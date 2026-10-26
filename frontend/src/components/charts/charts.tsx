import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryPoint, TiltEvent } from "@/types/terraguard";
import { fmtClock } from "@/utils/format";

export const SERIES_META = {
  soilMoisture: { label: "Soil moisture", unit: "%", color: "#2D6A57" },
  rainIntensity: { label: "Rain intensity", unit: "%", color: "#477BB4" },
  groundShiftCm: { label: "Ground shift", unit: "cm", color: "#D9895B" },
  groundDistanceCm: { label: "Ground distance", unit: "cm", color: "#718078" },
} as const;
export type SeriesKey = keyof typeof SERIES_META;

/** Downsample to at most `max` points, keeping shape. */
export function downsample(points: HistoryPoint[], max = 240): HistoryPoint[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: HistoryPoint[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

const tooltipStyle = {
  background: "#FFFEFA",
  border: "1px solid #DDE2D9",
  borderRadius: 8,
  fontSize: 11,
  padding: "6px 10px",
  boxShadow: "0 4px 14px rgba(23, 46, 42, 0.08)",
  color: "#202D29",
  fontFamily: "'IBM Plex Mono', monospace",
};

/* ---------- Sparkline ---------- */
export function Sparkline({ data, dataKey, color, height = 36, reference }: { data: HistoryPoint[]; dataKey: SeriesKey; color: string; height?: number; reference?: number }) {
  const d = useMemo(() => downsample(data.slice(-120), 80), [data]);
  const id = `spark-${dataKey}`;
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={d} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {reference !== undefined && <ReferenceLine y={reference} stroke="#CDD4CB" strokeDasharray="3 3" />}
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#${id})`} isAnimationActive={false} connectNulls={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Multi-series ---------- */
export function MultiSeriesChart({ data, enabled, height = 280 }: { data: HistoryPoint[]; enabled: Record<SeriesKey, boolean>; height?: number }) {
  const d = useMemo(() => downsample(data), [data]);
  const hasRight = enabled.groundShiftCm || enabled.groundDistanceCm;
  return (
    <div style={{ height }} role="img" aria-label="Multi-series chart of soil moisture, rain intensity and ground shift over time">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={d} margin={{ top: 8, right: hasRight ? 8 : 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#DDE2D9" strokeDasharray="3 3" />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtClock} tick={{ fill: "#718078", fontSize: 10 }} axisLine={{ stroke: "#DDE2D9" }} tickLine={false} minTickGap={48} />
          <YAxis yAxisId="pct" domain={[0, 100]} tick={{ fill: "#718078", fontSize: 10 }} axisLine={false} tickLine={false} width={34} unit="%" />
          {hasRight && <YAxis yAxisId="cm" orientation="right" tick={{ fill: "#718078", fontSize: 10 }} axisLine={false} tickLine={false} width={40} unit="cm" domain={enabled.groundDistanceCm ? ["auto", "auto"] : [-1, 8]} />}
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => fmtClock(Number(v))} formatter={(v: unknown, name: unknown) => { const k = name as SeriesKey; return [v === null || v === undefined ? "Unavailable" : `${Number(v).toFixed(k.includes("Cm") ? 2 : 1)} ${SERIES_META[k].unit}`, SERIES_META[k].label]; }} />
          {enabled.soilMoisture && <Line yAxisId="pct" type="monotone" dataKey="soilMoisture" stroke={SERIES_META.soilMoisture.color} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls={false} />}
          {enabled.rainIntensity && <Line yAxisId="pct" type="monotone" dataKey="rainIntensity" stroke={SERIES_META.rainIntensity.color} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls={false} />}
          {enabled.groundShiftCm && <Line yAxisId="cm" type="monotone" dataKey="groundShiftCm" stroke={SERIES_META.groundShiftCm.color} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls={false} />}
          {enabled.groundDistanceCm && <Line yAxisId="cm" type="monotone" dataKey="groundDistanceCm" stroke={SERIES_META.groundDistanceCm.color} dot={false} strokeWidth={1.5} strokeDasharray="4 3" isAnimationActive={false} connectNulls={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Single trend ---------- */
export function TrendChart({ data, dataKey, height = 220, domain, references = [], baseline }: { data: HistoryPoint[]; dataKey: SeriesKey; height?: number; domain?: [number | string, number | string]; references?: { y: number; label: string; color: string }[]; baseline?: number }) {
  const d = useMemo(() => downsample(data), [data]);
  const meta = SERIES_META[dataKey];
  const id = `trend-${dataKey}`;
  const hasData = d.some((p) => p[dataKey] !== null);
  if (!hasData) return <div style={{ height }} className="flex items-center justify-center rounded-lg border border-dashed border-line-2 text-xs text-fg-3 font-mono">No {meta.label.toLowerCase()} data in this range — sensor offline</div>;
  return (
    <div style={{ height }} role="img" aria-label={`${meta.label} trend chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={d} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={meta.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={meta.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#DDE2D9" strokeDasharray="3 3" />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtClock} tick={{ fill: "#718078", fontSize: 10 }} axisLine={{ stroke: "#DDE2D9" }} tickLine={false} minTickGap={48} />
          <YAxis domain={domain ?? ["auto", "auto"]} tick={{ fill: "#718078", fontSize: 10 }} axisLine={false} tickLine={false} width={44} unit={meta.unit} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => fmtClock(Number(v))} formatter={(v: unknown) => [v === null || v === undefined ? "Unavailable" : `${Number(v).toFixed(meta.unit === "cm" ? 2 : 1)} ${meta.unit}`, meta.label]} />
          {baseline !== undefined && <ReferenceLine y={baseline} stroke="#718078" strokeDasharray="4 4" label={{ value: "baseline", fill: "#718078", fontSize: 10, position: "insideTopRight" }} />}
          {references.map((r) => <ReferenceLine key={r.label} y={r.y} stroke={r.color} strokeDasharray="4 4" label={{ value: r.label, fill: r.color, fontSize: 10, position: "insideTopLeft" }} />)}
          <Area type="monotone" dataKey={dataKey} stroke={meta.color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} connectNulls={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Tilt timeline ---------- */
export function TiltTimeline({ events, rangeMs, height = 56, compact = false }: { events: TiltEvent[]; rangeMs: number; height?: number; compact?: boolean }) {
  const now = Date.now();
  const start = now - rangeMs;
  const segments = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.t - b.t);
    let state: "NORMAL" | "TRIGGERED" = "NORMAL";
    for (const e of sorted) if (e.t <= start) state = e.state;
    const segs: { from: number; to: number; state: "NORMAL" | "TRIGGERED" }[] = [];
    let cursor = start;
    for (const e of sorted) {
      if (e.t <= start) continue;
      segs.push({ from: cursor, to: e.t, state });
      cursor = e.t; state = e.state;
    }
    segs.push({ from: cursor, to: now, state });
    return segs;
  }, [events, start, now]);
  const marks = events.filter((e) => e.t >= start && e.state === "TRIGGERED");
  return (
    <div role="img" aria-label={`Tilt sensor timeline: ${marks.length} activations in range`}>
      <div className="relative w-full overflow-hidden rounded-md border border-line bg-panel-2" style={{ height }}>
        {segments.map((s, i) => (
          <div key={i} title={`${s.state} ${fmtClock(s.from)} → ${fmtClock(s.to)}`} className={s.state === "TRIGGERED" ? "absolute inset-y-0 bg-[#D9895B]" : "absolute inset-y-0 bg-[#E5EEE7]"} style={{ left: `${((s.from - start) / rangeMs) * 100}%`, width: `${Math.max(((s.to - s.from) / rangeMs) * 100, s.state === "TRIGGERED" ? 0.6 : 0)}%` }} />
        ))}
        {marks.map((m, i) => <div key={i} className="absolute inset-y-0 w-px bg-[#D9895B]" style={{ left: `${((m.t - start) / rangeMs) * 100}%` }} />)}
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between text-[10px] text-fg-3 tnum font-mono"><span>{fmtClock(start)}</span><span>{marks.length} activation{marks.length === 1 ? "" : "s"} · event chronology</span><span>{fmtClock(now)}</span></div>
      )}
    </div>
  );
}

/* ---------- Donut ---------- */
export function Donut({ data, size = 120, centerLabel, centerSub }: { data: { name: string; value: number; color: string }[]; size?: number; centerLabel: string; centerSub?: string }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${centerLabel} ${centerSub ?? ""}: ${data.map((d) => `${d.name} ${d.value}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={total ? data : [{ name: "none", value: 1, color: "#DDE2D9" }]} dataKey="value" innerRadius={size * 0.36} outerRadius={size * 0.48} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
            {(total ? data : [{ color: "#DDE2D9" }]).map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-lg font-bold tnum text-fg">{centerLabel}</span>
        {centerSub && <span className="text-[10px] font-mono uppercase text-fg-3">{centerSub}</span>}
      </div>
    </div>
  );
}

/* ---------- Interval comparison bars ---------- */
export function IntervalBars({ data, height = 180 }: { data: { name: string; soil: number | null; rain: number | null }[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Average soil moisture and rain intensity per interval">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={3}>
          <CartesianGrid vertical={false} stroke="#DDE2D9" strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fill: "#718078", fontSize: 10 }} axisLine={{ stroke: "#DDE2D9" }} tickLine={false} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fill: "#718078", fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#E8EDE6" }} formatter={(v: unknown, n: unknown) => [v === null ? "n/a" : `${Number(v).toFixed(1)} %`, n === "soil" ? "Avg soil moisture" : "Avg rain intensity"]} />
          <Bar dataKey="soil" fill="#2D6A57" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="rain" fill="#477BB4" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
