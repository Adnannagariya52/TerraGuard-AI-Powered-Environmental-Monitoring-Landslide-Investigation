/**
 * Backend TerraGuard adapter — CONNECTED MODE (integration scaffold).
 *
 * Expected backend contract (to be confirmed with the backend developer):
 *   GET  /api/state      → { has_telemetry, latest_telemetry, latest_ai_result, ai_in_progress, weather_context, server_time, device_id, ... }
 *   GET  /api/history    → array of telemetry records (shape TBD)
 *   POST /api/telemetry  → DEVICE ONLY. The frontend never calls this.
 *   POST /api/assess     → triggers an AI assessment (shape TBD)
 *   WS   /ws             → realtime push (message format TBD)
 *
 * This adapter is intentionally conservative:
 *  - It never falls back to simulated values.
 *  - Fields it cannot validate are rendered as "unknown"/"unavailable".
 *  - Operations not yet confirmed return explicit not-configured errors.
 *
 * TODO (integration): confirm payload shapes and complete the mapper functions
 * `mapStateResponse` and `mapHistoryResponse`.
 */

import type {
  Assessment,
  ChatResponse,
  HistoryPoint,
  MonitoringEvent,
  MonitoringState,
  RiskLevel,
  SystemComponent,
  TelemetrySnapshot,
  WeatherObservation,
} from "@/types/terraguard";
import type { TerraGuardService, Unsubscribe } from "./terraguardService";
import { API_BASE_URL, API_ROUTES, POLL_MS, WS_URL } from "@/config/env";
import { DEMO_SITE } from "@/data/mockTerraGuard";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const asNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const asStr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const RISK: RiskLevel[] = ["SAFE", "WATCH", "WARNING", "CRITICAL"];

function freshness(receivedAt: string | null, staleMs = 15_000) {
  if (!receivedAt) return { receivedAt: null, ageMs: null, status: "unknown" as const };
  const age = Date.now() - new Date(receivedAt).getTime();
  return { receivedAt, ageMs: age, status: age > staleMs ? ("stale" as const) : ("fresh" as const) };
}

/** Map a raw /api/state payload to the frontend contract. Unknown fields → null. */
export function mapStateResponse(raw: unknown, prev: MonitoringState): MonitoringState {
  if (!isObj(raw)) throw new Error("Invalid /api/state response: not an object");
  const serverTime = asStr(raw.server_time);
  const deviceId = asStr(raw.device_id) ?? "unknown-device";
  const lt = isObj(raw.latest_telemetry) ? raw.latest_telemetry : null;

  let telemetry: TelemetrySnapshot | null = null;
  if (raw.has_telemetry && lt) {
    const ts = asStr(lt.timestamp) ?? asStr(lt.received_at) ?? null;
    const f = freshness(ts);
    const baseline = asNum(lt.baseline_distance_cm);
    const distance = asNum(lt.ground_distance_cm);
    const tiltRaw = lt.tilt_triggered ?? lt.tilt;
    telemetry = {
      timestamp: ts ?? new Date(0).toISOString(),
      deviceId,
      soilMoisture: { value: asNum(lt.soil_moisture), unit: "%", freshness: f, previous: prev.telemetry?.soilMoisture.value ?? null },
      rainIntensity: { value: asNum(lt.rain_intensity), unit: "%", freshness: f, previous: prev.telemetry?.rainIntensity.value ?? null, source: lt.rain_is_fallback === true ? "manual_fallback" : "sensor" },
      tilt: { value: tiltRaw === true || tiltRaw === 1 || tiltRaw === "TRIGGERED" ? "TRIGGERED" : tiltRaw === undefined ? null : "NORMAL", unit: "", freshness: f, previous: prev.telemetry?.tilt.value ?? null },
      groundDistanceCm: { value: distance, unit: "cm", freshness: distance === null ? { ...f, status: "missing" } : f, previous: prev.telemetry?.groundDistanceCm.value ?? null },
      baselineDistanceCm: baseline,
      groundShiftCm: asNum(lt.ground_shift_cm) ?? (baseline !== null && distance !== null ? Math.round((baseline - distance) * 100) / 100 : null),
    };
  }

  let assessment: Assessment | null = prev.assessment;
  const ai = isObj(raw.latest_ai_result) ? raw.latest_ai_result : null;
  if (ai) {
    const rl = asStr(ai.risk_level)?.toUpperCase();
    assessment = {
      id: asStr(ai.id) ?? `ai_${asStr(ai.timestamp) ?? serverTime ?? "unknown"}`,
      timestamp: asStr(ai.timestamp) ?? serverTime ?? new Date(0).toISOString(),
      riskLevel: RISK.includes(rl as RiskLevel) ? (rl as RiskLevel) : "WATCH",
      landslideFlag: ai.landslide_flag === true,
      confidenceScore: asNum(ai.confidence_score),
      summary: asStr(ai.summary) ?? "No summary supplied by backend.",
      whySelected: asStr(ai.reasoning) ?? "Backend did not supply a reason field.",
      evidence: Array.isArray(raw.flags) ? raw.flags.filter(isObj).map((flag) => ({
        label: asStr(flag.code)?.replace(/_/g, " ") ?? "Sensor flag",
        value: asStr(flag.message) ?? "Active", unit: "", timestamp: telemetry?.timestamp ?? null, trend: "unavailable" as const,
      })) : [],
      contributingSignals: Array.isArray(raw.flags) ? raw.flags.filter(isObj).map((flag) => asStr(flag.message) ?? "Sensor flag") : [],
      unavailableInputs: [],
      uncertainty: "Backend-supplied result; uncertainty fields not provided by current contract.",
      recommendedAction: asStr(ai.recommended_action) ?? "No recommendation supplied.",
      provenance: { mode: "connected", source: asStr(ai.model) ?? "backend latest_ai_result", dataTimestamp: telemetry?.timestamp ?? null, usedStaleData: telemetry?.soilMoisture.freshness.status === "stale" },
    };
  }

  const wc = isObj(raw.weather_context) ? raw.weather_context : null;
  const weather: WeatherObservation | null = wc
    ? {
        provider: "Open-Meteo (via backend)",
        locationLabel: asStr(wc.location) ?? DEMO_SITE.locationLabel,
        temperatureC: asNum(wc.temperature_c ?? wc.temperature),
        humidityPct: asNum(wc.humidity_pct ?? wc.humidity),
        precipitationMm: asNum(wc.precipitation_mm ?? wc.precipitation),
        windSpeedKmh: asNum(wc.wind_speed_kmh ?? wc.wind_speed),
        condition: ({ "0": "Clear", "1": "Mostly clear", "2": "Partly cloudy", "3": "Overcast", "45": "Fog", "48": "Fog", "51": "Drizzle", "53": "Drizzle", "55": "Drizzle", "61": "Rain", "63": "Rain", "65": "Heavy rain", "80": "Showers", "81": "Showers", "82": "Heavy showers", "95": "Thunderstorm", "96": "Thunderstorm", "99": "Thunderstorm" } as Record<string, string>)[String(wc.condition)] ?? asStr(wc.condition) ?? "Unknown",
        observedAt: asStr(wc.observed_at),
        refreshedAt: asStr(wc.fetched_at),
        cacheStatus: wc.cached === true ? "cached" : "live",
      }
    : null;

  return {
    ...prev,
    telemetry,
    assessment,
    assessmentHistory: assessment && !prev.assessmentHistory.some((a) => a.id === assessment!.id) ? [assessment, ...prev.assessmentHistory].slice(0, 30) : prev.assessmentHistory,
    assessmentInProgress: raw.ai_in_progress === true,
    weather,
    serverTime,
    events: Array.isArray(raw.events) ? raw.events as MonitoringEvent[] : prev.events,
    site: {
      ...prev.site, name: "TerraGuard Field Node", nodeId: deviceId,
      locationLabel: wc && asStr(wc.location) ? asStr(wc.location)! : telemetry?.timestamp && lt ? `${asNum(lt.latitude)?.toFixed(4) ?? "—"}, ${asNum(lt.longitude)?.toFixed(4) ?? "—"}` : "Location unavailable",
      lat: lt ? asNum(lt.latitude) : null, lon: lt ? asNum(lt.longitude) : null, coordinatesAreDemo: false,
    },
    sensorHealth: {
      configured: 4,
      reporting: telemetry ? [telemetry.soilMoisture, telemetry.rainIntensity, telemetry.tilt, telemetry.groundDistanceCm].filter((r) => r.value !== null && r.source !== "manual_fallback").length : 0,
      stale: telemetry && telemetry.soilMoisture.freshness.status === "stale" ? 4 : 0,
      missing: telemetry ? [telemetry.soilMoisture, telemetry.rainIntensity, telemetry.tilt, telemetry.groundDistanceCm].filter((r) => r.value === null || r.source === "manual_fallback").length : 4,
      lastTelemetryAt: telemetry?.timestamp ?? null,
      updateIntervalSec: POLL_MS / 1000,
      quality: telemetry ? (telemetry.soilMoisture.freshness.status === "stale" || telemetry.rainIntensity.source === "manual_fallback" ? "degraded" : "good") : "unknown",
      simulated: false,
    },
  };
}

export function mapHistoryResponse(raw: unknown): HistoryPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObj)
    .map((r) => {
      const ts = asStr(r.timestamp);
      const baseline = asNum(r.baseline_distance_cm);
      const distance = asNum(r.ground_distance_cm);
      return {
        t: ts ? new Date(ts).getTime() : 0,
        soilMoisture: asNum(r.soil_moisture),
        rainIntensity: asNum(r.rain_intensity),
        groundDistanceCm: distance,
        groundShiftCm: asNum(r.ground_shift_cm) ?? (baseline !== null && distance !== null ? baseline - distance : null),
        tilt: r.tilt_triggered === true ? "TRIGGERED" : r.tilt_triggered === false ? "NORMAL" : null,
      } as HistoryPoint;
    })
    .filter((p) => p.t > 0)
    .sort((a, b) => a.t - b.t);
}

export function createBackendTerraGuardService(): TerraGuardService {
  const listeners = new Set<(s: MonitoringState) => void>();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let ws: WebSocket | null = null;
  let wsFailed = false;
  let runtimeHealth: { model?: string; ollama_reachable?: boolean; model_installed?: boolean } = {};

  const components = (): SystemComponent[] => [
    { key: "backend", label: "FastAPI backend", status: state.connection.state === "connected" ? "connected" : state.connection.state === "connecting" ? "connecting" : API_BASE_URL ? "disconnected" : "not_configured", detail: API_BASE_URL ?? "VITE_TERRAGUARD_API_BASE_URL not set" },
    { key: "ws", label: "WebSocket /ws", status: WS_URL ? (ws && ws.readyState === WebSocket.OPEN ? "connected" : wsFailed ? "disconnected" : "unverified") : "not_configured", detail: WS_URL ?? "REST polling is used" },
    { key: "esp32", label: "ESP32 telemetry", status: state.telemetry ? (state.telemetry.soilMoisture.freshness.status === "stale" ? "stale" : "connected") : "unverified", detail: state.telemetry ? `device ${state.telemetry.deviceId}` : "No telemetry received from backend" },
    { key: "gemma", label: runtimeHealth.model ?? "Gemma via Ollama", status: state.assessment ? "connected" : "unverified", detail: state.assessment?.provenance.source ?? "Waiting for latest assessment" },
    { key: "ollama", label: "Ollama runtime", status: runtimeHealth.ollama_reachable ? (runtimeHealth.model_installed ? "connected" : "stale") : "disconnected", detail: runtimeHealth.ollama_reachable ? `${runtimeHealth.model ?? "Model"} ${runtimeHealth.model_installed ? "installed" : "not installed"}` : "Ollama is unreachable" },
    { key: "weather", label: "Weather data (Open-Meteo)", status: state.weather ? (state.weather.cacheStatus === "cached" ? "stale" : "connected") : "unverified", detail: state.weather ? `${state.weather.provider} · ${state.weather.locationLabel}` : "Waiting for device location and weather response" },
    { key: "camera", label: "Browser camera", status: "unverified", detail: "Opt-in browser preview; Gemma vision endpoint available" },
    { key: "mic", label: "Browser microphone", status: "unverified", detail: "Opt-in local sound-level analysis; no recording or upload" },
  ];

  let state: MonitoringState = {
    site: { name: "TerraGuard Field Node", nodeId: "Awaiting node", locationLabel: "Location unavailable", lat: null, lon: null, coordinatesAreDemo: false, monitoringSince: new Date().toISOString() },
    connection: { mode: "connected", transport: "none", state: API_BASE_URL ? "connecting" : "error", lastUpdateAt: null, message: API_BASE_URL ? "Connecting to backend…" : "Backend base URL not configured (VITE_TERRAGUARD_API_BASE_URL)" },
    telemetry: null,
    history: [],
    tiltEvents: [],
    weather: null,
    assessment: null,
    assessmentHistory: [],
    assessmentInProgress: false,
    events: [],
    camera: { cameraId: "CAM_01", connection: "not_configured", previewActive: false, captureIntervalSec: 0, lastCaptureAt: null, nextCaptureAt: null, captures: [] },
    acoustic: { micState: "not_configured", monitoring: false, muted: false, intervalSec: 0, currentLevel: 0, peakLevel: 0, lastEventAt: null, events: [] },
    systemComponents: [],
    sensorHealth: { configured: 4, reporting: 0, stale: 0, missing: 4, lastTelemetryAt: null, updateIntervalSec: POLL_MS / 1000, quality: "unknown", simulated: false },
    simulationPaused: false,
    scenario: "normal",
    serverTime: null,
  };
  state.systemComponents = components();

  const emit = () => { state = { ...state, systemComponents: components() }; listeners.forEach((l) => l(state)); };

  const fetchJson = async (path: string, init?: RequestInit, timeoutMs = 8000) => {
    if (!API_BASE_URL) throw new Error("not_configured");
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(API_BASE_URL + path, { ...init, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(to); }
  };

  const pushSystemEvent = (title: string, description: string, severity: MonitoringEvent["severity"] = "info") => {
    const ev: MonitoringEvent = { id: `sys_${Date.now()}`, timestamp: new Date().toISOString(), category: "system", severity, title, description, acknowledged: false, read: false };
    state.events = [ev, ...state.events].slice(0, 120);
  };

  const poll = async () => {
    try {
      const raw = await fetchJson(API_ROUTES.state);
      state = mapStateResponse(raw, state);
      try { runtimeHealth = await fetchJson("/api/health", undefined, 5000); } catch { /* telemetry remains available if health is temporarily slow */ }
      state.connection = { ...state.connection, state: "connected", transport: ws?.readyState === WebSocket.OPEN ? "websocket" : "polling", lastUpdateAt: new Date().toISOString(), message: ws?.readyState === WebSocket.OPEN ? "WebSocket + REST state" : "REST polling /api/state" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (state.connection.state !== "disconnected") pushSystemEvent("Backend unreachable", `GET ${API_ROUTES.state} failed: ${msg}. No simulated values are substituted.`, "warning");
      state.connection = { ...state.connection, state: msg === "not_configured" ? "error" : "disconnected", transport: "none", message: msg === "not_configured" ? "Backend base URL not configured" : `Backend unreachable (${msg})` };
    }
    emit();
  };

  const openSocket = () => {
    if (!WS_URL) return;
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => { wsFailed = false; emit(); };
      ws.onmessage = (ev) => {
        // TODO (integration): confirm message format. Current assumption: same shape as /api/state.
        try { state = mapStateResponse(JSON.parse(ev.data), state); state.connection = { ...state.connection, transport: "websocket", state: "connected", lastUpdateAt: new Date().toISOString(), message: "WebSocket stream" }; emit(); }
        catch { pushSystemEvent("Invalid WebSocket message", "Message could not be validated against the expected state shape.", "warning"); emit(); }
      };
      ws.onerror = () => { wsFailed = true; emit(); };
      ws.onclose = () => { wsFailed = true; ws = null; emit(); };
    } catch { wsFailed = true; }
  };

  return {
    adapterName: "FastAPI backend adapter (connected)",
    start() {
      poll();
      openSocket();
      pollTimer = setInterval(poll, POLL_MS);
    },
    stop() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      ws?.close();
      ws = null;
    },
    getState: () => state,
    subscribe(l) { listeners.add(l); return (() => listeners.delete(l)) as Unsubscribe; },
    async loadHistory(rangeMs) {
      try {
        const raw = await fetchJson(`${API_ROUTES.history}?range_ms=${rangeMs}`); // TODO confirm query params
        const pts = mapHistoryResponse(raw);
        state.history = pts.slice(-2000);
        emit();
        return pts;
      } catch { return []; }
    },
    async requestAssessment() {
      try {
        await fetchJson(API_ROUTES.assess, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, 180_000);
        await poll();
        return state.assessment;
      } catch (e) {
        pushSystemEvent("Assessment request failed", e instanceof Error ? e.message : String(e), "warning");
        emit();
        return null;
      }
    },
    async loadAssessmentHistory() { return state.assessmentHistory; },
    async loadWeather() { return state.weather; },
    async loadEvents() { return state.events; },
    async sendChatMessage(message: string): Promise<ChatResponse> {
      try {
        const result = await fetchJson("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) }, 180_000);
        if (typeof result.reply !== "string" || !result.reply.trim()) return { ok: false, content: "Gemma returned an empty response.", source: "system", error: "invalid_response" };
        return { ok: true, content: result.reply, source: "gemma4" };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const timedOut = detail.includes("AbortError");
        return { ok: false, content: timedOut ? "Gemma took too long to answer. Try a shorter question." : detail, source: "system", error: timedOut ? "timeout" : "backend_unavailable" };
      }
    },
    acknowledgeEvent(id) { state.events = state.events.map((e) => (e.id === id ? { ...e, acknowledged: true, read: true } : e)); emit(); },
    markEventRead(id) { state.events = state.events.map((e) => (e.id === id ? { ...e, read: true } : e)); emit(); },
    markAllRead() { state.events = state.events.map((e) => ({ ...e, read: true })); emit(); },
    setCameraPreview() { /* not configured in connected mode */ },
    async captureSnapshot() { pushSystemEvent("Camera capture not configured", "No camera route in the confirmed backend contract.", "info"); emit(); },
    setAcousticMonitoring() { /* not configured */ },
    setAcousticMuted(muted) { state.acoustic = { ...state.acoustic, muted }; emit(); },
    setSimulationPaused() { /* no-op in connected mode */ },
    setScenario() { /* no-op in connected mode */ },
  };
}
