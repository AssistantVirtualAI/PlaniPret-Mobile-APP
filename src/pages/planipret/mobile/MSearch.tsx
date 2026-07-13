import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSearchParams, useNavigate, useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Phone, MessageSquare, Voicemail, User, Mail, Sparkles, Loader2, BookUser, AlertCircle, RefreshCw, ChevronDown } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import type { PlanipretMobileContext } from "../PlanipretMobile";

type DirEntry = { extension?: string; name?: string; first_name?: string; last_name?: string; email?: string; department?: string; position?: string; presence?: string };
type BackendKey = "calls" | "messages" | "voicemails" | "insights" | "contacts" | "emails";
type Scope = "all" | "directory" | BackendKey;
type HasMore = Record<BackendKey, boolean>;
type Result = {
  calls: any[]; messages: any[]; voicemails: any[]; insights: any[]; contacts: any[]; emails: any[]; directory: DirEntry[];
  has_more: HasMore;
  dir_visible: number;
};

const PAGE_SIZE = 20;
const DIR_PAGE = 20;
const emptyHasMore = (): HasMore => ({ calls: false, messages: false, voicemails: false, insights: false, contacts: false, emails: false });
const emptySearch = () => ({ calls: [], messages: [], voicemails: [], insights: [], contacts: [], emails: [], has_more: emptyHasMore() });

function highlight(text: string, q: string) {
  if (!text || !q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (<>{text.slice(0, i)}<mark style={{ background: "#FEF3C7", color: "inherit" }}>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>) as any;
}

async function callSearch(q: string, scope: Scope, offset: number, limit: number) {
  const sess = (await supabase.auth.getSession()).data.session;
  const backendScope = scope === "directory" ? "all" : scope; // directory is client-side
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pp-search?q=${encodeURIComponent(q)}&scope=${backendScope}&offset=${offset}&limit=${limit}`;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${sess?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "" },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  } finally {
    window.clearTimeout(timer);
  }
}

import { getPpContacts } from "@/lib/ppContactsCache";

async function fetchDirectory(q: string): Promise<DirEntry[]> {
  const dir = (await getPpContacts("directory")) as DirEntry[];
  const ql = q.toLowerCase();
  return dir.filter((d) => {
    const hay = `${d.first_name ?? ""} ${d.last_name ?? ""} ${d.name ?? ""} ${d.extension ?? ""} ${d.email ?? ""} ${d.department ?? ""} ${d.position ?? ""}`.toLowerCase();
    return hay.includes(ql);
  });
}

export default function MSearch() {
  const { t, lang } = useMplanipretLang();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const outlet = useOutletContext<PlanipretMobileContext | undefined>();
  const q = params.get("q") ?? "";
  const scope = (params.get("scope") as Scope) || "all";

  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState<BackendKey | "directory" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("pp_recent_searches") ?? "[]"); } catch { return []; } });
  const reqIdRef = useRef(0);

  const setScope = useCallback((s: Scope) => {
    const next = new URLSearchParams(params);
    if (s === "all") next.delete("scope"); else next.set("scope", s);
    setParams(next, { replace: true });
  }, [params, setParams]);

  // Initial / re-run with same params. Cancels stale responses via reqId.
  const run = useCallback(async () => {
    if (!q) { setData(null); setError(null); return; }
    const id = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      let searchError: any = null;
      let directoryError: any = null;
      const includeDirectory = scope === "all" || scope === "directory";
      const [searchRes, directory] = await Promise.all([
        scope === "directory" ? Promise.resolve(emptySearch()) : callSearch(q, scope, 0, PAGE_SIZE).catch((e) => { searchError = e; return emptySearch(); }),
        includeDirectory ? fetchDirectory(q).catch((e) => { directoryError = e; console.warn("[search] directory:", e?.message); return [] as DirEntry[]; }) : Promise.resolve([] as DirEntry[]),
      ]);
      if (id !== reqIdRef.current) return;
      if (scope === "directory" && directoryError) throw directoryError;
      if (scope !== "directory" && searchError && (!includeDirectory || directory.length === 0)) throw searchError;
      setData({
        calls: searchRes.calls ?? [],
        messages: searchRes.messages ?? [],
        voicemails: searchRes.voicemails ?? [],
        insights: searchRes.insights ?? [],
        contacts: searchRes.contacts ?? [],
        emails: searchRes.emails ?? [],
        directory,
        has_more: {
          calls: !!searchRes.has_more?.calls,
          messages: !!searchRes.has_more?.messages,
          voicemails: !!searchRes.has_more?.voicemails,
          insights: !!searchRes.has_more?.insights,
          contacts: !!searchRes.has_more?.contacts,
          emails: !!searchRes.has_more?.emails,
        },
        dir_visible: Math.min(directory.length, DIR_PAGE),
      });
    } catch (e: any) {
      if (id !== reqIdRef.current) return;
      console.error("[pp-search]", e);
      setError(e?.message || "Erreur inconnue");
      setData(null);
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }, [q, scope]);

  // Re-run whenever query/scope change (keeps results consistent with directory filters).
  useEffect(() => { void run(); }, [run]);

  const loadMore = useCallback(async (key: BackendKey | "directory") => {
    if (!data || loadingMore) return;
    setLoadingMore(key);
    try {
      if (key === "directory") {
        setData({ ...data, dir_visible: Math.min(data.directory.length, data.dir_visible + DIR_PAGE) });
        return;
      }
      const current = (data[key] as any[]).length;
      const res = await callSearch(q, key, current, PAGE_SIZE);
      const appended = (res[key] ?? []) as any[];
      setData({
        ...data,
        [key]: [...(data[key] as any[]), ...appended],
        has_more: { ...data.has_more, [key]: !!res.has_more?.[key] },
      } as Result);
    } catch (e: any) {
      console.error("[pp-search] loadMore", key, e);
      setError(e?.message || "Erreur de chargement");
    } finally {
      setLoadingMore(null);
    }
  }, [data, loadingMore, q]);

  const total = useMemo(() => {
    if (!data) return 0;
    return data.directory.length + data.calls.length + data.messages.length + data.voicemails.length + data.insights.length + data.contacts.length + data.emails.length;
  }, [data]);

  const show = (s: Scope) => scope === "all" || scope === s;
  const openDialer = outlet?.openDialer;

  const scopeChips: { id: Scope; label: string; count?: number }[] = data ? [
    { id: "all", label: t("common.all") || "Tout", count: total },
    { id: "directory", label: t("contacts.directory") || "Annuaire", count: data.directory.length },
    { id: "calls", label: t("searchPage.calls"), count: data.calls.length + (data.has_more.calls ? 1 : 0) },
    { id: "messages", label: t("searchPage.messages"), count: data.messages.length + (data.has_more.messages ? 1 : 0) },
    { id: "voicemails", label: t("searchPage.voicemails"), count: data.voicemails.length + (data.has_more.voicemails ? 1 : 0) },
    { id: "insights", label: t("searchPage.aiInsights"), count: data.insights.length + (data.has_more.insights ? 1 : 0) },
    { id: "contacts", label: t("searchPage.maestroContacts"), count: data.contacts.length + (data.has_more.contacts ? 1 : 0) },
    { id: "emails", label: t("searchPage.emails"), count: data.emails.length + (data.has_more.emails ? 1 : 0) },
  ] : [];

  const renderLoadMore = (key: BackendKey | "directory", hasMore: boolean) => {
    if (!hasMore) return null;
    const busy = loadingMore === key;
    return (
      <button onClick={() => void loadMore(key)} disabled={busy}
        className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
        style={{ background: "var(--pp-bg-elevated, #f1f5f9)", color: "var(--pp-text-secondary, #475569)", border: "1px solid var(--pp-bg-border-2, #e5e7eb)" }}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {busy ? (t("common.loading") || "Chargement…") : (t("common.loadMore") || "Charger plus")}
      </button>
    );
  };

  return (
    <div className="p-3">
      <header className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-slate-100"><ArrowLeft className="w-5 h-5" /></button>
        <div className="font-semibold text-slate-800 truncate">{t("searchPage.results")}: « {q} »</div>
      </header>

      {q && data && !loading && !error && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1 no-scrollbar">
          {scopeChips.map((c) => {
            const active = scope === c.id;
            return (
              <button key={c.id} onClick={() => setScope(c.id)}
                className="shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition"
                style={{
                  background: active ? "var(--pp-brand-accent-2, #2563eb)" : "var(--pp-bg-elevated, #f1f5f9)",
                  color: active ? "#fff" : "var(--pp-text-secondary, #475569)",
                  border: `1px solid ${active ? "var(--pp-brand-accent, #3b82f6)" : "var(--pp-bg-border-2, #e5e7eb)"}`,
                }}>
                {c.label}{typeof c.count === "number" ? ` (${c.count})` : ""}
              </button>
            );
          })}
        </div>
      )}

      {!q && (
        <div>
          <div className="text-xs text-slate-400 mb-2 px-1">{t("searchPage.recentSearches")}</div>
          {recent.length === 0 ? <div className="text-sm text-slate-400 px-1">{t("common.none")}</div> : (
            <div className="space-y-1">
              {recent.map((r) => (
                <button key={r} onClick={() => navigate(`/mplanipret/search?q=${encodeURIComponent(r)}`)}
                  className="block w-full text-left px-3 py-2 bg-white rounded-lg text-sm">{r}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          <div className="text-xs text-slate-500">{t("common.loading") || "Chargement…"}</div>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl p-4 text-sm flex flex-col items-start gap-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#dc2626" }}>
          <div className="flex items-center gap-2 font-semibold"><AlertCircle className="w-4 h-4" /> Recherche impossible</div>
          <div className="text-xs opacity-80 break-all">{error}</div>
          <div className="text-[11px] opacity-70">Requête : « {q} » · Filtre : {scope}</div>
          <button onClick={() => void run()} disabled={loading}
            className="mt-1 flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-semibold disabled:opacity-60"
            style={{ background: "rgba(239,68,68,0.15)", color: "#dc2626" }}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {loading ? "Réessai…" : "Réessayer"}
          </button>
        </div>
      )}

      {q && data && !loading && !error && total === 0 && (
        <div className="text-center py-12">
          <div className="text-sm text-slate-500">{t("searchPage.noResults") || "Aucun résultat"}</div>
        </div>
      )}

      {data && !loading && !error && (
        <div className="space-y-4">
          {show("directory") && (
            <Group icon={<BookUser className="w-4 h-4" />} title={t("contacts.directory") || "Annuaire"} count={data.directory.length}>
              {data.directory.slice(0, data.dir_visible).map((d, i) => {
                const name = [d.first_name, d.last_name].filter(Boolean).join(" ").trim() || d.name || (d.extension ? `Ext. ${d.extension}` : "—");
                return (
                  <button key={`${d.extension ?? i}`} onClick={() => d.extension && openDialer?.(d.extension)}
                    className="w-full text-left p-3 bg-white rounded-lg text-sm flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{highlight(name, q)}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {d.extension ? `Ext. ${d.extension}` : ""}{d.position ? ` · ${d.position}` : ""}{d.email ? ` · ${d.email}` : ""}
                      </div>
                    </div>
                    {d.extension && <Phone className="w-4 h-4 text-slate-400" />}
                  </button>
                );
              })}
              {renderLoadMore("directory", data.dir_visible < data.directory.length)}
            </Group>
          )}
          {show("calls") && (
            <Group icon={<Phone className="w-4 h-4" />} title={t("searchPage.calls")} count={data.calls.length}>
              {data.calls.map((c) => (
                <button key={c.id} onClick={() => navigate("/mplanipret/calls")} className="w-full text-left p-3 bg-white rounded-lg text-sm flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{highlight(c.from_name ?? c.to_name ?? c.caller_number ?? c.callee_number ?? t("common.unknown"), q)}</div>
                    <div className="text-xs text-slate-400">{c.direction} · {new Date(c.created_at).toLocaleString(lang === "en" ? "en-CA" : "fr-CA")}</div>
                  </div>
                </button>
              ))}
              {renderLoadMore("calls", data.has_more.calls)}
            </Group>
          )}
          {show("messages") && (
            <Group icon={<MessageSquare className="w-4 h-4" />} title={t("searchPage.messages")} count={data.messages.length}>
              {data.messages.map((m) => (
                <button key={m.id} onClick={() => navigate("/mplanipret/messages")} className="w-full text-left p-3 bg-white rounded-lg text-sm">
                  <div className="text-xs text-slate-400">{m.direction === "outbound" ? m.to_number : m.from_number}</div>
                  <div className="truncate">{highlight(m.body ?? "", q)}</div>
                </button>
              ))}
              {renderLoadMore("messages", data.has_more.messages)}
            </Group>
          )}
          {show("voicemails") && (
            <Group icon={<Voicemail className="w-4 h-4" />} title={t("searchPage.voicemails")} count={data.voicemails.length}>
              {data.voicemails.map((v) => (
                <button key={v.id} onClick={() => navigate("/mplanipret/voicemail")} className="w-full text-left p-3 bg-white rounded-lg text-sm">
                  <div className="text-xs text-slate-400">{v.from_number} · {v.duration_seconds}s</div>
                  <div className="truncate text-slate-600">{highlight((v.transcript ?? "").slice(0, 120), q)}</div>
                </button>
              ))}
              {renderLoadMore("voicemails", data.has_more.voicemails)}
            </Group>
          )}
          {show("insights") && (
            <Group icon={<Sparkles className="w-4 h-4" />} title={t("searchPage.aiInsights")} count={data.insights.length}>
              {data.insights.map((i) => (
                <div key={i.id} className="p-3 bg-white rounded-lg text-sm text-slate-600 truncate">{highlight((i.summary ?? "").slice(0, 160), q)}</div>
              ))}
              {renderLoadMore("insights", data.has_more.insights)}
            </Group>
          )}
          {show("contacts") && (
            <Group icon={<User className="w-4 h-4" />} title={t("searchPage.maestroContacts")} count={data.contacts.length}>
              {data.contacts.map((c: any, i: number) => (
                <div key={i} className="p-3 bg-white rounded-lg text-sm">
                  <div className="font-medium">{c.name ?? c.full_name ?? "Contact"}</div>
                  <div className="text-xs text-slate-400">{c.phone ?? c.email}</div>
                </div>
              ))}
              {renderLoadMore("contacts", data.has_more.contacts)}
            </Group>
          )}
          {show("emails") && (
            <Group icon={<Mail className="w-4 h-4" />} title={t("searchPage.emails")} count={data.emails.length}>
              {data.emails.map((e: any, i: number) => (
                <div key={i} className="p-3 bg-white rounded-lg text-sm">
                  <div className="font-medium truncate">{e.subject ?? t("searchPage.noSubject")}</div>
                  <div className="text-xs text-slate-400 truncate">{e.from ?? ""}</div>
                </div>
              ))}
              {renderLoadMore("emails", data.has_more.emails)}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ icon, title, count, children }: { icon: any; title: string; count: number; children: any }) {
  if (!count) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 px-1 text-xs font-semibold text-slate-500">{icon} {title} ({count})</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
