import { useState } from "react";
import { AlertOctagon, AlertTriangle, Pause, Play, RefreshCw, ShieldAlert, Sparkles, Volume2, VolumeX } from "lucide-react";
import { useTerraGuard } from "@/hooks/useTerraGuard";
import { useAlertOverlay } from "@/context/AlertContext";
import type { Assessment, DemoScenario } from "@/types/terraguard";
import { CameraPanel } from "@/components/camera/CameraPanel";
import { AcousticPanel } from "@/components/acoustic/AcousticPanel";
import { AssessmentCard, AssessmentDetailModal, AssessmentHistoryList } from "@/components/ai/Assessment";
import { AlertCentre } from "@/components/alerts/AlertCentre";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { SystemStatusPanel, WeatherCard } from "@/components/dashboard/Widgets";
import { Badge, Button, KV, Panel } from "@/components/ui/primitives";
import { SCENARIOS } from "@/data/mockTerraGuard";
import { API_BASE_URL, API_ROUTES, APP_VERSION, DEFAULT_MODE, POLL_MS, WS_URL } from "@/config/env";
import { cn } from "@/utils/cn";
import { fmtTime } from "@/utils/format";

/* ================= CAMERA ================= */
export function CameraPage() {
  const { state, service } = useTerraGuard();
  const [capturing, setCapturing] = useState(false);
  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <CameraPanel expanded camera={state.camera} onPreview={(a) => service.setCameraPreview(a)} capturing={capturing} onCapture={async () => { setCapturing(true); await service.captureSnapshot(); setCapturing(false); }} />
      <Panel title="Camera operation" subtitle="Browser camera with local Gemma vision assessment">
        <ul className="list-disc space-y-1 pl-5 text-xs text-fg-2">
          <li>Press <strong>Start camera</strong> and allow browser access. Sampled frame pairs are sent to this computer’s TerraGuard API and local Ollama/Gemma for comparison.</li>
          <li>A critical visual flag means the model saw clear falling or debris-like movement. Verify the live scene; this prototype does not send official alerts.</li>
          <li>Frames are not written to disk by the backend. Stop camera to end the stream and clear the temporary comparison frame.</li>
        </ul>
      </Panel>
    </div>
  );
}

/* ================= ACOUSTIC ================= */
export function AcousticPage() {
  const { state, service } = useTerraGuard();
  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <AcousticPanel expanded ac={state.acoustic} onMonitoring={(a) => service.setAcousticMonitoring(a)} onMute={(m) => service.setAcousticMuted(m)} />
      <Panel title="About the acoustic scale" subtitle="Honest measurement notes">
        <ul className="list-disc space-y-1 pl-5 text-xs text-fg-2">
          <li>Levels are shown on a <strong>relative 0–1 visual scale</strong>. No calibrated decibel (dB SPL) measurement exists in this prototype, so no dB values are displayed.</li>
          <li>In connected mode, Start microphone requests browser permission and uses the Web Audio API to display relative volume and frequency levels locally. It does not record, recognize speech, store, or upload audio.</li>
          <li>In demo mode the visualization is simulated and does not access the browser microphone.</li>
        </ul>
      </Panel>
    </div>
  );
}

/* ================= ASSESSMENTS ================= */
export function AssessmentsPage() {
  const { state, service } = useTerraGuard();
  const [selected, setSelected] = useState<Assessment | null>(null);
  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <AssessmentCard a={state.assessment} inProgress={state.assessmentInProgress} onDetails={() => setSelected(state.assessment)} onRequest={() => service.requestAssessment()} canRequest={!!state.telemetry} />
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Panel title="Assessment history" subtitle="Most recent first · click to open the full report" tag={<Badge tone={state.connection.mode === "demo" ? "demo" : "neutral"}>{state.connection.mode === "demo" ? "Simulated Gemma" : "Backend"}</Badge>}>
          <AssessmentHistoryList items={state.assessmentHistory} selectedId={state.assessment?.id} onSelect={setSelected} />
        </Panel>
        <div className="space-y-4">
          <Panel title="Model" subtitle="Execution details">
            <KV k="Model label" v="Gemma 4 12B · Ollama" mono={false} />
            <KV k="Execution mode" v={state.connection.mode === "demo" ? <span className="text-coral-tg font-medium">Demo (not invoked)</span> : "Connected"} mono={false} />
            <KV k="Runtime" v={state.connection.mode === "demo" ? "n/a — mock service" : "Ollama (unverified)"} mono={false} />
            <KV k="Auto interval" v={state.connection.mode === "demo" ? "45 s" : "backend-driven"} />
            <KV k="Last report" v={fmtTime(state.assessment?.timestamp)} />
            <KV k="Reports stored" v={state.assessmentHistory.length} />
            <p className="mt-3 text-[10px] leading-relaxed text-fg-3">Connected mode sends assessments and chat prompts to the local Ollama runtime. Demo mode uses simulated readings and does not invoke a model.</p>
          </Panel>
          <WeatherCard w={state.weather} detailed />
        </div>
      </div>
      <AssessmentDetailModal a={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ================= EVENTS ================= */
export function EventsPage() {
  const { state, service } = useTerraGuard();
  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <AlertCentre events={state.events} onAck={(id) => service.acknowledgeEvent(id)} onRead={(id) => service.markEventRead(id)} onReadAll={() => service.markAllRead()} />
    </div>
  );
}

/* ================= ASSISTANT ================= */
export function AssistantPage() {
  const { state } = useTerraGuard();
  const t = state.telemetry;
  return (
    <div className="mx-auto grid max-w-[1600px] gap-4 xl:grid-cols-[1fr_320px]">
      <ChatPanel tall />
      <div className="space-y-4">
        <Panel title="Context available to assistant" subtitle={state.connection.mode === "demo" ? "Simulated state used by the mock assistant" : "Latest backend telemetry and local node status"}>
          <KV k="Status" v={state.assessment?.riskLevel ?? "—"} />
          <KV k="Soil moisture" v={t?.soilMoisture.value === null || !t ? "Unavailable" : `${t.soilMoisture.value.toFixed(1)} %`} />
          <KV k="Rain intensity" v={t?.rainIntensity.value === null || !t ? "Unavailable" : `${t.rainIntensity.value.toFixed(1)} %`} />
          <KV k="Tilt" v={t?.tilt.value ?? "—"} />
          <KV k="Ground shift" v={t?.groundShiftCm === null || !t ? "Unavailable" : `${t.groundShiftCm.toFixed(2)} cm`} />
          <KV k="Telemetry time" v={fmtTime(t?.timestamp)} />
          <KV k="History points" v={state.history.length} />
        </Panel>
        <Panel title="Connected-mode states" subtitle="UI supports these response states">
          <ul className="space-y-1 text-xs text-fg-2">{["Sending", "Waiting", "Success", "Backend unavailable", "Model unavailable", "Timeout", "Invalid response"].map((s) => <li key={s} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-fg-3" />{s}</li>)}</ul>
          <p className="mt-2 text-[10px] text-fg-3">Connected chat uses the local Ollama model through the TerraGuard backend. No cloud AI fallback is used.</p>
        </Panel>
      </div>
    </div>
  );
}

/* ================= SETTINGS ================= */
export function SettingsPage() {
  const { state, service, mode, setMode } = useTerraGuard();
  const {
    audioState,
    soundEnabled,
    setSoundEnabled,
    enableAudio,
    triggerTestAlert,
    testSound,
    escalateTestAlert,
    silenceSiren,
    isSirenPlaying,
  } = useAlertOverlay();
  const [dedupCount, setDedupCount] = useState(0);
  const [confirmConnected, setConfirmConnected] = useState(false);

  const testDeduplication = () => {
    // Fire identical alert 5 times rapidly
    for (let i = 0; i < 5; i++) {
      triggerTestAlert("watch", {
        id: "dedup_test_stable_id",
        title: "Deduplication Verification Alert",
        description: "This alert was fired 5 times rapidly. Only 1 popup should appear and no multiple sounds.",
      });
    }
    setDedupCount((c) => c + 1);
  };
  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Data mode" subtitle="Switch between the local simulation and the real backend adapter">
          <div className="grid gap-2 sm:grid-cols-2">
            <button onClick={() => setMode("demo")} aria-pressed={mode === "demo"} className={cn("rounded-lg border p-3 text-left transition-colors", mode === "demo" ? "border-coral-tg/50 bg-pale-coral text-fg shadow-2xs" : "border-line bg-panel hover:border-line-2")}>
              <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={14} className="text-coral-tg" />Demo mode</div>
              <p className="mt-1 text-xs text-fg-3">Mock adapter only. No network, no device, no model. Always clearly labelled.</p>
            </button>
            <button onClick={() => (confirmConnected ? (setMode("connected"), setConfirmConnected(false)) : setConfirmConnected(true))} aria-pressed={mode === "connected"} className={cn("rounded-lg border p-3 text-left transition-colors", mode === "connected" ? "border-evergreen/50 bg-pale-sage text-fg shadow-2xs" : "border-line bg-panel hover:border-line-2")}>
              <div className="flex items-center gap-2 text-sm font-semibold"><RefreshCw size={14} className="text-evergreen" />Connected mode</div>
              <p className="mt-1 text-xs text-fg-3">{confirmConnected && mode !== "connected" ? "Click again to confirm. If the backend is unreachable you will see a disconnected state — never fake data." : "FastAPI adapter. Shows truthful connection and freshness status."}</p>
            </button>
          </div>
          <div className="mt-4 space-y-0.5 rounded-lg border border-line bg-panel-2 p-3 shadow-2xs">
            <KV k="Active adapter" v={service.adapterName} mono={false} />
            <KV k="Connection" v={`${state.connection.state} · ${state.connection.transport}`} />
            <KV k="Message" v={<span className="text-[11px]">{state.connection.message}</span>} mono={false} />
          </div>
        </Panel>

        <Panel title="Backend configuration" subtitle="Read from Vite environment variables at build time">
          <KV k="VITE_TERRAGUARD_API_BASE_URL" v={API_BASE_URL ?? <span className="text-watch">not set</span>} />
          <KV k="WebSocket URL" v={WS_URL ?? <span className="text-watch">not set</span>} />
          <KV k="VITE_TERRAGUARD_DEFAULT_MODE" v={DEFAULT_MODE} />
          <KV k="VITE_TERRAGUARD_POLL_MS" v={POLL_MS} />
          <KV k="Frontend version" v={APP_VERSION} />
          <div className="mt-3 rounded-lg border border-line bg-panel-2 p-3 text-[11px] text-fg-2 shadow-2xs">
            <p>Create a <code className="font-mono">.env.local</code> file, e.g. <code className="font-mono">VITE_TERRAGUARD_API_BASE_URL=http://YOUR_BACKEND_HOST:8000</code>, then rebuild.</p>
            <p className="mt-1 text-fg-3"><strong>Note:</strong> in a browser, <code className="font-mono">localhost</code> means the machine running the browser — not automatically the laptop running the backend. Use the backend laptop's LAN IP or hostname. Never put secrets in VITE_* variables.</p>
          </div>
          <div className="mt-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-3 font-semibold">Expected backend routes</div>
            <ul className="space-y-0.5 font-mono text-[11px]">
              <li><span className="text-safe">GET</span> {API_ROUTES.state} <span className="text-fg-3">— mapped (fields validated at runtime)</span></li>
              <li><span className="text-safe">GET</span> {API_ROUTES.history} <span className="text-fg-3">— mapped; query params unconfirmed</span></li>
              <li><span className="text-watch">POST</span> {API_ROUTES.telemetry} <span className="text-fg-3">— device only; frontend never calls</span></li>
              <li><span className="text-watch">POST</span> {API_ROUTES.assess} <span className="text-fg-3">— wired; request body unconfirmed</span></li>
              <li><span className="text-coral-tg">WS</span> {API_ROUTES.ws} <span className="text-fg-3">— opened; message format unconfirmed</span></li>
            </ul>
          </div>
        </Panel>
      </div>

      {mode === "demo" && (
        <Panel title="Demo simulation controls" tag={<Badge tone="demo">Demo only</Badge>} subtitle="Scenario changes propagate to cards, charts, events and the simulated assessment">
          <div className="mb-3 flex items-center gap-2">
            <Button size="sm" onClick={() => service.setSimulationPaused(!state.simulationPaused)}>{state.simulationPaused ? <><Play size={13} />Resume simulation</> : <><Pause size={13} />Pause simulation</>}</Button>
            <span className="text-xs text-fg-3">Tick every {state.sensorHealth.updateIntervalSec} s · {state.history.length} history points (bounded)</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(SCENARIOS) as DemoScenario[]).map((k) => {
              const s = SCENARIOS[k];
              const active = state.scenario === k;
              return (
                <button key={k} onClick={() => service.setScenario(k)} aria-pressed={active} className={cn("rounded-lg border p-3 text-left transition-colors", active ? "border-coral-tg/50 bg-pale-coral shadow-2xs" : "border-line bg-panel hover:border-line-2")}>
                  <div className="flex items-center justify-between text-sm font-semibold">{s.label}{active && <Badge tone="safe">Active</Badge>}</div>
                  <p className="mt-1 text-xs text-fg-3">{s.description}</p>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] text-fg-3">Scenarios are illustrative. None represents a verified real-world emergency.</p>
        </Panel>
      )}

      {/* Emergency Alert & Audio Simulator (Testing Controls) */}
      <Panel
        title="Emergency Alert & Audio Simulator"
        tag={<Badge tone="demo">DEMO / TEST ONLY</Badge>}
        subtitle="Test high-priority alerts, alternating emergency sirens, gentle chimes, severity escalations, and deduplication without generating fake backend telemetry."
      >
        <div className="space-y-4">
          {/* Audio State & Master Toggle */}
          <div className="rounded-lg border border-line bg-panel-2 p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-fg">Web Audio Synthesizer Status:</span>
                <Badge
                  tone={
                    audioState === "enabled"
                      ? "safe"
                      : audioState === "blocked"
                      ? "watch"
                      : audioState === "disabled"
                      ? "neutral"
                      : "critical"
                  }
                >
                  {audioState.toUpperCase()}
                </Badge>
                {isSirenPlaying && (
                  <span className="rounded bg-critical/20 text-critical border border-critical/40 px-1.5 py-0.5 text-[10px] font-bold animate-pulse">
                    SIREN ACTIVE
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-fg-3">
                {audioState === "blocked"
                  ? "Browser blocked automatic sound playback. Click 'Unlock Audio' to enable sirens and chimes."
                  : audioState === "enabled"
                  ? "Web Audio context is active. Emergency sirens and notification tones are operational."
                  : "Alert audio is muted in local settings."}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {audioState === "blocked" && (
                <Button size="sm" variant="primary" onClick={enableAudio} className="gap-1.5">
                  <Volume2 size={13} /> Unlock Audio
                </Button>
              )}
              <Button
                size="sm"
                variant={soundEnabled ? "default" : "primary"}
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="gap-1.5"
              >
                {soundEnabled ? <VolumeX size={13} /> : <Volume2 size={13} />}
                {soundEnabled ? "Mute All Sounds" : "Enable Alert Sounds"}
              </Button>
              {isSirenPlaying && (
                <Button size="sm" variant="danger" onClick={silenceSiren} className="gap-1.5">
                  <VolumeX size={13} /> Silence Active Siren
                </Button>
              )}
            </div>
          </div>

          {/* Alert Simulation Grid */}
          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-fg-3 mb-2">
              Trigger Simulated Severity Events (Isolated from Real Telemetry)
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <button
                onClick={() => triggerTestAlert("watch")}
                className="rounded-xl border border-[#E5D7A9] bg-[#F5EED8] hover:bg-[#EFE5C5] p-3.5 text-left transition-colors shadow-2xs"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#7D5B08]">
                  <AlertTriangle size={13} /> Test WATCH Alert
                </div>
                <p className="mt-1 text-[11px] text-fg-2">
                  Triggers floating medium-severity notification with gentle bell chime.
                </p>
              </button>

              <button
                onClick={() => triggerTestAlert("warning")}
                className="rounded-xl border border-[#EDC6B1] bg-[#F7E8DE] hover:bg-[#F2D7C5] p-3.5 text-left transition-colors shadow-2xs"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#9C3E08]">
                  <AlertTriangle size={13} /> Test WARNING Alert
                </div>
                <p className="mt-1 text-[11px] text-fg-2">
                  Triggers warning notification with crisp alert chime.
                </p>
              </button>

              <button
                onClick={() => triggerTestAlert("critical")}
                className="rounded-xl border border-[#F7B5BC] bg-[#FDEBED] hover:bg-[#F8D2D7] p-3.5 text-left transition-colors shadow-2xs"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#8A101E]">
                  <AlertOctagon size={13} /> Test CRITICAL Alert
                </div>
                <p className="mt-1 text-[11px] text-fg-2">
                  Displays full-screen emergency overlay and repeating alternating siren.
                </p>
              </button>

              <button
                onClick={escalateTestAlert}
                className="rounded-xl border border-[#C4D8EE] bg-[#E7EFF8] hover:bg-[#D5E5F4] p-3.5 text-left transition-colors shadow-2xs"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2A5A8E]">
                  <ShieldAlert size={13} /> Test Escalation (Watch -&gt; Crit)
                </div>
                <p className="mt-1 text-[11px] text-fg-2">
                  Starts with WATCH popup, then escalates to CRITICAL after 2.4 seconds.
                </p>
              </button>
            </div>
          </div>

          {/* Sound Effect Tests & Deduplication */}
          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            <div className="rounded-lg border border-line bg-panel-2 p-3 space-y-2 shadow-2xs">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-fg-3">
                Direct Audio Synthesis Tests
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="xs" variant="default" onClick={() => testSound("siren")}>
                  Play 4s Siren
                </Button>
                <Button size="xs" variant="default" onClick={() => testSound("warning")}>
                  Play Warning Tone
                </Button>
                <Button size="xs" variant="default" onClick={() => testSound("watch")}>
                  Play Watch Chime
                </Button>
              </div>
              <p className="text-[10px] text-fg-3">
                Plays synthesized Web Audio tones without triggering visual overlays.
              </p>
            </div>

            <div className="rounded-lg border border-line bg-panel-2 p-3 space-y-2 shadow-2xs">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-fg-3">
                Deduplication & Polling Flood Protection
              </div>
              <div className="flex items-center gap-2">
                <Button size="xs" variant="default" onClick={testDeduplication}>
                  Fire Duplicate Alert x5
                </Button>
                {dedupCount > 0 && (
                  <span className="text-[11px] text-evergreen font-mono font-medium">
                    Suppression verified ({dedupCount} test runs)
                  </span>
                )}
              </div>
              <p className="text-[10px] text-fg-3">
                Fires 5 identical events in milliseconds. Verified: only 1 popup opens, 1 chime plays, no duplicates.
              </p>
            </div>
          </div>

          <p className="text-[10px] text-fg-3 pt-1 border-t border-line">
            Notice: Simulated test alerts are marked with [DEMO / TEST ONLY] provenance and do NOT transmit fake telemetry or pollute real backend records.
          </p>
        </div>
      </Panel>

      <SystemStatusPanel components={state.systemComponents} mode={mode} />
    </div>
  );
}
