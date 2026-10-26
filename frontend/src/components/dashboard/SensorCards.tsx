import { ArrowDownRight, ArrowRight, ArrowUpRight, CloudRain, Droplets, Info, MoveVertical, Ruler } from "lucide-react";
import { cn } from "@/utils/cn";
import type { HistoryPoint, SensorReading, TelemetrySnapshot, TiltEvent } from "@/types/terraguard";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { Sparkline, TiltTimeline } from "@/components/charts/charts";
import { fmtAge, fmtNum, fmtTime, freshnessLabel } from "@/utils/format";
import { THRESHOLDS } from "@/data/mockTerraGuard";

function Trend({ cur, prev, unit, d = 1 }: { cur: number | null; prev: number | null; unit: string; d?: number }) {
  if (cur === null || prev === null) return <span className="text-fg-3">—</span>;
  const diff = cur - prev;
  const tol = unit === "cm" ? 0.05 : 0.3;
  const Icon = Math.abs(diff) < tol ? ArrowRight : diff > 0 ? ArrowUpRight : ArrowDownRight;
  const cls = Math.abs(diff) < tol ? "text-fg-3" : diff > 0 ? "text-watch font-medium" : "text-evergreen font-medium";
  return <span className={cn("inline-flex items-center gap-0.5 font-mono tnum", cls)}><Icon size={12} />{diff > 0 ? "+" : ""}{diff.toFixed(d)} {unit}</span>;
}

function FreshnessTag({ r }: { r: SensorReading<unknown> }) {
  const s = r.freshness.status;
  const tone = s === "fresh" ? "neutral" : s === "stale" ? "watch" : s === "missing" ? "critical" : "neutral";
  return <Badge tone={tone}>{freshnessLabel[s]}</Badge>;
}

function CardFrame({
  icon,
  title,
  channelCode,
  accentClass,
  status,
  statusTone,
  children,
  footer,
  onDetails,
}: {
  icon: React.ReactNode;
  title: string;
  channelCode?: string;
  accentClass?: string;
  status: string;
  statusTone: "safe" | "watch" | "warning" | "critical" | "neutral";
  children: React.ReactNode;
  footer: React.ReactNode;
  onDetails?: () => void;
}) {
  return (
    <article className={cn("panel flex flex-col p-4 shadow-sm hover:shadow-md transition-all relative overflow-hidden", accentClass)}>
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-panel-2 border border-line text-fg-2 shadow-2xs">
            {icon}
          </div>
          <div>
            <div className="font-heading text-xs font-bold text-fg tracking-tight">{title}</div>
            {channelCode && <div className="font-mono text-[9px] text-fg-3 uppercase">{channelCode}</div>}
          </div>
        </div>
        <Badge tone={statusTone}>{status}</Badge>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="mt-3 flex items-center justify-between border-t border-line pt-2 text-[11px] text-fg-3">
        <div>{footer}</div>
        {onDetails && (
          <button onClick={onDetails} className="inline-flex items-center gap-1 font-semibold text-evergreen hover:text-deep-evergreen hover:underline transition-colors">
            Analytics <ArrowRight size={11} />
          </button>
        )}
      </footer>
    </article>
  );
}

export function SensorCardSkeleton() {
  return <div className="panel space-y-3 p-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-10 w-32" /><Skeleton className="h-9 w-full" /><Skeleton className="h-3 w-40" /></div>;
}

export function SoilMoistureCard({ t, history, onDetails }: { t: TelemetrySnapshot; history: HistoryPoint[]; onDetails?: () => void }) {
  const r = t.soilMoisture;
  const v = r.value;
  const status = v === null ? "Unavailable" : v >= THRESHOLDS.soilMoistureCritical ? "Critical" : v >= THRESHOLDS.soilMoistureWarning ? "Warning" : v >= THRESHOLDS.soilMoistureWatch ? "Watch" : "Normal";
  const tone = status === "Normal" ? "safe" : status === "Watch" ? "watch" : status === "Warning" ? "warning" : status === "Critical" ? "critical" : "neutral";
  return (
    <CardFrame
      icon={<Droplets size={14} className="text-evergreen" />}
      title="Soil moisture"
      accentClass="border-t-2 border-t-evergreen"
      status={status}
      statusTone={tone}
      onDetails={onDetails}
      footer={<span>Measured {fmtTime(r.freshness.receivedAt)} · <FreshnessTag r={r} /></span>}
    >
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="font-mono text-[34px] sm:text-[36px] font-bold leading-none tracking-tight text-fg tnum value-transition">
            {v === null ? <span className="text-xl text-fg-3">Unavailable</span> : <>{fmtNum(v)}<span className="ml-1 text-base text-fg-3 font-normal">%</span></>}
          </div>
          <div className="mt-2 text-[11px] text-fg-3 flex items-center gap-1">
            <span>vs previous:</span> <Trend cur={v} prev={r.previous} unit="%" />
          </div>
        </div>
        <div className="text-right text-[10px] font-mono text-fg-3 space-y-0.5">
          <div>watch ≥ {THRESHOLDS.soilMoistureWatch}%</div>
          <div className="text-watch">warn ≥ {THRESHOLDS.soilMoistureWarning}%</div>
        </div>
      </div>
      <div className="mt-3 pt-1">
        <Sparkline data={history} dataKey="soilMoisture" color="#2D6A57" reference={THRESHOLDS.soilMoistureWatch} height={34} />
      </div>
    </CardFrame>
  );
}

export function RainCard({ t, history, onDetails }: { t: TelemetrySnapshot; history: HistoryPoint[]; onDetails?: () => void }) {
  const r = t.rainIntensity;
  const v = r.value;
  const isFallback = r.source === "manual_fallback";
  const status = v === null ? "Unavailable" : isFallback ? "Fallback" : v >= THRESHOLDS.rainWarning ? "High" : v >= THRESHOLDS.rainWatch ? "Elevated" : v >= 10 ? "Light" : "Minimal";
  const tone = status === "High" ? "warning" : status === "Elevated" ? "watch" : status === "Unavailable" || isFallback ? "neutral" : "safe";
  return (
    <CardFrame
      icon={<CloudRain size={14} className="text-slate-blue" />}
      title="Rain intensity"
      accentClass="border-t-2 border-t-slate-blue"
      status={status}
      statusTone={tone}
      onDetails={onDetails}
      footer={isFallback ? <span className="font-medium text-watch">Manual fallback · sensor offline</span> : <span>Measured {fmtTime(r.freshness.receivedAt)} · <FreshnessTag r={r} /></span>}
    >
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="font-mono text-[34px] sm:text-[36px] font-bold leading-none tracking-tight text-fg tnum">
            {v === null ? <span className="text-xl text-fg-3">Unavailable</span> : <>{fmtNum(v)}<span className="ml-1 text-base text-fg-3 font-normal">%</span></>}
          </div>
          <div className="mt-2 text-[11px] text-fg-3 flex items-center gap-1">
            {isFallback ? <span className="text-watch">Estimated value</span> : <><span>trend:</span> <Trend cur={v} prev={r.previous} unit="%" /></>}
          </div>
        </div>
        <div className="text-right text-[10px] font-mono text-fg-3 space-y-0.5">
          {!isFallback && <><div>relative sensor scale</div><div>watch ≥ {THRESHOLDS.rainWatch}%</div></>}
        </div>
      </div>
      <div className="mt-3 pt-1">
        <Sparkline data={history} dataKey="rainIntensity" color="#477BB4" reference={THRESHOLDS.rainWatch} height={34} />
      </div>
    </CardFrame>
  );
}

export function TiltCard({ t, tiltEvents }: { t: TelemetrySnapshot; tiltEvents: TiltEvent[] }) {
  const triggered = t.tilt.value === "TRIGGERED";
  const last = tiltEvents[tiltEvents.length - 1];
  return (
    <CardFrame
      icon={<MoveVertical size={14} className="text-copper" />}
      title="Tilt"
      accentClass="border-t-2 border-t-copper"
      status={t.tilt.value === null ? "Unavailable" : triggered ? "Tilt Triggered" : "Normal"}
      statusTone={t.tilt.value === null ? "neutral" : triggered ? "warning" : "safe"}
      footer={<span>Last transition: {last ? fmtTime(new Date(last.t).toISOString()) : "None"} · <FreshnessTag r={t.tilt} /></span>}
    >
      <div className="flex items-center gap-4">
        <div className={cn("relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 transition-colors", triggered ? "border-copper/50 bg-[#F7E8DE]" : "border-evergreen/30 bg-[#E5EEE7]")}>
          <svg width="32" height="32" viewBox="0 0 34 34" aria-hidden className={cn("transition-transform duration-500", triggered ? "rotate-[18deg]" : "rotate-0")}>
            <line x1="4" y1="24" x2="30" y2="24" stroke={triggered ? "#D9895B" : "#2D6A57"} strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="17" cy="24" r="2.5" fill={triggered ? "#D9895B" : "#2D6A57"} />
            <line x1="17" y1="24" x2="17" y2="8" stroke={triggered ? "#D9895B" : "#2D6A57"} strokeWidth="1.5" strokeDasharray="2 2" />
          </svg>
        </div>
        <div>
          <div className={cn("font-mono text-2xl font-bold tracking-tight", triggered ? "text-warning" : "text-fg")}>
            {t.tilt.value === null ? "Unavailable" : triggered ? "TRIGGERED" : "NORMAL"}
          </div>
          <div className="mt-1 text-[11px] text-fg-3">
            {tiltEvents.filter((e) => e.state === "TRIGGERED" && e.t > Date.now() - 3600_000).length} transitions in last 1h
          </div>
        </div>
      </div>
      <div className="mt-3 pt-1">
        <TiltTimeline events={tiltEvents} rangeMs={15 * 60_000} height={22} compact />
      </div>
    </CardFrame>
  );
}

export function GroundCard({ t, history, onDetails }: { t: TelemetrySnapshot; history: HistoryPoint[]; onDetails?: () => void }) {
  const r = t.groundDistanceCm;
  const shift = t.groundShiftCm;
  const unavailable = r.value === null;
  const status = unavailable ? "Unavailable" : shift! >= THRESHOLDS.shiftCriticalCm ? "Critical" : shift! >= THRESHOLDS.shiftWarningCm ? "Warning" : shift! >= THRESHOLDS.shiftWatchCm ? "Watch" : "Stable";
  const tone = status === "Stable" ? "safe" : status === "Watch" ? "watch" : status === "Warning" ? "warning" : status === "Critical" ? "critical" : "neutral";
  const prevShift = t.baselineDistanceCm !== null && r.previous !== null ? t.baselineDistanceCm - r.previous : null;
  return (
    <CardFrame
      icon={<Ruler size={14} className="text-teal-tg" />}
      title="Ground shift"
      accentClass="border-t-2 border-t-teal-tg"
      status={status}
      statusTone={tone}
      onDetails={onDetails}
      footer={<span>{unavailable ? `Last reading ${fmtAge(r.freshness.ageMs)}` : `Measured ${fmtTime(r.freshness.receivedAt)}`} · <FreshnessTag r={r} /></span>}
    >
      {unavailable ? (
        <div className="rounded-md border border-dashed border-critical/30 bg-critical/5 p-3 text-xs text-fg-2">
          <div className="flex items-center gap-1.5 font-semibold text-critical"><Info size={13} /> Ultrasonic sensor not reporting</div>
          <p className="mt-1 text-fg-3">Displacement calculation suspended until telemetry resumes. Baseline: {fmtNum(t.baselineDistanceCm)} cm.</p>
        </div>
      ) : (
        <div>
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className={cn("font-mono text-[34px] sm:text-[36px] font-bold leading-none tracking-tight tnum", status === "Stable" ? "text-fg" : status === "Watch" ? "text-watch" : status === "Warning" ? "text-warning" : "text-critical")}>
                {shift! > 0 ? "+" : ""}{fmtNum(shift, 2)}<span className="ml-1 text-base text-fg-3 font-normal">cm</span>
              </div>
              <div className="mt-2 text-[11px] text-fg-3 flex items-center gap-1">
                <span>vs previous:</span> <Trend cur={shift} prev={prevShift} unit="cm" d={2} />
              </div>
            </div>
            <div className="text-right text-[10px] font-mono text-fg-3 space-y-0.5">
              <div>Range: {fmtNum(r.value, 1)} cm</div>
              <div>Base: {fmtNum(t.baselineDistanceCm, 1)} cm</div>
            </div>
          </div>
          <div className="mt-3 pt-1">
            <Sparkline data={history} dataKey="groundShiftCm" color="#D9895B" reference={THRESHOLDS.shiftWatchCm} height={34} />
          </div>
        </div>
      )}
    </CardFrame>
  );
}
