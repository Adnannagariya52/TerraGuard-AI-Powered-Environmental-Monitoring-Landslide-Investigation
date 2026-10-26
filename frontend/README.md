# TerraGuard Frontend

React, TypeScript, Vite, and Tailwind dashboard for the TerraGuard monitoring backend. This repository contains frontend source and lockfiles; generated output and dependencies are excluded.

## Run locally

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open the Vite URL shown in the terminal. `.env.local` is ignored by Git. The default API URL points to a backend on the same computer at `http://127.0.0.1:8000`. Change `VITE_TERRAGUARD_API_BASE_URL` to the backend origin before building for another host. Vite embeds these settings at build time.

## Build

```powershell
npm ci
npm run build
```

The `dist/` folder is generated and ignored by Git. For separate hosting, configure the backend's `CORS_ALLOW_ORIGINS` with this dashboard's exact origin. Never place secrets in `VITE_*` values; they are public in browser code.

## Integration notes

The dashboard uses the FastAPI backend for readings, alert state, Gemma chat, weather/outlook, and reports. Camera and microphone access are browser-local and require user permission; camera analysis sends only the app's configured transient frames to the backend. Sensor-based assessments are decision support and are not official alerts.
