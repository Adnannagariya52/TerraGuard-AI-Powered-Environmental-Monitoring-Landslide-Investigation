import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/utils/cn";
import type { Assessment, RiskLevel } from "@/types/terraguard";
import { Badge, Button, KV, Modal, Panel, Skeleton } from "@/components/ui/primitives";
import { fmtDateTime, fmtTime, riskClasses, riskColor } from "@/utils/format";

const LEVELS: RiskLevel[] = ["SAFE", "WATCH", "WARNING", "CRITICAL"];

export function StatusRing({ level, size = 120, dark = false }: { level: RiskLevel; size?: number; dark?: boolean }) {
  const idx = LEVELS.indexOf(level);
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const segs = 4;
  const gap = 10;
  const segLen = c / segs - gap;
  const activeColor = level === "SAFE" ? (dark ? "#34D399" : "#2D6A57") : level === "WATCH" ? (dark ? "#FBBF24" : "#C59A2B") : level === "WARNING" ? (dark ? "#FB923C" : "#D9895B") : (dark ? "#F87171" : "#C52838");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Status ring showing ${level}`}>
      {LEVELS.map((l, i) => (
        <circle key={l} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} strokeLinecap="round"
          stroke={i <= idx ? activeColor : (dark ? "#24453D" : "#DDE2D9")} strokeOpacity={i <= idx ? 1 - (idx - i) * 0.2 : 1}
          strokeDasharray={`${segLen} ${c - segLen}`} strokeDashoffset={-(i * (c / segs)) + c / 4 - gap / 2}
          style={{ transition: "stroke 0.6s ease" }} />
      ))}
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill={activeColor} fontSize={size * 0.13} fontWeight={700} fontFamily="'IBM Plex Mono', ui-monospace, monospace" letterSpacing="1">{level}</text>
    </svg>
  );
}

function TrendIcon({ t }: { t: "rising" | "falling" | "stable" | "unavailable" }) {
  if (t === "rising") return <ArrowUpRight size={12} className="text-[#C59A2B]" />;
  if (t === "falling") return <ArrowDownRight size={12} className="text-evergreen" />;
  if (t === "stable") return <ArrowRight size={12} className="text-fg-3" />;
  return <Minus size={12} className="text-fg-3" />;
}

export function AssessmentCard({ a, inProgress, onDetails, onRequest, canRequest }: { a: Assessment | null; inProgress: boolean; onDetails: () => void; onRequest: () => void; canRequest: boolean }) {
  if (!a) {
    return (
      <Panel title="Current environmental assessment" tag={<Badge tone="demo">Gemma 4 12B · Ollama</Badge>}>
        <div className="flex items-center gap-5"><Skeleton className="h-28 w-28 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-2/3" /></div></div>
        <p className="mt-3 text-xs text-fg-3">{inProgress ? "Synthesizing environmental telemetry…" : "No assessment recorded."}</p>
      </Panel>
    );
  }
  const isDemo = a.provenance.mode === "demo";
  return (
    <section className="relative overflow-hidden rounded-xl border border-[#284D44] bg-[#162F29] text-[#F3F2EC] shadow-md flex flex-col justify-between">
      {/* Subtle topographic contour overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] contour" aria-hidden />

      <header className="relative flex items-center justify-between border-b border-[#24453D] px-5 py-3.5 bg-[#122722]/50">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-[#213D36] text-[#D9895B]">
            <Sparkles size={14} />
          </div>
          <h2 className="font-heading text-sm font-bold tracking-wide text-[#F3F2EC]">Environmental Intelligence Assessment</h2>
          <Badge className="bg-[#213D36] text-[#A6C0B5] border-[#2E554B] font-mono text-[9px]">{isDemo ? "Gemma · Simulated" : a.provenance.source}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {inProgress && <span className="inline-flex items-center gap-1 text-[11px] text-[#8DA097] font-mono"><RefreshCw size={11} className="animate-spin text-[#D9895B]" />Synthesizing</span>}
          <Button size="xs" variant="ghost" onClick={onRequest} disabled={!canRequest || inProgress} title="Request a new assessment" className="text-[#A6C0B5] hover:text-[#FFFFFF] hover:bg-[#213D36] border border-[#2E554B]">
            <RefreshCw size={12} />Re-assess
          </Button>
        </div>
      </header>

      <div className="relative grid gap-5 p-5 md:grid-cols-[auto_1fr] items-start">
        <div className="flex flex-col items-center gap-2 pt-1">
          <StatusRing level={a.riskLevel} dark size={124} />
          <span className="font-mono text-[10px] text-[#8DA097] tnum">{fmtTime(a.timestamp)}</span>
        </div>

        <div className="min-w-0 space-y-3.5">
          <p className="font-heading text-[14px] sm:text-[15px] font-medium leading-relaxed text-[#F3F2EC]">{a.summary}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-[#11241F] border border-[#24453D] p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#8DA097] font-semibold mb-1.5">Concordant Signals</div>
              <ul className="space-y-1.5 text-xs text-[#D1DBD6]">
                {a.contributingSignals.slice(0, 3).map((s) => (
                  <li key={s} className="flex items-start gap-1.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#34D399]" />
                    <span className="leading-tight">{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg bg-[#11241F] border-l-[3px] border-l-[#D9895B] border-t border-r border-b border-[#24453D] p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#D9895B] font-semibold mb-1">Operational Action</div>
              <p className="text-xs text-[#F3F2EC] leading-relaxed">{a.recommendedAction}</p>
              {a.unavailableInputs.length > 0 && <p className="mt-1.5 text-[10px] text-[#FBBF24] font-mono">Missing: {a.unavailableInputs.join(", ")}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#24453D] pt-3 text-[11px] text-[#8DA097]">
            <span className="font-mono">Confidence: <strong className="text-[#F3F2EC] font-semibold">{a.confidenceScore === null ? "n/a" : a.confidenceScore.toFixed(2)}</strong> · {a.provenance.usedStaleData ? "stale telemetry inputs" : "verified fresh inputs"}</span>
            <button onClick={onDetails} className="inline-flex items-center gap-1.5 font-semibold text-[#D9895B] hover:text-[#F7E8DE] transition-colors">
              Assessment details <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AssessmentDetailModal({ a, open, onClose }: { a: Assessment | null; open: boolean; onClose: () => void }) {
  if (!a) return null;
  const rc = riskClasses[a.riskLevel];
  return (
    <Modal open={open} onClose={onClose} wide title={<span className="flex items-center gap-2">Assessment report <Badge tone={a.provenance.mode === "demo" ? "demo" : "neutral"}>{a.provenance.mode === "demo" ? "Simulated" : "Connected"}</Badge><span className={cn("font-mono text-xs", rc.text)}>{a.riskLevel}</span></span>}>
      <div className="grid gap-5 md:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <Section title="Summary"><p className="text-sm leading-relaxed text-fg">{a.summary}</p><p className="mt-2 text-xs text-fg-2"><span className="text-fg-3">Why selected:</span> {a.whySelected}</p></Section>
          <Section title="Supporting evidence">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[10px] uppercase tracking-wider text-fg-3"><th className="pb-1 font-medium">Signal</th><th className="pb-1 font-medium">Value</th><th className="pb-1 font-medium">Trend</th><th className="pb-1 font-medium">Timestamp</th></tr></thead>
              <tbody className="divide-y divide-line">{a.evidence.map((e) => <tr key={e.label}><td className="py-1.5">{e.label}</td><td className="py-1.5 font-mono tnum">{e.value} {e.unit}</td><td className="py-1.5"><span className="inline-flex items-center gap-1 capitalize"><TrendIcon t={e.trend} />{e.trend}</span></td><td className="py-1.5 font-mono text-fg-3 tnum">{fmtTime(e.timestamp)}</td></tr>)}</tbody>
            </table>
            {a.evidence.length === 0 && <p className="text-xs text-fg-3">Backend did not supply evidence rows.</p>}
          </Section>
          <Section title="Changes and trends"><ul className="space-y-1 text-xs text-fg-2">{a.evidence.map((e) => <li key={e.label} className="flex items-center gap-2"><TrendIcon t={e.trend} /><span>{e.label}: {e.trend === "unavailable" ? "unavailable" : `${e.trend} over the last 5 minutes`}</span></li>)}</ul></Section>
          <Section title="Uncertainty"><p className="text-xs leading-relaxed text-fg-2">{a.uncertainty}</p>{a.unavailableInputs.length > 0 && <p className="mt-2 text-xs text-watch">Missing or stale: {a.unavailableInputs.join(", ")}</p>}</Section>
          <Section title="Recommended action"><p className={cn("rounded-md border p-3 text-sm font-medium", rc.border, rc.bg)}>{a.recommendedAction}</p></Section>
        </div>
        <aside className="h-fit rounded-lg border border-line bg-panel-2 p-3.5 shadow-2xs">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-fg-3">Provenance</div>
          <KV k="Mode" v={a.provenance.mode} mono={false} />
          <KV k="Source" v={<span className="text-right text-[11px]">{a.provenance.source}</span>} mono={false} />
          <KV k="Report time" v={fmtDateTime(a.timestamp)} />
          <KV k="Sensor data time" v={fmtDateTime(a.provenance.dataTimestamp)} />
          <KV k="Input freshness" v={a.provenance.usedStaleData ? <span className="text-watch">stale / partial</span> : <span className="text-safe">fresh</span>} mono={false} />
          <KV k="risk_level" v={a.riskLevel} />
          <KV k="landslide_flag" v={String(a.landslideFlag)} />
          <KV k="confidence_score" v={a.confidenceScore === null ? "n/a" : a.confidenceScore.toFixed(2)} />
          <p className="mt-3 text-[10px] leading-relaxed text-fg-3">confidence_score is model-reported metadata and is not a validated probability of a landslide. No raw model output or internal reasoning is shown because none is provided by the data source.</p>
        </aside>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-3">{title}</h3>{children}</section>;
}

export function AssessmentHistoryList({ items, selectedId, onSelect }: { items: Assessment[]; selectedId?: string; onSelect: (a: Assessment) => void }) {
  if (items.length === 0) return <div className="py-6 text-center text-xs text-fg-3">No assessments yet</div>;
  return (
    <ol className="relative space-y-1 border-l border-line pl-4">
      {items.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full border-2 border-panel" style={{ background: riskColor[a.riskLevel] }} />
          <button onClick={() => onSelect(a)} className={cn("w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-line/40", selectedId === a.id ? "border-line-2 bg-line/30" : "border-transparent")}>
            <div className="flex items-center gap-2"><span className={cn("font-mono text-[11px] font-bold", riskClasses[a.riskLevel].text)}>{a.riskLevel}</span><span className="ml-auto font-mono text-[10px] text-fg-3 tnum">{fmtTime(a.timestamp)}</span></div>
            <p className="mt-0.5 line-clamp-2 text-xs text-fg-2">{a.summary}</p>
            <p className="mt-1 truncate text-[10px] text-fg-3">{a.contributingSignals.slice(0, 2).join(" · ")}</p>
          </button>
        </li>
      ))}
    </ol>
  );
}
