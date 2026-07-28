// AvaChatSheet — Claude-powered AVA chat, styled like the other mobile pages.
import { useEffect, useRef, useState } from "react";
import { X, Send, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import avaLogo from "@/assets/ava-statistics-logo.png.asset.json";

type Msg = { role: "user" | "assistant"; content: string };

export default function AvaChatSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Bonjour 👋 Je suis **AVA**, votre assistante Planiprêt. Comment puis-je vous aider aujourd'hui ?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const frame = document.getElementById("pp-mobile-frame");
    setLockedHeight(Math.round(frame?.getBoundingClientRect().height || window.innerHeight));
  }, []);

  // Reliable close: Escape key anywhere while the sheet is mounted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // NOTE: do NOT auto-focus the textarea on mount — it triggers the mobile
  // keyboard + iOS viewport zoom which makes the layout appear to "grow".

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pp-ava-chat", {
        body: { messages: next, user_id: userId },
      });
      if (error) throw error;
      const reply = (data as any)?.reply ?? (data as any)?.message ?? "Désolée, je n'ai pas de réponse pour le moment.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ Erreur: ${e?.message ?? "indisponible"}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="absolute inset-x-0 top-0 z-[60] flex flex-col overflow-hidden"
      style={{ height: lockedHeight ? `${lockedHeight}px` : "100svh", background: "rgba(4,11,22,0.45)", backdropFilter: "blur(6px)", contain: "layout paint size" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="AVA Chat"
    >
      {/* Inner sheet — same top offset / header height as PlanipretMobile pages */}
      <div
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--pp-bg-base)",
          marginTop: 0,
          paddingTop: 0,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
      {/* Header — matches PlanipretMobile top header (same margin/height) */}
      <header
        className="relative flex items-center px-4 shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 32px)", paddingBottom: 10, background: "var(--pp-bg-deep)", borderBottom: "1px solid var(--pp-bg-border)" }}
      >
        <div className="flex items-center gap-2">
          <div className="relative shrink-0">
            <img
              src={avaLogo.url}
              alt="AVA"
              style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", background: "#0A1628", boxShadow: "0 0 12px rgba(124,58,237,0.35)" }}
            />
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
              style={{ background: "var(--pp-success)", border: "2px solid var(--pp-bg-deep)" }}
            />
          </div>
          <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--pp-agent)" }} />
        </div>

        {/* Centered title */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
          <span style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 14, color: "var(--pp-text-primary)", letterSpacing: "-0.01em" }}>AVA · Chat</span>
        </div>

        {/* Close — always visible, right */}
        <button
          onClick={onClose}
          className="ml-auto flex items-center justify-center active:scale-95 transition shrink-0"
          style={{ width: 32, height: 32, borderRadius: 10, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[86%] px-3.5 py-2.5 rounded-2xl break-words"
              style={
                m.role === "user"
                  ? {
                      background: "linear-gradient(135deg, var(--pp-brand-accent2), var(--pp-brand-accent))",
                      color: "#fff",
                      fontWeight: 600,
                      borderBottomRightRadius: 6,
                      boxShadow: "var(--pp-shadow-md, 0 4px 12px rgba(30,58,95,0.15))",
                    }
                  : {
                      background: "var(--pp-bg-surface)",
                      border: "1px solid var(--pp-bg-border)",
                      color: "var(--pp-text-primary)",
                      borderBottomLeftRadius: 6,
                    }
              }
            >
              <div className="prose prose-sm max-w-none" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div
              className="px-3.5 py-2.5 rounded-2xl flex items-center gap-2"
              style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)" }}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--pp-agent)" }} />
              <span style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>AVA réfléchit…</span>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="px-3 pt-2 pb-3 shrink-0" style={{ borderTop: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-deep)", transform: "translateZ(0)" }}>
        <div
          className="flex items-end gap-2 px-3 py-2 rounded-2xl"
          style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Demandez à AVA…"
            rows={1}
            className="flex-1 min-h-[38px] max-h-24 resize-none bg-transparent py-2 outline-none"
            style={{ fontSize: 16, color: "var(--pp-text-primary)", caretColor: "var(--pp-brand-accent)", fontFamily: "Inter,sans-serif" }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40 active:scale-95 transition shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--pp-brand-accent2), var(--pp-agent))",
              boxShadow: "0 4px 12px rgba(108,92,231,0.35)",
            }}
            aria-label="Envoyer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="text-center mt-1.5" style={{ fontSize: 9, color: "var(--pp-text-faint)", letterSpacing: "0.08em" }}>
          POWERED BY AVA
        </div>
      </div>
      </div>
    </div>
  );
}
