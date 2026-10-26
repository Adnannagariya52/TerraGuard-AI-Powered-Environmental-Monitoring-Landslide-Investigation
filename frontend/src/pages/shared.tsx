import { WifiOff } from "lucide-react";
import type { MonitoringState } from "@/types/terraguard";
import { Segmented } from "@/components/ui/primitives";

export function DisconnectedNotice({ state }: { state: MonitoringState }) {
  return (
    <div className="panel flex items-start gap-3 border-critical/30 p-4">
      <WifiOff size={18} className="mt-0.5 text-critical" />
      <div>
        <p className="text-sm font-semibold">{state.connection.state === "connecting" ? "Connecting to backend…" : "No telemetry from backend"}</p>
        <p className="mt-0.5 text-xs text-fg-2">{state.connection.message}. The dashboard will not display simulated readings in connected mode. Configure <code className="rounded bg-bg-elev px-1 font-mono text-[11px]">VITE_TERRAGUARD_API_BASE_URL</code> or switch back to demo mode in Settings.</p>
      </div>
    </div>
  );
}

export const RANGES = [
  { value: "1m", label: "1 min", ms: 60_000 },
  { value: "5m", label: "5 min", ms: 5 * 60_000 },
  { value: "15m", label: "15 min", ms: 15 * 60_000 },
  { value: "1h", label: "1 hour", ms: 60 * 60_000 },
] as const;
export type RangeKey = (typeof RANGES)[number]["value"];

export function RangeSelector({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return <Segmented ariaLabel="Time range" options={RANGES.map((r) => ({ value: r.value, label: r.label }))} value={value} onChange={onChange} />;
}

export const rangeMs = (k: RangeKey) => RANGES.find((r) => r.value === k)!.ms;
