import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download, Flame } from "lucide-react";
import { TEMP_COLORS, TEMP_EMOJI, TEMP_LABEL, type LeadTemp } from "@/components/planipret/leadHelpers";
import { PPEmptyState, PPSkeleton } from "@/components/planipret/admin/PPPrimitives";

type Row = {
  id: string;
  user_id: string;
  direction: string;
  from_number: string | null;
  from_name: string | null;
  to_number: string | null;
  to_name: string | null;
  started_at: string;
  lead_score: number | null;
  lead_temperature: LeadTemp;
  lead_score_reason: string | null;
  planipret_profiles?: { full_name: string };
};

const PAGE = 50;

export default function PALeads() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState({ all: 0, hot: 0, warm: 0, cold: 0 });
  const [filter, setFilter] = useState<"all" | "hot" | "warm" | "cold">("all");
  const [loading, setLoading] = useState(true);

  const loadCounts = async () => {
    const base = supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true }).not("lead_score", "is", null);
    const [a, h, w, c] = await Promise.all([
      base,
      supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true }).eq("lead_temperature", "hot"),
      supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true }).eq("lead_temperature", "warm"),
      supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true }).eq("lead_temperature", "cold"),
    ]);
    setCounts({ all: a.count ?? 0, hot: h.count ?? 0, warm: w.count ?? 0, cold: c.count ?? 0 });
  };

  const load = async (p = page) => {
    setLoading(true);
    const fromIdx = (p - 1) * PAGE;
    let q = supabase
      .from("planipret_phone_calls")
      .select("id, user_id, direction, from_number, from_name, to_number, to_name, started_at, lead_score, lead_temperature, lead_score_reason, planipret_profiles!inner(full_name)", { count: "exact" })
      .not("lead_score", "is", null)
      .order("lead_score", { ascending: false })
      .order("started_at", { ascending: false })
      .range(fromIdx, fromIdx + PAGE - 1);
    if (filter !== "all") q = q.eq("lead_temperature", filter);
    const { data, count } = await q;
    setRows((data ?? []) as any);
    setTotal(count ?? 0);
    setLoading(false);
  };

  useEffect(() => { setPage(1); load(1); loadCounts(); /* eslint-disable-next-line */ }, [filter]);
  useEffect(() => { load(page); /* eslint-disable-next-line */ }, [page]);

  useEffect(() => {
    const ch = supabase.channel("admin-leads")
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_calls" }, () => { load(1); loadCounts(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  const filtered = rows;

  const exportCsv = async () => {
    let q = supabase.from("planipret_phone_calls")
      .select("id, user_id, direction, from_number, from_name, to_number, to_name, started_at, lead_score, lead_temperature, lead_score_reason, planipret_profiles!inner(full_name)")
      .not("lead_score", "is", null)
      .order("lead_score", { ascending: false })
      .order("started_at", { ascending: false })
      .limit(5000);
    if (filter !== "all") q = q.eq("lead_temperature", filter);
    const { data: all } = await q;
    const header = ["Date", "Courtier", "Contact", "Numéro", "Direction", "Score", "Température", "Raison"];
    const lines = [header.join(",")];
    (all ?? []).forEach((r: any) => {
      const contact = r.from_name ?? r.to_name ?? "";
      const num = r.from_number ?? r.to_number ?? "";
      lines.push([
        new Date(r.started_at).toISOString(),
        `"${(r.planipret_profiles?.full_name ?? "").replace(/"/g, '""')}"`,
        `"${contact.replace(/"/g, '""')}"`,
        num, r.direction, r.lead_score ?? "", r.lead_temperature ?? "",
        `"${(r.lead_score_reason ?? "").replace(/"/g, '""')}"`,
      ].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leads-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 18, color: "var(--pp-text-primary)" }}>
            Leads & Pipeline
          </h2>
          <p style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>Scoring IA des appels entrants</p>
        </div>
        <button onClick={exportCsv} className="pp-btn-primary flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ["all", "Tous", counts.all],
          ["hot", "🔥 Chauds", counts.hot],
          ["warm", "🌡️ Tièdes", counts.warm],
          ["cold", "❄️ Froids", counts.cold],
        ] as const).map(([k, l, n]) => {
          const active = filter === k;
          return (
            <button key={k} onClick={() => setFilter(k as any)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-2"
              style={active
                ? { background: "var(--pp-brand-accent)", color: "#fff", border: "1px solid var(--pp-brand-accent)" }
                : { background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)", border: "1px solid var(--pp-bg-border)" }}>
              <span>{l}</span>
              <span className="rounded-full px-1.5 text-[10px] font-bold"
                style={{ background: active ? "rgba(255,255,255,0.2)" : "var(--pp-bg-deep)" }}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="pp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--pp-bg-deep)", color: "var(--pp-text-muted)" }}>
              <tr className="text-[11px] uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Courtier</th>
                <th className="text-left px-4 py-3 font-medium">Contact</th>
                <th className="text-left px-4 py-3 font-medium">Score</th>
                <th className="text-left px-4 py-3 font-medium">Température</th>
                <th className="text-left px-4 py-3 font-medium">Raison</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--pp-bg-border)" }}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><PPSkeleton style={{ height: 14, width: j === 5 ? "80%" : "60%" }} /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6}>
                  <PPEmptyState icon={<Flame className="w-6 h-6" />} title="Aucun lead noté"
                    description="Les appels seront automatiquement scorés par l'IA dès qu'ils auront une transcription." />
                </td></tr>
              ) : filtered.map((r) => {
                const contact = r.from_name ?? r.to_name ?? r.from_number ?? r.to_number ?? "—";
                const temp = (r.lead_temperature ?? "cold") as keyof typeof TEMP_COLORS;
                const c = TEMP_COLORS[temp];
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--pp-bg-border)", borderLeft: `3px solid ${c}` }}>
                    <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--pp-text-muted)" }}>
                      {new Date(r.started_at).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--pp-text-secondary)" }}>{r.planipret_profiles?.full_name ?? "—"}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--pp-text-primary)" }}>{contact}</td>
                    <td className="px-4 py-3 tabular-nums font-bold" style={{ color: c }}>{r.lead_score}/10</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] px-2 py-1 rounded-full font-semibold"
                        style={{ background: `${c}22`, color: c }}>
                        {TEMP_EMOJI[temp]} {TEMP_LABEL[temp]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-md truncate" style={{ color: "var(--pp-text-muted)" }}>
                      {r.lead_score_reason ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--pp-bg-border-2)", fontSize: 11, color: "var(--pp-text-muted)" }}>
          <span>{total === 0 ? 0 : (page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} sur {total}</span>
          <div className="flex gap-1">
            <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-2 py-1 rounded disabled:opacity-40" style={{ border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>←</button>
            <span className="px-3 py-1">{page} / {Math.max(1, Math.ceil(total / PAGE))}</span>
            <button disabled={page >= Math.ceil(total / PAGE)} onClick={() => setPage(page + 1)} className="px-2 py-1 rounded disabled:opacity-40" style={{ border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>→</button>
          </div>
        </div>
      </div>

    </div>
  );
}
