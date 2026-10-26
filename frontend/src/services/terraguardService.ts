/**
 * TerraGuardService — the frontend's single integration boundary.
 *
 * Two adapters implement this interface:
 *  - mockTerraGuardService  (demo mode — local simulation, no network)
 *  - backendTerraGuardService (connected mode — FastAPI + WebSocket, partially stubbed)
 *
 * UI components never import an adapter directly; they go through useTerraGuard().
 */

import type {
  Assessment,
  ChatResponse,
  DemoScenario,
  HistoryPoint,
  MonitoringEvent,
  MonitoringState,
  WeatherObservation,
} from "@/types/terraguard";

export type Unsubscribe = () => void;

export interface TerraGuardService {
  /** Human label for the adapter, shown in Settings. */
  readonly adapterName: string;

  /** Start realtime updates (simulation loop / WebSocket / polling). */
  start(): void;
  /** Tear down all timers / sockets. */
  stop(): void;

  getState(): MonitoringState;
  subscribe(listener: (state: MonitoringState) => void): Unsubscribe;

  loadHistory(rangeMs: number): Promise<HistoryPoint[]>;
  requestAssessment(): Promise<Assessment | null>;
  loadAssessmentHistory(): Promise<Assessment[]>;
  loadWeather(): Promise<WeatherObservation | null>;
  loadEvents(): Promise<MonitoringEvent[]>;

  sendChatMessage(message: string): Promise<ChatResponse>;

  // --- Event centre actions (frontend state only) ---
  acknowledgeEvent(id: string): void;
  markEventRead(id: string): void;
  markAllRead(): void;

  // --- Camera / acoustic controls ---
  setCameraPreview(active: boolean): void;
  captureSnapshot(): Promise<void>;
  setAcousticMonitoring(active: boolean): void;
  setAcousticMuted(muted: boolean): void;

  // --- Demo-only controls (no-ops in connected mode) ---
  setSimulationPaused(paused: boolean): void;
  setScenario(scenario: DemoScenario): void;
}
