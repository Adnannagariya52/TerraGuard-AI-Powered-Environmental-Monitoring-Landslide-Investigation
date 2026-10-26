import { useEffect, useState } from "react";
import { CloudRain, Droplets, MapPin, Thermometer, Wind } from "lucide-react";
import { cn } from "@/utils/cn";
import type { MonitoringEvent, MonitoringState, SensorHealth, SystemComponent, WeatherObservation } from "@/types/terraguard";
import { Badge, KV, Panel, StatusDot } from "@/components/ui/primitives";
import { Donut } from "@/components/charts/charts";
import { componentStatusMeta, fmtAge, fmtDuration, fmtTime, severityClasses } from "@/utils/format";

/* ---------- Site header ---------- */
export function SiteHeader({ state }: { state: MonitoringState }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const { site, telemetry, assessment, connection } = state;
  const uptime = now - new Date(site.monitoringSince).getTime();
  return (
    <section className="panel relative overflow-hidden p-5 sm:p-6 shadow-sm border border-line">
      {/* Precision topographic elevation contour SVG */}
      <svg className="pointer-events-none absolute right-0 top-0 h-full w-[45%] opacity-[0.09]" viewBox="0 0 500 200" fill="none" aria-hidden>
        <path d="M30 180 Q 140 50, 270 110 T 500 30" stroke="#2D6A57" strokeWidth="1.6" fill="none" />
        <path d="M0 155 Q 110 35, 250 95 T 500 15" stroke="#2D6A57" strokeWidth="1.2" fill="none" />
        <path d="M15 195 Q 170 80, 300 130 T 500 60" stroke="#D9895B" strokeWidth="1.3" fill="none" />
        <path d="M70 200 Q 210 110, 330 150 T 500 85" stroke="#477BB4" strokeWidth="1" fill="none" />
        <circle cx="270" cy="110" r="3" fill="#2D6A57" />
        <circle cx="300" cy="130" r="2.5" fill="#D9895B" />
      </svg>

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-script text-3xl text-fg">{site.name}</h2>
            <Badge tone="safe" className="font-mono">{site.nodeId}</Badge>
            {connection.mode === "demo" ? (
              <Badge tone="demo" className="font-mono">Demo Simulation</Badge>
            ) : (
              <Badge tone={telemetry ? "safe" : "neutral"} className="font-mono">{telemetry ? "Telemetry active" : "Awaiting telemetry"}</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-3">
            <span className="inline-flex items-center gap-1 font-medium text-fg-2">
              <MapPin size={13} className="text-evergreen" />{site.locationLabel}
            </span>
            <span className="font-mono tnum">
              {site.lat?.toFixed(4) ?? "—"}, {site.lon?.toFixed(4) ?? "—"}
              {site.coordinatesAreDemo && <span className="ml-1 text-evergreen font-medium">(illustrative coordinates)</span>}
            </span>
          </div>
        </div>

        {/* Neatly aligned precision operational metadata cluster */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:shrink-0">
          <div className="rounded-lg border border-line bg-panel-2/70 p-2.5 text-left shadow-2xs">
            <div className="text-[10px] uppercase font-mono tracking-wider text-fg-3 font-semibold">Local Time</div>
            <div className="font-mono text-sm font-bold text-fg tnum mt-0.5">
              {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panel-2/70 p-2.5 text-left shadow-2xs">
            <div className="text-[10px] uppercase font-mono tracking-wider text-fg-3 font-semibold">Last Telemetry</div>
            <div className="font-mono text-sm font-bold text-fg tnum mt-0.5">
              {fmtTime(telemetry?.timestamp)}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panel-2/70 p-2.5 text-left shadow-2xs">
            <div className="text-[10px] uppercase font-mono tracking-wider text-fg-3 font-semibold">Latest AI Report</div>
            <div className="font-mono text-sm font-bold text-fg tnum mt-0.5">
              {fmtTime(assessment?.timestamp)}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panel-2/70 p-2.5 text-left shadow-2xs">
            <div className="text-[10px] uppercase font-mono tracking-wider text-fg-3 font-semibold">
              {connection.mode === "demo" ? "Engine Uptime" : "Session Duration"}
            </div>
            <div className="font-mono text-sm font-bold text-fg tnum mt-0.5">
              {fmtDuration(uptime)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Sensor health ---------- */
export function SensorHealthPanel({ health }: { health: SensorHealth }) {
  const data = [
    { name: "Reporting", value: health.reporting, color: "#2D6A57" },
    { name: "Stale", value: health.stale, color: "#C59A2B" },
    { name: "Missing", value: health.missing, color: "#C52838" },
  ];
  return (
    <Panel title="Sensor health" tag={health.simulated ? <Badge tone="demo">Simulated</Badge> : undefined}>
      <div className="flex items-center gap-4">
        <Donut data={data} centerLabel={`${health.reporting}/${health.configured}`} centerSub="reporting" />
        <div className="flex-1 space-y-0.5">
          <KV k="Configured Channels" v={health.configured} />
          <KV k="Active Reporting" v={<span className="text-safe font-semibold">{health.reporting}</span>} />
          <KV k="Stale Channels" v={<span className={health.stale ? "text-watch font-semibold" : ""}>{health.stale}</span>} />
          <KV k="Missing Channels" v={<span className={health.missing ? "text-critical font-semibold" : ""}>{health.missing}</span>} />
          <KV k="Telemetry Timestamp" v={fmtTime(health.lastTelemetryAt)} />
          <KV k="Sampling Interval" v={health.updateIntervalSec ? `${health.updateIntervalSec} s` : "—"} />
          <KV k="Signal Reliability" v={<Badge tone={health.quality === "good" ? "safe" : health.quality === "degraded" ? "watch" : health.quality === "poor" ? "critical" : "neutral"}>{health.quality}</Badge>} mono={false} />
        </div>
      </div>
    </Panel>
  );
}

/* ---------- Weather ---------- */
export function WeatherCard({ w, detailed = false }: { w: WeatherObservation | null; detailed?: boolean }) {
  if (!w) return <Panel title="Atmospheric Context"><div className="py-6 text-center text-xs text-fg-3">Weather context unavailable</div></Panel>;
  const age = w.observedAt ? Date.now() - new Date(w.observedAt).getTime() : null;
  const stale = w.cacheStatus === "stale" || (age !== null && age > 30 * 60_000);
  const tone = w.cacheStatus === "simulated" ? "demo" : stale ? "watch" : w.cacheStatus === "cached" ? "watch" : "safe";
  const label = w.cacheStatus === "simulated" ? "Simulated" : stale ? "Stale" : w.cacheStatus === "cached" ? "Cached" : "Live";
  return (
    <Panel title="Weather" tag={<Badge tone={tone}>{label}</Badge>}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-4xl font-bold tracking-tight text-fg tnum">{w.temperatureC === null ? "—" : w.temperatureC.toFixed(1)}<span className="ml-1 text-lg text-fg-3 font-normal">°C</span></div>
          <div className="mt-1 font-heading text-sm font-semibold text-fg-2">{w.condition}</div>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pale-blue text-slate-blue border border-[#C4D8EE]">
          <CloudRain size={24} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg border border-line bg-panel-2 p-2.5 shadow-2xs"><div className="flex items-center gap-1 text-fg-3"><Droplets size={11} className="text-teal-tg" />Humidity</div><div className="mt-0.5 font-mono text-sm font-semibold text-fg tnum">{w.humidityPct ?? "—"} %</div></div>
        <div className="rounded-lg border border-line bg-panel-2 p-2.5 shadow-2xs"><div className="flex items-center gap-1 text-fg-3"><CloudRain size={11} className="text-slate-blue" />Precip.</div><div className="mt-0.5 font-mono text-sm font-semibold text-fg tnum">{w.precipitationMm ?? "—"} mm</div></div>
        <div className="rounded-lg border border-line bg-panel-2 p-2.5 shadow-2xs"><div className="flex items-center gap-1 text-fg-3"><Wind size={11} className="text-evergreen" />Wind</div><div className="mt-0.5 font-mono text-sm font-semibold text-fg tnum">{w.windSpeedKmh ?? "—"} km/h</div></div>
      </div>
      {detailed && w.forecastSummary && <p className="mt-3 rounded-lg border border-line bg-panel-2 p-2.5 text-xs text-fg-2 leading-relaxed"><Thermometer size={12} className="mr-1 inline text-copper" />{w.forecastSummary}</p>}
      <div className="mt-3 flex flex-wrap justify-between gap-1 text-[10px] text-fg-3 font-mono">
        <span>Observed {fmtTime(w.observedAt)}</span><span>Refreshed {fmtAge(w.refreshedAt ? Date.now() - new Date(w.refreshedAt).getTime() : null)}</span>
      </div>
      {w.cacheStatus === "simulated" && <p className="mt-2 text-[10px] text-evergreen font-medium">External Open-Meteo API simulated locally. Truthful provenance preserved.</p>}
    </Panel>
  );
}

/* ---------- System components ---------- */
export function SystemStatusPanel({ components, mode }: { components: SystemComponent[]; mode: "demo" | "connected" }) {
  return (
    <Panel title="System status" tag={<Badge tone={mode === "demo" ? "demo" : "neutral"}>{mode === "demo" ? "Demo" : "Live"}</Badge>}>
      <ul className="divide-y divide-line">
        {components.map((c) => {
          const m = componentStatusMeta[c.status];
          return (
            <li key={c.key} className="flex items-center gap-3 py-2 text-xs">
              <StatusDot className={m.dot} live={c.status === "connected" || c.status === "connecting"} />
              <div className="min-w-0 flex-1"><div className="font-medium text-fg">{c.label}</div><div className="truncate text-[10px] text-fg-3">{c.detail}</div></div>
              <span className="text-[10px] uppercase tracking-wider text-fg-2 font-medium">{m.label}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ---------- Compact event feed ---------- */
export function EventFeed({ events, onOpen, limit = 6 }: { events: MonitoringEvent[]; onOpen: () => void; limit?: number }) {
  return (
    <Panel title="Recent activity" actions={<button onClick={onOpen} className="text-[11px] font-medium text-evergreen hover:underline">View all</button>}>
      {events.length === 0 ? <div className="py-6 text-center text-xs text-fg-3">No events recorded yet</div> : (
        <ol className="space-y-2">
          {events.slice(0, limit).map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 text-xs">
              <span className={cn("mt-0.5 shrink-0 rounded border px-1 text-[9px] font-semibold uppercase", severityClasses[e.severity])}>{e.category}</span>
              <div className="min-w-0 flex-1"><div className="truncate font-medium text-fg">{e.title}</div>{e.evidence && <div className="truncate font-mono text-[10px] text-fg-3 tnum">{e.evidence}</div>}</div>
              <span className="shrink-0 font-mono text-[10px] text-fg-3 tnum">{fmtTime(e.timestamp)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/* ---------- Stylised site visual ---------- */
export function SiteVisual({ state }: { state: MonitoringState }) {
  const risk = state.assessment?.riskLevel ?? "SAFE";
  const color = risk === "SAFE" ? "#2D6A57" : risk === "WATCH" ? "#D6A72A" : risk === "WARNING" ? "#E99A68" : "#C52838";
  return (
    <Panel title="Site overview" tag={<Badge tone="demo">Illustrative</Badge>} subtitle="Stylised terrain — not a geospatial warning map">
      <svg viewBox="0 0 400 180" className="h-auto w-full" role="img" aria-label="Stylised contour illustration of the monitoring site with node marker">
        <defs><radialGradient id="nodeGlow"><stop offset="0%" stopColor={color} stopOpacity="0.35" /><stop offset="100%" stopColor={color} stopOpacity="0" /></radialGradient></defs>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} d={`M -20 ${150 - i * 14} C 80 ${130 - i * 16}, 140 ${160 - i * 12}, 220 ${120 - i * 15} S 360 ${100 - i * 12}, 420 ${60 - i * 10}`} fill="none" stroke="#CDD4CB" strokeWidth="1.2" opacity={0.9 - i * 0.08} />
        ))}
        <path d="M -20 180 C 80 160, 140 190, 220 150 S 360 130, 420 90 L 420 180 Z" fill="#E9ECE5" stroke="#DFE2D9" strokeWidth="1" />
        <circle cx="236" cy="112" r="26" fill="url(#nodeGlow)" />
        <circle cx="236" cy="112" r="5" fill={color} />
        <circle cx="236" cy="112" r="9" fill="none" stroke={color} strokeWidth="1.2" opacity="0.6" />
        <text x="250" y="108" fill="#202B2A" fontWeight="600" fontSize="11" fontFamily="ui-monospace, monospace">{state.site.nodeId}</text>
        <text x="250" y="121" fill="#77817B" fontSize="9" fontFamily="ui-monospace, monospace">{state.site.lat?.toFixed(3)}, {state.site.lon?.toFixed(3)}</text>
        <text x="12" y="20" fill="#77817B" fontWeight="600" fontSize="9" letterSpacing="1.5">DEMO RIDGE · SECTOR 7</text>
      </svg>
    </Panel>
  );
}
