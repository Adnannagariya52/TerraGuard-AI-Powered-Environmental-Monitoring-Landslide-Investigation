import { useMemo, useState } from "react";
import { BellOff, Check, CheckCheck, FileText, Filter, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/utils/cn";
import type { EventCategory, EventSeverity, MonitoringEvent } from "@/types/terraguard";
import { Badge, Button, EmptyState, KV, Modal, Panel } from "@/components/ui/primitives";
import { fmtDateTime, fmtTime, severityClasses } from "@/utils/format";
import { useAlertOverlay } from "@/context/AlertContext";

const CATS: { v: EventCategory | "all"; l: string }[] = [
  { v: "all", l: "All" }, { v: "sensor", l: "Sensor" }, { v: "tilt", l: "Tilt" }, { v: "displacement", l: "Displacement" }, { v: "assessment", l: "Assessment" }, { v: "camera", l: "Camera" }, { v: "audio", l: "Audio" }, { v: "system", l: "System" },
];
const SEVS: { v: EventSeverity | "all"; l: string }[] = [{ v: "all", l: "Any severity" }, { v: "info", l: "Info" }, { v: "watch", l: "Watch" }, { v: "warning", l: "Warning" }, { v: "critical", l: "Critical" }];

export function AlertCentre({ events, onAck, onRead, onReadAll }: { events: MonitoringEvent[]; onAck: (id: string) => void; onRead: (id: string) => void; onReadAll: () => void }) {
  const { soundEnabled, audioState } = useAlertOverlay();
  const [cat, setCat] = useState<EventCategory | "all">("all");
  const [sev, setSev] = useState<EventSeverity | "all">("all");
  const [hideAcked, setHideAcked] = useState(false);
  const [detail, setDetail] = useState<MonitoringEvent | null>(null);

  const filtered = useMemo(() => events.filter((e) => (cat === "all" || e.category === cat) && (sev === "all" || e.severity === sev) && (!hideAcked || !e.acknowledged)), [events, cat, sev, hideAcked]);
  const unread = events.filter((e) => !e.read).length;
  const counts = useMemo(() => ({ critical: events.filter((e) => e.severity === "critical" && !e.acknowledged).length, warning: events.filter((e) => e.severity === "warning" && !e.acknowledged).length, watch: events.filter((e) => e.severity === "watch" && !e.acknowledged).length }), [events]);

  return (
    <Panel
      title="Alert Centre & Incident Log"
      subtitle={`${events.length} events logged · ${unread} unread · Local alerts and operational incident audit`}
      tag={
        <div className="flex items-center gap-1.5 text-[11px] text-fg-3">
          {soundEnabled && audioState !== "blocked" ? <Volume2 size={13} className="text-evergreen" /> : <VolumeX size={13} className="text-fg-3" />}
          <span className="font-mono">Audio: {audioState}</span>
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          <Button size="xs" variant="ghost" onClick={() => (window.location.hash = "/reports")} className="gap-1 font-semibold text-evergreen hover:underline">
            <FileText size={12} /> Daily Reports
          </Button>
          <Button size="xs" variant="ghost" onClick={onReadAll} disabled={!unread}>
            <CheckCheck size={12} /> Mark all read
          </Button>
        </div>
      }
    >
      <div className="mb-3 grid grid-cols-3 gap-2">
        {(["critical", "warning", "watch"] as const).map((s) => <div key={s} className={cn("rounded-lg border px-3 py-2 shadow-2xs", severityClasses[s])}><div className="text-[10px] uppercase font-mono tracking-wider font-semibold opacity-90">Unacknowledged {s}</div><div className="font-mono text-xl font-bold tnum">{counts[s]}</div></div>)}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Filter size={12} className="text-fg-3" />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by category">{CATS.map((c) => <button key={c.v} onClick={() => setCat(c.v)} aria-pressed={cat === c.v} className={cn("rounded-md border px-2 py-0.5 text-[11px] transition-colors font-mono", cat === c.v ? "border-evergreen/40 bg-[#E5EEE7] text-evergreen font-bold" : "border-line text-fg-3 hover:text-fg hover:bg-panel-2")}>{c.l}</button>)}</div>
        <select value={sev} onChange={(e) => setSev(e.target.value as EventSeverity | "all")} aria-label="Filter by severity" className="h-7 rounded-md border border-line bg-panel-2 px-2 text-[11px] text-fg shadow-2xs focus:border-evergreen/50 focus:outline-none font-mono">{SEVS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
        <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-fg-3"><input type="checkbox" checked={hideAcked} onChange={(e) => setHideAcked(e.target.checked)} className="accent-evergreen" />Hide acknowledged</label>
      </div>
      {filtered.length === 0 ? <EmptyState icon={<BellOff size={20} />} title="No events match these filters" description="Events are created only on meaningful transitions, with cooldowns to avoid floods." /> : (
        <ul className="divide-y divide-line">
          {filtered.map((e) => (
            <li key={e.id} className={cn("flex items-start gap-3 py-2.5 transition-colors", !e.read && "bg-[#E5EEE7]/45", e.acknowledged && "opacity-60")}>
              <span className={cn("mt-0.5 w-[70px] shrink-0 rounded border px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase", severityClasses[e.severity])}>{e.severity}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-fg">{e.title}</span><Badge>{e.category}</Badge>{e.acknowledged && <Badge tone="safe">Acknowledged</Badge>}</div>
                <p className="mt-0.5 text-[11px] text-fg-2">{e.description}</p>
                {e.evidence && <p className="mt-0.5 font-mono text-[10px] text-fg-3 tnum">{e.evidence}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-[10px] text-fg-3 tnum">{fmtTime(e.timestamp)}</span>
                <div className="flex gap-1">
                  <Button size="xs" variant="ghost" onClick={() => { onRead(e.id); setDetail(e); }}>Details</Button>
                  {!e.acknowledged && <Button size="xs" variant="ghost" onClick={() => onAck(e.id)} title="Acknowledge"><Check size={12} />Ack</Button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={<span className="flex items-center gap-2">Event detail <Badge tone={detail?.severity === "critical" ? "critical" : detail?.severity === "warning" ? "warning" : detail?.severity === "watch" ? "watch" : "cyan"}>{detail?.severity}</Badge></span>}>
        {detail && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{detail.title}</h3>
            <p className="text-xs text-fg-2">{detail.description}</p>
            <div className="rounded-lg border border-line bg-panel-2 p-3 shadow-2xs"><KV k="Timestamp" v={fmtDateTime(detail.timestamp)} /><KV k="Category" v={detail.category} /><KV k="Evidence" v={detail.evidence ?? "—"} /><KV k="Acknowledged" v={detail.acknowledged ? "yes" : "no"} /><KV k="Event ID" v={detail.id} /></div>
            <p className="text-[10px] text-fg-3">Acknowledging an event records operator awareness in the local browser only. It is not shared across other devices unless persistent backend alert-sync is configured, and does NOT indicate that the environmental slope is physically safe.</p>
            {!detail.acknowledged && <Button size="sm" onClick={() => { onAck(detail.id); setDetail({ ...detail, acknowledged: true }); }}><Check size={12} />Acknowledge</Button>}
          </div>
        )}
      </Modal>
    </Panel>
  );
}
