"""TerraGuard telemetry API, deterministic risk assessment, and Ollama analysis."""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import sqlite3
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, time as datetime_time, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
DB_PATH = Path(os.getenv("DATABASE_PATH", str(ROOT / "terraguard.db")))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:12b")
OLLAMA_INTERVAL = max(15, int(os.getenv("OLLAMA_INTERVAL_SECONDS", "90")))
SOIL_WET = float(os.getenv("SOIL_WET_PCT", "70"))
RAIN_HIGH = float(os.getenv("RAIN_HIGH_PCT", "65"))
_rain_override = os.getenv("RAIN_SENSOR_OVERRIDE_PCT", "").strip()
RAIN_SENSOR_OVERRIDE_PCT = float(_rain_override) if _rain_override else None
if RAIN_SENSOR_OVERRIDE_PCT is not None and not 0 <= RAIN_SENSOR_OVERRIDE_PCT <= 100:
    raise ValueError("RAIN_SENSOR_OVERRIDE_PCT must be between 0 and 100")
SHIFT_WARN = float(os.getenv("GROUND_SHIFT_WARN_CM", "2.0"))
SHIFT_CRITICAL = float(os.getenv("GROUND_SHIFT_CRITICAL_CM", "5.0"))
DISTANCE_WARN = float(os.getenv("GROUND_DISTANCE_CHANGE_WARN_CM", "3.0"))
WEATHER_API_ENABLED = os.getenv("WEATHER_API_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}
WEATHER_CACHE_SECONDS = max(60, int(os.getenv("WEATHER_CACHE_SECONDS", "600")))
REPORT_TIMEZONE_NAME = os.getenv("REPORT_TIMEZONE", "Asia/Kolkata")
REPORT_TIMEZONE = ZoneInfo(REPORT_TIMEZONE_NAME)
REPORTS_DIR = ROOT / "reports"
CORS_ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
    ).split(",")
    if origin.strip()
]
HISTORY_LIMIT = 300
_weather_cache: dict[tuple[float, float], tuple[float, dict[str, Any]]] = {}
_outlook_cache: dict[str, Any] = {}
_outlook_task: asyncio.Task | None = None
_outlook_lock = asyncio.Lock()


class ConversationTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1200)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ConversationTurn] = Field(default_factory=list)


class VisionRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=80)
    frame_b64: str = Field(min_length=100, max_length=1_500_000)


class VisionStopRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=80)


class DailyReportRequest(BaseModel):
    report_date: date | None = None

_analysis_lock = asyncio.Lock()
_last_analysis_at = 0.0
_analysis_task: asyncio.Task | None = None
_vision_lock = asyncio.Lock()
_vision_sessions: dict[str, dict[str, Any]] = {}
_daily_report_lock = asyncio.Lock()
_daily_report_task: asyncio.Task | None = None


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT, received_at TEXT NOT NULL,
            device_id TEXT, payload TEXT NOT NULL, normalized TEXT NOT NULL,
            risk TEXT NOT NULL, flags TEXT NOT NULL, ai_analysis TEXT)""")
        conn.execute("""CREATE TABLE IF NOT EXISTS device_baselines (
            device_id TEXT PRIMARY KEY, baseline_distance_cm REAL NOT NULL)""")
        conn.execute("""CREATE TABLE IF NOT EXISTS incident_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT, reading_id INTEGER NOT NULL,
            created_at TEXT NOT NULL, severity TEXT NOT NULL, report_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft_not_sent')""")
        conn.execute("""CREATE TABLE IF NOT EXISTS daily_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT, report_date TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL, completed_at TEXT, status TEXT NOT NULL,
            model TEXT NOT NULL, report_json TEXT, pdf_path TEXT, error TEXT)""")


def pick(mapping: dict[str, Any], *names: str) -> Any:
    """Case/format-insensitive key lookup for firmware schema variations."""
    normalized = {"".join(ch for ch in str(k).lower() if ch.isalnum()): v for k, v in mapping.items()}
    for name in names:
        key = "".join(ch for ch in name.lower() if ch.isalnum())
        if key in normalized:
            return normalized[key]
    return None


def as_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
        return number if number == number and abs(number) != float("inf") else None
    except (TypeError, ValueError):
        return None


def normalize(payload: dict[str, Any]) -> dict[str, Any]:
    sensors = payload.get("sensors") if isinstance(payload.get("sensors"), dict) else {}
    flat = {**payload, **sensors}
    coords = payload.get("coordinates") if isinstance(payload.get("coordinates"), dict) else {}
    soil = as_float(pick(flat, "soil_moisture_pct", "soil_moisture_percent", "soil_pct", "soil_moisture"))
    rain_raw = as_float(pick(flat, "rain_pct", "rain_intensity_pct", "rainfall_pct", "rain_percent", "rain"))
    rain_override = RAIN_SENSOR_OVERRIDE_PCT is not None
    rain = RAIN_SENSOR_OVERRIDE_PCT if rain_override else rain_raw
    tilt = pick(flat, "tilt_detected", "tilt_triggered", "tilt", "is_tilted", "tilt_flag")
    if isinstance(tilt, str):
        tilt = tilt.strip().lower() in {"true", "1", "yes", "on", "tilted"}
    elif tilt is not None:
        tilt = bool(tilt)
    return {
        "device_id": str(pick(payload, "device_id", "node_id") or "NODE_01"),
        "latitude": as_float(pick(coords, "latitude", "lat")),
        "longitude": as_float(pick(coords, "longitude", "lon", "lng")),
        "soil_moisture_pct": soil,
        "rain_pct": rain,
        "rain_sensor_raw_pct": rain_raw,
        "rain_sensor_override": rain_override,
        "tilt_detected": tilt,
        "tilt_pin_level": as_float(pick(flat, "tilt_pin_level", "tilt_raw_level")),
        "ground_distance_cm": as_float(pick(flat, "ground_distance_cm", "distance_cm", "ultrasonic_distance_cm")),
        "baseline_distance_cm": as_float(pick(flat, "baseline_distance_cm", "ground_baseline_cm")),
        "ground_shift_cm": as_float(pick(flat, "ground_shift_cm", "shift_cm")),
        "temperature_c": as_float(pick(flat, "temperature_c", "temperature", "temp_c")),
        "humidity_pct": as_float(pick(flat, "humidity_pct", "humidity")),
    }


def evaluate_risk(data: dict[str, Any], prior: dict[str, Any] | None = None) -> tuple[str, list[dict[str, str]]]:
    flags: list[dict[str, str]] = []
    high_sensors: set[str] = set()

    def flag(level: str, code: str, message: str) -> None:
        flags.append({"level": level, "code": code, "message": message})

    soil, rain = data["soil_moisture_pct"], data["rain_pct"]
    shift, tilt = data["ground_shift_cm"], data["tilt_detected"]
    if tilt is True:
        high_sensors.add("tilt")
        flag("warning", "TILT_DETECTED", "Tilt switch is active. Verify the sensor and inspect site conditions.")
    if shift is not None and abs(shift) >= SHIFT_CRITICAL:
        high_sensors.add("ultrasonic")
        flag("warning", "GROUND_SHIFT_CRITICAL", f"Ultrasonic baseline range difference is {shift:.1f} cm (critical threshold {SHIFT_CRITICAL:g} cm); verify sensor stability.")
    elif shift is not None and abs(shift) >= SHIFT_WARN:
        high_sensors.add("ultrasonic")
        flag("warning", "GROUND_SHIFT", f"Ultrasonic baseline range difference is {shift:.1f} cm (warning threshold {SHIFT_WARN:g} cm); verify sensor stability.")
    if soil is not None and soil >= SOIL_WET:
        high_sensors.add("soil_moisture")
        flag("warning", "SOIL_WET", f"Soil moisture is high at {soil:.0f}%.")
    if data.get("rain_sensor_override"):
        flag("info", "RAIN_SENSOR_FALLBACK", f"Rain sensor is unavailable; displaying a manual {rain:g}% fallback. It is excluded from automated risk scoring.")
    elif rain is not None and rain >= RAIN_HIGH:
        high_sensors.add("rain")
        flag("warning", "HEAVY_RAIN", f"Rain sensor is high at {rain:.0f}%.")
    if prior and data["ground_distance_cm"] is not None and prior.get("ground_distance_cm") is not None:
        delta = data["ground_distance_cm"] - prior["ground_distance_cm"]
        if abs(delta) >= DISTANCE_WARN and shift is None:
            high_sensors.add("ultrasonic")
            flag("warning", "DISTANCE_CHANGE", f"Ultrasonic distance changed by {delta:+.1f} cm since the previous reading.")
    if len(high_sensors) >= 2:
        flag("critical", "MULTI_SENSOR_CORROBORATION",
             f"{len(high_sensors)} independent sensor types are above configured thresholds ({', '.join(sorted(high_sensors))}). Verify readings and site conditions promptly.")
        risk = "critical"
    elif high_sensors:
        risk = "medium"
    else:
        risk = "normal"
    return risk, flags


def high_sensor_count(data: dict[str, Any]) -> int:
    """Count independent threshold sources; ultrasonic shift/distance remains one source."""
    count = sum((data.get("tilt_detected") is True,
                 data.get("soil_moisture_pct") is not None and data["soil_moisture_pct"] >= SOIL_WET,
                 not data.get("rain_sensor_override", False) and data.get("rain_pct") is not None and data["rain_pct"] >= RAIN_HIGH,
                 data.get("ground_shift_cm") is not None and abs(data["ground_shift_cm"]) >= SHIFT_WARN))
    return count


def apply_ground_baseline(data: dict[str, Any]) -> None:
    """Use the first good ultrasonic value as a persistent baseline when firmware omits shift."""
    if data["ground_shift_cm"] is not None or data["ground_distance_cm"] is None:
        return
    provided = data.get("baseline_distance_cm")
    with db() as conn:
        row = conn.execute("SELECT baseline_distance_cm FROM device_baselines WHERE device_id=?",
                           (data["device_id"],)).fetchone()
        if provided is not None and provided > 0:
            baseline = provided
            conn.execute("INSERT OR REPLACE INTO device_baselines(device_id,baseline_distance_cm) VALUES(?,?)",
                         (data["device_id"], baseline))
        elif row is None:
            baseline = data["ground_distance_cm"]
            conn.execute("INSERT INTO device_baselines(device_id,baseline_distance_cm) VALUES(?,?)",
                         (data["device_id"], baseline))
        else:
            baseline = float(row["baseline_distance_cm"])
    data["baseline_distance_cm"] = baseline
    data["ground_shift_cm"] = baseline - data["ground_distance_cm"]

def insert_reading(received_at: str, payload: dict[str, Any], data: dict[str, Any], risk: str, flags: list[dict[str, str]]) -> int:
    with db() as conn:
        cur = conn.execute("INSERT INTO readings(received_at,device_id,payload,normalized,risk,flags) VALUES(?,?,?,?,?,?)",
            (received_at, data["device_id"], json.dumps(payload), json.dumps(data), risk, json.dumps(flags)))
        return int(cur.lastrowid)


def latest_rows(limit: int = HISTORY_LIMIT) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM readings ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        baseline_rows = conn.execute("SELECT device_id,baseline_distance_cm FROM device_baselines").fetchall()
    result = []
    prior_by_device: dict[str, dict[str, Any]] = {}
    # Use the persistent device baseline so /latest, history, and chat agree regardless of window size.
    baseline_by_device = {row["device_id"]: float(row["baseline_distance_cm"]) for row in baseline_rows}
    for row in reversed(rows):
        payload = json.loads(row["payload"])
        data = normalize(payload)
        device_id = data["device_id"]
        distance = data["ground_distance_cm"]
        baseline = data["baseline_distance_cm"]
        if distance is not None:
            if baseline is not None and baseline > 0:
                effective_baseline = baseline
            elif device_id in baseline_by_device:
                effective_baseline = baseline_by_device[device_id]
            else:
                effective_baseline = distance
                baseline_by_device[device_id] = effective_baseline
            data["baseline_distance_cm"] = effective_baseline
            # Always derive from the same effective baseline, ignoring stale or inconsistent stored shift fields.
            data["ground_shift_cm"] = effective_baseline - distance
        risk, flags = evaluate_risk(data, prior_by_device.get(device_id))
        result.append({"id": row["id"], "received_at": row["received_at"], "device_id": device_id,
            "payload": payload, "data": data, "risk": risk, "flags": flags,
            "ai_analysis": clean_model_text(row["ai_analysis"]) if row["ai_analysis"] else None})
        prior_by_device[device_id] = data
    return result


def queue_incident_report(reading_id: int, reading: dict[str, Any], previous_flags: list[dict[str, str]]) -> None:
    # Queue only corroborated multi-sensor critical events; a single medium indicator is informational.
    active = [flag for flag in reading["flags"] if flag["level"] == "critical"]
    if not active:
        return
    with db() as conn:
        recent_reports = conn.execute(
            "SELECT created_at,report_json FROM incident_reports ORDER BY id DESC LIMIT 100"
        ).fetchall()
    previous_codes = {flag["code"] for flag in previous_flags}
    recent_codes: set[str] = set()
    now_ts = datetime.now(timezone.utc).timestamp()
    for report_row in recent_reports:
        try:
            created_ts = datetime.fromisoformat(report_row["created_at"].replace("Z", "+00:00")).timestamp()
            if 0 <= now_ts - created_ts < 600:
                report_data = json.loads(report_row["report_json"])
                recent_codes.update(flag.get("code") for flag in report_data.get("new_flags", []))
        except (ValueError, TypeError, json.JSONDecodeError):
            continue
    # Avoid creating a new unsent incident draft for the same noisy flag more than once per 10 minutes.
    new_flags = [flag for flag in active if flag["code"] not in previous_codes and flag["code"] not in recent_codes]
    if not new_flags:
        return
    report = {
        "reading_id": reading_id,
        "created_at": reading["received_at"],
        "device_id": reading["device_id"],
        "location": {"latitude": reading["data"]["latitude"], "longitude": reading["data"]["longitude"]},
        "risk": reading["risk"],
        "readings": reading["data"],
        "new_flags": new_flags,
        "intended_recipients": [
            "relevant district disaster management authority (confirm jurisdiction/contact)",
            "relevant local civic body (confirm jurisdiction/contact)",
        ],
        "status": "draft_not_sent",
    }
    with db() as conn:
        conn.execute("INSERT INTO incident_reports(reading_id,created_at,severity,report_json,status) VALUES(?,?,?,?,?)",
                     (reading_id, reading["received_at"], reading["risk"], json.dumps(report), "draft_not_sent"))


def queue_startup_report_if_needed() -> None:
    """Capture an already-active legacy alert when the API starts, without sending it."""
    with db() as conn:
        report_count = conn.execute("SELECT COUNT(*) FROM incident_reports").fetchone()[0]
    if report_count:
        return
    rows = latest_rows(1)
    if not rows:
        return
    latest = rows[-1]
    if latest["risk"] != "critical":
        return
    queue_incident_report(latest["id"], {
        "received_at": latest["received_at"],
        "device_id": latest["device_id"],
        "data": latest["data"],
        "risk": latest["risk"],
        "flags": latest["flags"],
    }, [])


def clean_model_text(value: str) -> str:
    """Keep model notes readable as plain text even if Gemma returns Markdown markers."""
    import re
    text = str(value or "").strip()
    # Hide Gemma 4's internal thought channel if raw Ollama markers are present.
    text = re.sub(r"<\|channel>thought\b.*?(?:<channel\|>|<\|channel\|>)", "", text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<\|channel>final\s*", "", text, flags=re.IGNORECASE)
    text = text.replace("<channel|>", "").replace("<|channel|>", "")
    text = re.sub(r"(?m)^\s*#{1,6}\s*", "", text)
    text = re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", text)
    text = re.sub(r"(?m)^\s*[-*]\s+", "• ", text)
    return text.strip()


async def weather_for_coordinates(latitude: float | None, longitude: float | None) -> dict[str, Any] | None:
    """Fetch and cache current weather; called only when the explicit opt-in is enabled."""
    if not WEATHER_API_ENABLED or latitude is None or longitude is None:
        return None
    key = (round(latitude, 3), round(longitude, 3))
    now = time.monotonic()
    cached = _weather_cache.get(key)
    if cached and now - cached[0] < WEATHER_CACHE_SECONDS:
        return cached[1]
    params = {
        "latitude": latitude, "longitude": longitude, "timezone": "auto",
        "current": "temperature_2m,relative_humidity_2m,precipitation,rain,showers,wind_speed_10m,weather_code",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,precipitation_probability_max",
        "forecast_days": 7,
    }
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            response = await client.get("https://api.open-meteo.com/v1/forecast", params=params)
            response.raise_for_status()
        payload = response.json()
        result = {"source": "Open-Meteo", "fetched_at": datetime.now(timezone.utc).isoformat(),
                  "timezone": payload.get("timezone"), "current": payload.get("current"),
                  "daily": payload.get("daily")}
        _weather_cache[key] = (now, result)
        return result
    except Exception as exc:
        return {"source": "Open-Meteo", "error": f"Weather unavailable ({type(exc).__name__})."}


async def environment_snapshot() -> dict[str, Any]:
    rows = latest_rows(1)
    if not rows:
        return {"device_id": None, "telemetry_at": None, "location": None,
                "weather_enabled": WEATHER_API_ENABLED, "weather": None}
    row = rows[-1]
    data = row["data"]
    latitude, longitude = data.get("latitude"), data.get("longitude")
    location = None if latitude is None or longitude is None else {"latitude": latitude, "longitude": longitude}
    weather = await weather_for_coordinates(latitude, longitude) if WEATHER_API_ENABLED else None
    return {"device_id": row["device_id"], "telemetry_at": row["received_at"], "location": location,
            "weather_enabled": WEATHER_API_ENABLED, "weather": weather,
            "weather_message": "Weather lookup is disabled. Set WEATHER_API_ENABLED=true to share device coordinates with Open-Meteo." if not WEATHER_API_ENABLED else None}


async def create_outlook_analysis(device_id: str, received_at: str, risk: str,
                                  sensor_data: dict[str, Any], flags: list[dict[str, Any]],
                                  forecast: dict[str, Any], location: dict[str, Any]) -> None:
    """Ask Gemma for cautious forecast context; this is not a calibrated landslide model."""
    global _outlook_cache
    try:
        prompt = (
            "Summarize this 7-day weather forecast and the latest TerraGuard sensors for a dashboard. "
            "Use the supplied forecast as weather context only. If rain_sensor_override is true, treat rain_pct as a manual placeholder, not a sensor observation. The sensor risk and flags are deterministic inputs, "
            "not proof of a landslide. Do not provide a numeric landslide probability because this prototype has "
            "no calibrated landslide prediction model. Set landslide_indicator to exactly one of: "
            "low_indicators, watch, elevated_indicators, insufficient_data. Use insufficient_data when the forecast "
            "or sensor evidence is missing. Explain that these are qualitative indicators, not a confirmed event or "
            "official warning. Give practical precautions and advise following authorized local guidance. "
            "Return only JSON with keys tomorrow_summary (string), upcoming_summary (string), "
            "landslide_indicator (string), indicator_reason (string), precautions (array of up to 5 strings). "
            "Do not include private chain-of-thought.\n\n" + json.dumps({
                "device_id": device_id, "latest_reading_at": received_at, "current_backend_risk": risk,
                "current_sensors": sensor_data, "active_flags": flags, "location": location,
                "weather_source": "Open-Meteo", "forecast_timezone": forecast.get("timezone"),
                "daily_forecast": forecast.get("daily"),
            }, ensure_ascii=False)
        )
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(f"{OLLAMA_URL.rstrip('/')}/api/chat", json={
                "model": OLLAMA_MODEL,
                "think": False,
                "messages": [{"role": "system", "content": "You are a cautious weather-and-sensor outlook assistant. Reason carefully; return the requested concise final JSON, never private chain-of-thought. Never present qualitative indicators as calibrated probabilities."},
                             {"role": "user", "content": prompt}],
                "stream": False, "keep_alive": "10m",
                "options": {"temperature": 0.3, "num_ctx": 8192, "num_predict": 700},
            })
            response.raise_for_status()
        raw = clean_model_text(response.json().get("message", {}).get("content", ""))
        match = re.search(r"\{.*\}", re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE), re.DOTALL)
        if not match:
            raise ValueError("Gemma did not return outlook fields")
        result = json.loads(match.group(0))
        allowed = {"low_indicators", "watch", "elevated_indicators", "insufficient_data"}
        indicator = result.get("landslide_indicator")
        if indicator not in allowed:
            indicator = "insufficient_data"
        if not sensor_data or not forecast.get("daily"):
            indicator = "insufficient_data"
        _outlook_cache = {
            "generated_at": datetime.now(timezone.utc).isoformat(), "model": OLLAMA_MODEL,
            "reading_at": received_at, "device_id": device_id,
            "tomorrow_summary": clean_model_text(result.get("tomorrow_summary", "")),
            "upcoming_summary": clean_model_text(result.get("upcoming_summary", "")),
            "landslide_indicator": indicator,
            "indicator_reason": clean_model_text(result.get("indicator_reason", "")),
            "precautions": [clean_model_text(item) for item in result.get("precautions", [])[:5]],
            "analysis_status": "ready",
        }
    except Exception as exc:
        _outlook_cache = {"analysis_status": "unavailable", "error": type(exc).__name__,
                          "generated_at": datetime.now(timezone.utc).isoformat(), "model": OLLAMA_MODEL}


async def analyze_with_ollama(reading_id: int, data: dict[str, Any], risk: str, flags: list[dict[str, str]]) -> None:
    global _last_analysis_at
    async with _analysis_lock:
        _last_analysis_at = time.monotonic()
        recent = latest_rows(8)
        trend = [{"received_at": row["received_at"], "risk": row["risk"], "data": row["data"]}
                 for row in recent[-7:]]
        environment = await weather_for_coordinates(data["latitude"], data["longitude"]) if WEATHER_API_ENABLED else None
        prompt = (
            "Assess this sensor snapshot and its recent trend. Numeric zero is a measured value; only null is missing. "
            "The backend sets risk by independent high sensor types: one gives medium; two or more gives critical. "
            "Preserve the backend risk and every deterministic flag's exact severity. Treat weather as context, not a sensor reading. "
            "rain_pct is a relative sensor percentage, not a calibrated rainfall amount. If rain_sensor_override is true, describe it as a manual fallback and do not count it as evidence. "
            "ground_shift_cm is only the baseline-to-ultrasonic range difference; never call it actual ground movement without independent confirmation. "
            "If recent distances or shifts jump or conflict, identify the ultrasonic measurement as unstable and state low confidence. "
            "Use four short labels: Observations, Trend/data quality, Confidence, Next step. Write plain text only: no Markdown, asterisks, or decorative symbols. Stay under 150 words and finish the last sentence. "
            "Do not confirm a disaster or issue an official evacuation order. For critical flags, recommend checking hardware/site conditions and following local authority guidance.\n\n" +
            json.dumps({"risk": risk, "high_sensor_count": high_sensor_count(data), "flags": flags,
                        "current": data, "weather_context": environment, "recent_trend": trend}, ensure_ascii=False)
        )
        try:
            async with httpx.AsyncClient(timeout=75) as client:
                response = await client.post(f"{OLLAMA_URL.rstrip('/')}/api/chat", json={
                    "model": OLLAMA_MODEL,
                    "think": False,
                    "messages": [{"role": "system", "content": "You are a cautious environmental sensor assistant. Reason carefully; never reveal private chain-of-thought. Treat supplied telemetry as the only evidence; do not overstate noisy data."},
                                 {"role": "user", "content": prompt}],
                    "stream": False,
                    "keep_alive": "10m",
                    "options": {"temperature": 0.3, "num_ctx": 8192, "num_predict": 500},
                })
                response.raise_for_status()
                analysis = clean_model_text(response.json().get("message", {}).get("content", ""))
                if not analysis:
                    raise ValueError("Ollama returned an empty response")
            with db() as conn:
                conn.execute("UPDATE readings SET ai_analysis=? WHERE id=?", (analysis, reading_id))
        except Exception as exc:
            with db() as conn:
                conn.execute("UPDATE readings SET ai_analysis=? WHERE id=?",
                    (f"AI unavailable: {type(exc).__name__}. Check that Ollama is running and {OLLAMA_MODEL} is installed.", reading_id))


async def maybe_schedule_analysis(reading_id: int, data: dict[str, Any], risk: str, flags: list[dict[str, str]]) -> None:
    global _last_analysis_at, _analysis_task
    now = time.monotonic()
    urgent = risk in {"warning", "critical"}
    if _analysis_task is not None and not _analysis_task.done():
        return
    if now - _last_analysis_at >= OLLAMA_INTERVAL:
        _analysis_task = asyncio.create_task(analyze_with_ollama(reading_id, data, risk, flags))


def collect_day_summary(report_day: date) -> dict[str, Any]:
    day_start = datetime.combine(report_day, datetime_time.min, REPORT_TIMEZONE).astimezone(timezone.utc)
    day_end = day_start + timedelta(days=1)
    with db() as conn:
        rows = conn.execute(
            "SELECT id,received_at,normalized,risk,flags FROM readings WHERE received_at>=? AND received_at<? ORDER BY id",
            (day_start.isoformat(), day_end.isoformat()),
        ).fetchall()
    values: dict[str, list[float]] = {k: [] for k in ("soil_moisture_pct", "rain_pct", "ground_shift_cm", "ground_distance_cm", "temperature_c", "humidity_pct")}
    risk_counts = {"normal": 0, "medium": 0, "warning": 0, "critical": 0}
    flag_counts: dict[str, int] = {}
    hourly: dict[str, dict[str, Any]] = {}
    latest_data: dict[str, Any] | None = None
    latest_received: str | None = None
    latest_device: str | None = None
    for row in rows:
        data = json.loads(row["normalized"])
        received = datetime.fromisoformat(row["received_at"])
        local = received.astimezone(REPORT_TIMEZONE)
        risk = row["risk"] if row["risk"] in risk_counts else "warning"
        risk_counts[risk] += 1
        hour = local.strftime("%H:00")
        bucket = hourly.setdefault(hour, {"count": 0, "critical": 0, "soil": [], "rain": []})
        bucket["count"] += 1
        bucket["critical"] += int(risk == "critical")
        for key, alias in (("soil_moisture_pct", "soil"), ("rain_pct", "rain")):
            value = data.get(key)
            if isinstance(value, (int, float)) and not (key == "rain_pct" and data.get("rain_sensor_override")):
                values[key].append(float(value))
                bucket[alias].append(float(value))
        for key in ("ground_shift_cm", "ground_distance_cm", "temperature_c", "humidity_pct"):
            value = data.get(key)
            if isinstance(value, (int, float)):
                values[key].append(float(value))
        for flag in json.loads(row["flags"]):
            flag_counts[flag.get("code", "UNKNOWN")] = flag_counts.get(flag.get("code", "UNKNOWN"), 0) + 1
        latest_data, latest_received, latest_device = data, row["received_at"], data.get("device_id")

    ranges = {}
    for key, items in values.items():
        if items:
            ranges[key] = {"min": round(min(items), 2), "max": round(max(items), 2), "mean": round(sum(items) / len(items), 2)}
    hourly_summary = {hour: {"readings": item["count"], "critical_readings": item["critical"],
                             "soil_range_pct": [round(min(item["soil"]), 1), round(max(item["soil"]), 1)] if item["soil"] else None,
                             "rain_range_pct": [round(min(item["rain"]), 1), round(max(item["rain"]), 1)] if item["rain"] else None}
                      for hour, item in sorted(hourly.items())}
    return {"report_date": report_day.isoformat(), "timezone": REPORT_TIMEZONE_NAME,
            "reading_count": len(rows), "risk_counts": risk_counts, "flag_counts": flag_counts,
            "sensor_ranges": ranges, "hourly_summary": hourly_summary,
            "latest_reading": {"received_at": latest_received, "device_id": latest_device, "data": latest_data},
            "thresholds": {"soil_wet_pct": SOIL_WET, "rain_high_pct": RAIN_HIGH,
                           "ground_shift_warn_cm": SHIFT_WARN, "ground_shift_critical_cm": SHIFT_CRITICAL}}


def create_daily_pdf(report: dict[str, Any], pdf_path: Path) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="TGTitle", parent=styles["Title"], textColor=colors.HexColor("#164a34"), alignment=TA_LEFT, spaceAfter=8))
    styles.add(ParagraphStyle(name="TGSection", parent=styles["Heading2"], textColor=colors.HexColor("#1d6140"), spaceBefore=11, spaceAfter=5))
    styles.add(ParagraphStyle(name="TGBody", parent=styles["BodyText"], leading=14, spaceAfter=6))
    styles.add(ParagraphStyle(name="TGNotice", parent=styles["BodyText"], leading=15, borderColor=colors.HexColor("#bd8a20"), borderWidth=1, borderPadding=9, backColor=colors.HexColor("#fff8e7"), spaceBefore=5, spaceAfter=8))
    doc = SimpleDocTemplate(str(pdf_path), pagesize=letter, rightMargin=.62 * inch, leftMargin=.62 * inch, topMargin=.62 * inch, bottomMargin=.62 * inch, title=f"TerraGuard Daily Report {report['report_date']}", author=report["model"])
    def para(text: Any, style: str = "TGBody") -> Paragraph:
        safe = escape(str(text)).replace("\n", "<br/>")
        return Paragraph(safe, styles[style])
    story: list[Any] = [para("TerraGuard Daily Environmental Report", "TGTitle"),
        para(f"Report date: {report['report_date']} ({REPORT_TIMEZONE_NAME}) · Generated: {report['generated_at_local']}"),
        para(f"Reasoning module: {report['model']} via Ollama · Status: {report['status']}"),
        para("Prototype monitoring summary. Sensor and model observations require human verification; this is not an official hazard determination or evacuation order."),
        para("Gemma summary", "TGSection"), para(report.get("summary", "No summary available."))]
    story.extend([para("Daily readings and risk counts", "TGSection"), Table([
        ["Metric", "Value"], ["Readings", str(report["reading_count"])],
        ["Critical", str(report["risk_counts"].get("critical", 0))],
        ["Medium", str(report["risk_counts"].get("medium", 0))],
        ["Warnings", str(report["risk_counts"].get("warning", 0))],
        ["Normal", str(report["risk_counts"].get("normal", 0))],
        ["Device", str((report.get("telemetry") or {}).get("device_id") or "No telemetry")],
        ["Location", str((report.get("telemetry") or {}).get("location") or "Unavailable")],
    ], colWidths=[1.8 * inch, 5.3 * inch], repeatRows=1, style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8f1eb")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#164a34")),
        ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#cad8ce")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 6)]))])
    story.append(para("Observed patterns", "TGSection"))
    for item in report.get("observations", []):
        story.append(para("• " + str(item)))
    story.append(para("Recommended precautions", "TGSection"))
    for item in report.get("precautions", []):
        story.append(para("• " + str(item)))
    forecast_summary = report.get("forecast_outlook") or {}
    if forecast_summary:
        story.append(para("Tomorrow and upcoming weather outlook", "TGSection"))
        story.append(para("Tomorrow: " + str(forecast_summary.get("tomorrow_summary") or "Forecast summary unavailable.")))
        story.append(para("Next several days: " + str(forecast_summary.get("upcoming_summary") or "Forecast summary unavailable.")))
        story.append(para("Qualitative landslide indicators: " + str(forecast_summary.get("landslide_indicator") or "insufficient_data") +
                          " — " + str(forecast_summary.get("indicator_reason") or "No explanation available.")))
        for item in forecast_summary.get("precautions", []):
            story.append(para("• " + str(item)))
    story.extend([para("Public notice · ready to share manually", "TGSection"),
                  para(report.get("public_notice", "No public notice was generated."), "TGNotice"),
                  Spacer(1, 10), para(f"Reporting module: {report.get('model', OLLAMA_MODEL)} through local Ollama. No alert has been transmitted to authorities or residents.")])
    def footer(canvas: Any, _: Any) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#68796e"))
        canvas.drawString(.62 * inch, .35 * inch, "TerraGuard · verify conditions on site and follow authorized local guidance")
        canvas.drawRightString(7.9 * inch, .35 * inch, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


async def generate_daily_report(report_day: date, generated_by: str = "manual", force: bool = False) -> dict[str, Any]:
    async with _daily_report_lock:
        with db() as conn:
            existing = conn.execute("SELECT * FROM daily_reports WHERE report_date=?", (report_day.isoformat(),)).fetchone()
            if existing and existing["status"] == "complete" and not force:
                return {"id": existing["id"], "report_date": existing["report_date"], "status": existing["status"], "model": existing["model"], "download_url": f"/api/daily-reports/{existing['id']}/download", "existing": True}
            if existing:
                report_id = existing["id"]
                conn.execute("UPDATE daily_reports SET status='generating',error=NULL WHERE id=?", (report_id,))
            else:
                cur = conn.execute("INSERT INTO daily_reports(report_date,created_at,status,model) VALUES(?,?,?,?)",
                    (report_day.isoformat(), datetime.now(timezone.utc).isoformat(), "generating", OLLAMA_MODEL))
                report_id = int(cur.lastrowid)
        try:
            telemetry = collect_day_summary(report_day)
            environment = await environment_snapshot()
            location = environment.get("location")
            telemetry["latest_reading"]["location"] = location
            weather_forecast = environment.get("weather", {}).get("daily") if environment.get("weather") else None
            telemetry["weather_forecast"] = {"timezone": environment.get("weather", {}).get("timezone"),
                                              "daily": weather_forecast} if weather_forecast else None
            generated_at = datetime.now(REPORT_TIMEZONE).isoformat(timespec="seconds")
            prompt = (
                "Create a concise daily environmental monitoring report from this JSON aggregate. You are Gemma, the reasoning module. "
                "Base conclusions only on supplied readings; distinguish sensor data from verified ground conditions. Do not claim a landslide occurred unless the data establishes only that sensors flagged risk; state that it is an indicator, not proof. "
                "Give practical precautionary guidance without issuing evacuation orders or claiming authorities/residents were contacted. "
                "If there are no readings, clearly state that monitoring data is unavailable and no safety conclusion can be made. "
                "Return exactly a JSON object with keys summary (string), observations (array of up to 5 strings), "
                "precautions (array of up to 6 strings), public_notice (string), tomorrow_summary (string), "
                "upcoming_summary (string), landslide_indicator (one of low_indicators, watch, elevated_indicators, insufficient_data), "
                "indicator_reason (string), forecast_precautions (array of up to 5 strings). "
                "Summarize tomorrow and the supplied next-7-day forecast. Do not give a numeric landslide probability: this prototype is not calibrated to predict landslides. "
                "Use insufficient_data if the forecast or sensors are missing. Keep public_notice cautious, short and suitable for manual sharing. "
                "Do not include private chain-of-thought.\n\n" + json.dumps(telemetry, ensure_ascii=False)
            )
            async with httpx.AsyncClient(timeout=180) as client:
                response = await client.post(f"{OLLAMA_URL.rstrip('/')}/api/chat", json={
                    "model": OLLAMA_MODEL,
                    "think": False,
                    "messages": [{"role": "system", "content": "You are Gemma, a cautious environmental sensor reporting assistant. Reason carefully, but never reveal private chain-of-thought. Return only the requested final JSON."},
                                 {"role": "user", "content": prompt}],
                    "stream": False, "keep_alive": "10m",
                    "options": {"temperature": 0.3, "num_ctx": 8192, "num_predict": 1000},
                })
                response.raise_for_status()
            raw = clean_model_text(response.json().get("message", {}).get("content", ""))
            match = re.search(r"\{.*\}", re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE), re.DOTALL)
            if not match:
                raise ValueError("Gemma did not return the report fields")
            ai = json.loads(match.group(0))
            report = {"id": report_id, "report_date": report_day.isoformat(), "generated_at": datetime.now(timezone.utc).isoformat(),
                "generated_at_local": generated_at, "generated_by": generated_by, "model": OLLAMA_MODEL, "status": "complete",
                "reading_count": telemetry["reading_count"], "risk_counts": telemetry["risk_counts"],
                "flag_counts": telemetry["flag_counts"], "sensor_ranges": telemetry["sensor_ranges"],
                "telemetry": {"device_id": telemetry["latest_reading"]["device_id"], "latest_received": telemetry["latest_reading"]["received_at"],
                              "location": location},
                "summary": clean_model_text(ai.get("summary", "")),
                "observations": [clean_model_text(x) for x in ai.get("observations", [])[:5]],
                "precautions": [clean_model_text(x) for x in ai.get("precautions", [])[:6]],
                "forecast_outlook": {
                    "tomorrow_summary": clean_model_text(ai.get("tomorrow_summary", "")),
                    "upcoming_summary": clean_model_text(ai.get("upcoming_summary", "")),
                    "landslide_indicator": ai.get("landslide_indicator") if ai.get("landslide_indicator") in {
                        "low_indicators", "watch", "elevated_indicators", "insufficient_data"} else "insufficient_data",
                    "indicator_reason": clean_model_text(ai.get("indicator_reason", "")),
                    "precautions": [clean_model_text(x) for x in ai.get("forecast_precautions", [])[:5]],
                    "weather_forecast": telemetry["weather_forecast"],
                },
                "public_notice": clean_model_text(ai.get("public_notice", "")),
                "notice_status": "draft_not_sent"}
            if not report["summary"]:
                report["summary"] = clean_model_text(raw)
            if not report["public_notice"]:
                report["public_notice"] = "Monitoring indicators need local verification. This prototype notice is not an official hazard alert. Follow instructions from authorized local officials."
            pdf_path = REPORTS_DIR / f"terraguard-daily-{report_day.isoformat()}.pdf"
            create_daily_pdf(report, pdf_path)
            with db() as conn:
                conn.execute("UPDATE daily_reports SET completed_at=?,status='complete',model=?,report_json=?,pdf_path=?,error=NULL WHERE id=?",
                    (report["generated_at"], OLLAMA_MODEL, json.dumps(report, ensure_ascii=False), str(pdf_path), report_id))
            report["download_url"] = f"/api/daily-reports/{report_id}/download"
            report["existing"] = False
            return report
        except Exception as exc:
            with db() as conn:
                conn.execute("UPDATE daily_reports SET status='failed',error=? WHERE id=?", (type(exc).__name__, report_id))
            raise


async def daily_report_scheduler() -> None:
    while True:
        now = datetime.now(REPORT_TIMEZONE)
        yesterday = now.date() - timedelta(days=1)
        with db() as conn:
            prior = conn.execute("SELECT status FROM daily_reports WHERE report_date=?", (yesterday.isoformat(),)).fetchone()
        if not prior or prior["status"] != "complete":
            try:
                await generate_daily_report(yesterday, generated_by="scheduled_end_of_day")
            except Exception:
                pass
        if now.time() >= datetime_time(23, 59):
            with db() as conn:
                today_row = conn.execute("SELECT report_json,status FROM daily_reports WHERE report_date=?", (now.date().isoformat(),)).fetchone()
            already_final = False
            if today_row and today_row["status"] == "complete" and today_row["report_json"]:
                try:
                    already_final = json.loads(today_row["report_json"]).get("generated_by") == "scheduled_end_of_day"
                except json.JSONDecodeError:
                    pass
            if not already_final:
                try:
                    await generate_daily_report(now.date(), generated_by="scheduled_end_of_day", force=True)
                except Exception:
                    pass
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(_: FastAPI):
    global _daily_report_task
    initialize_db()
    queue_startup_report_if_needed()
    rows = latest_rows(1)
    if rows and not rows[-1]["ai_analysis"]:
        latest = rows[-1]
        await maybe_schedule_analysis(latest["id"], latest["data"], latest["risk"], latest["flags"])
    _daily_report_task = asyncio.create_task(daily_report_scheduler())
    yield
    if _daily_report_task:
        _daily_report_task.cancel()


app = FastAPI(title="TerraGuard API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
app.mount("/static", StaticFiles(directory=ROOT / "frontend"), name="static")
WEBUI_DIST = ROOT / "webui" / "dist"


@app.get("/")
async def dashboard() -> FileResponse:
    built_dashboard = WEBUI_DIST / "index.html"
    if built_dashboard.is_file():
        return FileResponse(built_dashboard)
    return FileResponse(ROOT / "frontend" / "index.html")


@app.get("/api/health")
async def health() -> dict[str, Any]:
    ollama_ok, installed = False, False
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            res = await client.get(f"{OLLAMA_URL.rstrip('/')}/api/tags")
            res.raise_for_status()
            ollama_ok = True
            models = res.json().get("models", [])
            installed = any(m.get("name", "").split(":")[0] == OLLAMA_MODEL.split(":")[0] and
                (":" not in OLLAMA_MODEL or m.get("name", "").endswith(":" + OLLAMA_MODEL.split(":", 1)[1])) for m in models)
    except Exception:
        pass
    with db() as conn:
        count = conn.execute("SELECT COUNT(*) FROM readings").fetchone()[0]
    return {"ok": True, "ollama_reachable": ollama_ok, "model": OLLAMA_MODEL, "model_installed": installed,
            "reading_count": count, "ollama_interval_seconds": OLLAMA_INTERVAL}


@app.post("/api/telemetry")
async def telemetry(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Body must be valid JSON") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Telemetry body must be a JSON object")
    prior_rows = latest_rows(1)
    prior = prior_rows[-1]["data"] if prior_rows else None
    previous_flags = prior_rows[-1]["flags"] if prior_rows else []
    data = normalize(payload)
    apply_ground_baseline(data)
    risk, flags = evaluate_risk(data, prior)
    received_at = datetime.now(timezone.utc).isoformat()
    reading_id = insert_reading(received_at, payload, data, risk, flags)
    queue_incident_report(reading_id, {
        "received_at": received_at, "device_id": data["device_id"],
        "data": data, "risk": risk, "flags": flags,
    }, previous_flags)
    await maybe_schedule_analysis(reading_id, data, risk, flags)
    return {"ok": True, "id": reading_id, "risk": risk, "flags": flags}


@app.get("/api/readings")
async def readings(limit: int = HISTORY_LIMIT) -> dict[str, Any]:
    return {"readings": latest_rows(max(1, min(limit, HISTORY_LIMIT)))}


@app.get("/api/readings/latest")
async def latest() -> dict[str, Any]:
    rows = latest_rows(1)
    return {"reading": rows[-1] if rows else None}


@app.get("/api/state")
async def connected_state() -> dict[str, Any]:
    """Compatibility shape for the supplied dashboard, backed by actual stored telemetry."""
    rows = latest_rows(1)
    if not rows:
        return {"has_telemetry": False, "latest_telemetry": None, "latest_ai_result": None,
                "ai_in_progress": False, "weather_context": None, "server_time": datetime.now(timezone.utc).isoformat(),
                "device_id": None, "flags": [], "risk": "normal"}
    row = rows[-1]
    data = row["data"]
    environment_data = await environment_snapshot()
    weather = (environment_data.get("weather") or {}).get("current") or {}
    location = environment_data.get("location") or {}
    risks = {"normal": "SAFE", "medium": "WATCH", "warning": "WARNING", "critical": "CRITICAL"}
    flags = row["flags"]
    event_codes = ",".join(sorted(str(flag.get("code", "flag")) for flag in flags))
    events = ([{"id": f"sensor_{row['received_at'][:10]}_{event_codes}", "timestamp": row["received_at"],
                "category": "sensor", "severity": "critical" if row["risk"] == "critical" else "info",
                "title": "Critical multi-sensor assessment" if row["risk"] == "critical" else "Sensor threshold indicators",
                "description": "; ".join(flag.get("message", "Review sensor flag.") for flag in flags),
                "evidence": "; ".join(flag.get("message", "") for flag in flags),
                "acknowledged": False, "read": False}] if flags else [])
    weather_context = None
    if weather:
        weather_context = {"location": f"{location.get('latitude')}, {location.get('longitude')}" if location else None,
            "temperature_c": weather.get("temperature_2m"), "humidity_pct": weather.get("relative_humidity_2m"),
            "precipitation_mm": weather.get("precipitation"), "wind_speed_kmh": weather.get("wind_speed_10m"),
            "condition": str(weather.get("weather_code", "Unknown")),
            "observed_at": weather.get("time"), "fetched_at": environment_data.get("weather", {}).get("fetched_at"),
            "cached": True}
    analysis = row.get("ai_analysis")
    return {"has_telemetry": True,
        "latest_telemetry": {"timestamp": row["received_at"], "received_at": row["received_at"],
            "device_id": row["device_id"], "soil_moisture": data.get("soil_moisture_pct"),
            "rain_intensity": data.get("rain_pct"), "rain_is_fallback": data.get("rain_sensor_override", False),
            "tilt_triggered": data.get("tilt_detected"),
            "tilt_pin_level": data.get("tilt_pin_level"), "ground_distance_cm": data.get("ground_distance_cm"),
            "baseline_distance_cm": data.get("baseline_distance_cm"), "ground_shift_cm": data.get("ground_shift_cm"),
            "latitude": data.get("latitude"), "longitude": data.get("longitude")},
        "latest_ai_result": {"id": f"reading_{row['id']}", "timestamp": row["received_at"],
            "risk_level": risks.get(row["risk"], "WATCH"), "landslide_flag": row["risk"] == "critical",
            "confidence_score": None, "summary": analysis or f"Gemma analysis pending. Deterministic backend risk is {row['risk']}.",
            "reasoning": analysis or "No Gemma interpretation is stored for this reading yet.",
            "recommended_action": "Verify sensor readings on site and follow authorized local guidance.", "model": OLLAMA_MODEL},
        "ai_in_progress": False, "weather_context": weather_context,
        "server_time": datetime.now(timezone.utc).isoformat(), "device_id": row["device_id"],
        "flags": flags, "risk": row["risk"], "events": events}


@app.get("/api/history")
async def connected_history(range_ms: int = 86_400_000) -> list[dict[str, Any]]:
    rows = latest_rows(HISTORY_LIMIT)
    cutoff = datetime.now(timezone.utc).timestamp() - max(60_000, min(range_ms, 31_536_000_000)) / 1000
    return [{"timestamp": row["received_at"], "soil_moisture": row["data"].get("soil_moisture_pct"),
             "rain_intensity": None if row["data"].get("rain_sensor_override") else row["data"].get("rain_pct"),
             "tilt_triggered": row["data"].get("tilt_detected"),
             "ground_distance_cm": row["data"].get("ground_distance_cm"),
             "baseline_distance_cm": row["data"].get("baseline_distance_cm"),
             "ground_shift_cm": row["data"].get("ground_shift_cm")}
            for row in rows if datetime.fromisoformat(row["received_at"]).timestamp() >= cutoff]


@app.post("/api/assess")
async def request_assessment() -> dict[str, Any]:
    rows = latest_rows(1)
    if not rows:
        raise HTTPException(status_code=409, detail="No sensor readings are available to assess.")
    row = rows[-1]
    prompt = ("Summarize this TerraGuard environmental sensor assessment in under 150 words. "
        "Distinguish sensor indicators from confirmed ground movement. Explain uncertainty, mention inconsistent ultrasonic readings, "
        "and give practical verification steps. Do not issue an evacuation order or claim a landslide occurred. "
        "Return plain text with Observations, Confidence, and Next step labels.\n\n" +
        json.dumps({"risk": row["risk"], "flags": row["flags"], "reading": row["data"]}, ensure_ascii=False))
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(f"{OLLAMA_URL.rstrip('/')}/api/chat", json={
                "model": OLLAMA_MODEL,
                "think": False,
                "messages": [{"role": "system", "content": "You are a cautious environmental sensor reporting assistant. Reason carefully; provide a concise final answer, not private chain-of-thought."},
                             {"role": "user", "content": prompt}],
                "stream": False, "keep_alive": "10m", "options": {"temperature": 0.3, "num_ctx": 8192, "num_predict": 500}})
            response.raise_for_status()
        answer = clean_model_text(response.json().get("message", {}).get("content", ""))
        with db() as conn:
            conn.execute("UPDATE readings SET ai_analysis=? WHERE id=?", (answer, row["id"]))
        return {"ok": True, "id": row["id"], "model": OLLAMA_MODEL, "summary": answer,
                "risk": row["risk"], "flags": row["flags"], "timestamp": row["received_at"]}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Gemma assessment unavailable: {type(exc).__name__}") from exc


@app.get("/api/config")
async def config() -> dict[str, Any]:
    return {"soil_wet_pct": SOIL_WET, "rain_high_pct": RAIN_HIGH,
            "rain_sensor_override_pct": RAIN_SENSOR_OVERRIDE_PCT,
            "rain_sensor_override_active": RAIN_SENSOR_OVERRIDE_PCT is not None,
            "ground_shift_warn_cm": SHIFT_WARN, "ground_shift_critical_cm": SHIFT_CRITICAL,
            "distance_change_warn_cm": DISTANCE_WARN}


@app.get("/api/environment")
async def environment() -> dict[str, Any]:
    """Latest device location and, when explicitly enabled, cached current weather."""
    return await environment_snapshot()


@app.get("/api/outlook")
async def outlook() -> dict[str, Any]:
    """Seven-day weather with a cached, advisory Gemma summary grounded in sensors."""
    global _outlook_task
    rows = latest_rows(1)
    if not rows:
        return {"analysis_status": "waiting_for_readings", "forecast": None,
                "message": "Waiting for node coordinates and readings."}
    latest = rows[-1]
    environment_data = await environment_snapshot()
    weather = environment_data.get("weather") or {}
    daily = weather.get("daily")
    location = environment_data.get("location")
    if not location or not isinstance(daily, dict):
        return {"analysis_status": "weather_unavailable", "forecast": None,
                "message": environment_data.get("weather_message") or weather.get("error") or
                           "A device GPS location and enabled weather forecast are required.",
                "location": location, "risk": latest["risk"], "flags": latest["flags"],
                "reading_at": latest["received_at"]}
    cache_fresh = False
    if _outlook_cache.get("generated_at"):
        try:
            cache_fresh = (datetime.now(timezone.utc) - datetime.fromisoformat(
                _outlook_cache["generated_at"])).total_seconds() < 900
        except (TypeError, ValueError):
            pass
    if not cache_fresh and (_outlook_task is None or _outlook_task.done()):
        _outlook_task = asyncio.create_task(create_outlook_analysis(
            latest["device_id"], latest["received_at"], latest["risk"], latest["data"],
            latest["flags"], weather, location))
    status = _outlook_cache.get("analysis_status", "analyzing") if cache_fresh else "analyzing"
    return {"analysis_status": status, "analysis": _outlook_cache if cache_fresh else None,
            "forecast": daily, "forecast_timezone": weather.get("timezone"),
            "weather_source": weather.get("source"), "forecast_fetched_at": weather.get("fetched_at"),
            "location": location, "risk": latest["risk"], "flags": latest["flags"],
            "reading_at": latest["received_at"], "device_id": latest["device_id"]}


@app.post("/api/vision/analyze")
async def analyze_camera_frame(request: VisionRequest) -> dict[str, Any]:
    """Compare transient consecutive JPEG frames with local Gemma vision; never persist images."""
    if not re.fullmatch(r"[A-Za-z0-9-]+", request.session_id):
        raise HTTPException(status_code=422, detail="Invalid camera session id")
    encoded = request.frame_b64.split(",", 1)[-1] if request.frame_b64.startswith("data:") else request.frame_b64
    try:
        frame = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="Camera frame must be valid base64 JPEG") from exc
    if len(frame) > 1_000_000 or not frame.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=422, detail="Camera frame must be a JPEG under 1 MB")

    async with _vision_lock:
        previous = _vision_sessions.get(request.session_id)
        if previous and time.monotonic() - previous["seen_at"] > 12:
            # Do not call a widely separated pair of images a continuous-motion comparison.
            previous = None
        _vision_sessions[request.session_id] = {"frame": encoded, "seen_at": time.monotonic()}
        # Bound transient frame memory if tabs disappear without sending a stop request.
        for sid, state in list(_vision_sessions.items()):
            if time.monotonic() - state["seen_at"] > 300:
                _vision_sessions.pop(sid, None)
        if previous is None:
            return {"event_detected": False, "risk": "unknown", "status": "baseline_captured",
                    "summary": "Camera is live. Capturing a second frame to compare for movement."}
        prompt = (
            "You are TerraGuard's visual movement classifier. Compare image 1 (earlier) with image 2 (later) from a fixed camera. "
            "Reason from these two images only. Detect scene change and distinguish ordinary movement (people, vehicles, leaves, "
            "lighting, camera noise) from concerning motion such as a falling object, falling debris, sudden downslope soil/debris "
            "flow, or a large rapid change to a visible slope. Do not call normal movement a hazard. "
            "Classify ordinary motion (walking people, cars passing, foliage movement, routine background activity) as movement_detected=true "
            "and risk=normal when it has no clear hazard-like character. Use risk=normal for an unchanged scene too, but say no movement was seen. "
            "Choose warning when motion is unusual or the pair is ambiguous; choose critical only when clear falling/debris/landslide-like movement is visible. "
            "If the camera moved or evidence is unclear, choose warning and low confidence; never say the site is certainly safe. "
            "Return exactly one JSON object with keys: movement_detected (boolean), risk (normal|warning|critical), "
            "confidence (high|medium|low), movement_type (short string), summary (one short sentence). "
            "Do not infer a disaster or issue an evacuation order."
        )
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                response = await client.post(f"{OLLAMA_URL.rstrip('/')}/api/chat", json={
                    "model": OLLAMA_MODEL,
                    "think": False,
                    "messages": [
                        {"role": "system", "content": "Reason carefully about visible evidence, distinguish ordinary movement from potential hazards, and never expose private chain-of-thought."},
                        {"role": "user", "content": prompt, "images": [previous["frame"], encoded]},
                    ],
                    "stream": False,
                    "keep_alive": "10m",
                    "options": {"temperature": 0.2, "num_ctx": 8192, "num_predict": 320},
                })
                response.raise_for_status()
            content = clean_model_text(response.json().get("message", {}).get("content", ""))
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.IGNORECASE)
            match = re.search(r"\{.*\}", content, flags=re.DOTALL)
            if not match:
                raise ValueError("Gemma did not return the required JSON event assessment")
            assessment = json.loads(match.group(0))
            risk = str(assessment.get("risk", "warning")).lower()
            if risk not in {"normal", "warning", "critical"}:
                risk = "warning"
            confidence = str(assessment.get("confidence", "low")).lower()
            if confidence not in {"high", "medium", "low"}:
                confidence = "low"
            # Gemma performs the visual classification; uncertain model outputs cannot be shown as safe or critical.
            if confidence != "high" and risk in {"normal", "critical"}:
                risk = "warning"
            critical = risk == "critical" and confidence == "high"
            return {"event_detected": critical, "risk": risk,
                    "status": "critical_visual_event" if critical else "classified",
                    "confidence": confidence,
                    "movement_detected": assessment.get("movement_detected") is True,
                    "event_type": str(assessment.get("movement_type", "scene change"))[:80],
                    "summary": str(assessment.get("summary", "No clear movement classification was returned."))[:300],
                    "model": OLLAMA_MODEL}
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Local camera analysis unavailable: {type(exc).__name__}") from exc


@app.post("/api/vision/stop")
async def stop_camera_analysis(request: VisionStopRequest) -> dict[str, bool]:
    async with _vision_lock:
        _vision_sessions.pop(request.session_id, None)
    return {"ok": True}


@app.post("/api/chat")
async def chat(request: ChatRequest) -> dict[str, Any]:
    rows = latest_rows(12)
    latest_reading = rows[-1] if rows else None
    recent_context = [{
        "received_at": row["received_at"],
        "risk": row["risk"],
        "flags": row["flags"],
        "readings": row["data"],
    } for row in rows[-8:]]
    environment = await environment_snapshot()
    context = {
        "latest_reading": None if latest_reading is None else {
            "received_at": latest_reading["received_at"],
            "risk": latest_reading["risk"],
            "flags": latest_reading["flags"],
            "readings": latest_reading["data"],
        },
        "recent_readings": recent_context,
        "thresholds": {
            "soil_wet_pct": SOIL_WET,
            "rain_high_pct": RAIN_HIGH,
            "ground_shift_warn_cm": SHIFT_WARN,
            "ground_shift_critical_cm": SHIFT_CRITICAL,
        },
        "environment": environment,
        "model": OLLAMA_MODEL,
    }
    system = (
        "You are TerraGuard's local sensor assistant. The current telemetry JSON in the latest user message is the "
        "source of truth and overrides any conflicting earlier chat text. Answer the user's question directly, using exact "
        "values and the reading timestamp/ID when relevant. Treat numeric zero as a measured value and only null as unavailable. "
        "Copy latest numeric readings and flag severity exactly; do not upgrade a warning to critical or recalculate the supplied ground shift. "
        "The backend assessment uses one independent high sensor type = medium and two or more = critical; do not override that classification. "
        "Compare the latest reading with the supplied recent sequence; call a trend stable only when the values support that. "
        "If current weather is supplied, summarize it as external context with its timestamp/source, and keep it distinct from node sensor readings. "
        "Distinguish sensor output from a confirmed site condition: "
            "rain_pct is a relative sensor percentage, not a calibrated rainfall amount. If rain_sensor_override is true, rain_pct is a manual fallback, not a sensor observation, and must not count as evidence or corroboration. tilt_detected means only that the switch is active, and ground_shift_cm "
        "is a baseline-to-ultrasonic range difference, not confirmed terrain movement unless mounting and calibration are "
        "reliable. If distances jump, disappear, or conflict, label that measurement unstable and lower confidence; do not "
        "present it as confirmed ground movement. Explain missing data and cross-sensor agreement. For sensor questions, "
        "answer in four short parts: Observed, Trend/data quality, Assessment/confidence, Next step. Keep the full answer "
        "under 160 words and finish with a complete sentence. Give a concise rationale, not private chain-of-thought. Never confirm a disaster, issue an official "
        "evacuation order, or claim a report was sent. For critical flags, advise verifying hardware/site conditions and "
        "contacting the appropriate local authority for official guidance."
    )
    messages = [{"role": "system", "content": system + " Reason carefully, but only provide concise conclusions and evidence, never private chain-of-thought."}]
    for turn in request.history[-8:]:
        messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content":
        "Current TerraGuard context (JSON):\n" + json.dumps(context, ensure_ascii=False) +
        "\n\nQuestion: " + request.message})
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            ollama_payload = {
                "model": OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
                "keep_alive": "10m",
                "think": False,
                "options": {"temperature": 0.3, "num_ctx": 8192, "num_predict": 700},
            }
            response = await client.post(f"{OLLAMA_URL.rstrip('/')}/api/chat", json=ollama_payload)
            response.raise_for_status()
            answer = clean_model_text(response.json().get("message", {}).get("content", ""))
        if not answer:
            raise ValueError("Ollama returned an empty response")
        return {"reply": answer, "context_reading_id": latest_reading["id"] if latest_reading else None,
                "context_received_at": latest_reading["received_at"] if latest_reading else None}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Gemma chat unavailable: {type(exc).__name__}") from exc




@app.get("/api/reports")
async def reports(limit: int = 20) -> dict[str, Any]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM incident_reports ORDER BY id DESC LIMIT ?",
                            (max(1, min(limit, 100)),)).fetchall()
    return {"reports": [{
        "id": row["id"], "reading_id": row["reading_id"], "created_at": row["created_at"],
        "severity": row["severity"], "status": row["status"], "report": json.loads(row["report_json"]),
    } for row in rows]}


@app.get("/api/daily-reports")
async def daily_reports(limit: int = 30) -> dict[str, Any]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM daily_reports ORDER BY report_date DESC LIMIT ?",
                            (max(1, min(limit, 100)),)).fetchall()
    items = []
    for row in rows:
        report = json.loads(row["report_json"]) if row["report_json"] else {}
        items.append({"id": row["id"], "report_date": row["report_date"], "created_at": row["created_at"],
            "completed_at": row["completed_at"], "status": row["status"], "model": row["model"],
            "summary": report.get("summary") or row["error"], "reading_count": report.get("reading_count"),
            "generated_at_local": report.get("generated_at_local"),
            "download_url": f"/api/daily-reports/{row['id']}/download" if row["status"] == "complete" else None})
    return {"reports": items, "timezone": REPORT_TIMEZONE_NAME}


@app.get("/api/daily-reports/by-date/{report_date}")
async def daily_report_by_date(report_date: date) -> dict[str, Any]:
    with db() as conn:
        row = conn.execute("SELECT report_json FROM daily_reports WHERE report_date=? AND status='complete'",
                           (report_date.isoformat(),)).fetchone()
    if not row or not row["report_json"]:
        raise HTTPException(status_code=404, detail="No completed daily report for this date.")
    return json.loads(row["report_json"])


@app.post("/api/daily-reports/generate")
async def create_daily_report(request: DailyReportRequest) -> dict[str, Any]:
    day = request.report_date or datetime.now(REPORT_TIMEZONE).date()
    try:
        return await generate_daily_report(day)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Gemma daily report generation failed: {type(exc).__name__}") from exc


@app.get("/api/daily-reports/{report_id}/download")
async def download_daily_report(report_id: int) -> FileResponse:
    with db() as conn:
        row = conn.execute("SELECT report_date,pdf_path,status FROM daily_reports WHERE id=?", (report_id,)).fetchone()
    if not row or row["status"] != "complete" or not row["pdf_path"]:
        raise HTTPException(status_code=404, detail="Completed PDF report not found.")
    path = Path(row["pdf_path"]).resolve()
    try:
        path.relative_to(REPORTS_DIR.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Report file is unavailable.") from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Report file is unavailable.")
    return FileResponse(path, media_type="application/pdf", filename=f"TerraGuard-daily-{row['report_date']}.pdf")


@app.get("/api/reports/prepare")
async def prepare_report() -> dict[str, Any]:
    rows = latest_rows(1)
    if not rows:
        raise HTTPException(status_code=404, detail="No telemetry is available to prepare a report.")
    row = rows[-1]
    data = row["data"]
    location = "GPS unavailable"
    if data["latitude"] is not None and data["longitude"] is not None:
        location = f"{data['latitude']:.6f}, {data['longitude']:.6f}"
    flags = row["flags"] or []
    flag_text = "\n".join(f"- {item['level'].upper()} {item['code']}: {item['message']}" for item in flags)
    report = (
        "TERRAGUARD SENSOR INCIDENT REPORT — DRAFT, NOT SENT\n"
        f"Intended recipients: relevant district disaster management authority and local civic body (confirm jurisdiction/contact).\n"
        f"Device: {row['device_id']}\nReceived: {row['received_at']}\nLocation: {location}\n"
        f"Risk classification: {row['risk'].upper()}\n"
        f"Readings: soil moisture={data['soil_moisture_pct']}%, rain={data['rain_pct']}%"
        f"{' (manual fallback; sensor offline, excluded from automated risk scoring)' if data.get('rain_sensor_override') else ''}, "
        f"tilt={data['tilt_detected']}, distance={data['ground_distance_cm']} cm, "
        f"ground shift={data['ground_shift_cm']} cm.\n"
        f"Flags:\n{flag_text or '- No configured threshold flag on this reading.'}\n\n"
        "Requested action: Please verify this report, assess the site, and advise appropriate protective steps. "
        "Confirm sensor calibration and conditions on the ground. This prototype report is not an official hazard "
        "determination or evacuation order. Follow directions from authorized local officials.\n"
        "PRECAUTIONS FOR LOCAL RESIDENTS: Keep away from steep slopes, drainage channels, visible cracks, and areas with falling debris; do not approach or cross unstable ground; follow instructions from authorized local officials."
    )
    public_notice = (
        f"LOCAL SAFETY NOTICE — TerraGuard recorded a {row['risk'].upper()} sensor assessment at {location} "
        f"({row['received_at']}). This is a prototype alert, not a confirmed disaster or official evacuation order. "
        "As a precaution, keep away from steep slopes, drainage channels, visible cracks and falling debris; do not enter unstable areas; "
        "follow instructions from authorized local officials. Verify the conditions before sharing. This notice has NOT been sent."
    )
    return {"status": "draft_not_sent", "report": report, "public_notice": public_notice, "reading_id": row["id"]}
