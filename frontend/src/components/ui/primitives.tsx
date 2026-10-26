import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";

/* ---------- Panel ---------- */
export function Panel({ className, children, title, subtitle, actions, tag }: { className?: string; children: ReactNode; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; tag?: ReactNode }) {
  return (
    <section className={cn("panel flex flex-col", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {title && <h2 className="truncate text-[13px] font-semibold tracking-wide text-fg">{title}</h2>}
              {tag}
            </div>
            {subtitle && <p className="mt-0.5 text-[11px] text-fg-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

/* ---------- Badge ---------- */
export function Badge({ children, className, tone = "neutral" }: { children: ReactNode; className?: string; tone?: "neutral" | "demo" | "safe" | "watch" | "warning" | "critical" | "cyan" }) {
  const tones = {
    neutral: "border-[#CAD3C9] text-[#4D5B55] bg-[#E8EDE6]",
    demo: "border-[#C4D8EE] text-[#2A5A8E] bg-[#E7EFF8]",
    cyan: "border-[#C4D8EE] text-[#2A5A8E] bg-[#E7EFF8]",
    safe: "border-[#BCD1C4] text-[#1E4D3E] bg-[#E5EEE7]",
    watch: "border-[#E5D7A9] text-[#7D5B08] bg-[#F5EED8]",
    warning: "border-[#EDC6B1] text-[#9C3E08] bg-[#F7E8DE]",
    critical: "border-[#F7B5BC] text-[#8A101E] bg-[#FDEBED]",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider font-mono", tones[tone], className)}>{children}</span>;
}

/* ---------- Status dot ---------- */
export function StatusDot({ className, live = false }: { className?: string; live?: boolean }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 rounded-full", live && "live-dot", className)} />;
}

/* ---------- Button ---------- */
export function Button({ className, variant = "default", size = "sm", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "danger"; size?: "xs" | "sm" | "md" }) {
  const v = {
    default: "border border-line bg-panel text-fg hover:bg-panel-2 hover:border-line-2 shadow-2xs",
    primary: "border border-evergreen bg-evergreen text-white hover:bg-deep-evergreen shadow-2xs font-semibold",
    ghost: "border border-transparent text-fg-2 hover:text-fg hover:bg-panel-2",
    danger: "border border-[#F7B5BC] bg-[#FDEBED] text-[#C52838] hover:bg-[#FCD7DA] font-semibold",
  }[variant];
  const s = { xs: "h-7 px-2.5 text-[11px]", sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm" }[size];
  return <button className={cn("inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50", v, s, className)} {...props} />;
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-md border border-line bg-panel-2 p-0.5 shadow-2xs">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("rounded px-2.5 py-1 text-[11px] font-medium transition-colors", value === o.value ? "bg-panel text-fg shadow-xs border border-line-2 font-semibold" : "text-fg-3 hover:text-fg-2")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded", className)} aria-hidden />;
}

/* ---------- Key/Value row ---------- */
export function KV({ k, v, mono = true }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="text-fg-3">{k}</span>
      <span className={cn("text-right text-fg", mono && "font-mono tnum")}>{v}</span>
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => { window.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#192C2A]/60 p-0 backdrop-blur-xs sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className={cn("fade-up max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-line bg-panel shadow-2xl sm:rounded-xl text-fg", wide ? "sm:max-w-4xl" : "sm:max-w-2xl")}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel/95 px-5 py-3 backdrop-blur">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-fg-3 hover:bg-line hover:text-fg"><X size={16} /></button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-2 px-4 py-8 text-center">
      {icon && <div className="mb-2 text-fg-3">{icon}</div>}
      <p className="text-sm font-medium text-fg-2">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs text-fg-3">{description}</p>}
    </div>
  );
}

/* ---------- Toasts ---------- */
export function ToastStack({ toasts, onDismiss }: { toasts: { id: string; title: string; description?: string; tone?: string }[]; onDismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cn("pointer-events-auto fade-up flex items-start gap-3 rounded-lg border bg-panel/95 px-3 py-2.5 shadow-xl backdrop-blur",
          t.tone === "critical" ? "border-critical/40" : t.tone === "warning" ? "border-warning/40" : t.tone === "success" ? "border-safe/40" : "border-cyan-tg/30")}>
          <StatusDot className={cn("mt-1.5", t.tone === "critical" ? "bg-critical" : t.tone === "warning" ? "bg-warning" : t.tone === "success" ? "bg-safe" : "bg-cyan-tg")} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-fg">{t.title}</p>
            {t.description && <p className="mt-0.5 text-[11px] text-fg-2">{t.description}</p>}
          </div>
          <button onClick={() => onDismiss(t.id)} aria-label="Dismiss" className="text-fg-3 hover:text-fg"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
