/**
 * Environment-driven configuration (Vite convention: VITE_* variables).
 *
 * VITE_TERRAGUARD_API_BASE_URL  — base URL of the FastAPI backend,
 *                                 e.g. http://YOUR_BACKEND_HOST:8000
 *                                 NOTE: `localhost` in a browser refers to the
 *                                 machine running the browser, NOT the backend laptop.
 * VITE_TERRAGUARD_WS_URL        — optional explicit WebSocket URL (defaults to <base>/ws)
 * VITE_TERRAGUARD_DEFAULT_MODE  — "demo" | "connected" (default demo)
 * VITE_TERRAGUARD_POLL_MS       — REST polling interval when WebSocket is unavailable
 *
 * Never put model credentials or secrets here — this bundle ships to the browser.
 */

import type { DataMode } from "@/types/terraguard";

const env = import.meta.env as Record<string, string | undefined>;

function trimSlash(s: string) {
  return s.replace(/\/+$/, "");
}

export const API_BASE_URL: string | null = env.VITE_TERRAGUARD_API_BASE_URL
  ? trimSlash(env.VITE_TERRAGUARD_API_BASE_URL)
  : typeof window !== "undefined" && window.location.protocol.startsWith("http")
    ? trimSlash(window.location.origin)
    : null;

// FastAPI currently exposes polling endpoints only; opt into a WebSocket URL only when configured.
export const WS_URL: string | null = env.VITE_TERRAGUARD_WS_URL || null;

export const DEFAULT_MODE: DataMode =
  env.VITE_TERRAGUARD_DEFAULT_MODE === "demo" ? "demo" : "connected";

export const POLL_MS: number = Number(env.VITE_TERRAGUARD_POLL_MS ?? 5000);

/** Expected backend routes (confirm actual payloads with the backend developer). */
export const API_ROUTES = {
  state: "/api/state",
  history: "/api/history",
  telemetry: "/api/telemetry", // POST — device → backend only. Frontend must NOT post here.
  assess: "/api/assess",
  ws: "/ws",
} as const;

export const APP_VERSION = "0.1.0-frontend-prototype";
