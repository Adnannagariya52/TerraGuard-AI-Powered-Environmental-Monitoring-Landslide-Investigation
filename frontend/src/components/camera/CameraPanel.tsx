import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Image as ImageIcon, Pause, Play } from "lucide-react";
import { cn } from "@/utils/cn";
import type { CameraState, CaptureRecord } from "@/types/terraguard";
import { Badge, Button, EmptyState, KV, Modal, Panel } from "@/components/ui/primitives";
import { fmtAge, fmtDateTime, fmtTime } from "@/utils/format";
import { API_BASE_URL } from "@/config/env";
import terrain from "@/assets/demo-terrain.jpg";

function resolveImage(url: string | null) {
  if (!url) return null;
  if (url === "demo://terrain") return terrain;
  return url;
}

function frameStyle(seq: number): React.CSSProperties {
  const b = 0.9 + ((seq * 7) % 5) * 0.03;
  const h = ((seq * 13) % 7) - 3;
  return { filter: `brightness(${b}) hue-rotate(${h}deg) saturate(${0.85 + ((seq * 3) % 4) * 0.05})` };
}

type VisionResult = { risk: "normal" | "warning" | "critical" | "unknown"; summary: string; confidence?: string; status?: string };

export function CameraPanel({ camera, onPreview, onCapture, capturing, expanded = false }: { camera: CameraState; onPreview: (active: boolean) => void; onCapture: () => void; capturing: boolean; expanded?: boolean }) {
  const [selected, setSelected] = useState<CaptureRecord | null>(null);
  const [flash, setFlash] = useState(false);
  const [, tick] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [vision, setVision] = useState<VisionResult | null>(null);
  const [visionBusy, setVisionBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [dismissedCritical, setDismissedCritical] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const shownCriticalRef = useRef(false);
  const latest = camera.captures[0];
  const configured = camera.connection !== "not_configured";
  const browserCamera = !configured;

  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!latest) return; setFlash(true); const t = setTimeout(() => setFlash(false), 350); return () => clearTimeout(t); }, [latest?.id]);
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream]);

  useEffect(() => {
    if (!stream || !sessionId) return;
    let active = true;
    let controller: AbortController | null = null;
    const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const run = async () => {
      while (active) {
        const video = videoRef.current;
        if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
          await pause(500);
          continue;
        }
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = canvas.toDataURL("image/jpeg", 0.62);
        if (!API_BASE_URL) {
          setCameraError("Backend URL is unavailable; live preview works, but Gemma vision analysis cannot run.");
          await pause(3000);
          continue;
        }
        controller = new AbortController();
        setVisionBusy(true);
        try {
          const response = await fetch(`${API_BASE_URL}/api/vision/analyze`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId, frame_b64: frame }),
            signal: controller.signal,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.detail ?? `Vision endpoint returned HTTP ${response.status}`);
          if (!active) break;
          const mapped: VisionResult = { risk: result.risk ?? "unknown", summary: result.summary ?? "No visual assessment returned.", confidence: result.confidence, status: result.status };
          setVision(mapped);
          if (mapped.risk !== "critical") setDismissedCritical(false);
          setCameraError("");
          if (mapped.risk === "critical" && !shownCriticalRef.current) shownCriticalRef.current = true;
          if (mapped.risk !== "critical") shownCriticalRef.current = false;
        } catch (error) {
          if (!active) break;
          if (!(error instanceof DOMException && error.name === "AbortError")) setCameraError(error instanceof Error ? error.message : "Gemma vision request failed.");
        } finally {
          setVisionBusy(false);
          controller = null;
        }
        await pause(3500);
      }
    };
    void run();
    return () => {
      active = false;
      controller?.abort();
      stream.getTracks().forEach((track) => track.stop());
      if (API_BASE_URL) void fetch(`${API_BASE_URL}/api/vision/stop`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }), keepalive: true,
      }).catch(() => undefined);
    };
  }, [stream, sessionId]);

  const startBrowserCamera = async () => {
    setCameraError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires a supported browser on localhost or HTTPS.");
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      setSessionId(`browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      setVision(null);
      setStream(media);
      onPreview(true);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Camera permission was denied or no camera is available.");
    }
  };

  const stopBrowserCamera = () => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setVisionBusy(false);
    setVision(null);
    onPreview(false);
  };

  const captureBrowserFrame = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setSnapshot(canvas.toDataURL("image/jpeg", 0.82));
  };

  const nextIn = camera.nextCaptureAt ? Math.max(0, Math.round((new Date(camera.nextCaptureAt).getTime() - Date.now()) / 1000)) : null;
  const img = resolveImage(latest?.imageUrl ?? null);
  const riskTone = vision?.risk === "critical" ? "critical" : vision?.risk === "warning" ? "warning" : vision?.risk === "normal" ? "safe" : "neutral";

  return (
    <Panel title="Camera intelligence" tag={<Badge tone={camera.connection === "simulated" ? "demo" : camera.connection === "connected" || stream ? "safe" : "neutral"}>{camera.connection === "simulated" ? "Simulated" : stream ? "Live camera" : camera.connection === "connected" ? "Connected" : "Ready to connect"}</Badge>} subtitle={browserCamera ? "Browser camera · Gemma vision via local Ollama · frames are analyzed locally" : `${camera.cameraId} · ${configured ? `capture every ${camera.captureIntervalSec} s` : "camera unavailable"}`}
      actions={browserCamera ? <>
        <Button size="xs" variant={stream ? "default" : "primary"} onClick={stream ? stopBrowserCamera : startBrowserCamera} aria-pressed={!!stream}>{stream ? <><Pause size={12} />Stop camera</> : <><Play size={12} />Start camera</>}</Button>
        {stream && <Button size="xs" variant="ghost" onClick={captureBrowserFrame}><Camera size={12} />Snapshot</Button>}
      </> : <>
        <Button size="xs" variant="ghost" onClick={() => onPreview(!camera.previewActive)} aria-pressed={camera.previewActive}>{camera.previewActive ? <><Pause size={12} />Pause</> : <><Play size={12} />Start</>}</Button>
        <Button size="xs" variant="primary" onClick={onCapture} disabled={capturing}><Camera size={12} />{capturing ? "Capturing…" : "Capture"}</Button>
      </>}>
      {browserCamera ? <div className={cn("grid gap-4", expanded && "lg:grid-cols-[1fr_300px]")}>
        <div>
          <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-black shadow-2xs">
            {stream ? <video ref={videoRef} autoPlay muted playsInline aria-label="Live laptop camera preview" className="h-full w-full object-cover" /> : (
              <div className="flex h-full flex-col items-center justify-center gap-2 bg-panel-2 px-5 text-center text-fg-3"><Camera size={24} /><span className="text-sm font-medium">Camera is off</span><span className="max-w-md text-xs">Press Start camera and allow this local dashboard to access your camera. No video is saved.</span></div>
            )}
            {stream && <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-2 font-mono text-[10px] text-white"><span className="rounded bg-black/60 px-1.5 py-0.5">LAPTOP CAMERA</span><span className="rounded bg-black/60 px-1.5 py-0.5">LIVE · GEMMA 4 12B</span></div>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={vision ? riskTone : "neutral"}>{vision?.risk?.toUpperCase() ?? (stream ? "BASELINE / WAITING" : "CAMERA OFF")}</Badge>
            <span className="text-xs text-fg-3">{visionBusy ? "Gemma is analyzing the latest frame pair…" : vision?.confidence ? `${vision.confidence} confidence` : "Analysis runs on demand after each sampled frame"}</span>
          </div>
          {vision?.summary && <p className="mt-2 rounded-lg border border-line bg-panel-2 p-3 text-xs leading-relaxed text-fg-2">{vision.summary}</p>}
          {vision?.risk === "critical" && <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-critical/40 bg-critical-bg p-3 text-sm text-critical"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><span><strong>Critical visual movement flagged.</strong> Verify the scene in person and follow authorized local procedures. This prototype does not send an official alert.</span></div>}
          {cameraError && <p role="status" className="mt-3 rounded-lg border border-watch/30 bg-watch/10 p-3 text-xs text-fg-2">{cameraError}</p>}
          {snapshot && <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-panel-2 p-2"><img src={snapshot} alt="Locally captured camera snapshot" className="h-16 w-24 rounded object-cover" /><span className="text-xs text-fg-3">Snapshot held temporarily in this page; not uploaded or saved.</span><Button size="xs" variant="ghost" onClick={() => setSnapshot(null)}>Dismiss</Button></div>}
          <p className="mt-2 text-[10px] text-fg-3">Frames are sent to this computer’s TerraGuard backend and Ollama for visual comparison. This is experimental decision support, not an emergency detector.</p>
        </div>
        <div className="rounded-xl border border-line bg-panel-2 p-4">
          <div className="mb-2 text-xs font-semibold text-fg">Camera status</div>
          <div className="space-y-1 text-xs text-fg-3"><div>Source: this browser device</div><div>Frame analysis: {API_BASE_URL ? "local TerraGuard API" : "backend URL unavailable"}</div><div>Model: Gemma 4 12B via Ollama</div><div>Image storage: not saved by API</div></div>
          {!stream && <EmptyState icon={<ImageIcon size={18} />} title="Waiting for camera" description="Starting the feed requires your browser’s camera permission." />}
        </div>
      </div> : (
        <div className={cn("grid gap-4", expanded && "lg:grid-cols-[1fr_300px]")}>
          <div>
            <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-black shadow-2xs">
              {img && camera.previewActive ? <img src={img} alt="Simulated terrain camera frame" className="h-full w-full object-cover transition-[filter] duration-700" style={frameStyle(latest?.sequence ?? 0)} /> : <div className="flex h-full flex-col items-center justify-center gap-2 bg-panel-2 text-fg-3"><Pause size={22} /><span className="text-xs">Preview paused</span></div>}
              <div className="pointer-events-none absolute inset-0 bg-white transition-opacity duration-300" style={{ opacity: flash ? 0.4 : 0 }} aria-hidden />
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-2 font-mono text-[10px] text-white/90"><span className="rounded bg-black/60 px-1.5 py-0.5">{camera.cameraId}</span><span className="rounded bg-black/60 px-1.5 py-0.5">{camera.previewActive ? "PREVIEW" : "PAUSED"} · DEMO</span></div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between p-2 font-mono text-[10px] text-white/90"><span className="rounded bg-black/60 px-1.5 py-0.5">{latest ? fmtDateTime(latest.capturedAt) : "no frame"}</span><span className="rounded bg-black/60 px-1.5 py-0.5">IMG #{latest?.sequence.toString().padStart(4, "0") ?? "----"}</span></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 sm:grid-cols-4"><KV k="Last capture" v={fmtTime(camera.lastCaptureAt)} /><KV k="Next capture" v={camera.previewActive && nextIn !== null ? `in ${nextIn}s` : "paused"} /><KV k="Snapshots" v={camera.captures.length} /><KV k="Quality" v={<span className="text-fg-3">n/a (demo)</span>} mono={false} /></div>
          </div>
          <div><div className="mb-2 flex items-center justify-between text-[11px] text-fg-3"><span>Recent captures</span><span>{camera.captures.length} stored</span></div>{camera.captures.length === 0 ? <EmptyState icon={<ImageIcon size={18} />} title="No captures yet" /> : camera.captures.slice(0, expanded ? 12 : 8).map((c) => <button key={c.id} onClick={() => setSelected(c)} className="relative mr-2 aspect-[4/3] w-20 overflow-hidden rounded-lg border border-line"><img src={resolveImage(c.imageUrl) ?? ""} alt={`Capture ${c.sequence}`} className="h-full w-full object-cover" style={frameStyle(c.sequence)} /></button>)}</div>
        </div>
      )}
      <Modal open={vision?.risk === "critical" && !dismissedCritical} onClose={() => setDismissedCritical(true)} title={<span className="flex items-center gap-2 text-critical"><AlertTriangle size={18} />Critical visual movement flagged</span>}>
        <div role="alertdialog" aria-modal="true" className="space-y-4">
          <p className="text-sm leading-relaxed text-fg-2">{vision?.summary} Verify conditions directly and follow authorized local procedures. This prototype does not contact emergency services or issue an official evacuation order.</p>
          <div className="flex justify-end"><Button variant="primary" onClick={() => setDismissedCritical(true)}>Acknowledge</Button></div>
        </div>
      </Modal>
      <Modal open={!!selected} onClose={() => setSelected(null)} wide title={<span className="flex items-center gap-2">Snapshot #{selected?.sequence} <Badge tone="demo">Simulated</Badge></span>}>{selected && <div className="space-y-3"><img src={resolveImage(selected.imageUrl) ?? ""} alt={`Capture ${selected.sequence}`} className="w-full rounded-lg border border-line" style={frameStyle(selected.sequence)} /><div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4"><KV k="Captured" v={fmtDateTime(selected.capturedAt)} /><KV k="Age" v={fmtAge(Date.now() - new Date(selected.capturedAt).getTime())} /><KV k="ID" v={selected.id} /><KV k="Processing" v={selected.processingStatus} /></div><p className="text-[11px] text-fg-3">This demo snapshot is an illustrative bundled image, not a live photograph.</p></div>}</Modal>
    </Panel>
  );
}
