import { useEffect, useRef, useState } from "react";
import { Bot, Send, Trash2, User } from "lucide-react";
import { cn } from "@/utils/cn";
import type { ChatMessage } from "@/types/terraguard";
import { useTerraGuard } from "@/hooks/useTerraGuard";
import { Badge, Button } from "@/components/ui/primitives";
import { fmtTime } from "@/utils/format";
import { SUGGESTED_QUESTIONS } from "@/data/mockTerraGuard";

const ERROR_TEXT: Record<string, string> = {
  backend_unavailable: "Backend unavailable — the chat request could not reach the TerraGuard API.",
  model_unavailable: "Model unavailable — the local Gemma 4 12B runtime did not respond.",
  timeout: "Timed out waiting for the model response.",
  invalid_response: "The backend returned a response that failed validation.",
  not_configured: "Connected chat is not configured yet.",
};

function renderInline(text: string) {
  // minimal markdown: **bold**, _italic_, line breaks, • bullets
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((p, j) => {
      if (p.startsWith("**")) return <strong key={j} className="font-semibold text-fg">{p.slice(2, -2)}</strong>;
      if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={j} className="text-fg-3">{p.slice(1, -1)}</em>;
      return p;
    });
    return <span key={i} className="block min-h-[1em]">{parts}</span>;
  });
}

export function ChatPanel({ tall = false }: { tall?: boolean }) {
  const { service, mode } = useTerraGuard();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const ts = new Date().toISOString();
    setMessages((m) => [...m, { id: `u_${Date.now()}`, role: "user", content: q, timestamp: ts, source: "operator", status: "ok" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await service.sendChatMessage(q);
      setMessages((m) => [...m, { id: `a_${Date.now()}`, role: "assistant", content: res.ok ? res.content : ERROR_TEXT[res.error ?? "backend_unavailable"] + " " + res.content, timestamp: new Date().toISOString(), source: res.source, status: res.ok ? "ok" : "error" }]);
    } catch (e) {
      setMessages((m) => [...m, { id: `a_${Date.now()}`, role: "assistant", content: `Request failed: ${e instanceof Error ? e.message : String(e)}`, timestamp: new Date().toISOString(), source: "system", status: "error" }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <section className={cn("panel flex flex-col", tall ? "h-[calc(100vh-9rem)] min-h-[520px]" : "h-[520px]")}>
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-evergreen/15 text-evergreen shadow-2xs">
            <Bot size={16} />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold text-fg">TerraGuard Copilot</h2>
            <p className="text-[10px] text-fg-3">{mode === "demo" ? "Mock assistant answering from simulated state" : "Gemma 4 12B · local Ollama · latest sensor context"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={mode === "demo" ? "demo" : "neutral"}>{mode === "demo" ? "Simulated · not Gemma" : "Connected chat"}</Badge>
          {confirmClear ? <><Button size="xs" variant="danger" onClick={() => { setMessages([]); setConfirmClear(false); }}>Confirm clear</Button><Button size="xs" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button></> : <Button size="xs" variant="ghost" onClick={() => setConfirmClear(true)} disabled={!messages.length} aria-label="Clear chat"><Trash2 size={12} /></Button>}
        </div>
      </header>
      <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Bot size={32} className="text-fg-3/60" />
            <p className="mt-2 text-sm font-semibold text-fg">Ask about the monitored data</p>
            <p className="mt-1 max-w-sm text-xs text-fg-3">Responses in demo mode are generated locally from current sensor readings and assessment context.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex gap-2.5", m.role === "user" ? "flex-row-reverse" : "")}>
            <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs shadow-2xs", m.role === "user" ? "bg-[#D9895B]/15 text-[#D9895B] font-semibold" : "bg-evergreen/15 text-evergreen")}>
              {m.role === "user" ? <User size={13} /> : <Bot size={13} />}
            </div>
            <div className={cn("max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed shadow-2xs", m.role === "user" ? "border border-[#EDC6B1] bg-[#F7E8DE] text-fg" : m.status === "error" ? "border border-[#F7B5BC] bg-[#FDEBED] text-fg" : "border border-line bg-panel text-fg")}>
              {renderInline(m.content)}
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-fg-3"><span className="font-mono tnum">{fmtTime(m.timestamp)}</span>{m.role === "assistant" && <span>· {m.source === "mock" ? "mock service" : m.source === "gemma4" ? "Gemma 4 12B · Ollama" : "system"}</span>}</div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-evergreen/15 text-evergreen shadow-2xs"><Bot size={13} /></div>
            <div className="flex items-center gap-1 rounded-xl border border-line bg-panel-2 px-3.5 py-3 shadow-2xs">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-evergreen [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-evergreen [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-evergreen [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-line bg-panel-2/50 p-3">
        <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-1">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button key={q} onClick={() => send(q)} disabled={busy} className="shrink-0 rounded-full border border-line bg-panel px-3 py-1 text-[11px] font-medium text-fg-2 shadow-2xs hover:border-evergreen/40 hover:bg-pale-sage hover:text-fg disabled:opacity-50 transition-colors">
              {q}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about readings, trends, status or next steps…" aria-label="Message" disabled={busy} className="h-10 flex-1 rounded-lg border border-line bg-panel px-3.5 text-sm text-fg shadow-2xs placeholder:text-fg-3 focus:border-evergreen/60 focus:ring-2 focus:ring-evergreen/20 disabled:opacity-60 transition-all" />
          <Button type="submit" size="md" variant="primary" disabled={busy || !input.trim()} aria-label="Send"><Send size={14} /></Button>
        </form>
      </div>
    </section>
  );
}
