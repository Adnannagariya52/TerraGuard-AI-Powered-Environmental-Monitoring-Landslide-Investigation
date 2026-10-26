import { useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, Bell, Bot, Camera, ChevronRight, Clock3, FileText, History, LayoutDashboard, LineChart, Menu, Radio, Settings, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { useTerraGuard } from "@/hooks/useTerraGuard";
import { useAlertOverlay } from "@/context/AlertContext";
import { Badge, StatusDot } from "@/components/ui/primitives";
import { fmtAge, fmtTime, severityClasses } from "@/utils/format";
import { APP_VERSION } from "@/config/env";

export type PageKey = "overview" | "live" | "analytics" | "camera" | "acoustic" | "assessments" | "events" | "assistant" | "reports" | "settings";

export const NAV: { key: PageKey; label: string; icon: typeof Activity; crumb: string }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard, crumb: "Site overview" },
  { key: "live", label: "Live Monitoring", icon: Activity, crumb: "Realtime telemetry" },
  { key: "analytics", label: "Sensor Analytics", icon: LineChart, crumb: "Trends & distributions" },
  { key: "camera", label: "Camera Intelligence", icon: Camera, crumb: "Image monitoring" },
  { key: "acoustic", label: "Acoustic Monitoring", icon: Radio, crumb: "Audio activity" },
  { key: "assessments", label: "AI Assessments", icon: Sparkles, crumb: "Gemma 4 12B reports" },
  { key: "events", label: "Event History", icon: History, crumb: "Alert centre" },
  { key: "reports", label: "Reports & Outlook", icon: FileText, crumb: "Daily intelligence & preparedness" },
  { key: "assistant", label: "AI Assistant", icon: Bot, crumb: "TerraGuard Copilot" },
  { key: "settings", label: "Settings", icon: Settings, crumb: "Configuration & integration" },
];

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className="shrink-0">
      <path d="M16 2.5 28 7v8.2c0 7.4-5 13.1-12 14.3C9 28.3 4 22.6 4 15.2V7l12-4.5Z" stroke="#2D6A57" strokeWidth="1.8" fill="#172E2A" />
      <path d="M7.5 19.5c3-2.5 5.5-2.5 8.5 0s5.5 2.5 8.5 0" stroke="#D9895B" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 15c2.5-2 4.5-2 7 0s4.5 2 7 0" stroke="#2D9187" strokeWidth="1.5" strokeLinecap="round" opacity="0.95" />
      <path d="M11 11c2-1.5 3.5-1.5 5 0s3 1.5 5 0" stroke="#477BB4" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
      <circle cx="16" cy="6.5" r="1.5" fill="#FFFEFA" />
    </svg>
  );
}

function SidebarContent({ page, onNavigate }: { page: PageKey; onNavigate: (p: PageKey) => void }) {
  const { state, mode } = useTerraGuard();
  const unread = state.events.filter((e) => !e.read).length;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-[#294740]">
        <Logo size={32} />
        <div className="leading-tight">
          <div className="font-heading text-[16px] font-bold tracking-tight text-[#FFFEFA]">TerraGuard</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#D9895B] font-semibold">Field Monitoring</div>
        </div>
      </div>
      <nav className="mt-2.5 flex-1 space-y-1 px-2.5" aria-label="Primary">
        {NAV.map((n) => {
          const active = page === n.key;
          const Icon = n.icon;
          return (
            <button key={n.key} onClick={() => onNavigate(n.key)} aria-current={active ? "page" : undefined}
              className={cn(
                "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-all",
                active
                  ? "bg-[#213D36] text-[#FFFFFF] font-semibold border-l-[3px] border-l-[#D9895B] shadow-sm"
                  : "text-[#83968E] hover:bg-[#213D36]/60 hover:text-[#F3F2EC]"
              )}>
              <Icon size={16} className={cn(active ? "text-[#D9895B]" : "text-[#677A73] group-hover:text-[#A8B9B1]")} />
              <span className="flex-1">{n.label}</span>
              {n.key === "events" && unread > 0 && <span className="rounded-full bg-[#D9895B]/25 border border-[#D9895B]/40 px-1.5 text-[10px] font-bold text-[#F7E8DE] font-mono tnum">{unread}</span>}
            </button>
          );
        })}
      </nav>
      <div className="m-2.5 space-y-2.5 rounded-xl border border-[#294740] bg-[#213D36] p-3 shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[#83968E] font-semibold font-mono">System</span>
          {mode === "demo" ? (
            <span className="rounded border border-[#3A5D57] bg-[#172E2A] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#9EE0D2] font-mono">
              Demo mode
            </span>
          ) : (
            <span className={cn(
              "rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider font-mono",
              state.connection.state === "connected"
                ? "border-emerald-600/40 bg-emerald-950/40 text-emerald-400"
                : "border-red-600/40 bg-red-950/40 text-red-400"
            )}>
              {state.connection.state}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <StatusDot live={state.connection.state === "connected"} className={state.connection.state === "connected" ? (mode === "demo" ? "bg-teal-tg text-teal-tg" : "bg-emerald-400 text-emerald-400") : "bg-critical text-critical"} />
          <span className="text-[#D1DBD7] text-[12px]">{mode === "demo" ? "Simulation engine" : state.connection.transport}</span>
          <span className="ml-auto font-mono text-[10px] text-[#83968E] tnum">{fmtTime(state.connection.lastUpdateAt)}</span>
        </div>
        <div className="flex items-center gap-2 border-t border-[#294740] pt-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-deep-forest text-[10px] font-bold text-white shadow-2xs font-mono">OP</div>
          <div className="leading-tight"><div className="text-xs font-semibold text-[#F3F2EC]">Observatory Operator</div><div className="text-[10px] text-[#83968E] font-mono">v{APP_VERSION}</div></div>
        </div>
      </div>
    </div>
  );
}

function NotificationPopover({ onOpenEvents }: { onOpenEvents: () => void }) {
  const { state, service } = useTerraGuard();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = state.events.filter((e) => !e.read);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h); window.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${unread.length} unread`} aria-expanded={open} className="relative rounded-lg border border-line bg-panel p-2 text-fg-2 hover:text-fg hover:bg-panel-2 shadow-2xs transition-colors">
        <Bell size={15} />
        {unread.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D9895B] px-1 text-[9px] font-bold text-white font-mono tnum">{unread.length}</span>}
      </button>
      {open && (
        <div className="fade-up absolute right-0 top-11 z-40 w-[min(380px,calc(100vw-2rem))] rounded-xl border border-line bg-panel shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5 bg-panel-2">
            <span className="text-xs font-bold text-fg font-heading">Event Notifications</span>
            <button onClick={() => service.markAllRead()} className="text-[11px] text-[#D9895B] font-semibold hover:underline" disabled={!unread.length}>Mark all read</button>
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-line">
            {state.events.slice(0, 8).map((e) => (
              <li key={e.id} className={cn("px-4 py-2.5 transition-colors", !e.read ? "bg-pale-copper/40" : "hover:bg-panel-2")}>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded border px-1 text-[9px] font-bold uppercase font-mono", severityClasses[e.severity])}>{e.severity}</span>
                  <span className="truncate text-xs font-semibold text-fg">{e.title}</span>
                  <span className="ml-auto font-mono text-[10px] text-fg-3 tnum">{fmtTime(e.timestamp)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-fg-2">{e.description}</p>
              </li>
            ))}
            {state.events.length === 0 && <li className="px-4 py-8 text-center text-xs text-fg-3">No events recorded</li>}
          </ul>
          <button onClick={() => { setOpen(false); onOpenEvents(); }} className="flex w-full items-center justify-center gap-1 border-t border-line bg-panel-2 px-3 py-2 text-[11px] font-medium text-fg-2 hover:text-fg hover:bg-panel transition-colors">Open full alert centre <ChevronRight size={12} /></button>
        </div>
      )}
    </div>
  );
}

export function Shell({ page, onNavigate, children }: { page: PageKey; onNavigate: (p: PageKey) => void; children: ReactNode }) {
  const { state, mode, setMode } = useTerraGuard();
  const { audioState, soundEnabled, enableAudio, setSoundEnabled } = useAlertOverlay();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [, tickNow] = useState(0);
  useEffect(() => { const t = setInterval(() => tickNow((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { setMobileOpen(false); }, [page]);

  const nav = NAV.find((n) => n.key === page)!;
  const age = state.connection.lastUpdateAt ? Date.now() - new Date(state.connection.lastUpdateAt).getTime() : null;
  const isStale = age !== null && age > 15_000 && !state.simulationPaused;
  const connTone = state.connection.state !== "connected" ? "critical" : isStale ? "watch" : mode === "demo" ? "demo" : "safe";
  const connLabel = state.connection.state !== "connected" ? (state.connection.state === "connecting" ? "Connecting" : "Backend disconnected") : isStale ? "Stale data" : state.simulationPaused ? "Simulation paused" : mode === "demo" ? "Demo · simulated" : "Connected";

  return (
    <div className="terrain-bg flex min-h-screen">
      {/* Desktop sidebar with rich forest-charcoal aesthetic */}
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 border-r border-[#243F39] bg-[#172E2A] text-[#F3F2EC] shadow-xl lg:block">
        <SidebarContent page={page} onNavigate={onNavigate} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[#172E2A]/70 backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
          <aside className="fade-up absolute inset-y-0 left-0 w-[264px] border-r border-[#243F39] bg-[#172E2A] text-[#F3F2EC] shadow-2xl">
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="absolute right-2 top-3 rounded p-1 text-[#83968E] hover:text-[#F3F2EC]"><X size={16} /></button>
            <SidebarContent page={page} onNavigate={onNavigate} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-[#FFFEFA]/95 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="rounded-lg border border-line bg-panel hover:bg-panel-2 p-1.5 text-fg-2 lg:hidden shadow-2xs"><Menu size={16} /></button>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-3 font-semibold font-mono">
                  <span>TerraGuard</span><ChevronRight size={10} /><span className="truncate">{nav.crumb}</span>
                </div>
                <h1 className="font-heading truncate text-base font-bold text-fg leading-tight">{nav.label}</h1>
              </div>
            </div>

            {/* Deliberately grouped control clusters */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Cluster 1: Context metrics */}
              <div className="hidden items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 py-1 text-[11px] md:flex shadow-2xs">
                <span className="text-fg-3 font-medium">Node</span>
                <span className="font-mono font-semibold text-fg tnum">{state.site.nodeId}</span>
                <span className="text-line-2">|</span>
                <Clock3 size={12} className="text-evergreen" />
                <span className="font-mono text-fg-2 tnum">{fmtAge(age)}</span>
              </div>

              {/* Cluster 2: Connection state & Audio toggle */}
              <div className="flex items-center gap-1.5">
                <Badge tone={connTone} className="h-7 px-2">
                  <StatusDot live={connTone !== "critical"} className="bg-current text-current" />
                  <span className="hidden sm:inline">{connLabel}</span>
                </Badge>
                <button
                  onClick={() => {
                    if (audioState === "blocked") enableAudio();
                    else setSoundEnabled(!soundEnabled);
                  }}
                  aria-label={soundEnabled ? "Alert audio enabled (click to mute)" : "Alert audio muted (click to enable)"}
                  title={
                    audioState === "blocked"
                      ? "Audio blocked by browser autoplay policy · Click to enable"
                      : soundEnabled
                      ? "Alert sounds active · Click to mute"
                      : "Alert sounds muted · Click to enable"
                  }
                  className={cn(
                    "relative rounded-lg border p-1.5 transition-colors shadow-2xs",
                    audioState === "blocked"
                      ? "border-[#E5D7A9] bg-[#F5EED8] text-[#7D5B08]"
                      : soundEnabled
                      ? "border-line bg-panel text-fg-2 hover:text-fg hover:bg-panel-2"
                      : "border-line bg-panel text-fg-3 hover:text-fg-2 hover:bg-panel-2"
                  )}
                >
                  {soundEnabled && audioState !== "blocked" ? <Volume2 size={15} /> : <VolumeX size={15} />}
                  {audioState === "blocked" && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-watch opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-watch" />
                    </span>
                  )}
                </button>
              </div>

              {/* Cluster 3: Operator Actions */}
              <div className="flex items-center gap-1.5 border-l border-line pl-2 sm:pl-3">
                <NotificationPopover onOpenEvents={() => onNavigate("events")} />
                <button onClick={() => onNavigate("settings")} aria-label="Settings" className="rounded-lg border border-line bg-panel hover:bg-panel-2 p-1.5 text-fg-2 hover:text-fg shadow-2xs transition-colors"><Settings size={15} /></button>
              </div>
            </div>
          </div>

          {mode === "demo" && (
            <div className="flex items-center gap-2 border-t border-[#C4D8EE] bg-[#E7EFF8] px-3 py-1.5 text-[11px] text-[#2A5A8E] font-medium sm:px-6">
              <Sparkles size={12} className="text-[#477BB4]" />
              <span className="truncate">DEMO SIMULATION — Telemetry, acoustics, camera and AI hypotheses are computed locally. No real-world danger implied.</span>
              <button onClick={() => onNavigate("settings")} className="ml-auto hidden shrink-0 underline-offset-2 hover:underline sm:inline font-semibold text-[#2A5A8E]">Manage engine</button>
            </div>
          )}
          {mode === "connected" && state.connection.state !== "connected" && (
            <div className="flex items-center gap-2 border-t border-[#F7B5BC] bg-[#FDEBED] px-3 py-1.5 text-[11px] text-[#8A101E] font-medium sm:px-6">
              <span className="truncate">{state.connection.message}. Truthful connection status.</span>
              <button onClick={() => setMode("demo")} className="ml-auto shrink-0 underline-offset-2 hover:underline font-semibold">Return to demo</button>
            </div>
          )}
        </header>
        <main className="flex-1 p-3 sm:p-5 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
