import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { Activity, CheckCircle2, XCircle, RefreshCw, Filter, Search } from "lucide-react";
import Pagination from "@/components/planipret/admin/Pagination";

type Log = {
  id: string;
  created_at: string;
  session_id: string | null;
  tool_name: string;
  user_id: string;
  broker_name: string;
  broker_email: string | null;
  status: "success" | "error" | "info";
  error: string | null;
  message: string | null;
  params: any;
  result: any;
};

type Stats = {
  total: number; success: number; error: number;
  by_tool: Record<string, number>;
  by_category: Record<string, number>;
};

export default function PAAvaLogs() {
  const { t, lang } = useMplanipretLang();
  const [logs, setLogs] = useState<Log[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusF, setStatusF] = useState<string>("");
  const [toolF, setToolF] = useState<string>("");
  const [since, setSince] = useState<string>("24h");
  // Search
  const [qEmail, setQEmail] = useState("");
  const [qPhone, setQPhone] = useState("");
  const [qId, setQId] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [idDraft, setIdDraft] = useState("");
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const sinceIso = since === "all"
        ? undefined
        : new Date(Date.now() - ({ "1h": 1, "24h": 24, "7d": 24 * 7, "30d": 24 * 30 }[since] ?? 24) * 3600_000).toISOString();
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (statusF) params.set("status", statusF);
      if (toolF) params.set("tool", toolF);
      if (sinceIso) params.set("since", sinceIso);
      if (qEmail) params.set("q_email", qEmail);
      if (qPhone) params.set("q_phone", qPhone);
      if (qId) params.set("q_id", qId);
      const { data, error } = await supabase.functions.invoke(`ava-tool-logs?${params.toString()}`, { method: "GET" as any });
      if (error) throw error;
      const d = data as any;
      setLogs(d?.logs ?? []);
      setStats(d?.stats ?? null);
      setTotal(d?.total ?? 0);
    } catch (e: any) {
      console.error("ava-tool-logs load", e);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusF, toolF, since, page, pageSize, qEmail, qPhone, qId]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [statusF, toolF, since, qEmail, qPhone, qId]);

  const toolNames = useMemo(() => Array.from(new Set(logs.map((l) => l.tool_name))).sort(), [logs]);
  const locale = lang === "en" ? "en-CA" : "fr-CA";

  const applySearch = () => {
    setQEmail(emailDraft.trim());
    setQPhone(phoneDraft.trim());
    setQId(idDraft.trim());
  };
  const clearSearch = () => {
    setEmailDraft(""); setPhoneDraft(""); setIdDraft("");
    setQEmail(""); setQPhone(""); setQId("");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 22, color: "var(--pp-text-primary)" }} className="flex items-center gap-2">
            <Activity className="w-5 h-5" style={{ color: "#6C3CE1" }} />
            {t("adminPortal.pageTitles.avaLogs") || "Journal AVA — Exécutions d'outils"}
          </h1>
          <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }} className="mt-0.5">
            Trace chaque appel/SMS/email/calendrier exécuté par l'agent AVA avec résultat et erreur.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="px-3 py-1.5 rounded-md border text-xs flex items-center gap-1.5"
          style={{ borderColor: "var(--pp-border)", color: "var(--pp-text-primary)" }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Résultats filtrés" value={stats.total} />
          <StatCard label="Succès" value={stats.success} tone="ok" />
          <StatCard label="Erreurs" value={stats.error} tone="err" />
          <StatCard label="Outils distincts" value={Object.keys(stats.by_tool).length} />
        </div>
      )}

      {/* Search bar */}
      <div className="p-3 rounded-md border space-y-2" style={{ borderColor: "var(--pp-border)" }}>
        <div className="flex items-center gap-2" style={{ color: "var(--pp-text-faint)", fontSize: 11, fontWeight: 600 }}>
          <Search className="w-3.5 h-3.5" /> RECHERCHE
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <SearchInput placeholder="Email du courtier" value={emailDraft} onChange={setEmailDraft} onEnter={applySearch} />
          <SearchInput placeholder="Numéro de téléphone (+15145551234)" value={phoneDraft} onChange={setPhoneDraft} onEnter={applySearch} />
          <SearchInput placeholder="ID exécution ou session" value={idDraft} onChange={setIdDraft} onEnter={applySearch} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={applySearch}
            className="px-3 py-1.5 rounded-md text-xs font-medium"
            style={{ background: "#1A4A8A", color: "#fff" }}>Rechercher</button>
          {(qEmail || qPhone || qId) && (
            <button onClick={clearSearch}
              className="px-3 py-1.5 rounded-md text-xs border"
              style={{ borderColor: "var(--pp-border)", color: "var(--pp-text-faint)" }}>Effacer</button>
          )}
          {(qEmail || qPhone || qId) && (
            <span className="text-[11px]" style={{ color: "var(--pp-text-faint)" }}>
              Actif : {[qEmail && `email=${qEmail}`, qPhone && `tél=${qPhone}`, qId && `id=${qId}`].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap p-3 rounded-md border" style={{ borderColor: "var(--pp-border)" }}>
        <Filter className="w-4 h-4" style={{ color: "var(--pp-text-faint)" }} />
        <Select value={since} onChange={setSince} options={[
          ["1h", "1h"], ["24h", "24h"], ["7d", "7j"], ["30d", "30j"], ["all", "Tout"],
        ]} />
        <Select value={statusF} onChange={setStatusF} options={[
          ["", "Tous statuts"], ["success", "Succès"], ["error", "Erreur"], ["info", "Info"],
        ]} />
        <Select value={toolF} onChange={setToolF} options={[["", "Tous les outils"], ...toolNames.map((n) => [n, n] as [string, string])]} />
      </div>

      <div className="rounded-md border overflow-hidden" style={{ borderColor: "var(--pp-border)" }}>
        <table className="w-full text-xs">
          <thead style={{ background: "var(--pp-surface-alt)" }}>
            <tr>
              <Th>Date</Th><Th>Courtier</Th><Th>Outil</Th><Th>Statut</Th><Th>Message / Erreur</Th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center" style={{ color: "var(--pp-text-faint)" }}>
                {loading ? "Chargement…" : "Aucune exécution pour ces critères."}
              </td></tr>
            )}
            {logs.map((l) => (
              <>
                <tr key={l.id} className="border-t cursor-pointer hover:bg-black/5"
                  style={{ borderColor: "var(--pp-border)" }}
                  onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                  <Td>{new Date(l.created_at).toLocaleString(locale, { dateStyle: "short", timeStyle: "medium" })}</Td>
                  <Td>
                    <div style={{ color: "var(--pp-text-primary)" }}>{l.broker_name}</div>
                    {l.broker_email && <div style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>{l.broker_email}</div>}
                  </Td>
                  <Td><code className="px-1.5 py-0.5 rounded" style={{ background: "var(--pp-surface-alt)", fontSize: 11 }}>{l.tool_name}</code></Td>
                  <Td>
                    {l.status === "success" ? (
                      <span className="inline-flex items-center gap-1" style={{ color: "#16A34A" }}><CheckCircle2 className="w-3.5 h-3.5" />OK</span>
                    ) : l.status === "error" ? (
                      <span className="inline-flex items-center gap-1" style={{ color: "#DC2626" }}><XCircle className="w-3.5 h-3.5" />Erreur</span>
                    ) : (
                      <span style={{ color: "var(--pp-text-faint)" }}>info</span>
                    )}
                  </Td>
                  <Td>
                    <span style={{ color: l.status === "error" ? "#DC2626" : "var(--pp-text-primary)" }}>
                      {l.error ?? l.message ?? "—"}
                    </span>
                  </Td>
                </tr>
                {expanded === l.id && (
                  <tr key={l.id + "-x"} style={{ background: "var(--pp-surface-alt)" }}>
                    <td colSpan={5} className="p-3">
                      <div className="grid md:grid-cols-2 gap-3">
                        <Detail title="Paramètres" data={l.params} />
                        <Detail title="Résultat" data={l.result} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3" style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>
                        <span>execution_id: <code>{l.id}</code></span>
                        {l.session_id && <span>session_id: <code>{l.session_id}</code></span>}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          loading={loading}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          unit="exécutions"
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "ok" | "err" }) {
  const color = tone === "ok" ? "#16A34A" : tone === "err" ? "#DC2626" : "var(--pp-text-primary)";
  return (
    <div className="p-3 rounded-md border" style={{ borderColor: "var(--pp-border)" }}>
      <div style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="text-xs px-2 py-1 rounded border bg-transparent"
      style={{ borderColor: "var(--pp-border)", color: "var(--pp-text-primary)" }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
function SearchInput({ value, onChange, onEnter, placeholder }: { value: string; onChange: (v: string) => void; onEnter: () => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") onEnter(); }}
      placeholder={placeholder}
      className="text-xs px-3 py-1.5 rounded-md border bg-transparent w-full"
      style={{ borderColor: "var(--pp-border)", color: "var(--pp-text-primary)" }}
    />
  );
}
function Th({ children }: { children: any }) {
  return <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--pp-text-faint)", fontSize: 11 }}>{children}</th>;
}
function Td({ children }: { children: any }) { return <td className="px-3 py-2 align-top">{children}</td>; }
function Detail({ title, data }: { title: string; data: any }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pp-text-faint)", marginBottom: 4 }}>{title}</div>
      <pre className="p-2 rounded overflow-auto text-[11px]" style={{ background: "var(--pp-surface)", maxHeight: 280 }}>
        {JSON.stringify(data ?? {}, null, 2)}
      </pre>
    </div>
  );
}
