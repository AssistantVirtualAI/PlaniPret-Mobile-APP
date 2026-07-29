/**
 * EmailHistoryList — locally cached email history (sent + received) from
 * `planipret_email_messages`. Includes emails saved on send even before
 * MS Graph delta sync catches up.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { Search, Mail, Send, Inbox } from "lucide-react";

type Row = {
  id: string;
  graph_id: string | null;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  to_recipients: any[] | null;
  body_preview: string | null;
  sent_at: string | null;
  received_at: string | null;
  is_sent_by_me: boolean | null;
  folder: string | null;
  locally_saved: boolean | null;
};

type Filter = "all" | "sent" | "inbox";

export default function EmailHistoryList() {
  const { lang } = useMplanipretLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("planipret_email_messages")
      .select("id, graph_id, subject, from_email, from_name, to_recipients, body_preview, sent_at, received_at, is_sent_by_me, folder, locally_saved")
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (filter === "sent") query = query.eq("is_sent_by_me", true);
    else if (filter === "inbox") query = query.eq("is_sent_by_me", false);
    const { data } = await query;
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term || !rows) return rows ?? [];
    return rows.filter((r) => {
      const to = (r.to_recipients ?? []).map((x: any) => x?.address ?? "").join(" ");
      return [r.subject, r.from_email, r.from_name, r.body_preview, to]
        .filter(Boolean).some((s) => String(s).toLowerCase().includes(term));
    });
  }, [rows, q]);

  const fmtDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(lang === "fr" ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { day: "2-digit", month: "short" });
  };

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--pp-bg-base)" }}>
      <div className="px-3 pt-3 pb-2 space-y-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--pp-text-secondary)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={lang === "fr" ? "Rechercher dans l'historique…" : "Search history…"}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
          />
        </div>
        <div className="flex gap-2">
          {([
            { k: "all" as Filter, label: lang === "fr" ? "Tous" : "All", Icon: Mail },
            { k: "sent" as Filter, label: lang === "fr" ? "Envoyés" : "Sent", Icon: Send },
            { k: "inbox" as Filter, label: lang === "fr" ? "Reçus" : "Received", Icon: Inbox },
          ]).map((tab) => {
            const active = filter === tab.k;
            return (
              <button
                key={tab.k}
                onClick={() => setFilter(tab.k)}
                className="flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1"
                style={active
                  ? { background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))", color: "white" }
                  : { background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
              >
                <tab.Icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="p-4 text-sm text-center" style={{ color: "var(--pp-text-secondary)" }}>…</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-6 text-sm text-center" style={{ color: "var(--pp-text-secondary)" }}>
            {lang === "fr" ? "Aucun courriel dans l'historique." : "No emails in history yet."}
          </div>
        )}
        <ul className="divide-y" style={{ borderColor: "var(--pp-bg-border)" }}>
          {filtered.map((r) => {
            const isSent = !!r.is_sent_by_me;
            const primaryAddr = isSent
              ? (r.to_recipients ?? []).map((x: any) => x?.address).filter(Boolean).join(", ")
              : (r.from_name || r.from_email || "");
            return (
              <li key={r.id} className="px-3 py-3 active:opacity-70">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isSent ? <Send className="w-3 h-3 shrink-0" style={{ color: "var(--pp-brand-accent)" }} />
                            : <Inbox className="w-3 h-3 shrink-0" style={{ color: "var(--pp-text-secondary)" }} />}
                    <span className="text-xs font-medium truncate" style={{ color: "var(--pp-text-secondary)" }}>{primaryAddr}</span>
                    {r.locally_saved && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--pp-brand-accent)", color: "white" }}>
                        {lang === "fr" ? "Local" : "Local"}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] shrink-0" style={{ color: "var(--pp-text-secondary)" }}>{fmtDate(r.sent_at ?? r.received_at)}</span>
                </div>
                <div className="text-sm font-semibold truncate" style={{ color: "var(--pp-text-primary)" }}>
                  {r.subject || (lang === "fr" ? "(sans objet)" : "(no subject)")}
                </div>
                <div className="text-xs line-clamp-2 mt-0.5" style={{ color: "var(--pp-text-secondary)" }}>
                  {r.body_preview}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
