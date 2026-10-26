import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DataMode, MonitoringEvent, MonitoringState, Toast } from "@/types/terraguard";
import type { TerraGuardService } from "@/services/terraguardService";
import { createMockTerraGuardService } from "@/services/mockTerraGuardService";
import { createBackendTerraGuardService } from "@/services/backendTerraGuardService";
import { DEFAULT_MODE } from "@/config/env";

interface TerraGuardContextValue {
  state: MonitoringState;
  service: TerraGuardService;
  mode: DataMode;
  setMode: (m: DataMode) => void;
  loading: boolean;
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
}

const Ctx = createContext<TerraGuardContextValue | null>(null);

function createService(mode: DataMode): TerraGuardService {
  return mode === "connected" ? createBackendTerraGuardService() : createMockTerraGuardService();
}

export function TerraGuardProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DataMode>(DEFAULT_MODE);
  const serviceRef = useRef<TerraGuardService>(createService(DEFAULT_MODE));
  const [state, setState] = useState<MonitoringState>(() => serviceRef.current.getState());
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastEventIdRef = useRef<string | null>(null);

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((prev) => prev.filter((x) => x.id !== id)), []);

  // Mount / swap adapter
  useEffect(() => {
    const svc = serviceRef.current;
    setLoading(true);
    const unsub = svc.subscribe((s) => {
      setState(s);
      setLoading(false);
    });
    // Simulated initial loading period so skeletons are visible briefly
    const t = setTimeout(() => svc.start(), 650);
    return () => {
      clearTimeout(t);
      unsub();
      svc.stop();
    };
  }, [mode]);

  // Surface camera/audio events as transient toasts
  useEffect(() => {
    const newest = state.events[0];
    if (!newest || newest.id === lastEventIdRef.current) return;
    const first = lastEventIdRef.current === null;
    lastEventIdRef.current = newest.id;
    if (first) return;
    const time = new Date(newest.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const toastFor = (e: MonitoringEvent) => {
      if (e.category === "camera") return { title: `${e.title} · ${time}`, tone: "info" as const };
      if (e.category === "audio") return { title: `${e.title} · ${time}`, tone: "info" as const };
      if (e.severity === "critical" || e.severity === "warning") return { title: e.title, description: `${time} · ${e.description}`, tone: e.severity as "critical" | "warning" };
      return null;
    };
    const tt = toastFor(newest);
    if (tt) pushToast(tt);
  }, [state.events, pushToast]);

  const setMode = useCallback((m: DataMode) => {
    if (m === mode) return;
    serviceRef.current.stop();
    serviceRef.current = createService(m);
    setState(serviceRef.current.getState());
    lastEventIdRef.current = null;
    setModeState(m);
  }, [mode]);

  const value = useMemo<TerraGuardContextValue>(
    () => ({ state, service: serviceRef.current, mode, setMode, loading, toasts, pushToast, dismissToast }),
    [state, mode, setMode, loading, toasts, pushToast, dismissToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTerraGuard() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTerraGuard must be used inside TerraGuardProvider");
  return v;
}
