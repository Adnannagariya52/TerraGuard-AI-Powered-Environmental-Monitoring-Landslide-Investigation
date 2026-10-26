# TerraGuard Backend

FastAPI service for ESP32 telemetry, deterministic sensor-risk flags, SQLite history, local Ollama/Gemma summaries, weather context, and PDF reports. This repository contains code and example configuration only; live telemetry, generated reports, local databases, and secrets are excluded.

## Requirements

- Python 3.10 or newer
- Ollama installed locally with `gemma4:12b` pulled if you want model summaries
- A private, trusted network for the ESP32

## Run locally on Windows

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
Copy-Item .env.example .env
ollama pull gemma4:12b
py -m uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

The API docs are at `http://127.0.0.1:8000/docs`. To accept ESP32 posts over a private LAN, set the firmware server address to the laptop's current LAN IPv4 (never `localhost`) and allow TCP 8000 only on the private firewall profile. Do not port-forward this prototype to the public internet.

## Separate frontend origin

Set `CORS_ALLOW_ORIGINS` in `.env` to the exact frontend origin(s), comma-separated, for example `https://your-dashboard.example`. Do not use `*` for a public deployment. The defaults permit local Vite development origins. The frontend build also needs `VITE_TERRAGUARD_API_BASE_URL` set to this API's origin. Use HTTPS for non-local deployments.

## Model and environment

Edit `.env` after copying `.env.example`. The default model is `gemma4:12b`; keep Ollama private on loopback. Set `DATABASE_PATH` to durable local storage. `RAIN_SENSOR_OVERRIDE_PCT` is blank by default; a manual fallback must be clearly labeled and is excluded from automatic risk scoring. Weather lookup is opt-in via `WEATHER_API_ENABLED`.

## Main API routes

- `POST /api/telemetry` — ESP32 device telemetry
- `GET /api/state`, `/api/readings`, `/api/readings/latest` — current and recent readings
- `GET /api/health`, `/api/config` — service/model status and thresholds
- `POST /api/chat` — Gemma chat grounded in current monitoring data
- `POST /api/vision/analyze`, `/api/vision/stop` — transient browser camera analysis
- `GET /api/environment`, `/api/outlook` — weather and forecast context
- `GET /api/reports`, `/api/daily-reports` — local report drafts and PDFs

Risk outputs are prototype decision support, not confirmed landslides, official warnings, or evacuation orders. Reports/notices are not automatically transmitted to agencies or residents.
