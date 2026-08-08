import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Search, Phone, PhoneCall, Loader2, Trash2, History, X, Filter, Building2, Hash,
} from "lucide-react";
import type { PlanipretMobileContext } from "../PlanipretMobile";

type Contact = {
  name: string;
  phone?: string | null;
  extension?: string | null;
  email?: string | null;
  company?: string | null;
  source: string;
  score?: number;
};

type AuditEntry = {
  id: string;
  caller: string;
  query: string;
  filters: any;
  sources_queried: string[];
  results_count: number;
  top_result: string | null;
  created_at: string;
};

const SOURCES: Array<{ key: string; label: string }> = [
  { key: "device", label: "Cellulaire" },
  { key: "directory", label: "Entreprise" },
  { key: "maestro", label: "Maestro" },
  { key: "microsoft", label: "Outlook" },
];

const SOURCE_LABEL: Record<string, string> = {
  device: "Cellulaire", directory: "Entreprise", shared: "Entreprise",
  ns_contacts: "Entreprise", maestro: "Maestro", microsoft: "Outlook",
};

async function callSearch(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("pp-contact-search", { body });
  if (error) throw error;
  return data as any;
}

export default function MAvaDirectory() {
  const navigate = useNavigate();
  const outlet = useOutletContext<PlanipretMobileContext | undefined>();

  const [q, setQ] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [suggestions, setSuggestions] = useState<Contact[]>([]);
  const [results, setResults] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openSuggest, setOpenSuggest] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [showAudit, setShowAudit] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filters = useMemo(
    () => ({ sources: sources.length ? sources : undefined, company: company || undefined, phone: phone || undefined }),
    [sources, company, phone],
  );

  // --- Autocomplete (debounced, ranked) -------------------------------
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const term = q.trim();
    if (term.length < 2) { setSuggestions([]); return; }
    debounce.current = setTimeout(async () => {
      try {
        const r = await callSearch({ query: term, limit: 6, _caller: "app_autocomplete", ...filters });
        setSuggestions(Array.isArray(r?.contacts) ? r.contacts : []);
        setOpenSuggest(true);
      } catch { setSuggestions([]); }
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q, filters]);

  const runSearch = useCallback(async (term?: string) => {
    const value = (term ?? q).trim();
    setLoading(true); setErr(null); setOpenSuggest(false);
    try {
      const r = await callSearch({ query: value, limit: 30, _caller: "app", ...filters });
      if (r?.success === false) throw new Error(r?.error || "Erreur");
      setResults(Array.isArray(r?.contacts) ? r.contacts : []);
    } catch (e: any) {
      setErr(e?.message ?? "Erreur de recherche");
      setResults([]);
    } finally { setLoading(false); }
  }, [q, filters]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const r = await callSearch({ action: "audit_list", limit: 100 });
      setAudit(Array.isArray(r?.entries) ? r.entries : []);
    } catch { setAudit([]); } finally { setAuditLoading(false); }
  }, []);

  const purgeAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      await callSearch({ action: "audit_purge" });
      setAudit([]);
      setToast("Historique effacé");
    } catch { setToast("Échec de la purge"); } finally { setAuditLoading(false); }
  }, []);

  useEffect(() => { if (showAudit) loadAudit(); }, [showAudit, loadAudit]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const dialLocal = (c: Contact) => {
    const num = (c.phone || c.extension || "").trim();
    if (!num) { setToast("Aucun numéro"); return; }
    outlet?.openDialer?.(num, true);
  };

  const dialVoice = async (c: Contact) => {
    const num = (c.phone || c.extension || "").trim();
    if (!num) { setToast("Aucun numéro"); return; }
    setVoiceBusy(num);
    try {
      const { data, error } = await supabase.functions.invoke("pp-ns-calls", {
        body: { action: "start", to_number: num, caller_id_name: c.name || undefined },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      setToast("Appel lancé — répondez sur votre téléphone");
    } catch (e: any) {
      setToast(e?.message ?? "Échec de l'appel");
    } finally { setVoiceBusy(null); }
  };

  const toggleSource = (key: string) =>
    setSources((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--pp-bg-base)" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
        <button onClick={() => navigate(-1)} aria-label="Retour">
          <ArrowLeft className="w-5 h-5" style={{ color: "var(--pp-text-primary)" }} />
        </button>
        <h1 className="text-base font-semibold flex-1" style={{ color: "var(--pp-text-primary)" }}>
          Recherche AVA
        </h1>
        <button onClick={() => setShowFilters((v) => !v)} aria-label="Filtres">
          <Filter className="w-5 h-5" style={{ color: showFilters ? "var(--pp-brand-accent)" : "var(--pp-text-muted)" }} />
        </button>
        <button onClick={() => setShowAudit(true)} aria-label="Journal d'audit">
          <History className="w-5 h-5" style={{ color: "var(--pp-text-muted)" }} />
        </button>
      </div>

      {/* Search box */}
      <div className="px-3 pt-3 relative">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
          <Search className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => suggestions.length && setOpenSuggest(true)}
            onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
            placeholder="Prénom, nom, entreprise ou numéro"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--pp-text-primary)" }}
          />
          {q && (
            <button onClick={() => { setQ(""); setResults([]); setSuggestions([]); }} aria-label="Effacer">
              <X className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />
            </button>
          )}
        </div>

        {openSuggest && suggestions.length > 0 && (
          <ul className="absolute left-3 right-3 mt-1 z-30 rounded-xl overflow-hidden shadow-xl max-h-72 overflow-y-auto"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
            {suggestions.map((s, i) => (
              <li key={`${s.name}-${i}`}
                onMouseDown={(e) => { e.preventDefault(); setQ(s.name); setResults([s]); setOpenSuggest(false); }}
                className="px-3 py-2 cursor-pointer active:opacity-70"
                style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: "var(--pp-text-primary)" }}>{s.name}</p>
                    <p className="text-[11px] truncate" style={{ color: "var(--pp-text-muted)" }}>
                      {s.phone || s.extension || s.email || s.company}
                    </p>
                  </div>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded"
                    style={{ background: "var(--pp-bg-deep)", color: "var(--pp-text-muted)" }}>
                    {SOURCE_LABEL[s.source] ?? s.source}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-3 pt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {SOURCES.map((s) => {
              const on = sources.includes(s.key);
              return (
                <button key={s.key} onClick={() => toggleSource(s.key)}
                  className="px-2.5 py-1 rounded-full text-xs"
                  style={{
                    background: on ? "var(--pp-brand-accent)" : "var(--pp-bg-elevated)",
                    color: on ? "#fff" : "var(--pp-text-muted)",
                    border: "1px solid var(--pp-bg-border-2)",
                  }}>
                  {s.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 flex-1 rounded-lg px-2 py-1.5"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
              <Building2 className="w-3.5 h-3.5" style={{ color: "var(--pp-text-muted)" }} />
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Entreprise"
                className="flex-1 bg-transparent outline-none text-xs" style={{ color: "var(--pp-text-primary)" }} />
            </div>
            <div className="flex items-center gap-1.5 flex-1 rounded-lg px-2 py-1.5"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
              <Hash className="w-3.5 h-3.5" style={{ color: "var(--pp-text-muted)" }} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Numéro" inputMode="tel"
                className="flex-1 bg-transparent outline-none text-xs" style={{ color: "var(--pp-text-primary)" }} />
            </div>
          </div>
        </div>
      )}

      <div className="px-3 py-2">
        <button onClick={() => runSearch()} disabled={loading}
          className="w-full py-2 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)", opacity: loading ? 0.7 : 1 }}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Rechercher
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {err && <p className="text-xs py-2" style={{ color: "#E84C4C" }}>{err}</p>}
        {!loading && !err && results.length === 0 && (
          <p className="text-xs text-center py-6" style={{ color: "var(--pp-text-muted)" }}>
            Aucun résultat pour l'instant.
          </p>
        )}
        {results.map((c, i) => (
          <div key={`${c.name}-${i}`} className="rounded-xl p-3 mb-2"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--pp-text-primary)" }}>{c.name}</p>
                <p className="text-[11px] truncate" style={{ color: "var(--pp-text-muted)" }}>
                  {[c.phone || c.extension, c.company, c.email].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded shrink-0"
                style={{ background: "var(--pp-bg-deep)", color: "var(--pp-text-muted)" }}>
                {SOURCE_LABEL[c.source] ?? c.source}
              </span>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => dialLocal(c)}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white flex items-center justify-center gap-1.5"
                style={{ background: "linear-gradient(135deg, #14622F, #29A35A)" }}>
                <Phone className="w-3.5 h-3.5" /> Appeler
              </button>
              <button onClick={() => dialVoice(c)} disabled={voiceBusy === (c.phone || c.extension)}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white flex items-center justify-center gap-1.5"
                style={{ background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)" }}>
                {voiceBusy === (c.phone || c.extension)
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <PhoneCall className="w-3.5 h-3.5" />}
                Appeler via voix
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Audit drawer */}
      {showAudit && (
        <div className="absolute inset-0 z-40 flex flex-col" style={{ background: "var(--pp-bg-base)" }}>
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
            <button onClick={() => setShowAudit(false)} aria-label="Fermer">
              <ArrowLeft className="w-5 h-5" style={{ color: "var(--pp-text-primary)" }} />
            </button>
            <h2 className="text-base font-semibold flex-1" style={{ color: "var(--pp-text-primary)" }}>
              Journal d'accès AVA
            </h2>
            <button onClick={purgeAudit} className="flex items-center gap-1 text-xs" style={{ color: "#E84C4C" }}>
              <Trash2 className="w-4 h-4" /> Purger
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {auditLoading && <Loader2 className="w-5 h-5 animate-spin mx-auto my-6" style={{ color: "var(--pp-text-muted)" }} />}
            {!auditLoading && audit.length === 0 && (
              <p className="text-xs text-center py-6" style={{ color: "var(--pp-text-muted)" }}>Aucune entrée.</p>
            )}
            {audit.map((a) => (
              <div key={a.id} className="rounded-lg p-2.5 mb-2"
                style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm truncate" style={{ color: "var(--pp-text-primary)" }}>
                    « {a.query || "(liste complète)"} »
                  </p>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: "var(--pp-bg-deep)", color: "var(--pp-text-muted)" }}>
                    {a.caller === "ava_voice" ? "Voix" : a.caller === "ava_chat" ? "Chat" : "App"}
                  </span>
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--pp-text-muted)" }}>
                  {new Date(a.created_at).toLocaleString("fr-CA")} · {a.results_count} résultat(s)
                  {a.top_result ? ` · ${a.top_result}` : ""}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--pp-text-muted)" }}>
                  Sources : {(a.sources_queried ?? []).map((s) => SOURCE_LABEL[s] ?? s).filter((v, i, arr) => arr.indexOf(v) === i).join(", ") || "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-24 px-3 py-2 rounded-lg text-xs text-white z-50"
          style={{ background: "rgba(0,0,0,0.82)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
