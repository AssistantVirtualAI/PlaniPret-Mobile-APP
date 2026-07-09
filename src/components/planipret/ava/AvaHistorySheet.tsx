import { useEffect, useMemo, useState } from "react";
import { X, Search, Mic, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string;
  user_id: string;
  role: string;
  message: string;
  created_at: string;
  metadata?: any;
};

export default function AvaHistorySheet({
  open,
  userId,
  onClose,
}: {
  open: boolean;
  userId: string | undefined;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(200);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("planipret_ava_conversations")
        .select("id, user_id, role, message, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!cancelled) {
        setRows(((data ?? []) as any[]) as Row[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, userId, limit]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => (r.message ?? "").toLowerCase().includes(q));
  }, [rows, query]);

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of filtered) {
      const d = new Date(r.created_at);
      const key = d.toLocaleDateString("fr-CA", { weekday: "long", day: "2-digit", month: "long" });
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return Array.from(m.entries());
  }, [filtered]);

  if (!open) return null;

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
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--pp-text-muted)" }}>Historique AVA</p>
          <div className="w-7" />
        </div>

        <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-full"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}
          >
            <Search className="w-3.5 h-3.5" style={{ color: "var(--pp-text-muted)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher dans vos conversations…"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: "var(--pp-text-primary)" }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--pp-text-muted)" }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-10 text-sm" style={{ color: "var(--pp-text-muted)" }}>
              {query ? "Aucun résultat" : "Aucune conversation enregistrée."}
            </div>
          )}
          {groups.map(([day, items]) => (
            <div key={day}>
              <p className="text-[10px] uppercase tracking-wider mb-1.5 px-1" style={{ color: "var(--pp-text-faint)" }}>{day}</p>
              <ul className="space-y-1.5">
                {items.map((r) => {
                  const isAudio = r.metadata?.mode === "audio" || r.metadata?.source === "voice";
                  const isUser = r.role === "user";
                  return (
                    <li
                      key={r.id}
                      className="rounded-xl p-2.5"
                      style={{
                        background: isUser ? "var(--pp-bg-surface)" : "rgba(155,127,232,0.08)",
                        border: `1px solid ${isUser ? "var(--pp-bg-border-2)" : "rgba(155,127,232,0.25)"}`,
                      }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-semibold uppercase" style={{ color: isUser ? "var(--pp-text-muted)" : "var(--pp-agent)" }}>
                          {isUser ? "Vous" : "AVA"}
                        </span>
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                          style={{
                            background: isAudio ? "rgba(46,155,220,0.12)" : "rgba(155,127,232,0.12)",
                            color: isAudio ? "var(--pp-brand-accent)" : "var(--pp-agent)",
                          }}
                        >
                          {isAudio ? <Mic className="w-2.5 h-2.5" /> : <MessageSquare className="w-2.5 h-2.5" />}
                          {isAudio ? "audio" : "texte"}
                        </span>
                        <span className="text-[10px] ml-auto" style={{ color: "var(--pp-text-faint)" }}>
                          {new Date(r.created_at).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words" style={{ color: "var(--pp-text-primary)" }}>{r.message}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {!loading && rows.length >= limit && (
            <button
              onClick={() => setLimit((l) => l + 200)}
              className="w-full py-2 rounded-full text-xs"
              style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
            >
              Charger plus
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
