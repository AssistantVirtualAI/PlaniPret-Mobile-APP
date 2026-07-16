/**
 * Live NS-API test panel — embedded in the NS-API integration card.
 *
 * Exercises /version, /domains/:d, /users, /calls, /cdrs, /devices,
 * /phonenumbers, /registrations, /callqueues via the `ns-live-test` Edge
 * Function and renders a full diagnostic UI:
 *   • API status grid (version, domain, active calls, registrations)
 *   • Extensions table (filters + search + per-row detail panel + link UI)
 *   • Collapsible "other results" (active calls, devices, CDRs, phone #s)
 *   • Sync-to-profiles button
 *   • Optional auto-refresh (30s)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, X, Play, ChevronDown, ChevronUp } from "lucide-react";

type NsUser = {
  extension: string;
  name: string;
  email: string;
  scope: string;
  status: string;
  active_calls: number | string;
  presence: string;
  voicemail: string;
  timezone: string;
  login: string;
  raw?: any;
};

type TestResults = {
  summary: {
    total_tests: number;
    passed: number;
    failed: number;
    domain: string;
    base_url: string;
    total_latency_ms: number;
    tested_at: string;
  };
  results: Record<string, any>;
};

const C = {
  bg: "#040B16",
  card: "#0A1628",
  border: "#0E2A45",
  borderSoft: "#0A1E35",
  text: "#E8EDF5",
  sub: "#8FA8C0",
  dim: "#4A7FA5",
  blue: "#2E9BDC",
  teal: "#00D4AA",
  red: "#E84C4C",
  amber: "#F5A623",
  purple: "#A874E0",
};

function Pill({ color, bg, border, children }: any) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
      style={{ background: bg, border: `1px solid ${border}`, color }}>
      {children}
    </span>
  );
}

function scopePill(scope: string) {
  const s = (scope || "").toLowerCase();
  if (s.includes("reseller")) return <Pill color={C.purple} bg="rgba(168,116,224,0.12)" border="rgba(168,116,224,0.35)">{scope}</Pill>;
  if (s.includes("super")) return <Pill color={C.red} bg="rgba(232,76,76,0.12)" border="rgba(232,76,76,0.35)">{scope}</Pill>;
  if (s.includes("office")) return <Pill color={C.amber} bg="rgba(245,166,35,0.12)" border="rgba(245,166,35,0.35)">{scope}</Pill>;
  if (s.includes("domain")) return <Pill color={C.blue} bg="rgba(46,155,220,0.12)" border="rgba(46,155,220,0.35)">{scope}</Pill>;
  return <Pill color={C.sub} bg="#0D1F35" border={C.border}>{scope || "—"}</Pill>;
}

function presenceLabel(p: string) {
  const v = (p || "").toLowerCase();
  if (v === "active" || v === "available") return { dot: C.teal, label: "En ligne" };
  if (v === "busy" || v === "on-call") return { dot: C.red, label: "Occupé" };
  if (v === "away") return { dot: C.amber, label: "Absent" };
  if (!v || v === "inactive" || v === "offline") return { dot: "#3A5070", label: "Hors ligne" };
  return { dot: C.dim, label: p };
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function timeAgo(iso?: string) {
  if (!iso) return "";
  const sec = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `il y a ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return `il y a ${h} h`;
}

export default function NsLiveTestPanel({ domain = "planipret.ca" }: { domain?: string }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TestResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "online" | "offline" | "vm">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<NsUser | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [linkBrokers, setLinkBrokers] = useState<Array<{ id: string; email: string; first_name?: string; last_name?: string }>>([]);
  const [linkTarget, setLinkTarget] = useState<string>("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const run = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      toast.info(`⏳ Test NS-API en cours pour ${domain}...`);
    }
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("ns-live-test", {
      body: { action: "test", domain },
    });
    if (!silent) setLoading(false);
    if (err || (res as any)?.error) {
      const msg = (res as any)?.error ?? err?.message ?? "Erreur inconnue";
      setError(msg);
      if (!silent) toast.error(`❌ Erreur NS-API: ${msg}`);
      return;
    }
    setData(res as TestResults);
    if (!silent) {
      const r = (res as TestResults).results;
      const v = r?.version?.data?.apiversion ?? r?.version?.data?.version ?? "?";
      const count = r?.users?.count ?? 0;
      toast.success(`✅ NS-API connecté — ${v} — ${count} extensions trouvées`);
    }
  }, [domain]);

  // Initial fetch
  useEffect(() => { /* manual trigger */ }, []);

  // Auto-refresh (30s, lightweight repeat of full test)
  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (autoRefresh) {
      intervalRef.current = setInterval(() => run(true), 30000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, run]);

  // Load brokers for linking
  useEffect(() => {
    if (!selected) return;
    (async () => {
      const { data } = await supabase
        .from("planipret_profiles")
        .select("id,email,first_name,last_name")
        .order("email")
        .limit(500);
      setLinkBrokers((data as any) ?? []);
    })();
  }, [selected]);

  const users: NsUser[] = data?.results?.users?.data ?? [];
  const regs: any[] = Array.isArray(data?.results?.registrations?.data) ? data!.results.registrations.data : [];
  const regsByExt = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of regs) {
      const ext = String(r?.user ?? r?.aor ?? r?.["aor-user"] ?? "").trim();
      if (ext) m.set(ext, r);
    }
    return m;
  }, [regs]);

  const filteredUsers = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users.filter((u) => {
      if (s && !(u.name.toLowerCase().includes(s) || String(u.extension).includes(s) || u.email.toLowerCase().includes(s))) return false;
      const online = regsByExt.has(String(u.extension));
      if (filter === "online" && !online) return false;
      if (filter === "offline" && online) return false;
      if (filter === "vm") {
        const vm = String(u.voicemail).toLowerCase();
        if (vm !== "yes" && vm !== "true" && vm !== "1") return false;
      }
      return true;
    });
  }, [users, search, filter, regsByExt]);

  async function syncToProfiles(includeCdrs = false) {
    toast.info(includeCdrs ? "🔄 Synchro complète (utilisateurs + CDRs)..." : "🔄 Synchronisation des utilisateurs...");
    const { data: res, error: err } = await supabase.functions.invoke("ns-live-test", {
      body: { action: includeCdrs ? "sync_all" : "sync", domain },
    });
    if (err || (res as any)?.error) {
      toast.error(`❌ ${(res as any)?.error ?? err?.message}`);
      return;
    }
    const r = res as any;
    const cdr = r.cdr ? ` — CDRs: ${r.cdr.inserted}/${r.cdr.total}${r.cdr.error ? ` (err: ${r.cdr.error})` : ""}` : "";
    toast.success(`🔄 ${r.matched_count}/${r.users_total} courtiers liés — ${r.unmatched_count} sans corresp.${cdr}`);
  }


  async function linkExtension() {
    if (!selected || !linkTarget) return;
    setLinkBusy(true);
    const { data: res, error: err } = await supabase.functions.invoke("ns-live-test", {
      body: { action: "link", profile_id: linkTarget, extension: selected.extension, sip_username: selected.login || selected.extension, domain },
    });
    setLinkBusy(false);
    if (err || (res as any)?.error) { toast.error(`❌ ${(res as any)?.error ?? err?.message}`); return; }
    toast.success(`✅ Extension ${selected.extension} liée`);
    setLinkTarget("");
  }

  // ─── render helpers ─────────────────────────────────────────────
  const summary = data?.summary;
  const versionStr = data?.results?.version?.data?.apiversion ?? data?.results?.version?.data?.version ?? "—";
  const domainInfo = data?.results?.domain?.data ?? {};
  const activeCount = data?.results?.active_calls?.count ?? 0;
  const regCount = data?.results?.registrations?.count ?? 0;

  return (
    <div style={{
      background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 20, marginTop: 16,
    }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>🔬 Test en direct — {domain}</div>
          {summary && (
            <span style={{ fontSize: 11, color: C.dim }}>Dernière vérification: {timeAgo(summary.tested_at)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold"
            style={{
              background: autoRefresh ? "rgba(0,212,170,0.12)" : "#0D1F35",
              border: `1px solid ${autoRefresh ? C.teal : C.border}`,
              color: autoRefresh ? C.teal : C.sub,
            }}>
            <RefreshCw className="w-3 h-3" style={{ animation: autoRefresh ? "spin 2s linear infinite" : "none" }} />
            Auto-refresh: {autoRefresh ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => run(false)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#1A4A8A,#2E9BDC)", border: "none", opacity: loading ? 0.7 : 1, cursor: loading ? "wait" : "pointer" }}>
            {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Test en cours...</> : <><Play className="w-3.5 h-3.5" /> Lancer le test complet</>}
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Pill color={C.teal} bg="rgba(0,212,170,0.12)" border="rgba(0,212,170,0.35)">✅ {summary.passed} réussis</Pill>
          {summary.failed > 0 && <Pill color={C.red} bg="rgba(232,76,76,0.12)" border="rgba(232,76,76,0.35)">❌ {summary.failed} échoués</Pill>}
          <Pill color={C.amber} bg="rgba(245,166,35,0.12)" border="rgba(245,166,35,0.35)">⏱ {summary.total_latency_ms}ms</Pill>
        </div>
      )}

      {error && (
        <div className="mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(232,76,76,0.1)", border: `1px solid ${C.red}`, color: "#ffd5d5" }}>
          {error}
        </div>
      )}

      {!summary && !loading && !error && (
        <div className="mt-4 text-sm" style={{ color: C.dim }}>
          Cliquez sur <strong style={{ color: C.blue }}>Lancer le test complet</strong> pour interroger en direct NS-API v2.
        </div>
      )}

      {/* ─── Section A: API status grid ─── */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <StatusCard icon="🔌" label="Version API" value={String(versionStr)} ok={data?.results?.version?.success} />
          <StatusCard icon="🌐" label="Domaine" value={domain} sub={domainInfo?.["time-zone"] ?? domainInfo?.["domain-type"]} ok={data?.results?.domain?.success} />
          <StatusCard icon="📞" label="Appels actifs" value={String(activeCount)} sub="En ce moment" ok={data?.results?.active_calls?.success} pulse={activeCount > 0} />
          <StatusCard icon="📡" label="SIP en ligne" value={String(regCount)} sub="Appareils enregistrés" ok={data?.results?.registrations?.success} />
        </div>
      )}

      {/* ─── Section B: Extensions table (collapsed by default) ─── */}
      {summary && (
        <details className="mt-5 group" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-4 py-3 select-none">
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              👥 Extensions {domain} — {users.length} utilisateurs
              <span style={{ marginLeft: 8, fontSize: 11, color: C.dim, fontWeight: 500 }}>(cliquer pour afficher)</span>
            </div>
            <span style={{ fontSize: 11, color: C.dim }} className="group-open:hidden">▾</span>
            <span style={{ fontSize: 11, color: C.dim }} className="hidden group-open:inline">▴</span>
          </summary>

          <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: C.borderSoft }}>
          <div className="flex items-center justify-end gap-2 flex-wrap mb-3 mt-3">
            <button onClick={() => syncToProfiles(false)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold"
              style={{ background: "linear-gradient(135deg,#1A3D2A,#00D4AA)", color: "#060D1A", border: "none" }}>
              🔄 Synchroniser les courtiers
            </button>
            <button onClick={() => syncToProfiles(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold"
              style={{ background: "linear-gradient(135deg,#1A4A8A,#2E9BDC)", color: "#fff", border: "none" }}>
              ⚡ Synchro complète (CDRs)
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-3">

            {[
              { k: "all", label: "Tous" },
              { k: "online", label: "En ligne" },
              { k: "offline", label: "Hors ligne" },
              { k: "vm", label: "Avec voicemail" },
            ].map((f) => (
              <button key={f.k} onClick={() => setFilter(f.k as any)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold"
                style={{
                  background: filter === f.k ? "rgba(46,155,220,0.12)" : "#0D1F35",
                  border: `1px solid ${filter === f.k ? C.blue : C.border}`,
                  color: filter === f.k ? C.blue : C.sub,
                }}>
                {f.label}
              </button>
            ))}
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: C.dim }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par nom, extension ou email..."
                className="w-full pl-8 pr-3 py-2 rounded-lg text-xs"
                style={{ background: "#0D1F35", border: `1px solid ${C.border}`, color: C.text, outline: "none" }}
              />
            </div>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {["Ext.", "Nom", "Email", "Scope", "Présence", "Appels", "VM", "SIP", "Actions"].map((h) => (
                      <th key={h} style={{
                        padding: "10px 16px", fontSize: 9, fontWeight: 600, color: "#2A4A6A",
                        textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => {
                    const reg = regsByExt.get(String(u.extension));
                    const pres = presenceLabel(u.presence);
                    return (
                      <tr key={u.extension} style={{ borderTop: `1px solid ${C.borderSoft}` }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#0D1F35")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            display: "inline-block", padding: "3px 8px", borderRadius: 6,
                            background: "#0D2A4A", border: "1px solid #1A4A7A",
                            fontFamily: "JetBrains Mono, monospace", color: C.blue, fontWeight: 700, fontSize: 13,
                          }}>{u.extension}</span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div className="flex items-center gap-2">
                            <div style={{
                              width: 28, height: 28, borderRadius: "50%",
                              background: "linear-gradient(135deg,#1A4A8A,#2E9BDC)",
                              color: "#fff", fontSize: 11, fontWeight: 700,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>{initialsOf(u.name)}</div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.name || "—"}</span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 11, color: C.sub, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email || "—"}</td>
                        <td style={{ padding: "12px 16px" }}>{scopePill(u.scope)}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <div className="flex items-center gap-1.5">
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: pres.dot, display: "inline-block" }} />
                            <span style={{ fontSize: 11, color: C.sub }}>{pres.label}</span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {Number(u.active_calls) > 0
                            ? <span style={{ padding: "2px 8px", borderRadius: 999, background: "rgba(46,155,220,0.15)", color: C.blue, fontWeight: 700, fontSize: 11 }}>{u.active_calls}</span>
                            : <span style={{ color: C.dim }}>—</span>}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13 }}>{String(u.voicemail).toLowerCase() === "yes" ? "✅" : "⬜"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          {reg ? (
                            <div className="flex items-center gap-1.5">
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.teal }} />
                              <span style={{ fontSize: 11, color: C.teal, fontWeight: 600 }}>Connecté</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3A5070" }} />
                              <span style={{ fontSize: 11, color: C.dim }}>Hors ligne</span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                          <button onClick={() => setSelected(u)}
                            className="px-2 py-1 rounded text-[10px] font-semibold"
                            style={{ background: "#0D1F35", border: `1px solid ${C.border}`, color: C.blue }}>
                            ✏️ Détails
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: C.dim, fontSize: 12 }}>Aucun résultat.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </details>
      )}


      {/* ─── Section C: collapsible other results ─── */}
      {summary && (
        <div className="mt-5">
          <button onClick={() => setOtherOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ background: "#0D1F35", border: `1px solid ${C.border}`, color: C.sub }}>
            {otherOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Autres résultats (appels, devices, CDR, numéros, files)
          </button>
          {otherOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <ResultList title={`📞 Appels actifs (${data?.results?.active_calls?.count ?? 0})`} data={data?.results?.active_calls?.data} empty="Aucun appel actif en ce moment" />
              <ResultList title={`📱 Appareils SIP (${data?.results?.devices?.count ?? 0})`} data={data?.results?.devices?.data} />
              <ResultList title={`📋 CDR récents (${data?.results?.cdrs?.count ?? 0})`} data={data?.results?.cdrs?.data} />
              <ResultList title={`☎️ Numéros (${data?.results?.phone_numbers?.count ?? 0})`} data={data?.results?.phone_numbers?.data} />
              <ResultList title={`👥 Files d'attente (${data?.results?.call_queues?.count ?? 0})`} data={data?.results?.call_queues?.data} />
            </div>
          )}
        </div>
      )}

      {/* ─── Detail side panel ─── */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: 420, maxWidth: "100vw", height: "100%", background: C.card,
            borderLeft: `1px solid ${C.border}`, overflowY: "auto", padding: 20,
          }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "linear-gradient(135deg,#1A4A8A,#2E9BDC)",
                  color: "#fff", fontSize: 16, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{initialsOf(selected.name)}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{selected.name || "—"}</div>
                  <div style={{ fontSize: 12, color: C.blue, fontFamily: "monospace" }}>Ext. {selected.extension}</div>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded" style={{ color: C.sub }}><X className="w-4 h-4" /></button>
            </div>

            <DetailGroup title="📋 Informations" rows={[
              ["Extension", selected.extension],
              ["Login", selected.login],
              ["Email", selected.email],
              ["Scope", selected.scope],
              ["Timezone", selected.timezone],
              ["Account Status", selected.status],
              ["Dial Plan", selected.raw?.["dial-plan"]],
              ["Dial Policy", selected.raw?.["dial-policy"]],
            ]} />
            <DetailGroup title="📞 Téléphonie" rows={[
              ["Caller ID Name", selected.raw?.["caller-id-name"]],
              ["Caller ID Number", selected.raw?.["caller-id-number"]],
              ["Active Calls", selected.active_calls],
              ["Ring Timeout (s)", selected.raw?.["ring-timeout"]],
              ["Call Recording", selected.raw?.["call-recording"]],
              ["Call Screening", selected.raw?.["call-screening"]],
            ]} />
            <DetailGroup title="📬 Messagerie" rows={[
              ["Voicemail", selected.voicemail],
              ["VM Transcription", selected.raw?.["voicemail-transcription-enabled"]],
              ["Email Alerts", selected.raw?.["voicemail-email-enabled"]],
            ]} />

            <div className="mt-4">
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>🔗 Lier au portail Planiprêt</div>
              <select
                value={linkTarget}
                onChange={(e) => setLinkTarget(e.target.value)}
                style={{ width: "100%", background: "#0D1F35", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 12, marginBottom: 8 }}>
                <option value="">— Sélectionner un courtier —</option>
                {linkBrokers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.first_name || b.last_name ? `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim() + " — " : ""}{b.email}
                  </option>
                ))}
              </select>
              <button disabled={!linkTarget || linkBusy} onClick={linkExtension}
                className="w-full px-3 py-2 rounded-lg text-xs font-bold"
                style={{
                  background: !linkTarget ? "#0D1F35" : "linear-gradient(135deg,#1A4A8A,#2E9BDC)",
                  color: !linkTarget ? C.dim : "#fff", border: "none",
                  opacity: linkBusy ? 0.7 : 1, cursor: !linkTarget || linkBusy ? "not-allowed" : "pointer",
                }}>
                {linkBusy ? "Liaison..." : "Lier cette extension"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusCard({ icon, label, value, sub, ok, pulse }: { icon: string; label: string; value: string; sub?: string; ok?: boolean; pulse?: boolean }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
      <div className="flex items-center justify-between">
        <div style={{ fontSize: 18 }}>{icon}</div>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: ok === false ? C.red : C.teal,
          animation: pulse ? "pulse 1.5s ease-in-out infinite" : "none",
        }} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 6, wordBreak: "break-word" }}>{value}</div>
      <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function DetailGroup({ title, rows }: { title: string; rows: Array<[string, any]> }) {
  return (
    <div className="mt-4">
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {rows.map(([k, v], i) => (
          <div key={k} style={{
            display: "flex", justifyContent: "space-between", gap: 8,
            padding: "6px 10px", fontSize: 11,
            borderTop: i === 0 ? "none" : `1px solid ${C.borderSoft}`,
          }}>
            <span style={{ color: C.dim }}>{k}</span>
            <span style={{ color: C.text, fontFamily: "monospace", textAlign: "right", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v == null || v === "" ? "—" : String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultList({ title, data, empty }: { title: string; data: any; empty?: string }) {
  const arr = Array.isArray(data) ? data : [];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>{title}</div>
      {arr.length === 0 ? (
        <div style={{ fontSize: 11, color: C.dim }}>{empty ?? "Aucune donnée"}</div>
      ) : (
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          {arr.slice(0, 10).map((row, i) => (
            <div key={i} style={{
              padding: "6px 8px", fontSize: 11, color: C.sub,
              borderTop: i === 0 ? "none" : `1px solid ${C.borderSoft}`,
              fontFamily: "JetBrains Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {JSON.stringify(row).slice(0, 200)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
