import type { ComponentStatus, EventSeverity, Freshness, RiskLevel } from "@/types/terraguard";

export const fmtTime = (iso: string | null | undefined, withSeconds = true) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}) }) : "—";

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

export const fmtClock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function fmtAge(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "Freshness unknown";
  const s = Math.round(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h > 0 ? h + "h " : ""}${m.toString().padStart(2, "0")}m ${sec.toString().padStart(2, "0")}s`;
}

export const fmtNum = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "—" : v.toFixed(d));

export const riskColor: Record<RiskLevel, string> = {
  SAFE: "#2D6A57",
  WATCH: "#C59A2B",
  WARNING: "#D9895B",
  CRITICAL: "#C52838",
};

export const riskClasses: Record<RiskLevel, { text: string; bg: string; border: string; ring: string }> = {
  SAFE: { text: "text-[#1E4D3E]", bg: "bg-[#E5EEE7]", border: "border-[#BCD1C4]", ring: "ring-[#2D6A57]/30" },
  WATCH: { text: "text-[#7D5B08]", bg: "bg-[#F5EED8]", border: "border-[#E5D7A9]", ring: "ring-[#C59A2B]/30" },
  WARNING: { text: "text-[#9C3E08]", bg: "bg-[#F7E8DE]", border: "border-[#EDC6B1]", ring: "ring-[#D9895B]/30" },
  CRITICAL: { text: "text-[#8A101E]", bg: "bg-[#FDEBED]", border: "border-[#F7B5BC]", ring: "ring-[#C52838]/30" },
};

export const severityClasses: Record<EventSeverity, string> = {
  info: "text-[#2A5A8E] bg-[#E7EFF8] border-[#C4D8EE]",
  watch: "text-[#7D5B08] bg-[#F5EED8] border-[#E5D7A9]",
  warning: "text-[#9C3E08] bg-[#F7E8DE] border-[#EDC6B1]",
  critical: "text-[#8A101E] bg-[#FDEBED] border-[#F7B5BC]",
};

export const freshnessLabel: Record<Freshness, string> = {
  fresh: "Fresh",
  stale: "Stale",
  missing: "Missing",
  unknown: "Freshness unknown",
};

export const componentStatusMeta: Record<ComponentStatus, { label: string; dot: string }> = {
  connected: { label: "Connected", dot: "bg-safe" },
  connecting: { label: "Connecting", dot: "bg-cyan-tg" },
  disconnected: { label: "Disconnected", dot: "bg-critical" },
  stale: { label: "Stale", dot: "bg-watch" },
  error: { label: "Error", dot: "bg-critical" },
  simulated: { label: "Simulated", dot: "bg-cyan-tg" },
  not_configured: { label: "Not configured", dot: "bg-fg-3" },
  unverified: { label: "Unverified", dot: "bg-fg-3" },
};
