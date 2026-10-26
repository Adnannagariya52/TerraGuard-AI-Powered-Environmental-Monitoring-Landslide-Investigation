import { useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/utils/cn";
import { useTerraGuard } from "@/hooks/useTerraGuard";
import { GroundCard, RainCard, SensorCardSkeleton, SoilMoistureCard, TiltCard } from "@/components/dashboard/SensorCards";
import { Donut, IntervalBars, MultiSeriesChart, SERIES_META, TiltTimeline, TrendChart, type SeriesKey } from "@/components/charts/charts";
import { Badge, Button, KV, Panel, Skeleton } from "@/components/ui/primitives";
import { DisconnectedNotice, RangeSelector, rangeMs, type RangeKey } from "./shared";
import { THRESHOLDS } from "@/data/mockTerraGuard";
import { fmtNum, fmtTime } from "@/utils/format";

function useRangeData(range: RangeKey) {
  const { state } = useTerraGuard();
  return useMemo(() => { const c = Date.now() - rangeMs(range); return state.history.filter((p) => p.t >= c); }, [state.history, range]);
}

function SeriesToggles({ enabled, onToggle }: { enabled: Record<SeriesKey, boolean>; onToggle: (k: SeriesKey) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Toggle series">
      {(Object.keys(SERIES_META) as SeriesKey[]).map((k) => (
        <button key={k} onClick={() => onToggle(k)} aria-pressed={enabled[k]} className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] transition-colors", enabled[k] ? "border-line-2 bg-panel-2 text-fg" : "border-line text-fg-3 line-through")}>
          <span className="h-2 w-2 rounded-full" style={{ background: SERIES_META[k].color, opacity: enabled[k] ? 1 : 0.4 }} />{SERIES_META[k].label} <span className="text-fg-3">({SERIES_META[k].unit})</span>
        </button>
      ))}
    </div>
  );
}

/* ================= LIVE MONITORING ================= */
export function LivePage() {
  const { state, service, loading, mode } = useTerraGuard();
  const [range, setRange] = useState<RangeKey>("5m");
  const [enabled, setEnabled] = useState<Record<SeriesKey, boolean>>({ soilMoisture: true, rainIntensity: true, groundShiftCm: true, groundDistanceCm: false });
  const data = useRangeData(range);
  const t = state.telemetry;
  const toggle = (k: SeriesKey) => setEnabled((e) => ({ ...e, [k]: !e[k] }));

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      {mode === "connected" && !t && <DisconnectedNotice state={state} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-fg-3">
          <span>Transport:</span><Badge tone={mode === "demo" ? "demo" : "neutral"}>{state.connection.transport}</Badge>
          <span>· Last update <span className="font-mono tnum">{fmtTime(state.connection.lastUpdateAt)}</span></span>
          {state.simulationPaused && <Badge tone="watch">Simulation paused</Badge>}
        </div>
        {mode === "demo" && <Button size="sm" onClick={() => service.setSimulationPaused(!state.simulationPaused)}>{state.simulationPaused ? <><Play size={13} />Resume simulation</> : <><Pause size={13} />Pause simulation</>}</Button>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !t ? <><SensorCardSkeleton /><SensorCardSkeleton /><SensorCardSkeleton /><SensorCardSkeleton /></> : <>
          <SoilMoistureCard t={t} history={data} /><RainCard t={t} history={data} /><TiltCard t={t} tiltEvents={state.tiltEvents} /><GroundCard t={t} history={data} />
        </>}
      </div>

      <Panel title="Live multi-series chart" tag={mode === "demo" ? <Badge tone="demo">Simulated</Badge> : undefined} subtitle="Hover for timestamps and values · percent on left axis, centimetres on right"
        actions={<RangeSelector value={range} onChange={setRange} />}>
        <div className="mb-3"><SeriesToggles enabled={enabled} onToggle={toggle} /></div>
        {loading ? <Skeleton className="h-[300px] w-full" /> : data.length < 2 ? <div className="flex h-[300px] items-center justify-center text-xs text-fg-3">Not enough data in this range yet</div> : <MultiSeriesChart data={data} enabled={enabled} height={300} />}
        <p className="mt-2 text-[10px] text-fg-3">{data.length} points in range · history bounded at ~66 min in demo mode · charts downsampled for rendering</p>
      </Panel>

      <Panel title="Tilt state timeline" subtitle="Orange = TRIGGERED; markers are event transitions, not polling ticks">
        <TiltTimeline events={state.tiltEvents} rangeMs={rangeMs(range)} />
      </Panel>

      <Panel title="Latest telemetry record" subtitle="Raw snapshot from the data adapter · source timestamps are never regenerated on render">
        {t ? (
          <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            <KV k="Device ID" v={t.deviceId} /><KV k="Source timestamp" v={fmtTime(t.timestamp)} /><KV k="Soil moisture" v={`${fmtNum(t.soilMoisture.value)} %`} />
            <KV k="Rain intensity" v={`${fmtNum(t.rainIntensity.value)} %`} /><KV k="Tilt" v={t.tilt.value ?? "Unavailable"} /><KV k="Ground distance" v={t.groundDistanceCm.value === null ? "Unavailable" : `${fmtNum(t.groundDistanceCm.value, 2)} cm`} />
            <KV k="Baseline distance" v={`${fmtNum(t.baselineDistanceCm, 2)} cm`} /><KV k="Ground shift" v={t.groundShiftCm === null ? "Unavailable" : `${fmtNum(t.groundShiftCm, 2)} cm`} /><KV k="Distance freshness" v={t.groundDistanceCm.freshness.status} />
          </div>
        ) : <Skeleton className="h-20 w-full" />}
      </Panel>
    </div>
  );
}

/* ================= SENSOR ANALYTICS ================= */
export function AnalyticsPage() {
  const { state, loading, mode } = useTerraGuard();
  const [range, setRange] = useState<RangeKey>("15m");
  const data = useRangeData(range);

  const intervals = useMemo(() => {
    const now = Date.now();
    const buckets = [{ name: "0–5 min", from: 5 }, { name: "5–10 min", from: 10 }, { name: "10–15 min", from: 15 }, { name: "15–30 min", from: 30 }, { name: "30–60 min", from: 60 }];
    let prevTo = 0;
    return buckets.map((b) => {
      const pts = state.history.filter((p) => p.t <= now - prevTo * 60_000 && p.t > now - b.from * 60_000);
      prevTo = b.from;
      const avg = (k: "soilMoisture" | "rainIntensity") => { const v = pts.map((p) => p[k]).filter((x): x is number => x !== null); return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null; };
      return { name: b.name, soil: avg("soilMoisture"), rain: avg("rainIntensity") };
    });
  }, [state.history]);

  const eventDist = useMemo(() => {
    const c: Record<string, number> = {};
    state.events.forEach((e) => { c[e.category] = (c[e.category] ?? 0) + 1; });
    const colors: Record<string, string> = {
      sensor: "#2D6A57",
      tilt: "#D9895B",
      displacement: "#C59A2B",
      assessment: "#24594D",
      camera: "#477BB4",
      audio: "#2D9187",
      system: "#718078",
    };
    return Object.entries(c).map(([name, value]) => ({ name, value, color: colors[name] ?? "#718078" }));
  }, [state.events]);

  const freq = useMemo(() => {
    const now = Date.now();
    return [60, 50, 40, 30, 20, 10].map((m) => ({ name: `-${m}m`, n: state.events.filter((e) => { const a = now - new Date(e.timestamp).getTime(); return a <= m * 60_000 && a > (m - 10) * 60_000; }).length }));
  }, [state.events]);
  const maxFreq = Math.max(1, ...freq.map((f) => f.n));

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-3">Detailed multi-channel telemetry streams with configured threshold lines. {mode === "demo" && "Demonstration engine data."}</p>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Volumetric Soil Moisture" subtitle="Unit: % · watch and warning thresholds shown">
          {loading ? <Skeleton className="h-[220px]" /> : <TrendChart data={data} dataKey="soilMoisture" domain={[0, 100]} references={[{ y: THRESHOLDS.soilMoistureWatch, label: "watch", color: "#C59A2B" }, { y: THRESHOLDS.soilMoistureWarning, label: "warning", color: "#D9895B" }]} />}
        </Panel>
        <Panel title="Relative Rain Intensity" subtitle="Unit: % · optical sensing scale">
          {loading ? <Skeleton className="h-[220px]" /> : <TrendChart data={data} dataKey="rainIntensity" domain={[0, 100]} references={[{ y: THRESHOLDS.rainWatch, label: "watch", color: "#C59A2B" }, { y: THRESHOLDS.rainWarning, label: "warning", color: "#D9895B" }]} />}
        </Panel>
        <Panel title="Ground Displacement (Shift)" subtitle="Unit: cm · shift = baseline − distance · positive = slope heave">
          {loading ? <Skeleton className="h-[220px]" /> : <TrendChart data={data} dataKey="groundShiftCm" domain={[-1, 8]} references={[{ y: THRESHOLDS.shiftWatchCm, label: "watch", color: "#C59A2B" }, { y: THRESHOLDS.shiftWarningCm, label: "warning", color: "#D9895B" }, { y: THRESHOLDS.shiftCriticalCm, label: "critical", color: "#C52838" }]} />}
          <div className="mt-3 rounded-lg border border-line bg-panel-2 p-3 text-[11px] text-fg-2 shadow-2xs">
            <strong className="text-fg font-medium">Instrumentation Principle: </strong> Ground shift is calculated as <code className="font-mono">baseline_distance_cm − ground_distance_cm</code>. The ultrasonic sensor points downward at the slope face; if the earth swells toward the sensor, measured distance drops and shift becomes positive. Baseline: <span className="font-mono tnum font-semibold">{THRESHOLDS.baselineDistanceCm} cm</span>.
          </div>
        </Panel>
        <Panel title="Raw Ultrasonic Distance" subtitle="Unit: cm · calibrated baseline reference shown">
          {loading ? <Skeleton className="h-[220px]" /> : <TrendChart data={data} dataKey="groundDistanceCm" baseline={THRESHOLDS.baselineDistanceCm} domain={["auto", "auto"]} />}
        </Panel>
      </div>

      <Panel title="Inclinometer Tilt Timeline" subtitle="Continuous state strip for active range"><TiltTimeline events={state.tiltEvents} rangeMs={rangeMs(range)} /></Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Interval Comparison" subtitle="Average soil moisture vs rain intensity per interval"><IntervalBars data={intervals} /></Panel>
        <Panel title="Category Distribution" subtitle="Share of recorded events across channels">
          <div className="flex items-center gap-4"><Donut data={eventDist} centerLabel={String(state.events.length)} centerSub="events" size={130} />
            <ul className="flex-1 space-y-1 text-xs">{eventDist.map((d) => <li key={d.name} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: d.color }} /><span className="capitalize text-fg-2">{d.name}</span><span className="ml-auto font-mono tnum">{d.value}</span></li>)}{eventDist.length === 0 && <li className="text-fg-3">No events yet</li>}</ul></div>
        </Panel>
        <Panel title="Activity Frequency" subtitle="Events per 10-minute interval across last hour">
          <div className="flex h-[130px] items-end gap-2" role="img" aria-label={`Event frequency: ${freq.map((f) => `${f.name} ${f.n}`).join(", ")}`}>
            {freq.map((f) => <div key={f.name} className="flex flex-1 flex-col items-center gap-1"><span className="font-mono text-[10px] text-fg-3 tnum">{f.n}</span><div className="w-full rounded-t bg-[#477BB4]/70 hover:bg-[#477BB4] transition-colors" style={{ height: `${(f.n / maxFreq) * 90}px`, minHeight: 2 }} /><span className="text-[10px] font-mono text-fg-3">{f.name}</span></div>)}
          </div>
        </Panel>
      </div>
    </div>
  );
}
