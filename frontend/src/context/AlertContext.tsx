import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { MonitoringEvent } from "@/types/terraguard";
import { alertAudioService } from "@/services/alertAudioService";
import { useTerraGuard } from "@/hooks/useTerraGuard";

export interface AlertContextValue {
  activeCriticalAlert: MonitoringEvent | null;
  activeWatchAlerts: MonitoringEvent[];
  isSirenPlaying: boolean;
  audioState: "enabled" | "blocked" | "disabled" | "unsupported";
  soundEnabled: boolean;
  silenceSiren: () => void;
  acknowledgeAlert: (id: string) => void;
  dismissCriticalOverlay: () => void;
  dismissWatchAlert: (id: string) => void;
  enableAudio: () => Promise<boolean>;
  setSoundEnabled: (enabled: boolean) => void;
  triggerTestAlert: (severity: "watch" | "warning" | "critical", custom?: Partial<MonitoringEvent>) => void;
  testSound: (type: "siren" | "watch" | "warning") => void;
  escalateTestAlert: () => void;
}

const AlertCtx = createContext<AlertContextValue | null>(null);

export function AlertProvider({ children }: { children: ReactNode }) {
  const { state, service } = useTerraGuard();
  const [activeCriticalAlert, setActiveCriticalAlert] = useState<MonitoringEvent | null>(null);
  const [activeWatchAlerts, setActiveWatchAlerts] = useState<MonitoringEvent[]>([]);
  const [isSirenPlaying, setIsSirenPlaying] = useState<boolean>(alertAudioService.isSirenPlaying());
  const [audioState, setAudioState] = useState(alertAudioService.getAudioState());
  const [soundEnabled, setSoundEnabledState] = useState(alertAudioService.isSoundEnabled());

  // Deduplication tracking sets
  const handledEventIdsRef = useRef<Set<string>>(new Set());
  const silencedAlertIdsRef = useRef<Set<string>>(new Set());
  const silencedCriticalEpisodeRef = useRef(false);
  const acknowledgedAlertIdsRef = useRef<Set<string>>(new Set());
  const dismissedAlertIdsRef = useRef<Set<string>>(new Set());
  const lastCriticalIdRef = useRef<string | null>(null);

  // Sync with audio service state
  useEffect(() => {
    const unsub = alertAudioService.subscribe(() => {
      setIsSirenPlaying(alertAudioService.isSirenPlaying());
      setAudioState(alertAudioService.getAudioState());
      setSoundEnabledState(alertAudioService.isSoundEnabled());
    });
    return unsub;
  }, []);

  // Keep a user-silenced live siren quiet while the same critical condition
  // continues to produce fresh event IDs. Re-arm only after an explicit
  // non-critical assessment from the backend.
  useEffect(() => {
    if (state.assessment && state.assessment.riskLevel !== "CRITICAL") {
      silencedCriticalEpisodeRef.current = false;
      silencedAlertIdsRef.current.clear();
      lastCriticalIdRef.current = null;
    }
  }, [state.assessment?.riskLevel]);

  // Primary event evaluation loop from incoming state events
  useEffect(() => {
    if (!state.events || state.events.length === 0) return;

    // Check the latest few events
    const recent = state.events.slice(0, 5);

    for (const ev of recent) {
      if (handledEventIdsRef.current.has(ev.id)) {
        continue;
      }
      handledEventIdsRef.current.add(ev.id);

      // CRITICAL ALERT
      if (ev.severity === "critical") {
        lastCriticalIdRef.current = ev.id;
        setActiveCriticalAlert(ev);

        // Critical alert takes precedence and stops any playing lower chimes
        if (!silencedCriticalEpisodeRef.current && !silencedAlertIdsRef.current.has(ev.id)) {
          alertAudioService.startCriticalSiren();
          setIsSirenPlaying(alertAudioService.isSirenPlaying());
          setAudioState(alertAudioService.getAudioState());
        }
        break;
      }

      // WATCH or WARNING ALERT
      if (ev.severity === "watch" || ev.severity === "warning") {
        if (!dismissedAlertIdsRef.current.has(ev.id) && !acknowledgedAlertIdsRef.current.has(ev.id)) {
          setActiveWatchAlerts((prev) => {
            if (prev.some((p) => p.id === ev.id)) return prev;
            return [ev, ...prev].slice(0, 3);
          });

          // Play appropriate chime if critical alert is not active
          if (!lastCriticalIdRef.current || silencedAlertIdsRef.current.has(lastCriticalIdRef.current)) {
            if (ev.severity === "warning") {
              alertAudioService.playWarningChime();
            } else {
              alertAudioService.playWatchChime();
            }
          }
        }
      }
    }
  }, [state.events]);

  const silenceSiren = useCallback(() => {
    alertAudioService.stopCriticalSiren();
    if (activeCriticalAlert) {
      silencedAlertIdsRef.current.add(activeCriticalAlert.id);
      // Test alerts are not part of backend state and should not mute a later
      // real incident. Live critical alarms stay silenced until risk clears.
      if (state.events.some((event) => event.id === activeCriticalAlert.id)) {
        silencedCriticalEpisodeRef.current = true;
      }
    }
    setIsSirenPlaying(false);
  }, [activeCriticalAlert, state.events]);

  const acknowledgeAlert = useCallback(
    (id: string) => {
      acknowledgedAlertIdsRef.current.add(id);
      service.acknowledgeEvent(id);

      // If acknowledging the critical alert, silence siren
      if (activeCriticalAlert && activeCriticalAlert.id === id) {
        silenceSiren();
      }

      // Remove from watch popups if present
      setActiveWatchAlerts((prev) => prev.filter((a) => a.id !== id));
    },
    [service, activeCriticalAlert, silenceSiren]
  );

  const dismissCriticalOverlay = useCallback(() => {
    silenceSiren();
    if (activeCriticalAlert) {
      dismissedAlertIdsRef.current.add(activeCriticalAlert.id);
    }
    setActiveCriticalAlert(null);
  }, [silenceSiren, activeCriticalAlert]);

  const dismissWatchAlert = useCallback((id: string) => {
    dismissedAlertIdsRef.current.add(id);
    setActiveWatchAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const enableAudio = useCallback(async () => {
    const ok = await alertAudioService.enableAudio();
    setAudioState(alertAudioService.getAudioState());
    setSoundEnabledState(alertAudioService.isSoundEnabled());
    return ok;
  }, []);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    alertAudioService.setSoundEnabled(enabled);
    setSoundEnabledState(enabled);
    setAudioState(alertAudioService.getAudioState());
  }, []);

  const triggerTestAlert = useCallback(
    (severity: "watch" | "warning" | "critical", custom?: Partial<MonitoringEvent>) => {
      const now = new Date().toISOString();
      const testId = `test_ev_${Date.now()}`;
      const ev: MonitoringEvent = {
        id: testId,
        timestamp: now,
        category: custom?.category ?? "displacement",
        severity,
        title: custom?.title ?? (severity === "critical" ? "Ground displacement critical threshold exceeded" : severity === "warning" ? "Rapid soil saturation & rain rate warning" : "Elevated soil moisture watch condition"),
        description: custom?.description ?? (severity === "critical" ? "Ultrasonic distance shrank to 42.8 cm, indicating 5.2 cm rapid displacement toward sensor on slope face." : severity === "warning" ? "Rainfall accumulation reached 68% relative rate with sustained high soil saturation." : "Soil moisture exceeded 55% threshold following persistent light rainfall."),
        evidence: custom?.evidence ?? (severity === "critical" ? "groundShift: 5.2 cm · rate: +1.4 cm/min" : severity === "warning" ? "rainIntensity: 68% · soilMoisture: 72%" : "soilMoisture: 58.4% · baseline: 38%"),
        acknowledged: false,
        read: false,
        ...custom,
      };

      handledEventIdsRef.current.add(testId);

      if (severity === "critical") {
        lastCriticalIdRef.current = testId;
        setActiveCriticalAlert(ev);
        alertAudioService.startCriticalSiren();
        setIsSirenPlaying(alertAudioService.isSirenPlaying());
        setAudioState(alertAudioService.getAudioState());
      } else {
        setActiveWatchAlerts((prev) => [ev, ...prev.filter((p) => p.id !== testId)].slice(0, 3));
        if (severity === "warning") {
          alertAudioService.playWarningChime();
        } else {
          alertAudioService.playWatchChime();
        }
      }
    },
    []
  );

  const escalateTestAlert = useCallback(() => {
    const now = new Date().toISOString();
    const watchId = `escalate_test_${Date.now()}`;
    const watchEv: MonitoringEvent = {
      id: watchId,
      timestamp: now,
      category: "displacement",
      severity: "watch",
      title: "Initial slope displacement watch",
      description: "Preliminary ground shift detected at 1.8 cm toward sensor.",
      evidence: "groundShift: 1.8 cm",
      acknowledged: false,
      read: false,
    };

    handledEventIdsRef.current.add(watchId);
    setActiveWatchAlerts((prev) => [watchEv, ...prev].slice(0, 3));
    alertAudioService.playWatchChime();

    // After 2.5 seconds, escalate to CRITICAL
    setTimeout(() => {
      const critId = `escalated_crit_${Date.now()}`;
      const critEv: MonitoringEvent = {
        id: critId,
        timestamp: new Date().toISOString(),
        category: "displacement",
        severity: "critical",
        title: "ESCALATION: Slope displacement crossed critical safety threshold",
        description: "Ground movement accelerated sharply from 1.8 cm to 5.4 cm toward the ultrasonic sensor.",
        evidence: "groundShift: 5.4 cm (accelerating) · soil: 82%",
        acknowledged: false,
        read: false,
      };
      handledEventIdsRef.current.add(critId);
      lastCriticalIdRef.current = critId;
      setActiveWatchAlerts((prev) => prev.filter((a) => a.id !== watchId));
      setActiveCriticalAlert(critEv);
      alertAudioService.startCriticalSiren();
      setIsSirenPlaying(alertAudioService.isSirenPlaying());
      setAudioState(alertAudioService.getAudioState());
    }, 2400);
  }, []);

  const testSound = useCallback((type: "siren" | "watch" | "warning") => {
    if (type === "siren") {
      alertAudioService.startCriticalSiren();
      setTimeout(() => {
        alertAudioService.stopCriticalSiren();
      }, 4000);
    } else if (type === "warning") {
      alertAudioService.playWarningChime();
    } else {
      alertAudioService.playWatchChime();
    }
  }, []);

  const value: AlertContextValue = {
    activeCriticalAlert,
    activeWatchAlerts,
    isSirenPlaying,
    audioState,
    soundEnabled,
    silenceSiren,
    acknowledgeAlert,
    dismissCriticalOverlay,
    dismissWatchAlert,
    enableAudio,
    setSoundEnabled,
    triggerTestAlert,
    testSound,
    escalateTestAlert,
  };

  return <AlertCtx.Provider value={value}>{children}</AlertCtx.Provider>;
}

export function useAlertOverlay() {
  const ctx = useContext(AlertCtx);
  if (!ctx) throw new Error("useAlertOverlay must be used within an AlertProvider");
  return ctx;
}
