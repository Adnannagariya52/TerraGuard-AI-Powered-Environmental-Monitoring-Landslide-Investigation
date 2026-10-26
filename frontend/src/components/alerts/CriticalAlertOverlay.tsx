import { AlertOctagon, CheckCircle2, ChevronRight, Info, ShieldAlert, Volume2, VolumeX, X } from "lucide-react";
import { useAlertOverlay } from "@/context/AlertContext";
import { useTerraGuard } from "@/hooks/useTerraGuard";
import { Badge, Button } from "@/components/ui/primitives";
import { fmtDateTime, fmtNum, fmtTime } from "@/utils/format";

export function CriticalAlertOverlay({ onNavigate }: { onNavigate?: (p: any) => void }) {
  const { activeCriticalAlert, isSirenPlaying, audioState, silenceSiren, acknowledgeAlert, dismissCriticalOverlay, enableAudio } = useAlertOverlay();
  const { state, mode } = useTerraGuard();

  if (!activeCriticalAlert) return null;

  const t = state.telemetry;
  const a = state.assessment;
  const isDemo = mode === "demo" || activeCriticalAlert.id.includes("test");

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="critical-alert-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#172E2A]/80 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border-2 border-critical bg-panel shadow-2xl overflow-hidden fade-up">
        {/* Pulsing emergency top strip */}
        <div className="h-2 w-full bg-gradient-to-r from-critical via-amber-500 to-critical animate-pulse" />

        {/* Audio blocked notification banner if autoplay was stopped */}
        {audioState === "blocked" && (
          <div className="flex items-center justify-between gap-3 bg-watch/15 border-b border-watch/30 px-4 py-2 text-xs text-watch">
            <span className="flex items-center gap-1.5 font-medium">
              <VolumeX size={14} /> Alert sounds blocked by browser autoplay policy.
            </span>
            <button
              onClick={() => enableAudio()}
              className="rounded bg-watch/20 px-2 py-0.5 text-[11px] font-semibold text-fg hover:bg-watch/30 underline-offset-2 hover:underline"
            >
              Enable Alert Sounds
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between border-b border-line px-5 py-4 bg-critical-bg">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-critical/15 text-critical border border-critical/30 shadow-2xs live-dot">
              <AlertOctagon size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold tracking-widest text-critical uppercase">
                  CRITICAL SENSOR ALERT · VERIFY CONDITIONS
                </span>
                <Badge tone={isDemo ? "demo" : "critical"}>
                  {isDemo ? "DEMO ALERT" : "LIVE BACKEND"}
                </Badge>
              </div>
              <h1 id="critical-alert-title" className="font-heading text-2xl font-black tracking-tight text-fg">
                CRITICAL ALERT
              </h1>
            </div>
          </div>
          <button
            onClick={dismissCriticalOverlay}
            aria-label="Close emergency overlay"
            className="rounded-lg p-1.5 text-fg-3 hover:text-fg hover:bg-line transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Alert Description & Trigger Evidence */}
          <div className="rounded-xl border border-critical/30 bg-critical-bg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-critical">{activeCriticalAlert.title}</span>
              <span className="font-mono text-fg-3 text-[11px] tnum">
                {fmtDateTime(activeCriticalAlert.timestamp)}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-fg-2">
              {activeCriticalAlert.description}
            </p>
            {activeCriticalAlert.evidence && (
              <div className="mt-2 rounded-lg bg-panel border border-line px-3 py-2 text-xs font-mono text-critical font-medium shadow-2xs">
                <span className="text-fg-3">Trigger Evidence: </span>{activeCriticalAlert.evidence}
              </div>
            )}
          </div>

          {/* Sensor Snapshot at Trigger Time */}
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-fg-3">
              Telemetry Snapshot at Alert Time
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-lg border border-line bg-panel-2 p-2.5 text-center shadow-2xs">
                <div className="text-[10px] text-fg-3 font-medium">Soil Moisture</div>
                <div className="mt-0.5 font-mono text-base font-bold text-fg tnum">
                  {fmtNum(t?.soilMoisture.value)} %
                </div>
                <div className="text-[9px] text-fg-3">Unit: %</div>
              </div>
              <div className="rounded-lg border border-line bg-panel-2 p-2.5 text-center shadow-2xs">
                <div className="text-[10px] text-fg-3 font-medium">Rain Intensity</div>
                <div className="mt-0.5 font-mono text-base font-bold text-fg tnum">
                  {fmtNum(t?.rainIntensity.value)} %
                </div>
                <div className="text-[9px] text-fg-3">Relative sensor %</div>
              </div>
              <div className="rounded-lg border border-line bg-panel-2 p-2.5 text-center shadow-2xs">
                <div className="text-[10px] text-fg-3 font-medium">Tilt Switch</div>
                <div className="mt-0.5 font-mono text-base font-bold text-warning tnum">
                  {t?.tilt.value ?? "NORMAL"}
                </div>
                <div className="text-[9px] text-fg-3">Biaxial sensor</div>
              </div>
              <div className="rounded-lg border border-line bg-panel-2 p-2.5 text-center shadow-2xs">
                <div className="text-[10px] text-fg-3 font-medium">Ground Shift</div>
                <div className="mt-0.5 font-mono text-base font-bold text-critical tnum">
                  {t?.groundShiftCm !== null && t?.groundShiftCm !== undefined ? `+${t.groundShiftCm.toFixed(2)} cm` : "Unavailable"}
                </div>
                <div className="text-[9px] text-fg-3">Displacement toward sensor</div>
              </div>
            </div>
          </div>

          {/* AI Assessment Guidance */}
          {a && (
            <div className="rounded-xl border border-line bg-panel-2 p-3.5 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <ShieldAlert size={14} className="text-critical" />
                <span>AI Assessment Context ({a.provenance.source})</span>
              </div>
              <p className="text-xs text-fg-2 leading-relaxed">{a.summary}</p>
              <div className="mt-2 text-xs font-medium text-fg bg-panel rounded-lg p-2.5 border border-line shadow-2xs">
                <span className="text-watch font-semibold">Immediate Action: </span>
                {a.recommendedAction}
              </div>
            </div>
          )}

          {/* Safety & Lifecycle Notice */}
          <div className="flex items-start gap-2 rounded-lg border border-line bg-panel-2 p-2.5 text-[11px] text-fg-3 shadow-2xs">
            <Info size={14} className="shrink-0 mt-0.5 text-fg-3" />
            <p>
              Silencing the siren or acknowledging this alert records operator awareness in the local system.
              It does <strong>not</strong> declare the environmental slope safe and does not replace site evacuation protocols.
            </p>
          </div>

          {/* Event Metadata */}
          <div className="flex items-center justify-between text-[10px] font-mono text-fg-3 border-t border-line pt-2">
            <span>Event ID: {activeCriticalAlert.id}</span>
            <span>Recorded: {fmtTime(activeCriticalAlert.timestamp)}</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-panel-2 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Button
              variant={isSirenPlaying ? "danger" : "ghost"}
              size="sm"
              onClick={silenceSiren}
              disabled={!isSirenPlaying}
              className="gap-1.5"
              title={isSirenPlaying ? "Stop siren audio without clearing the alert" : "Siren is silenced for this critical incident"}
            >
              {isSirenPlaying ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {isSirenPlaying ? "Silence Siren" : "Siren Silenced"}
            </Button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {onNavigate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  dismissCriticalOverlay();
                  onNavigate("events");
                }}
                className="gap-1 text-fg-2 hover:text-fg"
              >
                View in Alert Centre <ChevronRight size={13} />
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                acknowledgeAlert(activeCriticalAlert.id);
                dismissCriticalOverlay();
              }}
              className="gap-1.5 bg-critical hover:bg-critical/90 text-white"
            >
              <CheckCircle2 size={14} />
              Acknowledge Alert
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
