import { useState } from "react";
import { useTerraGuard } from "@/hooks/useTerraGuard";
import type { PageKey } from "@/components/layout/Shell";
import { SiteHeader, SensorHealthPanel, WeatherCard, SystemStatusPanel, EventFeed, SiteVisual } from "@/components/dashboard/Widgets";
import { GroundCard, RainCard, SensorCardSkeleton, SoilMoistureCard, TiltCard } from "@/components/dashboard/SensorCards";
import { AssessmentCard, AssessmentDetailModal } from "@/components/ai/Assessment";
import { CameraPanel } from "@/components/camera/CameraPanel";
import { AcousticPanel } from "@/components/acoustic/AcousticPanel";
import { MultiSeriesChart } from "@/components/charts/charts";
import { Badge, Panel, Skeleton } from "@/components/ui/primitives";
import { DisconnectedNotice } from "./shared";

export function OverviewPage({ onNavigate }: { onNavigate: (p: PageKey) => void }) {
  const { state, service, loading, mode } = useTerraGuard();
  const [detailOpen, setDetailOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const t = state.telemetry;
  const recent = state.history.filter((p) => p.t >= Date.now() - 15 * 60_000);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <SiteHeader state={state} />
      {mode === "connected" && !t && <DisconnectedNotice state={state} />}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <AssessmentCard a={state.assessment} inProgress={state.assessmentInProgress} onDetails={() => setDetailOpen(true)} onRequest={() => service.requestAssessment()} canRequest={!!t} />
        <SensorHealthPanel health={state.sensorHealth} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !t ? <><SensorCardSkeleton /><SensorCardSkeleton /><SensorCardSkeleton /><SensorCardSkeleton /></> : <>
          <SoilMoistureCard t={t} history={recent} onDetails={() => onNavigate("analytics")} />
          <RainCard t={t} history={recent} onDetails={() => onNavigate("analytics")} />
          <TiltCard t={t} tiltEvents={state.tiltEvents} />
          <GroundCard t={t} history={recent} onDetails={() => onNavigate("analytics")} />
        </>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Sensor trends · 15 minutes"
          tag={mode === "demo" ? <Badge tone="demo">Simulated Stream</Badge> : undefined}
          actions={<button onClick={() => onNavigate("analytics")} className="text-[11px] font-semibold text-evergreen hover:text-deep-evergreen hover:underline transition-colors">Analytics</button>}
        >
          {loading ? <Skeleton className="h-[240px] w-full" /> : <MultiSeriesChart data={recent} enabled={{ soilMoisture: true, rainIntensity: true, groundShiftCm: true, groundDistanceCm: false }} height={240} />}
        </Panel>
        <WeatherCard w={state.weather} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <CameraPanel camera={state.camera} onPreview={(a) => service.setCameraPreview(a)} capturing={capturing} onCapture={async () => { setCapturing(true); await service.captureSnapshot(); setCapturing(false); }} />
        <AcousticPanel ac={state.acoustic} onMonitoring={(a) => service.setAcousticMonitoring(a)} onMute={(m) => service.setAcousticMuted(m)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <EventFeed events={state.events} onOpen={() => onNavigate("events")} />
        <SystemStatusPanel components={state.systemComponents} mode={mode} />
        <SiteVisual state={state} />
      </div>

      <AssessmentDetailModal a={state.assessment} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </div>
  );
}
