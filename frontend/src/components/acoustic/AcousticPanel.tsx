import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/utils/cn";
import type { AcousticState } from "@/types/terraguard";
import { Badge, Button, EmptyState, KV, Panel } from "@/components/ui/primitives";
import { fmtTime } from "@/utils/format";

const BARS = 48;
type FrequencyRef = { current: Uint8Array | null };

function Spectrum({ level, active, muted, height = 150, frequencies, simulated }: { level: number; active: boolean; muted: boolean; height?: number; frequencies: FrequencyRef; simulated: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(level);
  const barsRef = useRef<number[]>(new Array(BARS).fill(0.03));
  useEffect(() => { levelRef.current = level; }, [level]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const dpr = window.devicePixelRatio || 1;
    const draw = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
      ctx.clearRect(0, 0, w, h);
      const bins = frequencies.current;
      const bars = barsRef.current;
      for (let i = 0; i < BARS; i++) {
        const measured = bins?.length ? (bins[Math.min(bins.length - 1, Math.floor(i * bins.length / BARS))] ?? 0) / 255 : 0;
        const demoMotion = simulated && active && !muted ? (0.04 + levelRef.current * (0.35 + 0.55 * Math.abs(Math.sin(Date.now() / 170 + i * 0.3)))) : 0;
        const target = active && !muted ? (bins ? measured : demoMotion) : 0.025;
        bars[i] += (target - bars[i]) * 0.24;
      }
      const gap = 2, bw = (w - gap * (BARS - 1)) / BARS;
      const base = h - 10;
      ctx.strokeStyle = "#DDE2D9"; ctx.beginPath(); ctx.moveTo(0, base + 0.5); ctx.lineTo(w, base + 0.5); ctx.stroke();
      for (let i = 0; i < BARS; i++) {
        const bh = Math.max(2, bars[i] * (h - 20));
        const x = i * (bw + gap);
        const g = ctx.createLinearGradient(0, base - bh, 0, base);
        g.addColorStop(0, bars[i] > 0.75 ? "#D9895B" : "#2D6A57");
        g.addColorStop(1, "#2D918740");
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, base - bh, bw, bh, 2); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, muted, frequencies, simulated]);

  return <canvas ref={ref} style={{ height }} className="w-full" role="img" aria-label={active ? `${simulated ? "Simulated" : "Live local"} frequency spectrum, relative level ${level.toFixed(2)}` : "Acoustic visualiser inactive"} />;
}

export function AcousticPanel({ ac, onMonitoring, onMute, expanded = false }: { ac: AcousticState; onMonitoring: (a: boolean) => void; onMute: (m: boolean) => void; expanded?: boolean }) {
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState("");
  const [localLevel, setLocalLevel] = useState(0);
  const [localPeak, setLocalPeak] = useState(0);
  const frequencies = useRef<Uint8Array | null>(null);
  const browserMic = ac.micState === "not_configured" || ac.micState === "permission_required";
  const configured = !browserMic;
  const active = browserMic ? micStream !== null : ac.monitoring && configured;
  const level = browserMic ? localLevel : ac.currentLevel;
  const peak = browserMic ? localPeak : ac.peakLevel;

  useEffect(() => {
    if (!micStream) return;
    let frame = 0;
    let lastUpdate = 0;
    const context = new window.AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 128;
    const source = context.createMediaStreamSource(micStream);
    source.connect(analyser);
    const spectrum = new Uint8Array(analyser.frequencyBinCount);
    const waveform = new Uint8Array(analyser.fftSize);
    const sample = (time: number) => {
      analyser.getByteFrequencyData(spectrum);
      frequencies.current = spectrum;
      analyser.getByteTimeDomainData(waveform);
      let sum = 0;
      for (const value of waveform) { const centered = (value - 128) / 128; sum += centered * centered; }
      const current = Math.min(1, Math.sqrt(sum / waveform.length) * 4);
      if (time - lastUpdate > 100) {
        lastUpdate = time;
        setLocalLevel(current);
        setLocalPeak((prior) => Math.max(prior * 0.998, current));
      }
      frame = requestAnimationFrame(sample);
    };
    if (context.state === "suspended") void context.resume();
    frame = requestAnimationFrame(sample);
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
      frequencies.current = null;
      micStream.getTracks().forEach((track) => track.stop());
    };
  }, [micStream]);

  useEffect(() => { micStream?.getAudioTracks().forEach((track) => { track.enabled = !ac.muted; }); }, [micStream, ac.muted]);

  const startBrowserMic = async () => {
    setMicError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access requires a supported browser on localhost or HTTPS.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      setLocalPeak(0);
      setMicStream(stream);
    } catch (error) {
      setMicError(error instanceof Error ? error.message : "Microphone permission was denied or no microphone is available.");
    }
  };
  const stopBrowserMic = () => { micStream?.getTracks().forEach((track) => track.stop()); setMicStream(null); setLocalLevel(0); setLocalPeak(0); };
  const displayedState = browserMic ? (micStream ? "active" : "not_configured") : ac.micState;

  return (
    <Panel title="Acoustic monitoring" tag={<Badge tone={displayedState === "simulated" ? "demo" : displayedState === "active" ? "safe" : "neutral"}>{displayedState === "active" && browserMic ? "Browser microphone" : displayedState === "simulated" ? "Simulated" : displayedState.replace("_", " ")}</Badge>} subtitle={browserMic ? "Live relative sound level · processed in this browser only · no audio recording or upload" : `Relative level on a 0–1 visual scale · sample every ${ac.intervalSec} s · not calibrated dB`}
      actions={<>
        {active && <Button size="xs" variant="ghost" onClick={() => onMute(!ac.muted)} aria-pressed={ac.muted} title={ac.muted ? "Unmute microphone monitor" : "Mute microphone monitor"}>{ac.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}</Button>}
        <Button size="xs" variant={active ? "default" : "primary"} onClick={browserMic ? (active ? stopBrowserMic : startBrowserMic) : () => onMonitoring(!ac.monitoring)} aria-pressed={active}>{active ? <><Pause size={12} />Stop microphone</> : <><Play size={12} />Start microphone</>}</Button>
      </>}>
      <div className={cn("grid gap-4", expanded && "lg:grid-cols-[1fr_300px]")}>
        <div>
          <div className="relative overflow-hidden rounded-lg border border-line bg-panel-2 px-3 pt-3 shadow-2xs">
            <div className="absolute left-3 top-2 flex items-center gap-2 text-[10px] font-mono text-fg-3"><span className={cn("flex h-5 w-5 items-center justify-center rounded-full border", active ? "border-copper/50 text-copper bg-pale-copper/40" : "border-line text-fg-3")}>{active ? <Mic size={10} /> : <MicOff size={10} />}</span><span>{active ? ac.muted ? "MICROPHONE MUTED" : browserMic ? "LISTENING · LOCAL LEVEL ONLY" : "MONITORING" : "MICROPHONE OFF"}</span></div>
            <Spectrum level={level} active={active} muted={ac.muted} height={expanded ? 220 : 150} frequencies={frequencies} simulated={ac.micState === "simulated"} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 sm:grid-cols-4">
            <KV k="Current level" v={<span className="text-evergreen font-semibold">{active ? level.toFixed(2) : "—"}</span>} />
            <KV k="Peak (session)" v={peak.toFixed(2)} />
            <KV k="Last sample" v={browserMic && active ? new Date().toLocaleTimeString() : fmtTime(ac.lastEventAt)} />
            <KV k="Microphone" v={<span className="text-fg-3">{browserMic ? active ? "active · local" : "off" : "simulated"}</span>} mono={false} />
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden><div className="h-full rounded-full bg-gradient-to-r from-evergreen to-copper transition-[width] duration-150" style={{ width: `${(active ? level : 0) * 100}%` }} /></div>
          {micError && <p role="status" className="mt-3 rounded-lg border border-watch/30 bg-watch/10 p-3 text-xs text-fg-2">{micError}</p>}
          {browserMic && <p className="mt-2 text-[10px] text-fg-3">No speech recognition, recording, storage, or upload. The browser calculates only a relative sound-level visualisation. Level is not calibrated dB.</p>}
        </div>
        <div><div className="mb-2 flex items-center justify-between text-[11px] text-fg-3"><span>{browserMic ? "Local audio processing" : "Sample history"}</span><span>{browserMic ? "No audio saved" : `${ac.events.length} stored (bounded)`}</span></div>{browserMic ? <EmptyState icon={<Mic size={18} />} title={active ? "Audio is analyzed locally" : "Microphone is off"} description={active ? "Only waveform amplitude and frequency levels are measured; audio never leaves the browser." : "Press Start microphone and grant permission to enable the live level display."} /> : ac.events.length === 0 ? <EmptyState title="No samples yet" /> : <ol className="max-h-[260px] space-y-1 overflow-y-auto pr-1">{ac.events.slice(0, expanded ? 20 : 6).map((e) => <li key={e.id} className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-xs shadow-2xs"><div className="flex h-5 w-12 items-end gap-px" aria-hidden>{[0.4, 0.7, 1, 0.6, 0.8].map((m, i) => <span key={i} className={cn("w-full rounded-sm", e.peakLevel > 0.7 ? "bg-coral-tg/80" : "bg-evergreen/70")} style={{ height: `${Math.max(10, e.relativeLevel * m * 100)}%` }} />)}</div><div className="min-w-0 flex-1"><div className="truncate font-medium text-fg">{e.label}</div><div className="font-mono text-[10px] text-fg-3">lvl {e.relativeLevel.toFixed(2)} · peak {e.peakLevel.toFixed(2)}</div></div><span className="font-mono text-[10px] text-fg-3">{fmtTime(e.recordedAt)}</span></li>)}</ol>}</div>
      </div>
    </Panel>
  );
}
