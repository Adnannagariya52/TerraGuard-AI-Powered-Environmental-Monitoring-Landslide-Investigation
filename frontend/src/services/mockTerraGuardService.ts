/**
 * Mock TerraGuard adapter — DEMO MODE ONLY.
 *
 * One coherent simulation loop drives every panel. Nothing here touches the
 * network, the microphone, a camera or the real /api/telemetry endpoint.
 */

import type {
  AcousticState,
  Assessment,
  AudioEvent,
  CameraState,
  CaptureRecord,
  ChatResponse,
  DemoScenario,
  EvidenceItem,
  EventCategory,
  EventSeverity,
  FreshnessMeta,
  HistoryPoint,
  MonitoringEvent,
  MonitoringState,
  RiskLevel,
  TelemetrySnapshot,
  TiltState,
  WeatherObservation,
} from "@/types/terraguard";
import type { TerraGuardService, Unsubscribe } from "./terraguardService";
import {
  DEMO_DEVICE_ID,
  DEMO_SITE,
  DEMO_SYSTEM_COMPONENTS,
  SCENARIOS,
  THRESHOLDS,
  WEATHER_CONDITIONS,
} from "@/data/mockTerraGuard";
import { answerFromState } from "./mockChatService";

const TICK_MS = 2500;
const HISTORY_LIMIT = 1600; // ~66 min at 2.5 s
const EVENT_LIMIT = 120;
const ASSESSMENT_LIMIT = 30;
const CAPTURE_LIMIT = 24;
const AUDIO_EVENT_LIMIT = 40;
const CAMERA_INTERVAL_SEC = 30;
const AUDIO_INTERVAL_SEC = 20;
const ASSESSMENT_INTERVAL_MS = 45_000;
const EVENT_COOLDOWN_MS = 60_000;
const STALE_AFTER_MS = 15_000;

let idCounter = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const jitter = (amp: number) => (Math.random() - 0.5) * 2 * amp;

export function createMockTerraGuardService(): TerraGuardService {
  const listeners = new Set<(s: MonitoringState) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let started = false;
  let initialised = false;

  // ---- internal simulation variables ----
  let scenario: DemoScenario = "normal";
  let soil = 38;
  let rain = 12;
  let shift = 0.2;
  let tilt: TiltState = "NORMAL";
  let tiltHoldTicks = 0;
  let distanceMissingSince: number | null = null;
  let lastAssessmentAt = 0;
  let lastCameraAt = Date.now() - 12_000;
  let lastAudioAt = Date.now() - 6_000;
  let captureSeq = 0;
  const eventCooldowns = new Map<string, number>();
  let lastRisk: RiskLevel = "SAFE";

  // ---- seed history (1 hour of plausible normal data) ----
  const seedHistory = (): HistoryPoint[] => {
    const pts: HistoryPoint[] = [];
    const now = Date.now();
    let s = 36, r = 10, sh = 0.1;
    for (let t = now - 60 * 60 * 1000; t < now; t += 5000) {
      s = clamp(s + jitter(0.5) + Math.sin(t / 400_000) * 0.1, 30, 45);
      r = clamp(r + jitter(0.9) + Math.sin(t / 250_000) * 0.15, 4, 20);
      sh = clamp(sh + jitter(0.03), -0.3, 0.5);
      pts.push({
        t,
        soilMoisture: round(s),
        rainIntensity: round(r),
        groundDistanceCm: round(THRESHOLDS.baselineDistanceCm - sh, 2),
        groundShiftCm: round(sh, 2),
        tilt: "NORMAL",
      });
    }
    soil = s; rain = r; shift = sh;
    return pts;
  };

  const now = new Date();
  const initialWeather = (): WeatherObservation => ({
    provider: "Open-Meteo (simulated)",
    locationLabel: DEMO_SITE.locationLabel,
    temperatureC: 17.4,
    humidityPct: 82,
    precipitationMm: 1.2,
    windSpeedKmh: 9,
    condition: "Overcast",
    observedAt: now.toISOString(),
    refreshedAt: now.toISOString(),
    cacheStatus: "simulated",
    forecastSummary: "Simulated forecast: showers continuing for the next 6 hours.",
  });

  const state: MonitoringState = {
    site: DEMO_SITE,
    connection: {
      mode: "demo",
      transport: "simulation",
      state: "connected",
      lastUpdateAt: now.toISOString(),
      message: "Demo simulation loop active — no backend or device connected",
    },
    telemetry: null,
    history: seedHistory(),
    tiltEvents: [{ t: Date.now() - 60 * 60 * 1000, state: "NORMAL" }],
    weather: initialWeather(),
    assessment: null,
    assessmentHistory: [],
    assessmentInProgress: false,
    events: [],
    camera: {
      cameraId: "CAM_01",
      connection: "simulated",
      previewActive: true,
      captureIntervalSec: CAMERA_INTERVAL_SEC,
      lastCaptureAt: null,
      nextCaptureAt: null,
      captures: [],
    },
    acoustic: {
      micState: "simulated",
      monitoring: true,
      muted: false,
      intervalSec: AUDIO_INTERVAL_SEC,
      currentLevel: 0.18,
      peakLevel: 0.18,
      lastEventAt: null,
      events: [],
    },
    systemComponents: DEMO_SYSTEM_COMPONENTS,
    sensorHealth: {
      configured: 4,
      reporting: 4,
      stale: 0,
      missing: 0,
      lastTelemetryAt: null,
      updateIntervalSec: TICK_MS / 1000,
      quality: "good",
      simulated: true,
    },
    simulationPaused: false,
    scenario: "normal",
    serverTime: now.toISOString(),
  };

  const emit = () => {
    const snapshot = { ...state };
    listeners.forEach((l) => l(snapshot));
  };

  // ---- helpers ----
  const fresh = (iso: string): FreshnessMeta => ({ receivedAt: iso, ageMs: 0, status: "fresh" });
  const missing = (since: number | null): FreshnessMeta => ({
    receivedAt: since ? new Date(since).toISOString() : null,
    ageMs: since ? Date.now() - since : null,
    status: since && Date.now() - since > STALE_AFTER_MS ? "missing" : "stale",
  });

  const pushEvent = (
    key: string,
    category: EventCategory,
    severity: EventSeverity,
    title: string,
    description: string,
    evidence?: string,
    cooldownMs = EVENT_COOLDOWN_MS,
  ) => {
    const last = eventCooldowns.get(key) ?? 0;
    if (Date.now() - last < cooldownMs) return;
    eventCooldowns.set(key, Date.now());
    const ev: MonitoringEvent = {
      id: uid("ev"),
      timestamp: new Date().toISOString(),
      category,
      severity,
      title,
      description,
      evidence,
      acknowledged: false,
      read: false,
    };
    state.events = [ev, ...state.events].slice(0, EVENT_LIMIT);
  };

  const classify = (): { level: RiskLevel; reasons: string[] } => {
    const reasons: string[] = [];
    let score = 0;
    const distMissing = distanceMissingSince !== null;
    if (soil >= THRESHOLDS.soilMoistureCritical) { score += 3; reasons.push("Soil moisture above critical reference"); }
    else if (soil >= THRESHOLDS.soilMoistureWarning) { score += 2; reasons.push("Soil moisture above warning reference"); }
    else if (soil >= THRESHOLDS.soilMoistureWatch) { score += 1; reasons.push("Soil moisture above watch reference"); }
    if (rain >= THRESHOLDS.rainWarning) { score += 2; reasons.push("Rain intensity high"); }
    else if (rain >= THRESHOLDS.rainWatch) { score += 1; reasons.push("Rain intensity elevated"); }
    if (!distMissing) {
      if (shift >= THRESHOLDS.shiftCriticalCm) { score += 4; reasons.push("Ground shift above critical reference"); }
      else if (shift >= THRESHOLDS.shiftWarningCm) { score += 2; reasons.push("Ground shift above warning reference"); }
      else if (shift >= THRESHOLDS.shiftWatchCm) { score += 1; reasons.push("Ground shift above watch reference"); }
    } else {
      reasons.push("Ultrasonic distance unavailable — displacement cannot be evaluated");
    }
    if (tilt === "TRIGGERED") { score += 2; reasons.push("Tilt sensor triggered"); }
    let level: RiskLevel = "SAFE";
    if (score >= 6) level = "CRITICAL";
    else if (score >= 4) level = "WARNING";
    else if (score >= 2) level = "WATCH";
    if (level === "SAFE" && reasons.length === 0) reasons.push("All monitored signals within normal reference ranges");
    return { level, reasons };
  };

  const trendOf = (key: keyof Pick<HistoryPoint, "soilMoisture" | "rainIntensity" | "groundShiftCm">, windowMs = 5 * 60_000): EvidenceItem["trend"] => {
    const cutoff = Date.now() - windowMs;
    const pts = state.history.filter((p) => p.t >= cutoff && p[key] !== null);
    if (pts.length < 4) return "unavailable";
    const a = pts[0][key] as number;
    const b = pts[pts.length - 1][key] as number;
    const diff = b - a;
    const tol = key === "groundShiftCm" ? 0.3 : 2;
    return diff > tol ? "rising" : diff < -tol ? "falling" : "stable";
  };

  const buildAssessment = (): Assessment => {
    const { level, reasons } = classify();
    const tele = state.telemetry!;
    const ts = new Date().toISOString();
    const distMissing = distanceMissingSince !== null;

    const evidence: EvidenceItem[] = [
      { label: "Soil moisture", value: soil.toFixed(1), unit: "%", timestamp: tele.timestamp, trend: trendOf("soilMoisture") },
      { label: "Rain intensity", value: rain.toFixed(1), unit: "%", timestamp: tele.timestamp, trend: trendOf("rainIntensity") },
      { label: "Tilt sensor", value: tilt === "TRIGGERED" ? "Triggered" : "Normal", unit: "", timestamp: tele.timestamp, trend: "stable" },
      distMissing
        ? { label: "Ground shift", value: "Unavailable", unit: "cm", timestamp: tele.groundDistanceCm.freshness.receivedAt, trend: "unavailable" }
        : { label: "Ground shift", value: shift.toFixed(2), unit: "cm", timestamp: tele.timestamp, trend: trendOf("groundShiftCm") },
    ];

    const summaries: Record<RiskLevel, string> = {
      SAFE: "Simulated readings remain within normal reference ranges. No tilt activation or notable ground displacement is present in the demo data.",
      WATCH: "One or more simulated signals have moved above watch references. Conditions warrant closer observation but do not indicate active movement.",
      WARNING: "Several simulated signals are elevated together, including moisture and/or ground-shift references. The combination is consistent with conditions that merit on-site review.",
      CRITICAL: "Simulated signals indicate a combination of saturated soil, significant ground shift and/or tilt activation. Treat as a high-priority investigation scenario in this demo.",
    };
    const actions: Record<RiskLevel, string> = {
      SAFE: "Continue routine monitoring. Verify sensor freshness at the next scheduled check.",
      WATCH: "Increase review frequency for soil moisture and rain trends. Confirm the ultrasonic baseline is still valid.",
      WARNING: "Review camera captures for surface change, verify tilt and distance readings in person if safe, and brief the responsible operator.",
      CRITICAL: "Escalate to the responsible authority per site procedure, avoid the slope area, and cross-check all readings against independent observations.",
    };

    const unavailable: string[] = [];
    if (distMissing) unavailable.push("Ultrasonic ground distance");
    if (state.weather?.cacheStatus === "stale") unavailable.push("Weather observation (stale)");

    return {
      id: uid("as"),
      timestamp: ts,
      riskLevel: level,
      landslideFlag: level === "CRITICAL",
      confidenceScore: round(0.55 + Math.random() * 0.3, 2),
      summary: summaries[level],
      whySelected: reasons.join("; ") + ".",
      evidence,
      contributingSignals: reasons,
      unavailableInputs: unavailable,
      uncertainty: distMissing
        ? "Ground displacement cannot be assessed because the ultrasonic sensor is not reporting. The assessment relies on moisture, rain and tilt only. Confidence score is uncalibrated demo metadata."
        : "Demo thresholds are illustrative and uncalibrated. Weather context is simulated. Confidence score is model-reported metadata, not a validated probability.",
      recommendedAction: actions[level],
      provenance: {
        mode: "demo",
        source: "Simulated Gemma assessment (mock service)",
        dataTimestamp: tele.timestamp,
        usedStaleData: distMissing,
      },
    };
  };

  const runAssessment = () => {
    if (!state.telemetry) return;
    state.assessmentInProgress = true;
    emit();
    setTimeout(() => {
      const a = buildAssessment();
      state.assessment = a;
      state.assessmentHistory = [a, ...state.assessmentHistory].slice(0, ASSESSMENT_LIMIT);
      state.assessmentInProgress = false;
      lastAssessmentAt = Date.now();
      const sev: EventSeverity = a.riskLevel === "CRITICAL" ? "critical" : a.riskLevel === "WARNING" ? "warning" : a.riskLevel === "WATCH" ? "watch" : "info";
      if (a.riskLevel !== lastRisk) {
        pushEvent(`risk_${a.riskLevel}`, "assessment", sev, `Assessment status changed to ${a.riskLevel}`, a.summary, `Simulated Gemma · ${a.contributingSignals[0] ?? ""}`, 0);
        lastRisk = a.riskLevel;
      } else {
        pushEvent("assessment_generated", "assessment", "info", "New simulated assessment generated", `Status remains ${a.riskLevel}.`, "Simulated Gemma assessment", ASSESSMENT_INTERVAL_MS - 1000);
      }
      emit();
    }, 1400);
  };

  const doCapture = (manual: boolean) => {
    captureSeq += 1;
    const ts = new Date().toISOString();
    const rec: CaptureRecord = {
      id: uid("cap"),
      sequence: captureSeq,
      capturedAt: ts,
      imageUrl: "demo://terrain",
      processingStatus: "simulated",
      simulated: true,
    };
    state.camera = {
      ...state.camera,
      lastCaptureAt: ts,
      nextCaptureAt: new Date(Date.now() + CAMERA_INTERVAL_SEC * 1000).toISOString(),
      captures: [rec, ...state.camera.captures].slice(0, CAPTURE_LIMIT),
    };
    lastCameraAt = Date.now();
    pushEvent(manual ? `cap_manual_${captureSeq}` : "cap_auto", "camera", "info",
      manual ? "Demo image captured (manual)" : "Demo image captured",
      `Simulated frame #${captureSeq} recorded by ${state.camera.cameraId}.`, `Sequence ${captureSeq}`, manual ? 0 : CAMERA_INTERVAL_SEC * 1000 - 500);
  };

  const doAudioSample = () => {
    const ts = new Date().toISOString();
    const base = 0.1 + rain / 250 + (tilt === "TRIGGERED" ? 0.25 : 0);
    const level = clamp(base + Math.random() * 0.2, 0.02, 1);
    const peak = clamp(level + Math.random() * 0.25, level, 1);
    const label = peak > 0.7 ? "Transient burst" : peak > 0.4 ? "Elevated ambient" : "Low ambient";
    const ev: AudioEvent = { id: uid("au"), recordedAt: ts, relativeLevel: round(level, 2), peakLevel: round(peak, 2), label, simulated: true };
    state.acoustic = {
      ...state.acoustic,
      currentLevel: round(level, 2),
      peakLevel: Math.max(state.acoustic.peakLevel, round(peak, 2)),
      lastEventAt: ts,
      events: [ev, ...state.acoustic.events].slice(0, AUDIO_EVENT_LIMIT),
    };
    lastAudioAt = Date.now();
    pushEvent("audio_sample", "audio", "info", "Demo audio sample recorded", `${label} · relative level ${level.toFixed(2)} (0–1 scale, not dB).`, `Peak ${peak.toFixed(2)}`, AUDIO_INTERVAL_SEC * 1000 - 500);
  };

  const updateWeather = () => {
    const w = state.weather!;
    const ts = new Date().toISOString();
    const targetPrecip = rain / 12;
    const condIdx = rain > 65 ? 3 : rain > 40 ? 2 : rain > 20 ? 1 : rain > 10 ? 4 : 0;
    state.weather = {
      ...w,
      temperatureC: round(clamp((w.temperatureC ?? 17) + jitter(0.15), 12, 24)),
      humidityPct: Math.round(clamp((w.humidityPct ?? 80) + (rain > 40 ? 0.4 : -0.1) + jitter(0.6), 55, 99)),
      precipitationMm: round((w.precipitationMm ?? 1) + (targetPrecip - (w.precipitationMm ?? 1)) * 0.2, 1),
      windSpeedKmh: Math.round(clamp((w.windSpeedKmh ?? 9) + jitter(1), 2, 30)),
      condition: WEATHER_CONDITIONS[condIdx],
      observedAt: ts,
      refreshedAt: ts,
      cacheStatus: "simulated",
    };
  };

  // ---- main tick ----
  const tick = () => {
    const prof = SCENARIOS[scenario];
    const tsNum = Date.now();
    const ts = new Date(tsNum).toISOString();
    const prevSoil = soil, prevRain = rain, prevShift = shift;

    soil = clamp(soil + (prof.soilTarget - soil) * prof.drift + jitter(0.6), 5, 98);
    rain = clamp(rain + (prof.rainTarget - rain) * prof.drift + jitter(1.4), 0, 100);
    shift = clamp(shift + (prof.shiftTarget - shift) * prof.drift + jitter(0.05), -1, 8);

    // tilt behaviour
    if (tiltHoldTicks > 0) {
      tiltHoldTicks -= 1;
      if (tiltHoldTicks === 0 && tilt === "TRIGGERED") {
        tilt = "NORMAL";
        state.tiltEvents = [...state.tiltEvents, { t: tsNum, state: "NORMAL" as TiltState }].slice(-60);
        pushEvent("tilt_normal", "tilt", "info", "Tilt sensor returned to normal", "Simulated tilt state cleared.", undefined, 0);
      }
    } else if (tilt === "NORMAL" && Math.random() < prof.tiltProbabilityPerTick) {
      tilt = "TRIGGERED";
      tiltHoldTicks = 3 + Math.floor(Math.random() * 4);
      state.tiltEvents = [...state.tiltEvents, { t: tsNum, state: "TRIGGERED" as TiltState }].slice(-60);
      pushEvent("tilt_trig", "tilt", "warning", "Tilt sensor triggered", "Simulated tilt switch changed from NORMAL to TRIGGERED.", `Soil ${soil.toFixed(1)} % · shift ${shift.toFixed(2)} cm`, 0);
    }

    // distance availability
    if (prof.distanceMissing && distanceMissingSince === null) {
      distanceMissingSince = tsNum;
      pushEvent("dist_missing", "system", "warning", "Ultrasonic sensor stopped reporting", "No distance reading received; displacement cannot be calculated.", undefined, 0);
    } else if (!prof.distanceMissing && distanceMissingSince !== null) {
      distanceMissingSince = null;
      pushEvent("dist_back", "system", "info", "Ultrasonic sensor reporting again", "Distance readings resumed.", undefined, 0);
    }
    const distMissing = distanceMissingSince !== null;
    const distance = distMissing ? null : round(THRESHOLDS.baselineDistanceCm - shift, 2);
    const shiftVal = distMissing ? null : round(shift, 2);

    // telemetry snapshot
    state.telemetry = {
      timestamp: ts,
      deviceId: DEMO_DEVICE_ID,
      soilMoisture: { value: round(soil), unit: "%", freshness: fresh(ts), previous: round(prevSoil) },
      rainIntensity: { value: round(rain), unit: "%", freshness: fresh(ts), previous: round(prevRain) },
      tilt: { value: tilt, unit: "", freshness: fresh(ts), previous: tilt },
      groundDistanceCm: {
        value: distance,
        unit: "cm",
        freshness: distMissing ? missing(distanceMissingSince) : fresh(ts),
        previous: round(THRESHOLDS.baselineDistanceCm - prevShift, 2),
      },
      baselineDistanceCm: THRESHOLDS.baselineDistanceCm,
      groundShiftCm: shiftVal,
    };

    state.history = [
      ...state.history,
      { t: tsNum, soilMoisture: round(soil), rainIntensity: round(rain), groundDistanceCm: distance, groundShiftCm: shiftVal, tilt },
    ].slice(-HISTORY_LIMIT);

    // threshold-transition events (with cooldown)
    const crossed = (prev: number, cur: number, th: number) => prev < th && cur >= th;
    if (crossed(prevSoil, soil, THRESHOLDS.soilMoistureWatch)) pushEvent("soil_watch", "sensor", "watch", "Soil moisture crossed watch reference", `Reading reached ${soil.toFixed(1)} % (watch reference ${THRESHOLDS.soilMoistureWatch} %).`, `${soil.toFixed(1)} %`);
    if (crossed(prevSoil, soil, THRESHOLDS.soilMoistureWarning)) pushEvent("soil_warn", "sensor", "warning", "Soil moisture crossed warning reference", `Reading reached ${soil.toFixed(1)} % (warning reference ${THRESHOLDS.soilMoistureWarning} %).`, `${soil.toFixed(1)} %`);
    if (crossed(prevRain, rain, THRESHOLDS.rainWatch)) pushEvent("rain_watch", "sensor", "watch", "Rain intensity rising", `Rain intensity reached ${rain.toFixed(1)} %.`, `${rain.toFixed(1)} %`);
    if (crossed(prevRain, rain, THRESHOLDS.rainWarning)) pushEvent("rain_warn", "sensor", "warning", "Rain intensity high", `Rain intensity reached ${rain.toFixed(1)} %.`, `${rain.toFixed(1)} %`);
    if (!distMissing && crossed(prevShift, shift, THRESHOLDS.shiftWatchCm)) pushEvent("shift_watch", "displacement", "watch", "Ground shift above watch reference", `Calculated shift ${shift.toFixed(2)} cm toward sensor.`, `${shift.toFixed(2)} cm`);
    if (!distMissing && crossed(prevShift, shift, THRESHOLDS.shiftWarningCm)) pushEvent("shift_warn", "displacement", "warning", "Ground displacement exceeded warning reference", `Calculated shift ${shift.toFixed(2)} cm toward sensor.`, `${shift.toFixed(2)} cm`);
    if (!distMissing && crossed(prevShift, shift, THRESHOLDS.shiftCriticalCm)) pushEvent("shift_crit", "displacement", "critical", "Ground displacement exceeded critical reference", `Calculated shift ${shift.toFixed(2)} cm toward sensor.`, `${shift.toFixed(2)} cm`);

    // sensor health
    state.sensorHealth = {
      ...state.sensorHealth,
      reporting: distMissing ? 3 : 4,
      stale: 0,
      missing: distMissing ? 1 : 0,
      lastTelemetryAt: ts,
      quality: distMissing ? "degraded" : "good",
    };

    // acoustic ambient level drifts even between samples
    if (state.acoustic.monitoring) {
      const base = 0.1 + rain / 250 + (tilt === "TRIGGERED" ? 0.25 : 0);
      state.acoustic = { ...state.acoustic, currentLevel: round(clamp(base + jitter(0.06), 0.02, 1), 2) };
    }

    // periodic collectors
    if (state.camera.previewActive && tsNum - lastCameraAt >= CAMERA_INTERVAL_SEC * 1000) doCapture(false);
    if (state.acoustic.monitoring && tsNum - lastAudioAt >= AUDIO_INTERVAL_SEC * 1000) doAudioSample();
    if (tsNum % 4 < 1 || Math.random() < 0.15) updateWeather();
    if (!state.assessmentInProgress && tsNum - lastAssessmentAt >= ASSESSMENT_INTERVAL_MS) runAssessment();

    state.connection = { ...state.connection, lastUpdateAt: ts };
    state.serverTime = ts;
    state.camera = { ...state.camera, nextCaptureAt: state.camera.previewActive ? new Date(lastCameraAt + CAMERA_INTERVAL_SEC * 1000).toISOString() : null };
    emit();
  };

  // ---- service implementation ----
  const service: TerraGuardService = {
    adapterName: "Mock simulation adapter (demo)",
    start() {
      if (started) return;
      started = true;
      tick();
      // initial collectors so panels are populated (once per service instance)
      if (!initialised) {
        initialised = true;
        doCapture(false);
        doAudioSample();
        runAssessment();
      }
      timer = setInterval(() => { if (!state.simulationPaused) tick(); }, TICK_MS);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      started = false;
    },
    getState: () => ({ ...state }),
    subscribe(listener) {
      listeners.add(listener);
      return (() => listeners.delete(listener)) as Unsubscribe;
    },
    async loadHistory(rangeMs) {
      const cutoff = Date.now() - rangeMs;
      return state.history.filter((p) => p.t >= cutoff);
    },
    async requestAssessment() {
      if (state.assessmentInProgress) return state.assessment;
      runAssessment();
      return new Promise((resolve) => setTimeout(() => resolve(state.assessment), 1500));
    },
    async loadAssessmentHistory() { return state.assessmentHistory; },
    async loadWeather() { return state.weather; },
    async loadEvents() { return state.events; },
    async sendChatMessage(message): Promise<ChatResponse> {
      await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
      return { ok: true, content: answerFromState(message, state), source: "mock" };
    },
    acknowledgeEvent(id) {
      state.events = state.events.map((e) => (e.id === id ? { ...e, acknowledged: true, read: true } : e));
      emit();
    },
    markEventRead(id) {
      state.events = state.events.map((e) => (e.id === id ? { ...e, read: true } : e));
      emit();
    },
    markAllRead() {
      state.events = state.events.map((e) => ({ ...e, read: true }));
      emit();
    },
    setCameraPreview(active) {
      state.camera = { ...state.camera, previewActive: active } as CameraState;
      emit();
    },
    async captureSnapshot() {
      await new Promise((r) => setTimeout(r, 500));
      doCapture(true);
      emit();
    },
    setAcousticMonitoring(active) {
      state.acoustic = { ...state.acoustic, monitoring: active, micState: active ? "simulated" : "paused" } as AcousticState;
      emit();
    },
    setAcousticMuted(muted) {
      state.acoustic = { ...state.acoustic, muted };
      emit();
    },
    setSimulationPaused(paused) {
      state.simulationPaused = paused;
      emit();
    },
    setScenario(next) {
      scenario = next;
      state.scenario = next;
      pushEvent(`scenario_${next}_${Date.now()}`, "system", "info", "Demo scenario changed", `Simulation now following “${SCENARIOS[next].label}”.`, undefined, 0);
      lastAssessmentAt = Date.now() - ASSESSMENT_INTERVAL_MS + 8000; // reassess shortly
      emit();
    },
  };

  return service;
}

// Re-export types used by TelemetrySnapshot consumers
export type { TelemetrySnapshot };
