# TerraGuard: AI-Powered Environmental Monitoring and Landslide Investigation

TerraGuard combines ESP32 sensor telemetry, a Python backend, and a web dashboard for environmental monitoring and risk assessment.

## Repository layout

- `backend/` — Python API, inference/risk rules, and its standalone backend notes.
- `frontend/` — Vite/React dashboard and frontend setup notes.
- `firmware/esp32/` — ESP32 sketch and safe configuration template.

## Run locally

### Backend

From `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

Review `backend/README.md` and `.env.example` for model, CORS, and device settings.

### Frontend

From `frontend/`:

```powershell
npm install
npm run dev
```

Set `VITE_API_BASE_URL` in the frontend `.env` to the backend URL when they do not share an origin. The frontend README includes further details.

### ESP32

Open `firmware/esp32/terraguard_node.ino` in Arduino IDE. Copy `secrets.example.h` to `secrets.h` and fill in your local Wi-Fi and server settings. `secrets.h` is ignored by Git; never commit credentials.

## Safety note

This is a monitoring and decision-support prototype. Sensor/model alerts can be delayed or wrong and are not a substitute for official emergency guidance, validated instruments, or authorized disaster-management procedures. Contact local authorities through approved channels; this repository does not automatically dispatch emergency services.
