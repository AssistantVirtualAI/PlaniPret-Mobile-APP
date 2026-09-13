import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, ShieldAlert, RefreshCw, Search, Loader2 } from "lucide-react";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";

type Row = {
  id: string;
  user_id: string | null;
  email: string | null;
  event: string;
  reason: string | null;
  provider: string | null;
  portal: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: any;
  created_at: string;
};

const EVENT_LABEL: Record<string, string> = {
  session_opened: "Connexion",
  blocked: "Accès refusé",
  "2fa_verified": "2FA validé",
  "2fa_failed": "2FA échoué",
};

export default function PAAccessLog() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "blocked">("all");

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("planipret_portal_access_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (filter === "blocked") query = query.in("event", ["blocked", "2fa_failed"]);
    const { data } = await query;
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [filter]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.email, r.event, r.reason, r.ip, r.provider].some((v) => String(v ?? "").toLowerCase().includes(s)),
    );
  }, [rows, q]);

  const blockedCount = rows.filter((r) => r.event === "blocked" || r.event === "2fa_failed").length;

  return (
    <PAPage>
      <PAPageHeader
        icon={<ShieldCheck className="w-5 h-5" />}
        title="Journal des accès"
        subtitle="Connexions au portail et tentatives refusées (500 derniers événements)."
        actions={<div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)" }}>
            <Search size={15} style={{ color: "var(--pp-text-muted)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Courriel, IP, motif…"
              className="bg-transparent outline-none text-sm w-48"
              style={{ color: "var(--pp-text-primary)" }}
            />
          </div>
          <button
            onClick={() => setFilter(filter === "all" ? "blocked" : "all")}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
          >
            {filter === "all" ? "Voir refus seulement" : "Voir tout"}
          </button>
          <button
            onClick={() => void load()}
            className="px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2"
            style={{ background: "var(--pp-accent, #0023e6)", color: "#fff" }}
          >
            <RefreshCw size={15} /> Actualiser
          </button>
        </div>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Événements", value: rows.length, Icon: ShieldCheck },
          { label: "Refus / échecs", value: blockedCount, Icon: ShieldAlert },
          { label: "Comptes distincts", value: new Set(rows.map((r) => r.email)).size, Icon: ShieldCheck },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="rounded-xl p-4" style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)" }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--pp-text-muted)" }}>
              <Icon size={14} /> {label}
            </div>
            <div className="text-2xl font-semibold mt-1" style={{ color: "var(--pp-text-primary)" }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)" }}>
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="animate-spin" size={20} style={{ color: "var(--pp-text-muted)" }} /></div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ color: "var(--pp-text-muted)" }}>Aucun événement.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--pp-text-muted)" }}>
                  {["Date", "Compte", "Événement", "Motif", "Méthode", "IP"].map((h) => (
                    <th key={h} className="text-left font-medium px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const bad = r.event === "blocked" || r.event === "2fa_failed";
                  return (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })}
                      </td>
                      <td className="px-4 py-3">{r.email ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className="px-2 py-1 rounded-md text-xs"
                          style={{
                            background: bad ? "rgba(239,68,68,.14)" : "rgba(34,197,94,.14)",
                            color: bad ? "#ef4444" : "#22c55e",
                          }}
                        >
                          {EVENT_LABEL[r.event] ?? r.event}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--pp-text-muted)" }}>{r.reason ?? "—"}</td>
                      <td className="px-4 py-3" style={{ color: "var(--pp-text-muted)" }}>{r.metadata?.via ?? r.provider ?? "—"}</td>
                      <td className="px-4 py-3" style={{ color: "var(--pp-text-muted)" }}>{r.ip ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PAPage>
  );
}
