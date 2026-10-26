/**
 * TerraGuard Local Alert Audio Service
 *
 * Implements high-priority emergency sirens and notification chimes
 * locally in the browser using the Web Audio API.
 *
 * Features:
 * - Alternating two-tone emergency siren for CRITICAL alerts.
 * - Gentle bell notification chime for WATCH alerts.
 * - Crisp dual-tone chime for WARNING alerts.
 * - Guaranteed single-instance playback (no overlapping sirens).
 * - Full browser autoplay policy & interaction handling.
 * - Controlled non-painful volume (gain ~0.15 with soft ramps).
 * - Zero external assets, zero remote APIs, zero cloud dependencies.
 */

type AudioState = "enabled" | "blocked" | "disabled" | "unsupported";

class AlertAudioService {
  private ctx: AudioContext | null = null;
  private sirenIntervalId: ReturnType<typeof setInterval> | null = null;
  private sirenOsc1: OscillatorNode | null = null;
  private sirenOsc2: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private isSirenActive = false;
  private soundEnabled = true;
  private listeners = new Set<() => void>();

  constructor() {
    // Check local storage for saved user audio preference
    try {
      const saved = localStorage.getItem("terraguard_sound_enabled");
      if (saved !== null) {
        this.soundEnabled = saved === "true";
      }
    } catch {
      // LocalStorage access restricted in some iframes
    }
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private initContext(): AudioContext | null {
    if (this.ctx && this.ctx.state !== "closed") {
      return this.ctx;
    }
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) {
      return null;
    }
    try {
      this.ctx = new AudioCtxClass();
      return this.ctx;
    } catch {
      return null;
    }
  }

  public getAudioState(): AudioState {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return "unsupported";
    if (!this.soundEnabled) return "disabled";
    if (!this.ctx) return "blocked";
    if (this.ctx.state === "suspended") return "blocked";
    return "enabled";
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public isSirenPlaying(): boolean {
    return this.isSirenActive;
  }

  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    try {
      localStorage.setItem("terraguard_sound_enabled", String(enabled));
    } catch {
      // ignored
    }
    if (!enabled) {
      this.stopCriticalSiren();
    }
    this.notify();
  }

  /**
   * Unlock AudioContext from explicit user interaction (e.g. click).
   */
  public async enableAudio(): Promise<boolean> {
    const ctx = this.initContext();
    if (!ctx) return false;
    this.soundEnabled = true;
    try {
      localStorage.setItem("terraguard_sound_enabled", "true");
    } catch {
      // ignored
    }
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        this.notify();
        return false;
      }
    }
    this.notify();
    return ctx.state === "running";
  }

  /**
   * Start alternating emergency siren for CRITICAL alerts.
   * Alternates frequencies: 840 Hz (High) and 630 Hz (Low) every 360ms.
   */
  public startCriticalSiren(): boolean {
    if (!this.soundEnabled) return false;
    if (this.isSirenActive) return true; // Single instance already running

    const ctx = this.initContext();
    if (!ctx) return false;

    if (ctx.state === "suspended") {
      // Attempt auto-resume
      ctx.resume().catch(() => {});
      if (ctx.state === "suspended") {
        this.notify();
        return false; // Browser blocked until interaction
      }
    }

    try {
      const now = ctx.currentTime;

      // Master siren gain with gentle ramp to non-painful volume
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(0.18, now + 0.08); // controlled volume
      masterGain.connect(ctx.destination);

      // Low-pass filter to soften harsh harmonics
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1400, now);
      filter.connect(masterGain);

      // Primary tone oscillator
      const osc1 = ctx.createOscillator();
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(840, now);
      osc1.connect(filter);

      // Secondary harmonizing oscillator for authority
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(420, now);
      osc2.connect(filter);

      osc1.start(now);
      osc2.start(now);

      this.sirenOsc1 = osc1;
      this.sirenOsc2 = osc2;
      this.sirenGain = masterGain;
      this.isSirenActive = true;

      // Alternate frequencies every 360ms
      let highTone = true;
      this.sirenIntervalId = setInterval(() => {
        if (!this.isSirenActive || !this.sirenOsc1 || !this.sirenOsc2 || !this.ctx) return;
        const t = this.ctx.currentTime;
        highTone = !highTone;
        const f1 = highTone ? 840 : 630;
        const f2 = highTone ? 420 : 315;
        this.sirenOsc1.frequency.setTargetAtTime(f1, t, 0.035);
        this.sirenOsc2.frequency.setTargetAtTime(f2, t, 0.035);
      }, 360);

      this.notify();
      return true;
    } catch (e) {
      console.warn("Failed to start critical siren:", e);
      this.isSirenActive = false;
      this.notify();
      return false;
    }
  }

  /**
   * Stop critical siren immediately.
   */
  public stopCriticalSiren(): void {
    if (!this.isSirenActive && !this.sirenGain) return;

    if (this.sirenIntervalId) {
      clearInterval(this.sirenIntervalId);
      this.sirenIntervalId = null;
    }

    // Detach the current nodes before stopping them so a rapid re-arm cannot
    // be affected by delayed cleanup from the previous siren instance.
    const osc1 = this.sirenOsc1;
    const osc2 = this.sirenOsc2;
    const gain = this.sirenGain;
    this.sirenOsc1 = null;
    this.sirenOsc2 = null;
    this.sirenGain = null;
    this.isSirenActive = false;
    try {
      if (gain && this.ctx && this.ctx.state !== "closed") {
        gain.gain.cancelScheduledValues(this.ctx.currentTime);
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      osc1?.stop();
      osc2?.stop();
      osc1?.disconnect();
      osc2?.disconnect();
      gain?.disconnect();
    } catch {
      // Nodes may already have stopped if the browser is closing the context.
    }
    this.notify();
  }

  /**
   * Play a gentle bell chime for WATCH alerts.
   */
  public playWatchChime(): void {
    if (!this.soundEnabled) return;
    const ctx = this.initContext();
    if (!ctx || ctx.state === "suspended") return;

    try {
      const now = ctx.currentTime;

      // Note 1: 523.25 Hz (C5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);

      // Note 2: 659.25 Hz (E5) delayed by 120ms
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(659.25, now + 0.12);
      gain2.gain.setValueAtTime(0.001, now + 0.12);
      gain2.gain.linearRampToValueAtTime(0.14, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.75);
    } catch {
      // audio error ignored
    }
  }

  /**
   * Play a crisp tone for WARNING alerts.
   */
  public playWarningChime(): void {
    if (!this.soundEnabled) return;
    const ctx = this.initContext();
    if (!ctx || ctx.state === "suspended") return;

    try {
      const now = ctx.currentTime;

      // 587.33 Hz (D5) -> 739.99 Hz (F#5) with a slight pulse
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(739.99, now + 0.18);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.6);
    } catch {
      // audio error ignored
    }
  }
}

export const alertAudioService = new AlertAudioService();
