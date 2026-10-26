/**
 * Mock TerraGuard Copilot — DEMO ONLY.
 * Produces answers from the *current* simulated state. Never claims to be Gemma.
 */

import type { HistoryPoint, MonitoringState } from "@/types/terraguard";
import { THRESHOLDS } from "@/data/mockTerraGuard";

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "unknown";

const num = (v: number | null, unit: string, d = 1) => (v === null ? "Unavailable" : `${v.toFixed(d)} ${unit}`.trim());

function pointAt(history: HistoryPoint[], msAgo: number): HistoryPoint | undefined {
  const target = Date.now() - msAgo;
  let best: HistoryPoint | undefined;
  for (const p of history) {
    if (p.t <= target) best = p;
    else break;
  }
  return best ?? history[0];
}

function delta(cur: number | null, prev: number | null | undefined, unit: string, d = 1) {
  if (cur === null || prev === null || prev === undefined) return "unavailable";
  const diff = cur - prev;
  const dir = Math.abs(diff) < (unit === "cm" ? 0.1 : 0.5) ? "unchanged" : diff > 0 ? "rose" : "fell";
  return dir === "unchanged" ? "remained roughly stable" : `${dir} by ${Math.abs(diff).toFixed(d)} ${unit}`;
}

const DISCLAIMER = "\n\n_Simulated response from the TerraGuard demo assistant — the connected Gemma 4 assistant is not yet available._";

export function answerFromState(question: string, s: MonitoringState): string {
  const q = question.toLowerCase();
  const t = s.telemetry;
  if (!t) return "No telemetry is available yet in the simulation." + DISCLAIMER;

  const soil = t.soilMoisture.value;
  const rain = t.rainIntensity.value;
  const shift = t.groundShiftCm;
  const dist = t.groundDistanceCm.value;
  const a = s.assessment;

  if (q.includes("unavailable") || q.includes("missing") || q.includes("stale") || q.includes("offline")) {
    const missing: string[] = [];
    if (t.groundDistanceCm.value === null) missing.push(`Ultrasonic ground distance (last reading ${fmtTime(t.groundDistanceCm.freshness.receivedAt)})`);
    if (s.weather?.cacheStatus === "stale") missing.push("Weather observation is stale");
    return (missing.length
      ? `The following inputs are currently unavailable or degraded:\n• ${missing.join("\n• ")}\n\nSensor health: ${s.sensorHealth.reporting}/${s.sensorHealth.configured} configured sensors reporting (simulated health values).`
      : `All ${s.sensorHealth.configured} configured sensors are reporting in the simulation. Last telemetry ${fmtTime(s.sensorHealth.lastTelemetryAt)}. Note that camera, microphone, Gemma and the backend are all simulated — none is verified as connected.`) + DISCLAIMER;
  }

  if (q.includes("why") || q.includes("status selected") || q.includes("reason")) {
    if (!a) return "No assessment has been generated yet." + DISCLAIMER;
    return `The current status **${a.riskLevel}** was selected at ${fmtTime(a.timestamp)} because: ${a.whySelected}\n\nContributing signals:\n• ${a.contributingSignals.join("\n• ")}\n\n${a.uncertainty}` + DISCLAIMER;
  }

  if (q.includes("changed") || q.includes("last five") || q.includes("last 5") || q.includes("minutes")) {
    const prev = pointAt(s.history, 5 * 60_000);
    return `Changes over the last five minutes (simulated):\n• Soil moisture ${delta(soil, prev?.soilMoisture, "%")} — now ${num(soil, "%")}.\n• Rain intensity ${delta(rain, prev?.rainIntensity, "%")} — now ${num(rain, "%")}.\n• Ground shift ${delta(shift, prev?.groundShiftCm, "cm", 2)} — now ${num(shift, "cm", 2)}.\n• Tilt sensor is currently ${t.tilt.value === "TRIGGERED" ? "TRIGGERED" : "NORMAL"}; ${s.tiltEvents.filter((e) => e.t > Date.now() - 5 * 60_000).length} tilt transition(s) in the window.` + DISCLAIMER;
  }

  if (q.includes("compare") || (q.includes("ground") && q.includes("moisture"))) {
    const prev = pointAt(s.history, 15 * 60_000);
    return `Comparing ground movement with soil moisture (simulated, 15-minute window):\n• Soil moisture ${delta(soil, prev?.soilMoisture, "%")} to ${num(soil, "%")} (watch reference ${THRESHOLDS.soilMoistureWatch} %).\n• Ground shift ${delta(shift, prev?.groundShiftCm, "cm", 2)} to ${num(shift, "cm", 2)} (watch reference ${THRESHOLDS.shiftWatchCm} cm).\n\nConvention: shift = baseline (${t.baselineDistanceCm} cm) − measured distance (${num(dist, "cm", 2)}); positive means movement toward the sensor. ${shift !== null && soil !== null && shift > THRESHOLDS.shiftWatchCm && soil > THRESHOLDS.soilMoistureWatch ? "Both signals are elevated together, which is the combination this prototype treats as more significant than either alone." : "The two signals are not currently elevated together."}` + DISCLAIMER;
  }

  if (q.includes("inspect") || q.includes("next") || q.includes("should") || q.includes("recommend")) {
    return `Recommended next step for the current simulated state (${a?.riskLevel ?? "no assessment"}):\n${a?.recommendedAction ?? "Continue routine monitoring."}\n\nAlso worth checking: the latest camera capture (${fmtTime(s.camera.lastCaptureAt)}) and acoustic sample (${fmtTime(s.acoustic.lastEventAt)}) — both simulated in this build.` + DISCLAIMER;
  }

  if (q.includes("weather") || q.includes("rain") && q.includes("forecast")) {
    const w = s.weather;
    if (!w) return "No weather context is available." + DISCLAIMER;
    return `Simulated weather for ${w.locationLabel}: ${w.condition}, ${num(w.temperatureC, "°C")}, humidity ${num(w.humidityPct, "%", 0)}, precipitation ${num(w.precipitationMm, "mm")}, wind ${num(w.windSpeedKmh, "km/h", 0)}. Observed ${fmtTime(w.observedAt)}. ${w.forecastSummary ?? ""}` + DISCLAIMER;
  }

  if (q.includes("summar") || q.includes("observation") || q.includes("overview")) {
    return `Environmental summary at ${fmtTime(t.timestamp)} (simulated):\n• Status: ${a?.riskLevel ?? "pending"} — ${a?.summary ?? ""}\n• Soil moisture ${num(soil, "%")}, rain intensity ${num(rain, "%")}, tilt ${t.tilt.value}, ground shift ${num(shift, "cm", 2)}.\n• Weather: ${s.weather?.condition ?? "n/a"}, ${num(s.weather?.temperatureC ?? null, "°C")}.\n• ${s.events.filter((e) => !e.acknowledged && e.severity !== "info").length} unacknowledged non-info events.` + DISCLAIMER;
  }

  if (q.includes("explain") || q.includes("reading") || q.includes("sensor") || q.includes("latest")) {
    return `Latest simulated readings (${fmtTime(t.timestamp)}, device ${t.deviceId}):\n• Soil moisture: ${num(soil, "%")} — ${soil !== null && soil >= THRESHOLDS.soilMoistureWarning ? "above warning reference" : soil !== null && soil >= THRESHOLDS.soilMoistureWatch ? "above watch reference" : "within normal range"}.\n• Rain intensity: ${num(rain, "%")} (relative percentage from the rain sensor, not mm).\n• Tilt sensor: ${t.tilt.value}.\n• Ground distance: ${num(dist, "cm", 2)} vs baseline ${t.baselineDistanceCm} cm → shift ${num(shift, "cm", 2)} ${shift !== null && shift > 0 ? "(toward sensor)" : ""}.` + DISCLAIMER;
  }

  return `I can only answer questions about the simulated monitoring data in this demo build (readings, changes, status reasons, unavailable sensors, weather, comparisons and next steps). The connected Gemma 4 assistant is not yet available, so this response is generated locally by the mock service.`;
}
