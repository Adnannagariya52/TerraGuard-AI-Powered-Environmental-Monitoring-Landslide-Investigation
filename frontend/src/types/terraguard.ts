/**
 * TerraGuard — central data contracts.
 * All UI components consume these types. Both the mock adapter and the future
 * real backend adapter must produce data in this shape.
 */

export type RiskLevel = "SAFE" | "WATCH" | "WARNING" | "CRITICAL";
export type DataMode = "demo" | "connected";

export type Freshness = "fresh" | "stale" | "missing" | "unknown";

export interface FreshnessMeta {
  /** ISO timestamp of the source reading / receive time. Never regenerated on render. */
  receivedAt: string | null;
  ageMs: number | null;
  status: Freshness;
}

export interface SensorReading<T = number> {
  value: T | null;
  unit: string;
  freshness: FreshnessMeta;
  /** previous value for delta display */
  previous: T | null;
  /** Manual substitute for a failed physical sensor; never treat it as measured data. */
  source?: "sensor" | "manual_fallback";
}

export type TiltState = "NORMAL" | "TRIGGERED";

export interface TelemetrySnapshot {
  /** ISO timestamp from the source (device/backend), not render time */
  timestamp: string;
  deviceId: string;
  soilMoisture: SensorReading;          // %
  rainIntensity: SensorReading;         // %
  tilt: SensorReading<TiltState>;
  groundDistanceCm: SensorReading;      // cm
  baselineDistanceCm: number | null;    // cm
  /** groundShift = baseline - distance. Positive = movement toward sensor. */
  groundShiftCm: number | null;
}

export interface HistoryPoint {
  t: number; // epoch ms
  soilMoisture: number | null;
  rainIntensity: number | null;
  groundDistanceCm: number | null;
  groundShiftCm: number | null;
  tilt: TiltState | null;
}

export interface TiltEvent {
  t: number;
  state: TiltState;
}

export interface WeatherObservation {
  provider: string;        // "Open-Meteo (simulated)" in demo
  locationLabel: string;
  temperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  condition: string;
  observedAt: string | null;
  refreshedAt: string | null;
  cacheStatus: "live" | "cached" | "stale" | "unavailable" | "simulated";
  forecastSummary?: string;
}

export interface EvidenceItem {
  label: string;
  value: string;
  unit: string;
  timestamp: string | null;
  trend: "rising" | "falling" | "stable" | "unavailable";
}

export interface Assessment {
  id: string;
  timestamp: string;
  riskLevel: RiskLevel;
  landslideFlag: boolean;
  /** Uncalibrated model-reported metadata, NOT a validated probability. */
  confidenceScore: number | null;
  summary: string;
  whySelected: string;
  evidence: EvidenceItem[];
  contributingSignals: string[];
  unavailableInputs: string[];
  uncertainty: string;
  recommendedAction: string;
  provenance: {
    mode: DataMode;
    source: string; // e.g. "Simulated Gemma assessment" | "gemma4 via ollama"
    dataTimestamp: string | null;
    usedStaleData: boolean;
  };
}

export type EventCategory =
  | "sensor"
  | "tilt"
  | "displacement"
  | "assessment"
  | "camera"
  | "audio"
  | "system";
export type EventSeverity = "info" | "watch" | "warning" | "critical";

export interface MonitoringEvent {
  id: string;
  timestamp: string;
  category: EventCategory;
  severity: EventSeverity;
  title: string;
  description: string;
  evidence?: string;
  acknowledged: boolean;
  read: boolean;
}

export interface CaptureRecord {
  id: string;
  sequence: number;
  capturedAt: string;
  /** URL / data URL / object URL. Future real adapter may supply blob URLs. */
  imageUrl: string | null;
  processingStatus: "simulated" | "pending" | "processed" | "failed";
  simulated: boolean;
}

export interface CameraState {
  cameraId: string;
  connection: "simulated" | "connected" | "disconnected" | "not_configured";
  previewActive: boolean;
  captureIntervalSec: number;
  lastCaptureAt: string | null;
  nextCaptureAt: string | null;
  captures: CaptureRecord[];
}

export interface AudioEvent {
  id: string;
  recordedAt: string;
  relativeLevel: number; // 0-1 relative visual intensity (not dB)
  peakLevel: number;
  label: string;
  simulated: boolean;
}

export interface AcousticState {
  micState: "simulated" | "active" | "paused" | "not_configured" | "permission_required";
  monitoring: boolean;
  muted: boolean;
  intervalSec: number;
  currentLevel: number; // 0-1 relative
  peakLevel: number;
  lastEventAt: string | null;
  events: AudioEvent[];
}

export type ComponentStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "stale"
  | "error"
  | "simulated"
  | "not_configured"
  | "unverified";

export interface SystemComponent {
  key: string;
  label: string;
  status: ComponentStatus;
  detail: string;
}

export interface SensorHealth {
  configured: number;
  reporting: number;
  stale: number;
  missing: number;
  lastTelemetryAt: string | null;
  updateIntervalSec: number;
  quality: "good" | "degraded" | "poor" | "unknown";
  simulated: boolean;
}

export interface SiteInfo {
  name: string;
  nodeId: string;
  locationLabel: string;
  lat: number | null;
  lon: number | null;
  coordinatesAreDemo: boolean;
  monitoringSince: string;
}

export interface ConnectionStatus {
  mode: DataMode;
  transport: "simulation" | "websocket" | "polling" | "none";
  state: "connected" | "connecting" | "disconnected" | "error";
  lastUpdateAt: string | null;
  message: string;
}

export type DemoScenario =
  | "normal"
  | "elevated_moisture"
  | "rising_rain"
  | "tilt_activation"
  | "displacement"
  | "missing_sensor";

export interface MonitoringState {
  site: SiteInfo;
  connection: ConnectionStatus;
  telemetry: TelemetrySnapshot | null;
  history: HistoryPoint[];
  tiltEvents: TiltEvent[];
  weather: WeatherObservation | null;
  assessment: Assessment | null;
  assessmentHistory: Assessment[];
  assessmentInProgress: boolean;
  events: MonitoringEvent[];
  camera: CameraState;
  acoustic: AcousticState;
  systemComponents: SystemComponent[];
  sensorHealth: SensorHealth;
  simulationPaused: boolean;
  scenario: DemoScenario;
  serverTime: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  source: "operator" | "mock" | "gemma4" | "system";
  status?: "sending" | "ok" | "error";
}

export type ChatErrorKind =
  | "backend_unavailable"
  | "model_unavailable"
  | "timeout"
  | "invalid_response"
  | "not_configured";

export interface ChatResponse {
  ok: boolean;
  content: string;
  source: ChatMessage["source"];
  error?: ChatErrorKind;
}

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone?: "info" | "success" | "warning" | "critical";
}
