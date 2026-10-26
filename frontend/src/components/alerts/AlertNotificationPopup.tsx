import { AlertTriangle, Check, ChevronRight, X } from "lucide-react";
import { useAlertOverlay } from "@/context/AlertContext";
import { useTerraGuard } from "@/hooks/useTerraGuard";
import { Badge, Button } from "@/components/ui/primitives";
import { fmtTime, severityClasses } from "@/utils/format";
import { cn } from "@/utils/cn";

export function AlertNotificationPopup({ onNavigate }: { onNavigate?: (p: any) => void }) {
  const { activeWatchAlerts, activeCriticalAlert, acknowledgeAlert, dismissWatchAlert } = useAlertOverlay();
  const { mode } = useTerraGuard();

  // If a critical alert is actively displayed, it takes precedence; don't clutter with popups
  if (activeCriticalAlert || activeWatchAlerts.length === 0) return null;

  return (
    <aside
      aria-label="Active environmental notifications"
      className="fixed top-16 right-3 sm:right-5 z-40 flex flex-col gap-2.5 max-w-[min(420px,calc(100vw-1.5rem))] pointer-events-none"
    >
      {activeWatchAlerts.map((ev) => {
        const isDemo = mode === "demo" || ev.id.includes("test");
        const isWarning = ev.severity === "warning";
        const toneClass = isWarning
          ? "border-[#EDC6B1] bg-panel shadow-lg shadow-copper/15"
          : "border-[#E5D7A9] bg-panel shadow-lg shadow-watch/15";

        return (
          <div
            key={ev.id}
            role="alert"
            className={cn(
              "pointer-events-auto rounded-xl border p-4 backdrop-blur-md fade-up transition-all",
              toneClass
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase", severityClasses[ev.severity])}>
                  {ev.severity}
                </span>
                <Badge tone={isDemo ? "demo" : "neutral"}>
                  {isDemo ? "DEMO ALERT" : "LIVE BACKEND"}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-mono text-[10px] text-fg-3 tnum">{fmtTime(ev.timestamp)}</span>
                <button
                  onClick={() => dismissWatchAlert(ev.id)}
                  aria-label="Dismiss notification"
                  className="rounded p-1 text-fg-3 hover:text-fg hover:bg-line transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="mt-2">
              <h2 className="text-xs font-semibold text-fg flex items-center gap-1.5">
                <AlertTriangle size={13} className={isWarning ? "text-coral-tg" : "text-watch"} />
                {ev.title}
              </h2>
              <p className="mt-1 text-xs text-fg-2 leading-relaxed">{ev.description}</p>
              {ev.evidence && (
                <div className="mt-1.5 font-mono text-[10px] text-fg-2 bg-panel-2 rounded-md px-2.5 py-1 border border-line">
                  Evidence: {ev.evidence}
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-line pt-2">
              <span className="text-[10px] font-mono text-fg-3">ID: {ev.id}</span>
              <div className="flex items-center gap-1.5">
                {onNavigate && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      dismissWatchAlert(ev.id);
                      onNavigate("events");
                    }}
                    className="gap-1 text-[11px]"
                  >
                    Details <ChevronRight size={11} />
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => acknowledgeAlert(ev.id)}
                  className="gap-1 text-[11px]"
                >
                  <Check size={11} /> Ack
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </aside>
  );
}
