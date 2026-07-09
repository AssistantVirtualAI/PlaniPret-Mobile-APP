// AvaChatSheet — Claude-powered AVA chat for brokers without the voice agent enabled.
// Uses pp-ava-chat Edge Function (existing). Premium glass UI.
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

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
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 z-40 flex flex-col"
        style={{
          background: "linear-gradient(180deg, rgba(6,13,26,0.98) 0%, rgba(10,22,40,0.99) 100%)",
          backdropFilter: "blur(24px)",
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.25 }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid rgba(155,127,232,0.18)", background: "linear-gradient(180deg, rgba(45,26,90,0.4), transparent)" }}>
          <div className="relative">
            <img src={avaLogo.url} alt="AVA" className="w-10 h-10 rounded-xl object-cover"
              style={{ boxShadow: "0 0 24px rgba(155,127,232,0.5)" }} />
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full"
              style={{ background: "#00D4AA", border: "2px solid #060D1A" }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <span style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", letterSpacing: "-0.01em" }}>AVA</span>
              <Sparkles className="w-3.5 h-3.5" style={{ color: "#9B7FE8" }} />
            </div>
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", letterSpacing: "0.04em" }}>Assistante Planiprêt · Claude</span>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)" }}
            aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((m, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[82%] px-3.5 py-2.5 rounded-2xl"
                style={
                  m.role === "user"
                    ? {
                        background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
                        color: "#fff",
                        borderBottomRightRadius: 6,
                        boxShadow: "0 4px 16px rgba(46,155,220,0.3)",
                      }
                    : {
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(155,127,232,0.18)",
                        color: "rgba(255,255,255,0.92)",
                        borderBottomLeftRadius: 6,
                        backdropFilter: "blur(12px)",
                      }
                }
              >
                <div className="prose prose-invert prose-sm max-w-none" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              </div>
            </motion.div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="px-3.5 py-2.5 rounded-2xl flex items-center gap-2"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(155,127,232,0.18)" }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#9B7FE8" }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>AVA réfléchit…</span>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="px-3 pb-4 pt-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(155,127,232,0.22)" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Demandez à AVA…"
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: 14, color: "#fff", fontFamily: "Inter,sans-serif" }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40 active:scale-95 transition"
              style={{
                background: "linear-gradient(135deg, #2D1A5A, #9B7FE8)",
                boxShadow: "0 4px 14px rgba(155,127,232,0.45)",
              }}
              aria-label="Envoyer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="text-center mt-2" style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>
            POWERED BY AVA · CLAUDE 3
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
