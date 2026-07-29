import { useState } from "react";
import { X, Copy, Send, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { callAva } from "@/services/avaProactive";

export type AvaSummarizeSource = "sms" | "team" | "email";

export default function AvaSummarizeSheet({
  open,
  source,
  title,
  content,
  contextMeta,
  onClose,
  onInsert,
}: {
  open: boolean;
  source: AvaSummarizeSource;
  title: string;
  content: string;
  contextMeta?: Record<string, any>;
  onClose: () => void;
  onInsert?: (text: string) => void;
}) {
  const [level, setLevel] = useState<"short" | "standard" | "detailed">("standard");
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const run = async (lvl: "short" | "standard" | "detailed") => {
    setLevel(lvl);
    setLoading(true);
    setSummary("");
    const r = await callAva({
      mode: "summarize",
      level: lvl,
      message: `Source: ${source}\nTitre: ${title}\n\nContenu:\n${content.slice(0, 5000)}`,
      context: contextMeta,
    });
    setSummary(r.reply);
    setLoading(false);
  };

  const copy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      toast.success("Copié");
    } catch {
      toast.error("Échec de la copie");
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl flex flex-col"
        style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)", height: "92%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ color: "var(--pp-text-secondary)" }}>
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider" style={{ color: "var(--pp-agent)" }}>
            <Sparkles className="w-3.5 h-3.5" /> Résumer avec AVA
          </div>
          <div className="w-7" />
        </div>

        <div className="px-4 py-3 space-y-3 flex-1 overflow-y-auto">
          <div>
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--pp-text-muted)" }}>Source</p>
            <p className="text-sm font-semibold" style={{ color: "var(--pp-text-primary)" }}>{title}</p>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: "var(--pp-text-muted)" }}>Niveau de détail</p>
            <div className="flex gap-1.5">
              {[
                { k: "short" as const, label: "Court" },
                { k: "standard" as const, label: "Standard" },
                { k: "detailed" as const, label: "Détaillé" },
              ].map((l) => {
                const active = level === l.k;
                return (
                  <button
                    key={l.k}
                    onClick={() => run(l.k)}
                    disabled={loading}
                    className="flex-1 text-xs py-1.5 rounded-full font-semibold"
                    style={
                      active
                        ? { background: "linear-gradient(135deg, var(--pp-agent), #6C3CE1)", color: "white", boxShadow: "0 2px 10px rgba(155,127,232,0.35)" }
                        : { background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }
                    }
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>

          {!summary && !loading && (
            <button
              onClick={() => run(level)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              style={{
                background: "rgba(155,127,232,0.12)",
                border: "1px solid rgba(155,127,232,0.30)",
                color: "var(--pp-agent)",
              }}
            >
              <Sparkles className="w-4 h-4" /> Générer le résumé
            </button>
          )}

          {loading && (
            <div className="rounded-xl p-4 flex items-center gap-2 text-sm" style={{ background: "rgba(155,127,232,0.08)", color: "var(--pp-agent)" }}>
              <Loader2 className="w-4 h-4 animate-spin" /> AVA résume…
            </div>
          )}

          {summary && !loading && (
            <div
              className="rounded-xl p-3 text-sm whitespace-pre-wrap"
              style={{
                background: "rgba(155,127,232,0.08)",
                border: "1px solid rgba(155,127,232,0.25)",
                color: "var(--pp-text-primary)",
              }}
            >
              {summary}
            </div>
          )}
        </div>

        <div className="px-4 py-3 flex gap-2" style={{ borderTop: "1px solid var(--pp-bg-border)" }}>
          <button
            onClick={copy}
            disabled={!summary}
            className="flex-1 py-2.5 rounded-full text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
          >
            <Copy className="w-4 h-4" /> Copier
          </button>
          {onInsert && (
            <button
              onClick={() => { if (summary) { onInsert(summary); onClose(); } }}
              disabled={!summary}
              className="flex-1 py-2.5 rounded-full text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}
            >
              <Send className="w-4 h-4" /> Insérer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
