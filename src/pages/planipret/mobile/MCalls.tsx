import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search, X, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff, Copy,
  Bot, ChevronDown, ChevronUp, Pause, Play, Mic, MicOff, ArrowRightLeft, Loader2,
  Check, Sparkles, RefreshCw, Voicemail as VmIcon, Save, Trash2, FileText, Download,
} from "lucide-react";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import { TEMP_COLORS, TEMP_EMOJI, TEMP_LABEL, tempBorder, callbackDelayToDate, delayLabel, type LeadTemp } from "@/components/planipret/leadHelpers";
import ContactTimeline from "@/components/planipret/ContactTimeline";
import RecordingsList from "@/components/planipret/mobile/recordings/RecordingsList";
import { CallRecordingPlayer } from "@/components/planipret/mobile/call/CallRecordingPlayer";
import MaestroTab from "@/components/planipret/mobile/call/MaestroTab";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { useCallerNames } from "@/lib/planipret/callerLookup";


const PRIMARY = "var(--pp-brand-accent-2)";
const ACCENT = "var(--pp-brand-accent)";
const SUCCESS = "var(--pp-success)";
const DANGER = "var(--pp-danger)";
const PURPLE = "var(--pp-agent)";

type Call = {
  id: string;
  user_id: string;
  ns_call_id: string | null;
  ns_callid?: string | null;
  ns_orig_callid?: string | null;
  ns_term_callid?: string | null;
  extension?: string | null;
  direction: string;
  status: string | null;
  from_number: string | null;
  from_name: string | null;
  to_number: string | null;
  to_name: string | null;
  started_at: string;
  duration_seconds: number | null;
  recording_url: string | null;
  has_recording?: boolean | null;
  transcript: string | null;
  ai_summary: string | null;
  metadata: any;
  lead_score?: number | null;
  lead_temperature?: LeadTemp;
  lead_score_reason?: string | null;
  suggested_callback_delay?: string | null;
  callback_reason?: string | null;
  // Maestro / AI pipeline (optional)
  maestro_synced?: boolean | null;
  maestro_client_id?: string | null;
  transcript_segments?: any;
  transcript_language?: string | null;
  ai_coaching?: any;
  ai_key_points?: any;
  ai_client_insights?: any;
  ai_tasks?: any;
  pipeline_state?: any;
};

type Insight = {
  call_id: string;
  summary: string | null;
  coaching_notes: string | null;
  customer_intent: string | null;
  sentiment: string | null;
  topics: any;
  suggested_actions: any;
};

// ---------- helpers ----------
const isOutbound = (c: Call) => c.direction === "outbound";
const isMissed = (c: Call) => c.direction === "missed" || c.status === "missed" || c.status === "no-answer";

// Normalize NS values like "sip:15145551234@planipret.ca", "tel:+1...",
// "anonymous", "1000@planipret.ca", or empty strings.
function cleanNumber(v: unknown): string | null {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/^sips?:/i, "").replace(/^tel:/i, "");
  const at = s.indexOf("@");
  if (at !== -1) s = s.slice(0, at);
  s = s.replace(/^\+?1(\d{10})$/, "$1");
  if (!s || /^(anonymous|unknown|restricted|private|unavailable)$/i.test(s)) return null;
  return s;
}

const pick = (raw: any, keys: string[]) => {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
};
function fmtPhone(n: string | null): string | null {
  if (!n) return null;
  const d = n.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return n;
}

const otherNumber = (c: Call) => cleanNumber(isOutbound(c) ? c.to_number : c.from_number) || "";
const otherName = (c: Call) => (isOutbound(c) ? c.to_name : c.from_name) || "";
// Label priority: NS caller_id_name → resolved (Maestro/MS/contacts) → phone
// number → localized "Numéro non résolu" fallback.
const UNRESOLVED_FR = "Numéro non résolu";
const UNRESOLVED_EN = "Unresolved number";
function displayLabelWith(c: Call, resolved?: string | null, lang: "fr" | "en" = "fr"): string {
  const name = otherName(c);
  if (name) return name;
  if (resolved) return resolved;
  const num = fmtPhone(otherNumber(c));
  if (num) return num;
  return lang === "en" ? UNRESOLVED_EN : UNRESOLVED_FR;
}
const displayLabel = (c: Call) => otherName(c) || fmtPhone(otherNumber(c)) || UNRESOLVED_FR;

const localizedDateTime = (iso: string, lang: "fr" | "en", todayLabel: string, yesterdayLabel: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const sameDay = d.toDateString() === today.toDateString();
  const isYest = d.toDateString() === yest.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const sep = lang === "en" ? ":" : "h";
  if (sameDay) return `${todayLabel}, ${hh}${sep}${mm}`;
  if (isYest) return `${yesterdayLabel}, ${hh}${sep}${mm}`;
  return `${d.toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", { day: "2-digit", month: "short", year: "numeric" })}, ${hh}${sep}${mm}`;
};
const dayHeader = (iso: string, lang: "fr" | "en", todayLabel: string, yesterdayLabel: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return todayLabel;
  if (d.toDateString() === yest.toDateString()) return yesterdayLabel;
  return d.toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", { weekday: "long", day: "2-digit", month: "long" });
};
const localizedDuration = (s: number | null, lang: "fr" | "en") => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec} ${lang === "en" ? "sec" : "sec"}`;
  return `${m} min ${sec} sec`;
};
const statusInfo = (c: Call, lang: "fr" | "en") => {
  const s = String(c.status ?? "").toLowerCase();
  if (isMissed(c)) return { label: lang === "en" ? "Missed" : "Manqué", color: "var(--pp-danger)" };
  if (s.includes("voicemail") || s.includes("vm")) return { label: lang === "en" ? "Voicemail" : "Messagerie", color: "var(--pp-agent)" };
  if (s.includes("busy") || s.includes("occup")) return { label: lang === "en" ? "Busy" : "Occupé", color: "var(--pp-warning, #f59e0b)" };
  if (s.includes("fail") || s.includes("cancel")) return { label: lang === "en" ? "Failed" : "Échoué", color: "var(--pp-danger)" };
  if ((c.duration_seconds ?? 0) > 0) return { label: lang === "en" ? "Answered" : "Répondu", color: "var(--pp-success)" };
  return { label: lang === "en" ? "—" : "—", color: "var(--pp-text-muted)" };
};


// ---------- main ----------
export default function MCalls() {
  const { t, lang } = useMplanipretLang();
  const { profile, openDialer, registerRefresh } = useOutletContext<PlanipretMobileContext>();
  const [params, setParams] = useSearchParams();
  const initialTab = (params.get("tab") as any) || "recents";
  const [tab, setTab] = useState<"recents" | "active" | "missed" | "recordings" | "voicemails">(
    ["recents", "active", "missed", "recordings", "voicemails"].includes(initialTab) ? initialTab : "recents"
  );
  const [calls, setCalls] = useState<Call[]>([]);
  const [recordings, setRecordings] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Call | null>(null);
  const [visibleCount, setVisibleCount] = useState(25);
  const [degraded, setDegraded] = useState<{ active: boolean; reason?: string; reopens_at?: number | null }>({ active: false });
  const recordingsSyncingRef = useRef(false);
  const callsRefreshDebounceRef = useRef<number | null>(null);

  const userId = profile?.id ?? profile?.user_id;
  const profileAuthId = profile?.user_id;
  const profileExtension = profile?.ns_extension ?? profile?.extension;
  const phoneCallScopeFilter = useMemo(() => {
    const filters = [userId ? `user_id.eq.${userId}` : null, profileAuthId ? `user_id.eq.${profileAuthId}` : null, profileExtension ? `extension.eq.${profileExtension}` : null]
      .filter(Boolean);
    return filters.join(",");
  }, [userId, profileAuthId, profileExtension]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1) NS-API live CDRs via pp-ns-cdr (segmenté par extension côté serveur)
      const { data: ns, error: nsErr } = await supabase.functions.invoke("pp-ns-cdr", {
        body: { action: "list", limit: 50, offset: 0 },
      });
      if (nsErr) throw nsErr;
      const nsAny = ns as any;
      setDegraded({ active: !!nsAny?.degraded, reason: nsAny?.reason, reopens_at: nsAny?.reopens_at ?? null });
      const items: any[] = nsAny?.items ?? [];

      // 2) Données enrichies locales (transcripts, AI, lead scoring)
      let localQuery: any = supabase
        .from("planipret_phone_calls")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(200);
      if (phoneCallScopeFilter) localQuery = localQuery.or(phoneCallScopeFilter);
      const { data: local } = await localQuery;
      const byNsId = new Map<string, any>();
      (local ?? []).forEach((r: any) => { if (r.ns_call_id) byNsId.set(r.ns_call_id, r); });

      const merged: Call[] = items.map((it, i) => {
        const nsId = pick(it, ["ns_call_id", "call-parent-cdr-id", "cdr-id", "id", "uuid", "call_id", "call-id"]);
        const nsCallId = pick(it, ["ns_callid", "call-id", "call_id", "callid", "call-parent-call-id", "orig_callid", "term_callid"]);
        const enriched = nsId ? byNsId.get(nsId) : null;
        const dirRaw = String(pick(it, ["direction", "call_direction", "call-direction", "type", "call-type"]) ?? "").toLowerCase();
        const answeredFalse = it.answered === false || ["no-answer", "missed", "unanswered"].includes(String(it.disposition ?? it.status ?? "").toLowerCase());
        const isIn = dirRaw.includes("in") || dirRaw === "incoming" || dirRaw === "received";
        const isOut = dirRaw.includes("out") || dirRaw === "outgoing" || dirRaw === "placed";
        const direction = isIn
          ? (answeredFalse ? "missed" : "inbound")
          : isOut ? "outbound"
          : (answeredFalse ? "missed" : "inbound");
        const from_number = pick(it, ["from_number", "from", "caller_id_number", "caller-id-number", "orig_from_user", "orig-user", "call-orig-user", "orig_from_uri", "orig-from-uri", "call-orig-from-uri", "by_number", "ani"]) ?? enriched?.from_number ?? null;
        const to_number = pick(it, ["to_number", "to", "destination", "dialed_number", "dnis", "term_to_user", "term-user", "call-term-user", "orig_to_user", "orig-to-user", "call-orig-to-uri", "call-term-to-uri"]) ?? enriched?.to_number ?? null;
        const from_name = pick(it, ["from_name", "caller_id_name", "caller-id-name", "orig_from_name", "orig-name", "by_name"]) ?? enriched?.from_name ?? null;
        return {
          id: enriched?.id ?? nsId ?? `ns-${i}`,
          user_id: enriched?.user_id ?? userId,
          ns_call_id: nsId,
          ns_callid: nsCallId ?? enriched?.ns_callid ?? null,
          ns_orig_callid: pick(it, ["ns_orig_callid", "orig_callid", "orig-callid", "call-orig-call-id"]) ?? enriched?.ns_orig_callid ?? null,
          ns_term_callid: pick(it, ["ns_term_callid", "term_callid", "term-callid", "call-term-call-id"]) ?? enriched?.ns_term_callid ?? null,
          extension: pick(it, ["extension", "user", "call-orig-user", "orig-user", "call-term-user", "term-user"]) ?? enriched?.extension ?? null,
          direction,
          status: it.disposition ?? it.status ?? null,
          from_number,
          from_name,
          to_number,
          to_name: it.to_name ?? it.term_to_name ?? enriched?.to_name ?? null,
          started_at: (it.start_time ?? it.started_at ?? it.time_start ?? new Date().toISOString()) as string,
          duration_seconds: Number(it.duration ?? it.billsec ?? it.time_talking ?? 0) || 0,
          recording_url: pick(it, ["recording_url", "ns_recording_url", "file-access-url", "recording", "record_url", "url"]) ?? enriched?.recording_url ?? null,
          has_recording: Boolean(pick(it, ["recording_url", "ns_recording_url", "file-access-url", "call-recording-status", "recording", "record_url", "url"]) ?? enriched?.has_recording),
          transcript: enriched?.transcript ?? null,
          ai_summary: enriched?.ai_summary ?? null,
          metadata: it,
          ...(enriched ?? {}),
        } as Call;
      });

      // Fallback : si NS ne renvoie rien, montrer le cache local
      setCalls(merged.length ? merged : ((local ?? []) as Call[]));
    } catch (e: any) {
      console.error("[pp-ns-cdr] list failed", e);
      toast.error(e?.message ?? "Échec chargement CDR");
      let fallbackQuery: any = supabase
        .from("planipret_phone_calls")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(100);
      if (phoneCallScopeFilter) fallbackQuery = fallbackQuery.or(phoneCallScopeFilter);
      const { data } = await fallbackQuery;
      setCalls((data ?? []) as Call[]);
    } finally {
      setLoading(false);
    }
  }, [userId, phoneCallScopeFilter]);

  const loadRecordingsFromCache = useCallback(async () => {
    if (!userId) return;
    setRecordingsLoading(true);
    try {
      const end = new Date().toISOString();
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      let localQuery: any = supabase
        .from("planipret_phone_calls")
        .select("*")
        .not("to_number", "ilike", "%vmail%")
        .not("to_number", "ilike", "%voicemail%")
        .not("to_number", "ilike", "%vm@%")
        .gte("started_at", start)
        .lte("started_at", end)
        .order("started_at", { ascending: false })
        .limit(50);
      if (phoneCallScopeFilter) localQuery = localQuery.or(phoneCallScopeFilter);
      const { data: local } = await localQuery;
      setRecordings((local ?? []).filter((r: any) => r.has_recording || r.recording_url || r.ns_callid || r.ns_orig_callid || r.ns_term_callid || r.ns_call_id).map((r: any) => ({
        ...r,
        stream_via_proxy: true,
        proxy_call_db_id: r.id,
        proxy_ns_callid: r.ns_callid ?? r.ns_orig_callid ?? r.ns_term_callid ?? r.ns_call_id ?? null,
        has_recording: !!(r.has_recording || r.recording_url || r.ns_callid || r.ns_orig_callid || r.ns_term_callid || r.ns_call_id),
      })) as Call[]);
    } catch (e) {
      console.warn("[MCalls] recordings load failed", e);
    } finally {
      setRecordingsLoading(false);
    }
  }, [userId, phoneCallScopeFilter]);

  const syncRecordingsInBackground = useCallback(async () => {
    if (!userId || recordingsSyncingRef.current) return;
    recordingsSyncingRef.current = true;
    try {
      const end = new Date().toISOString();
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.functions.invoke("pp-ns-cdr", { body: { action: "sync", start, end, limit: 25 } });
      await loadRecordingsFromCache();
    } catch (e) {
      console.warn("[MCalls] recordings sync failed", e);
    } finally {
      recordingsSyncingRef.current = false;
    }
  }, [userId, loadRecordingsFromCache]);

  const loadRecordings = useCallback(async () => {
    await loadRecordingsFromCache();
    void syncRecordingsInBackground();
  }, [loadRecordingsFromCache, syncRecordingsInBackground]);

  useEffect(() => { load(); }, [load]);

  // Fetch recordings when tab is opened and keep it actualized without hammering the API.
  useEffect(() => {
    if (tab !== "recordings" || !userId) return;
    void loadRecordings();
    const timer = window.setInterval(() => { void loadRecordings(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [tab, userId, loadRecordings]);

  // Reset pagination when tab or search changes
  useEffect(() => { setVisibleCount(25); }, [tab, search]);

  useEffect(() => {
    registerRefresh(() => { load(); loadRecordings(); });
    return () => registerRefresh(null);
  }, [load, loadRecordings, registerRefresh]);


  // Realtime updates on phone_calls (for new entries + auto-refresh recordings)
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`planipret-calls:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_calls" }, (payload: any) => {
        const row = payload?.new ?? payload?.old ?? {};
        if (row.user_id && row.user_id !== userId && row.user_id !== profileAuthId && row.extension !== profileExtension) return;
        if (callsRefreshDebounceRef.current) window.clearTimeout(callsRefreshDebounceRef.current);
        callsRefreshDebounceRef.current = window.setTimeout(() => {
          void load();
          if (tab === "recordings") void loadRecordings();
        }, 1_000);
      })
      .subscribe();
    return () => {
      if (callsRefreshDebounceRef.current) window.clearTimeout(callsRefreshDebounceRef.current);
      supabase.removeChannel(ch);
    };
  }, [userId, profileAuthId, profileExtension, tab, load, loadRecordings]);

  const missedCount = useMemo(() => calls.filter(isMissed).length, [calls]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = tab === "missed" ? calls.filter(isMissed) : calls;
    if (!q) return base;
    return base.filter((c) =>
      [c.from_number, c.to_number, c.from_name, c.to_name]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [calls, tab, search]);

  const paged = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), tab === "recordings" ? loadRecordings() : Promise.resolve()]);
    setTimeout(() => setRefreshing(false), 300);
  };


  return (
    <div className="h-full flex flex-col" style={{ background: "var(--pp-bg-base)" }}>
      {/* Header */}
      <div
        className="px-4 pt-5 pb-3"
        style={{
          background: "var(--pp-bg-deep)",
          borderBottom: "1px solid var(--pp-bg-border)",
        }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ color: "var(--pp-text-primary)" }}>{t("calls.title")}</h1>
          <button
            onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setSearch(""); }}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: searchOpen ? "var(--pp-bg-elevated)" : "transparent",
              color: "var(--pp-text-secondary)",
            }}
            aria-label={t("common.search")}
          >
            {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>
        </div>
        {searchOpen && (
          <div className="mt-3">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("calls.searchNumber")}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{
                background: "var(--pp-bg-elevated)",
                border: "1px solid var(--pp-bg-border-2)",
                color: "var(--pp-text-primary)",
              }}
            />
          </div>
        )}
        {degraded.active && (
          <div
            className="mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs"
            style={{
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              color: "var(--pp-text-primary)",
            }}
            role="status"
          >
            <span className="flex-1">
              {lang === "en" ? "Degraded mode — showing cached data." : "Mode dégradé — données en cache affichées."}
              {degraded.reason ? ` (${degraded.reason})` : ""}
            </span>
            <button
              onClick={() => { setDegraded({ active: false }); load(); }}
              className="px-3 py-1 rounded-full text-xs font-medium"
              style={{ background: "var(--pp-primary)", color: "#fff" }}
            >
              {lang === "en" ? "Retry now" : "Réessayer"}
            </button>
          </div>
        )}
        {/* Pill Tabs */}
        <div
          className="mt-3 flex rounded-full p-1"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}
        >
          {[
            { k: "recents", label: t("calls.tabs.recents") },
            { k: "active", label: t("calls.tabs.active") },
            { k: "missed", label: t("calls.tabs.missed") },
            { k: "recordings", label: t("calls.tabs.recordings") },
            { k: "voicemails", label: t("calls.tabs.voicemails") },
          ].map((tabDef) => {
            const active = tab === (tabDef.k as any);
            const isMissedTab = tabDef.k === "missed";
            return (
              <button
                key={tabDef.k}
                onClick={() => { setTab(tabDef.k as any); const np = new URLSearchParams(params); np.set("tab", tabDef.k); setParams(np, { replace: true }); }}

                className="flex-1 py-2 text-xs font-semibold rounded-full transition flex items-center justify-center gap-1.5"
                style={
                  active
                    ? {
                        background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))",
                        color: "white",
                        boxShadow: "0 2px 10px rgba(46,155,220,0.35)",
                      }
                    : { color: "var(--pp-text-muted)" }
                }
              >
                {tabDef.label}
                {isMissedTab && missedCount > 0 && (
                  <span
                    className="text-[10px] text-white px-1.5 rounded-full"
                    style={{ background: "var(--pp-danger)" }}
                  >
                    {missedCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {tab === "active" ? (
          <ActiveCallsTab userId={userId} openDialer={openDialer} />
        ) : tab === "recordings" ? (
          <>
            <div className="px-4 pt-2 flex items-center justify-end">
              <button
                onClick={() => loadRecordings()}
                className="text-xs flex items-center gap-1 px-2 py-1"
                style={{ color: "var(--pp-text-muted)" }}
              >
                <RefreshCw className={`w-3 h-3 ${recordingsLoading ? "animate-spin" : ""}`} /> {t("common.refresh")}
              </button>
            </div>
            <RecordingsList
              calls={recordings as any}
              loading={recordingsLoading}
              userId={userId}
              onUpdated={(c) => setRecordings((prev) => prev.map((p) => (p.id === c.id ? { ...p, ...c } as any : p)))}
            />
          </>
        ) : tab === "voicemails" ? (
          <VoicemailsTab userId={userId} openDialer={openDialer} registerRefresh={registerRefresh} />
        ) : (
          <>
            {/* Pull-to-refresh proxy */}
            <div className="px-4 pt-2 flex items-center justify-between">
              <span className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
                {filtered.length} {filtered.length > 1 ? (lang === "en" ? "calls" : "appels") : (lang === "en" ? "call" : "appel")}
              </span>
              <button
                onClick={onRefresh}
                className="text-xs flex items-center gap-1 px-2 py-1"
                style={{ color: "var(--pp-text-muted)" }}
              >
                <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} /> {t("common.refresh")}
              </button>
            </div>
            {loading ? (
              <ul className="px-3 pt-3 pb-4 space-y-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <li
                    key={i}
                    className="rounded-xl px-3 py-3 flex items-center gap-3"
                    style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}
                  >
                    <div className="w-12 h-12 rounded-full animate-pulse" style={{ background: "var(--pp-bg-elevated)" }} />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-[70%] animate-pulse rounded" style={{ background: "var(--pp-bg-elevated)" }} />
                      <div className="h-3 w-[40%] animate-pulse rounded" style={{ background: "var(--pp-bg-elevated)" }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : filtered.length === 0 ? (
              <EmptyState tab={tab as any} />
            ) : (
              <>
                <ul className="px-3 pb-2 space-y-1.5">
                  {paged.map((c, idx) => {
                    const prev = idx > 0 ? paged[idx - 1] : null;
                    const header = dayHeader(c.started_at, lang as "fr" | "en", t("common.today"), t("common.yesterday"));
                    const prevHeader = prev ? dayHeader(prev.started_at, lang as "fr" | "en", t("common.today"), t("common.yesterday")) : null;
                    const showHeader = header !== prevHeader;
                    return (
                      <div key={c.id}>
                        {showHeader && (
                          <div
                            className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ color: "var(--pp-text-muted)" }}
                          >
                            {header}
                          </div>
                        )}
                        <CallRow call={c} onTap={() => setSelected(c)} onCall={() => openDialer(otherNumber(c))} showCallBtn={tab === "missed"} />
                      </div>
                    );
                  })}
                </ul>
                {visibleCount < filtered.length && (
                  <div className="px-3 pb-4">
                    <button
                      onClick={() => setVisibleCount((n) => n + 25)}
                      className="w-full py-2.5 rounded-xl text-xs font-semibold"
                      style={{
                        background: "var(--pp-bg-surface)",
                        border: "1px solid var(--pp-bg-border-2)",
                        color: "var(--pp-brand-accent)",
                      }}
                    >
                      {lang === "en" ? "Load more" : "Charger plus"} ({filtered.length - visibleCount})
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>


      {selected && (
        <CallDetailSheet
          call={selected}
          userId={userId}
          onClose={() => setSelected(null)}
          openDialer={openDialer}
          onUpdated={(updated) => {
            setSelected(updated);
            setCalls((cs) => cs.map((x) => (x.id === updated.id ? updated : x)));
          }}
        />
      )}
    </div>
  );
}

// ---------- row ----------
function CallRow({ call, onTap, onCall, showCallBtn }: { call: Call; onTap: () => void; onCall: () => void; showCallBtn?: boolean }) {
  const { t, lang } = useMplanipretLang();
  const missed = isMissed(call);
  const out = isOutbound(call);
  const dirColor = missed ? "var(--pp-danger)" : out ? "var(--pp-success)" : "var(--pp-brand-accent)";
  const Icon = missed ? PhoneMissed : out ? PhoneOutgoing : PhoneIncoming;
  const num = otherNumber(call);
  const names = useCallerNames([num]);
  const resolved = names[num];
  const label = displayLabelWith(call, resolved, lang as "fr" | "en");
  const numberSub = fmtPhone(num);
  const showNumberSub = !!numberSub && numberSub !== label;
  const st = statusInfo(call, lang as "fr" | "en");
  const hasAi = !!call.ai_summary;

  return (
    <li className="list-none">
      <div
        className="rounded-2xl px-3 py-3 flex items-center gap-3 active:opacity-80"
        style={{
          background: "var(--pp-bg-surface)",
          border: "1px solid var(--pp-bg-border-2)",
          borderLeft: `3px solid ${dirColor}`,
        }}
      >
        <button onClick={onTap} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <div
            className="rounded-full flex items-center justify-center shrink-0"
            style={{ width: 44, height: 44, background: "var(--pp-bg-elevated)", color: dirColor }}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="font-semibold text-[15px] truncate"
                style={{ color: missed ? "var(--pp-danger)" : "var(--pp-text-primary)" }}
              >
                {label}
              </div>
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                style={{ background: `${st.color}22`, color: st.color }}
              >
                {st.label}
              </span>
            </div>
            {showNumberSub && (
              <div className="text-[11px] truncate" style={{ color: "var(--pp-text-muted)" }}>
                {numberSub}
              </div>
            )}
            <div className="text-xs truncate" style={{ color: "var(--pp-text-muted)" }}>
              {localizedDateTime(call.started_at, lang, t("common.today"), t("common.yesterday"))} · {localizedDuration(call.duration_seconds, lang)}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasAi && (
            <span
              className="rounded-full p-1.5 flex items-center justify-center"
              style={{ background: "rgba(155,127,232,0.15)", color: "var(--pp-agent)" }}
              title={t("calls.aiAnalysis")}
            >
              <Bot className="w-3.5 h-3.5" />
            </span>
          )}
          <button
            onClick={onCall}
            className="rounded-full flex items-center justify-center"
            style={{
              width: 36,
              height: 36,
              background: "rgba(46,155,220,0.15)",
              color: "var(--pp-brand-accent)",
            }}
            aria-label={t("common.callBack")}
          >
            <Phone className="w-4 h-4" />
          </button>
        </div>
      </div>
    </li>
  );
}


// ---------- empty ----------
function EmptyState({ tab }: { tab: "recents" | "active" | "missed" }) {
  const { t } = useMplanipretLang();
  const cfg = {
    recents: { Icon: Phone, title: t("calls.noRecentsTitle"), sub: t("calls.noRecentsSub") },
    active: { Icon: Phone, title: t("calls.noActiveTitle"), sub: t("calls.noActiveSub") },
    missed: { Icon: PhoneMissed, title: t("calls.noMissedTitle"), sub: t("calls.noMissedSub") },
  }[tab];
  return (
    <div className="p-10 text-center">
      <div
        className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3"
        style={{ background: "rgba(46,155,220,0.12)", color: "var(--pp-brand-accent)" }}
      >
        <cfg.Icon className="w-6 h-6" />
      </div>
      <div className="font-semibold" style={{ color: "var(--pp-text-secondary)" }}>{cfg.title}</div>
      <div className="text-xs mt-1" style={{ color: "var(--pp-text-muted)" }}>{cfg.sub}</div>
    </div>
  );
}

// ---------- Transcript view (chat bubbles + auto-fetch + Analyze CTA) ----------
type Seg = { speaker: string; text: string; start?: number | null; end?: number | null };
function TranscriptView({
  segments, transcript, loading, preparing = false, attempt = 0, onFetch, onAnalyze, aiLoading, analyzed, t, filenameHint,
}: {
  segments: Seg[] | null;
  transcript: string | null;
  loading: boolean;
  preparing?: boolean;
  attempt?: number;
  onFetch: () => Promise<void> | void;
  onAnalyze: () => Promise<void> | void;
  aiLoading: boolean;
  analyzed: boolean;
  t: (k: string) => string;
  filenameHint?: string;
}) {
  const has = (segments && segments.length > 0) || !!(transcript && transcript.trim());
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!has && !loading && !preparing && !fetchedRef.current) {
      fetchedRef.current = true;
      void onFetch();
    }
  }, [has, loading, preparing, onFetch]);

  const isCourtier = (speaker: string) => {
    const s = (speaker || "").toLowerCase();
    return s.includes("courtier") || s.startsWith("agent") || s.startsWith("broker") || s === "speaker 1" || s === "1";
  };

  if ((loading || preparing) && !has) {
    return (
      <div className="pp-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--pp-text-primary)" }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pp-brand-accent)" }} />
          {preparing
            ? `⏳ Transcription en cours de préparation${attempt > 0 ? ` (tentative ${attempt + 1})` : ""}…`
            : "Chargement de la transcription…"}
        </div>
        {preparing && (
          <div className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
            NetSapiens génère la transcription. Nouvelle vérification automatique dans quelques secondes.
          </div>
        )}
        <div className="space-y-2 pt-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
              <div className="h-10 rounded-2xl animate-pulse" style={{ width: "60%", background: "var(--pp-bg-surface)" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!has) {
    return (
      <div className="pp-card p-4 space-y-3">
        <div className="text-xs" style={{ color: "var(--pp-warning, #F5A623)" }}>
          ⚠️ {t("calls.transcriptUnavailable") || "Transcription non disponible."}
        </div>
        <div className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
          Vérifiez que <code>PORTAL_VOICE_TRANSCRIPTION_SENTIMENT = yes</code> est activé pour votre domaine dans NetSapiens.
        </div>
        <button onClick={() => onFetch()} className="w-full py-2 rounded-lg text-xs font-semibold"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}>
          <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Réessayer
        </button>
      </div>
    );
  }

  const segs: Seg[] = segments && segments.length > 0
    ? segments
    : (transcript ?? "").split("\n").filter(Boolean).map((line) => {
        const c = line.indexOf(":");
        if (c > 0 && c < 30) return { speaker: line.slice(0, c).trim(), text: line.slice(c + 1).trim() };
        return { speaker: "Speaker", text: line };
      });
  const wordCount = segs.reduce((n, s) => n + (s.text.split(/\s+/).filter(Boolean).length), 0);

  const buildPlainText = () => segs.map((s) => `${s.speaker}: ${s.text}`).join("\n");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainText());
      toast.success(t("calls.transcriptCopied") || "Transcription copiée");
    } catch {
      toast.error("Copie impossible");
    }
  };

  const handleDownload = (format: "txt" | "md") => {
    const safe = (filenameHint || "transcription").replace(/[^\w.-]+/g, "_").slice(0, 60);
    let content = "";
    let mime = "text/plain;charset=utf-8";
    let ext = "txt";
    if (format === "md") {
      content = segs.map((s) => `**${s.speaker}**\n\n${s.text}\n`).join("\n");
      mime = "text/markdown;charset=utf-8";
      ext = "md";
    } else {
      content = buildPlainText();
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Téléchargé .${ext}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 sticky top-0 z-10 py-1"
        style={{ background: "var(--pp-bg-base)" }}>
        <div className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
          {wordCount} mots · {segs.length} tours
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleCopy}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
            aria-label="Copier">
            <Copy className="w-3.5 h-3.5" /> Copier
          </button>
          <button onClick={() => handleDownload("txt")}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
            aria-label="Télécharger .txt">
            <Download className="w-3.5 h-3.5" /> .txt
          </button>
          <button onClick={() => handleDownload("md")}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
            aria-label="Télécharger .md">
            <Download className="w-3.5 h-3.5" /> .md
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {segs.map((s, i) => {
          const right = isCourtier(s.speaker);
          return (
            <div key={i} className={`flex flex-col ${right ? "items-end" : "items-start"}`}>
              <div className="text-[10px] mb-0.5" style={{ color: "var(--pp-text-tertiary, var(--pp-text-secondary))" }}>{s.speaker}</div>
              <div
                className="px-3 py-2 text-[13px] leading-relaxed"
                style={{
                  maxWidth: "82%",
                  color: right ? "white" : "var(--pp-text-primary)",
                  background: right ? "linear-gradient(135deg, var(--pp-brand-accent-2), var(--pp-brand-accent))" : "var(--pp-bg-elevated)",
                  border: right ? "none" : "1px solid var(--pp-bg-border-2)",
                  borderRadius: right ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                }}
              >
                {s.text}
              </div>
            </div>
          );
        })}
      </div>


      {!analyzed && (
        <button
          onClick={() => onAnalyze()}
          disabled={aiLoading}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2 sticky bottom-0"
          style={{ background: "linear-gradient(135deg, #2D1A5A, #9B7FE8)" }}
        >
          {aiLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours…</> : <><Sparkles className="w-4 h-4" /> Analyser avec Claude IA</>}
        </button>
      )}
    </div>
  );
}

// ---------- Claude coaching block (reads ai_analysis_json) ----------
function ClaudeCoachingBlock({ analysis, coachingScore }: { analysis: any; coachingScore: number | null }) {
  if (!analysis || typeof analysis !== "object") return null;
  const coaching = analysis.coaching ?? {};
  const summary = analysis.summary ?? {};
  const key = summary.key_info ?? {};
  const overall = typeof coaching.overall_score === "number" ? coaching.overall_score : coachingScore;
  const breakdown = coaching.score_breakdown ?? {};
  const phrases: Array<{ context?: string; phrase?: string }> = Array.isArray(coaching.suggested_phrases) ? coaching.suggested_phrases : [];
  const strengths: string[] = Array.isArray(coaching.strengths) ? coaching.strengths : [];
  const improvements: string[] = Array.isArray(coaching.improvements) ? coaching.improvements : [];

  const scoreColor = overall != null && overall >= 8 ? "#00D4AA" : overall != null && overall >= 6 ? "#F5A623" : "#E84C4C";
  const label = overall != null && overall >= 8 ? "Excellent" : overall != null && overall >= 6 ? "Bien" : "À améliorer";

  const barKeys: Array<[string, string]> = [
    ["listening", "Écoute"],
    ["questioning", "Questions"],
    ["empathy", "Empathie"],
    ["product_knowledge", "Connaissance"],
    ["closing", "Conclusion"],
  ];

  return (
    <>
      {overall != null && (
        <div className="pp-card p-4 flex items-center gap-4" style={{ borderLeft: `4px solid ${scoreColor}` }}>
          <div className="w-16 h-16 rounded-full flex flex-col items-center justify-center shrink-0"
            style={{ border: `3px solid ${scoreColor}`, background: "var(--pp-bg-elevated)" }}>
            <div className="text-xl font-bold" style={{ color: scoreColor }}>{overall}</div>
            <div className="text-[9px]" style={{ color: "var(--pp-text-muted)" }}>/10</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: scoreColor }}>Score de coaching</div>
            <div className="text-sm font-semibold" style={{ color: "var(--pp-text-primary)" }}>{label}</div>
            <div className="mt-2 space-y-1">
              {barKeys.map(([k, lbl]) => {
                const v = typeof breakdown[k] === "number" ? breakdown[k] : null;
                if (v == null) return null;
                return (
                  <div key={k} className="flex items-center gap-2 text-[10px]" style={{ color: "var(--pp-text-secondary)" }}>
                    <span className="w-20 shrink-0">{lbl}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--pp-bg-border-2)" }}>
                      <div style={{ width: `${Math.min(100, v * 10)}%`, height: "100%", background: scoreColor }} />
                    </div>
                    <span className="w-6 text-right">{v}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {(key.budget || key.property_type || key.timeline) && (
        <div className="flex flex-wrap gap-1.5">
          {key.budget && <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}>💰 {key.budget}</span>}
          {key.property_type && <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}>🏠 {key.property_type}</span>}
          {key.timeline && <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}>⏰ {key.timeline}</span>}
        </div>
      )}

      {strengths.length > 0 && (
        <div className="pp-card p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#00D4AA" }}>✅ Points forts</div>
          <ul className="space-y-1 text-xs" style={{ color: "var(--pp-text-primary)" }}>
            {strengths.map((s, i) => <li key={i}>• {s}</li>)}
          </ul>
        </div>
      )}
      {improvements.length > 0 && (
        <div className="pp-card p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#F5A623" }}>⚠️ À améliorer</div>
          <ul className="space-y-1 text-xs" style={{ color: "var(--pp-text-primary)" }}>
            {improvements.map((s, i) => <li key={i}>• {s}</li>)}
          </ul>
        </div>
      )}

      {phrases.length > 0 && (
        <div className="pp-card p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9B7FE8" }}>💬 Formulations suggérées</div>
          <div className="space-y-2">
            {phrases.map((p, i) => (
              <div key={i} className="rounded-lg p-2" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
                {p.context && <div className="text-[10px] italic mb-1" style={{ color: "var(--pp-text-secondary)" }}>{p.context}</div>}
                <div className="text-xs" style={{ color: "var(--pp-text-primary)" }}>« {p.phrase} »</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}


// ============================================================
// CALL DETAIL SHEET
// ============================================================
function CallDetailSheet({
  call, userId, onClose, openDialer, onUpdated,
}: {
  call: Call; userId: string; onClose: () => void; openDialer: (n?: string) => void; onUpdated: (c: Call) => void;
}) {
  const { t, lang } = useMplanipretLang();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txPreparing, setTxPreparing] = useState(false);
  const [txAttempt, setTxAttempt] = useState(0);
  const txRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (txRetryTimerRef.current) clearTimeout(txRetryTimerRef.current); }, []);
  const [aiLoading, setAiLoading] = useState(false);
  const [taskState, setTaskState] = useState<Record<string, { creating?: boolean; createdId?: string }>>({});
  const [eventState, setEventState] = useState<Record<string, { creating?: boolean; createdId?: string }>>({});
  const [activeTab, setActiveTab] = useState<"audio" | "transcript" | "coaching" | "maestro">("audio");
  const peerNumber = (call.direction === "outbound" ? call.to_number : call.from_number) ?? "";
  const _resolvedNames = useCallerNames([peerNumber]);
  const _callerLabel = displayLabelWith(call, _resolvedNames[peerNumber], lang as "fr" | "en");

  // Load insight
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("planipret_ai_insights")
        .select("*")
        .eq("call_id", call.id)
        .maybeSingle();
      setInsight((data as any) ?? null);
    })();
  }, [call.id]);

  // Auto-run transcription + AI analysis when opening a call that has a
  // recording but no transcript/insight yet (parity with /planipret/admin).
  const autoRanRef = useRef<string | null>(null);
  useEffect(() => {
    const hasRecording = !!(call.recording_url || (call as any).has_recording || call.ns_call_id);
    const hasTranscript = !!call.transcript || (Array.isArray(call.transcript_segments) && call.transcript_segments.length > 0);
    const hasInsight = !!insight?.summary;
    if (!hasRecording || autoRanRef.current === call.id) return;
    if (hasTranscript && hasInsight) return;
    autoRanRef.current = call.id;
    (async () => {
      try {
        if (!hasTranscript) {
          setTxLoading(true);
          const { data } = await supabase.functions.invoke("ns-get-transcription", { body: { call_db_id: call.id, ns_callid: call.ns_callid ?? call.ns_call_id } });
          setTxLoading(false);
          const res = (data ?? {}) as any;
          if (res?.transcript || (Array.isArray(res?.segments) && res.segments.length)) {
            const transcript = res.transcript ?? (Array.isArray(res.segments) ? res.segments.map((s: any) => `${s.speaker ?? "Speaker"}: ${s.text}`).join("\n") : call.transcript);
            onUpdated({ ...call, transcript, transcript_segments: res.segments ?? call.transcript_segments });
          }
        }
        // Reload latest call state before analyzing
        const { data: fresh } = await supabase.from("planipret_phone_calls").select("*").eq("id", call.id).maybeSingle();
        const freshCall = (fresh as Call) ?? call;
        const segs = Array.isArray(freshCall.transcript_segments) ? freshCall.transcript_segments : null;
        if ((freshCall.transcript || segs) && !hasInsight) {
          setAiLoading(true);
          await supabase.functions.invoke("pp-coach-call", {
            body: { call_id: call.id, transcript: freshCall.transcript ?? null, force: true },
          });
          setAiLoading(false);
          const { data: ins } = await supabase.from("planipret_ai_insights").select("*").eq("call_id", call.id).maybeSingle();
          setInsight((ins as any) ?? null);
          if (fresh) onUpdated(freshCall);
        }
      } catch (e) {
        setTxLoading(false); setAiLoading(false);
        console.error("[MCalls] auto AI pipeline failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id, insight?.summary]);

  // Realtime refresh on ai-insights channel
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`ai-insights:${userId}`)
      .on("broadcast", { event: "updated" }, async (msg: any) => {
        if (msg?.payload?.call_id === call.id) {
          const { data: ins } = await supabase.from("planipret_ai_insights").select("*").eq("call_id", call.id).maybeSingle();
          setInsight((ins as any) ?? null);
          const { data: c2 } = await supabase.from("planipret_phone_calls").select("*").eq("id", call.id).maybeSingle();
          if (c2) onUpdated(c2 as Call);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, call.id, onUpdated]);

  const refreshCall = async () => {
    const { data } = await supabase.from("planipret_phone_calls").select("*").eq("id", call.id).maybeSingle();
    if (data) onUpdated(data as Call);
  };

  const fetchRecording = async () => {
    setRecLoading(true);
    const { data, error } = await supabase.functions.invoke("pp-ns-recordings", { body: { action: "get", call_id: call.ns_call_id ?? call.id } });
    setRecLoading(false);
    if (error || !(data as any)?.recording_url) { toast.error(t("calls.recordingUnavailable")); return; }
    await supabase.from("planipret_phone_calls").update({ recording_url: (data as any).recording_url }).eq("id", call.id);
    await refreshCall();
    toast.success(t("calls.recordingFetched"));
  };

  // Retry backoff (ms) for transient transcription failures (still being generated NS-side)
  const TX_BACKOFF = [4000, 10000, 25000, 60000];

  const isTransientTxError = (res: any): boolean => {
    if (!res) return true;
    const attempts: Array<{ status: number }> = Array.isArray(res.attempts) ? res.attempts : [];
    // Retry when NS returned 404/202/425 or nothing usable yet — the CDR exists but transcript not ready.
    if (attempts.length && attempts.every((a) => [0, 202, 404, 425, 408, 500, 502, 503, 504].includes(a.status))) return true;
    // Explicit hints from the edge function
    const hay = `${res.error ?? ""} ${res.hint ?? ""}`.toLowerCase();
    if (hay.includes("en cours") || hay.includes("prépar") || hay.includes("processing")) return true;
    return false;
  };

  const runTranscriptOnce = async () => {
    const { data, error } = await supabase.functions.invoke("ns-get-transcription", {
      body: { call_db_id: call.id, ns_callid: call.ns_callid ?? call.ns_call_id },
    });
    const res = (data ?? {}) as any;
    const ok = !error && res.success !== false && (res.transcript || (Array.isArray(res.segments) && res.segments.length));
    return { ok, res, error };
  };

  const fetchTranscript = async (attempt = 0): Promise<void> => {
    if (txRetryTimerRef.current) { clearTimeout(txRetryTimerRef.current); txRetryTimerRef.current = null; }
    setTxAttempt(attempt);
    if (attempt === 0) setTxLoading(true); else setTxPreparing(true);

    const { ok, res, error } = await runTranscriptOnce();

    if (ok) {
      setTxLoading(false); setTxPreparing(false); setTxAttempt(0);
      const transcript = res.transcript ?? (Array.isArray(res.segments) ? res.segments.map((s: any) => `${s.speaker ?? "Speaker"}: ${s.text}`).join("\n") : call.transcript);
      onUpdated({ ...call, transcript, transcript_segments: res.segments ?? call.transcript_segments });
      await refreshCall();
      if (transcript && !call.ai_summary) {
        setAiLoading(true);
        await supabase.functions.invoke("pp-coach-call", { body: { call_id: call.id, transcript, force: true } });
        setAiLoading(false);
        await refreshCall();
      }
      toast.success(t("calls.transcriptFetched"));
      return;
    }

    if (Array.isArray(res.attempts)) console.warn("ns-get-transcription attempts:", res.attempts);

    const transient = isTransientTxError(res);
    if (transient && attempt < TX_BACKOFF.length) {
      setTxLoading(false);
      setTxPreparing(true);
      const delay = TX_BACKOFF[attempt];
      txRetryTimerRef.current = setTimeout(() => { void fetchTranscript(attempt + 1); }, delay);
      return;
    }

    // Give up — show real error
    setTxLoading(false); setTxPreparing(false); setTxAttempt(0);
    const msg = res.error ?? error?.message ?? t("calls.transcriptUnavailable");
    const hint = res.hint ?? res.action_required ?? "";
    toast.error(hint ? `${msg} — ${hint}` : msg);
  };

  const analyzeAI = async () => {
    const segments = Array.isArray(call.transcript_segments) ? call.transcript_segments : null;
    if (!call.transcript && !segments) return;
    setAiLoading(true);
    const { data, error } = await supabase.functions.invoke("pp-coach-call", {
      body: { call_id: call.id, transcript: call.transcript ?? null, force: true },
    });
    setAiLoading(false);
    if (error) { toast.error(error.message ?? t("common.failed")); return; }
    toast.success(t("calls.analysisDone"));
    await refreshCall();
    const { data: ins } = await supabase.from("planipret_ai_insights").select("*").eq("call_id", call.id).maybeSingle();
    setInsight((ins as any) ?? null);
  };


  const meta = (call.metadata ?? {}) as any;
  const aiTasks: Array<any> = Array.isArray(meta.ai_tasks) ? meta.ai_tasks
    : Array.isArray(insight?.suggested_actions?.tasks) ? insight!.suggested_actions.tasks
    : [];
  const aiEvents: Array<any> = Array.isArray(meta.ai_events) ? meta.ai_events
    : Array.isArray(insight?.suggested_actions?.events) ? insight!.suggested_actions.events
    : [];

  const createOne = async (type: "task" | "event", item: any, idx: number) => {
    const key = String(idx);
    if (type === "task") setTaskState((s) => ({ ...s, [key]: { creating: true } }));
    else setEventState((s) => ({ ...s, [key]: { creating: true } }));
    const { data, error } = await supabase.functions.invoke("maestro-actions", {
      body: { action: type === "task" ? "create_task" : "create_event", call_id: call.id, payload: item },
    });
    const createdId = (data as any)?.id ?? (data as any)?.maestro_task_id ?? (data as any)?.maestro_event_id ?? "ok";
    if (error || (data as any)?.success === false) {
      toast.error(`Échec création ${type === "task" ? "tâche" : "événement"}`);
      if (type === "task") setTaskState((s) => ({ ...s, [key]: {} }));
      else setEventState((s) => ({ ...s, [key]: {} }));
      return;
    }
    toast.success(type === "task" ? "Tâche créée ✅" : "Événement créé ✅");
    if (type === "task") setTaskState((s) => ({ ...s, [key]: { createdId } }));
    else setEventState((s) => ({ ...s, [key]: { createdId } }));
  };

  const createAll = async () => {
    for (let i = 0; i < aiTasks.length; i++) if (!taskState[String(i)]?.createdId) await createOne("task", aiTasks[i], i);
    for (let i = 0; i < aiEvents.length; i++) if (!eventState[String(i)]?.createdId) await createOne("event", aiEvents[i], i);
  };

  const copyTranscript = async () => {
    if (!call.transcript) return;
    await navigator.clipboard.writeText(call.transcript);
    toast.success(t("calls.transcriptCopied"));
  };

  const direction = isOutbound(call) ? t("calls.outbound") : isMissed(call) ? t("calls.missed") : t("calls.inbound");
  const dirColor = isMissed(call) ? DANGER : isOutbound(call) ? SUCCESS : ACCENT;

  const objections: string[] = (insight?.suggested_actions?.objections as string[]) || (meta.objections as string[]) || [];
  const buyingSignals: string[] = (insight?.suggested_actions?.buying_signals as string[]) || (meta.buying_signals as string[]) || [];
  const nextAction: string = (insight?.suggested_actions?.next_action as string) || (meta.next_action as string) || "";
  const coaching = insight?.coaching_notes || meta.ai_coaching || "";
  const summary = insight?.summary || call.ai_summary || "";

  const score = call.lead_score ?? null;
  const scoreColor = score == null ? "var(--pp-text-muted)" : score >= 8 ? "var(--pp-success)" : score >= 5 ? "var(--pp-warning)" : "var(--pp-danger)";

  return (
    <div className="absolute inset-0 z-40 flex items-end" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }} />
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="relative w-full flex flex-col"
        style={{
          height: "95%",
          background: "var(--pp-bg-base)",
          borderTop: "1px solid var(--pp-bg-border-2)",
          borderRadius: "24px 24px 0 0",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {/* Drag handle + close */}
        <div className="pt-3 pb-2 flex flex-col items-center relative shrink-0">
          <div style={{ width: 36, height: 4, background: "var(--pp-bg-border-2)", borderRadius: 2 }} />
          <button onClick={onClose} className="absolute right-3 top-2 p-2.5 rounded-full" style={{ minWidth: 44, minHeight: 44, color: "var(--pp-text-secondary)" }} aria-label={t("common.close")}>
            <X className="w-5 h-5 mx-auto" />
          </button>
        </div>

        {/* Caller header */}
        <div className="px-5 pb-3 shrink-0" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
          <div className="text-lg font-bold truncate" style={{ color: "var(--pp-text-primary)" }}>{_callerLabel}</div>
          {otherName(call) && <div className="text-xs mt-0.5" style={{ color: "var(--pp-text-muted)" }}>{otherNumber(call)}</div>}
          <div className="mt-1.5 flex items-center gap-2 text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
            <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: `${dirColor}1F`, color: dirColor, border: `1px solid ${dirColor}55` }}>{direction}</span>
            <span>{localizedDateTime(call.started_at, lang, t("common.today"), t("common.yesterday"))}</span>
            <span style={{ color: "var(--pp-text-faint)" }}>·</span>
            <span>{localizedDuration(call.duration_seconds, lang)}</span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => { openDialer(otherNumber(call)); onClose(); }}
              className="flex-1 py-2 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, var(--pp-brand-accent-2), var(--pp-brand-accent))" }}
            >
              <Phone className="w-4 h-4" /> {t("common.callBack")}
            </button>
            <button
              onClick={() => setActiveTab("transcript")}
              className="px-3 py-2 rounded-xl text-xs font-semibold"
              style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)", border: "1px solid var(--pp-bg-border-2)" }}
            >
              <FileText className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 4 Tabs */}
        <div className="px-3 pt-3 shrink-0">
          <div className="flex rounded-full p-1" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}>
            {[
              { k: "audio", label: "🎙️ Audio" },
              { k: "transcript", label: "📝 Texte" },
              { k: "coaching", label: "🤖 Coach" },
              { k: "maestro", label: "🏢 CRM" },
            ].map((t) => {
              const active = activeTab === (t.k as any);
              return (
                <button
                  key={t.k}
                  onClick={() => setActiveTab(t.k as any)}
                  className="flex-1 py-2 rounded-full text-[11px] font-semibold transition"
                  style={active
                    ? { background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))", color: "white", boxShadow: "0 2px 10px rgba(46,155,220,0.35)" }
                    : { color: "var(--pp-text-muted)" }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ===== TAB AUDIO ===== */}
          {activeTab === "audio" && (
            <CallRecordingPlayer
              callId={call.id}
              duration={call.duration_seconds ?? 0}
            />
          )}

          {/* ===== TAB TRANSCRIPT ===== */}
          {activeTab === "transcript" && (
            <TranscriptView
              segments={Array.isArray(call.transcript_segments) ? call.transcript_segments : null}
              transcript={call.transcript}
              loading={txLoading}
              preparing={txPreparing}
              attempt={txAttempt}
              onFetch={() => fetchTranscript(0)}
              onAnalyze={analyzeAI}
              aiLoading={aiLoading}
              analyzed={!!(call as any).ai_analysis_json}
              t={t}
              filenameHint={`transcript_${displayLabel(call)}_${(call.started_at || "").slice(0,10)}`}
            />
          )}



          {/* ===== TAB COACHING ===== */}
          {activeTab === "coaching" && (
            <>
              <ClaudeCoachingBlock analysis={(call as any).ai_analysis_json ?? null} coachingScore={(call as any).coaching_score ?? null} />

              {/* Score circle */}
              {score != null && (
                <div className="flex items-center gap-4 pp-card p-4">
                  <div className="relative w-20 h-20 shrink-0 rounded-full flex items-center justify-center"
                    style={{ background: "var(--pp-bg-elevated)", border: `3px solid ${scoreColor}` }}>
                    <div className="text-2xl font-bold" style={{ color: scoreColor, fontFamily: "Inter,sans-serif" }}>{score}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs uppercase tracking-wider font-bold" style={{ color: scoreColor }}>Score lead /10</div>
                    {call.lead_score_reason && <div className="text-xs italic mt-1" style={{ color: "var(--pp-text-secondary)" }}>{call.lead_score_reason}</div>}
                  </div>
                </div>
              )}

              {summary && (
                <div className="rounded-xl p-3" style={{ background: "rgba(46,155,220,0.06)", border: "1px solid rgba(46,155,220,0.15)", borderLeft: "3px solid var(--pp-brand-accent)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pp-brand-accent)" }}>📋 Résumé</div>
                  <p className="text-xs whitespace-pre-wrap" style={{ color: "var(--pp-text-primary)" }}>{summary}</p>
                </div>
              )}

              {buyingSignals.length > 0 && (
                <div className="rounded-xl p-3" style={{ background: "rgba(0,212,170,0.06)", border: "1px solid rgba(0,212,170,0.15)", borderLeft: "3px solid var(--pp-success)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--pp-success)" }}>✅ Points forts</div>
                  <ul className="space-y-1.5">
                    {buyingSignals.map((s, i) => (
                      <li key={i} className="text-xs flex items-start gap-2" style={{ color: "var(--pp-text-primary)" }}>
                        <span style={{ color: "var(--pp-success)" }}>●</span> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {objections.length > 0 && (
                <div className="rounded-xl p-3" style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.15)", borderLeft: "3px solid var(--pp-warning)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--pp-warning)" }}>⚠️ Axes d'amélioration</div>
                  <ul className="space-y-1.5">
                    {objections.map((o, i) => (
                      <li key={i} className="text-xs flex items-start gap-2" style={{ color: "var(--pp-text-primary)" }}>
                        <span style={{ color: "var(--pp-warning)" }}>●</span> {o}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {nextAction && (
                <div className="rounded-xl p-3" style={{ background: "rgba(155,127,232,0.06)", border: "1px solid rgba(155,127,232,0.15)", borderLeft: "3px solid var(--pp-agent)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--pp-agent)" }}>💡 Prochaine étape</div>
                  <p className="text-xs" style={{ color: "var(--pp-text-primary)" }}>{nextAction}</p>
                </div>
              )}

              {coaching && (
                <div className="rounded-xl p-4" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", borderLeft: "4px solid var(--pp-agent)" }}>
                  <p className="text-xs italic whitespace-pre-wrap" style={{ color: "var(--pp-text-primary)" }}>« {coaching} »</p>
                  <div className="text-[10px] mt-2 font-semibold" style={{ color: "var(--pp-agent)" }}>— AVA, Coach IA</div>
                </div>
              )}

              {/* Suggested actions */}
              {(aiTasks.length > 0 || aiEvents.length > 0) && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pp-text-secondary)" }}>⚡ Actions suggérées</div>
                  {aiTasks.map((t: any, i: number) => {
                    const st = taskState[String(i)] ?? {};
                    return (
                      <ActionRow key={`t-${i}`} icon="📌" title={t.title ?? t.name ?? "Tâche"} sub={t.due_date ?? t.due ?? ""}
                        done={!!st.createdId} loading={!!st.creating}
                        doneLabel={st.createdId ? `Créé · ${String(st.createdId).slice(0, 8)}` : undefined}
                        onCreate={() => createOne("task", t, i)} />
                    );
                  })}
                  {aiEvents.map((e: any, i: number) => {
                    const st = eventState[String(i)] ?? {};
                    return (
                      <ActionRow key={`e-${i}`} icon="📅" title={e.title ?? e.subject ?? "Événement"} sub={e.start ?? e.suggested_time ?? ""}
                        done={!!st.createdId} loading={!!st.creating} onCreate={() => createOne("event", e, i)} />
                    );
                  })}
                  {aiTasks.length + aiEvents.length > 1 && (
                    <button onClick={createAll} className="w-full mt-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                      style={{ background: "linear-gradient(135deg, var(--pp-brand-accent-2), var(--pp-brand-accent))" }}>
                      <Sparkles className="w-4 h-4" /> Tout créer dans Maestro
                    </button>
                  )}
                </div>
              )}

              {/* Empty / analyze CTA */}
              {!summary && !coaching && (
                call.transcript ? (
                  <button onClick={analyzeAI} disabled={aiLoading}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg, #6C3CE1, var(--pp-agent))" }}>
                    {aiLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours…</> : <><Sparkles className="w-4 h-4" /> Analyser avec l'IA</>}
                  </button>
                ) : (
                  <button onClick={async () => { await fetchTranscript(); }} disabled={txLoading || txPreparing}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg, var(--pp-brand-accent-2), var(--pp-brand-accent))" }}>
                    {txPreparing ? <><Loader2 className="w-4 h-4 animate-spin" /> Préparation…</> : <>📝 Obtenir transcription + Analyse</>}
                  </button>
                )
              )}

              {/* Callback suggestion */}
              {call.suggested_callback_delay && (
                <CallbackSuggestion call={call} onScheduled={() => toast.success("Rappel programmé ✅")} />
              )}
            </>
          )}

          {/* ===== TAB MAESTRO ===== */}
          {activeTab === "maestro" && (
            <MaestroTab call={call as any} onUpdated={refreshCall} />
          )}

        </div>
      </motion.div>
    </div>
  );
}

function CallbackSuggestion({ call, onScheduled }: { call: Call; onScheduled: () => void }) {
  const [busy, setBusy] = useState(false);
  const schedule = async (delay: string) => {
    setBusy(true);
    const at = callbackDelayToDate(delay);
    if (!at) { setBusy(false); return; }
    const { error } = await supabase.from("planipret_reminders").insert({
      user_id: call.user_id,
      call_id: call.id,
      contact_number: call.direction === "outbound" ? call.to_number : call.from_number,
      contact_name: call.direction === "outbound" ? call.to_name : call.from_name,
      reminder_type: "callback",
      scheduled_at: at.toISOString(),
      ai_suggested: true,
      note: call.callback_reason ?? null,
    });
    setBusy(false);
    if (error) { toast.error("Erreur création rappel"); return; }
    // Best-effort Maestro event
    supabase.functions.invoke("maestro-actions", {
      body: { action: "create_event", call_id: call.id, payload: { title: `Rappel: ${call.from_name ?? call.from_number ?? ""}`, start: at.toISOString(), end: new Date(at.getTime() + 30*60000).toISOString(), description: call.callback_reason ?? "" } },
    }).catch(() => {});
    onScheduled();
  };
  return (
    <div className="mt-3 rounded-xl p-3" style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.25)" }}>
      <div className="text-xs font-semibold mb-1" style={{ color: "var(--pp-agent)" }}>⏰ Rappel suggéré par AVA</div>
      {call.callback_reason && <p className="text-xs text-slate-600 mb-2">{call.callback_reason}</p>}
      <div className="flex flex-wrap gap-1.5">
        {(["2h","tomorrow_9am","monday_9am"] as const).map((d) => (
          <button key={d} disabled={busy} onClick={() => schedule(d)}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md text-white disabled:opacity-50"
            style={{ background: "var(--pp-agent)" }}>
            {delayLabel(d)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="text-[13px] font-semibold mb-2" style={{ color: "var(--pp-text-primary)" }}>{title}</div>
      {children}
    </div>
  );
}

function Accordion({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50">
        <span>{title}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

function ActionRow({ icon, title, sub, onCreate, loading, done, doneLabel }: {
  icon: string; title: string; sub?: string; onCreate: () => void; loading?: boolean; done?: boolean; doneLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-100">
      <div className="text-lg">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-slate-800 truncate">{title}</div>
        {sub && <div className="text-[11px] text-slate-500 truncate">{sub}</div>}
      </div>
      {done ? (
        <span className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md flex items-center gap-1" style={{ background: `${SUCCESS}15`, color: SUCCESS }}>
          <Check className="w-3 h-3" /> {doneLabel ?? "Créé"}
        </span>
      ) : (
        <button onClick={onCreate} disabled={loading} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md text-white flex items-center gap-1 disabled:opacity-50" style={{ background: PRIMARY }}>
          {loading && <Loader2 className="w-3 h-3 animate-spin" />} Créer dans Maestro
        </button>
      )}
    </div>
  );
}

// ============================================================
// ACTIVE CALLS TAB
// ============================================================
type ActiveCall = {
  id: string;
  number: string;
  name?: string;
  status: "ringing" | "active" | "hold" | "inbound";
  startedAt: number;
};

function ActiveCallsTab({ userId, openDialer }: { userId: string; openDialer: (n?: string) => void }) {
  const [active, setActive] = useState<ActiveCall[]>([]);
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const [transferOpen, setTransferOpen] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [incoming, setIncoming] = useState<ActiveCall | null>(null);
  const [incomingMaestro, setIncomingMaestro] = useState<any>(null);
  const [maestroLoading, setMaestroLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Maestro lookup on incoming
  useEffect(() => {
    if (!incoming?.number) { setIncomingMaestro(null); return; }
    let cancel = false;
    setMaestroLoading(true);
    supabase.functions
      .invoke("maestro-client-lookup", { body: { phone: incoming.number } })
      .then(({ data }) => { if (!cancel) setIncomingMaestro((data as any) || null); })
      .catch(() => { if (!cancel) setIncomingMaestro(null); })
      .finally(() => { if (!cancel) setMaestroLoading(false); });
    return () => { cancel = true; };
  }, [incoming?.number]);


  const fetchActive = async () => {
    const { data, error } = await supabase.functions.invoke("pp-ns-calls", { body: { action: "list" } });
    if (error) return;
    const raw = data as any;
    const list = (Array.isArray(raw) ? raw : raw?.calls ?? raw?.items ?? raw?.data ?? []) as any[];
    setActive(list.map((c: any) => ({
      id: c["call-id"] ?? c.call_id ?? c.callid ?? c.id,
      number: c.remote_number ?? c.number ?? c["call-term-user"] ?? c["call-orig-user"] ?? "",
      name: c.remote_name ?? c.name ?? c["caller-id-name"],
      status: (c.state ?? c.status ?? "active") as any,
      startedAt: c.started_at ? new Date(c.started_at).getTime() : Date.now(),
    })).filter((c: ActiveCall) => !!c.id));
  };

  useEffect(() => {
    fetchActive();
    pollRef.current = setInterval(fetchActive, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`call-events:${userId}`)
      .on("broadcast", { event: "*" }, (msg: any) => {
        const p = msg?.payload;
        if (!p) return;
        if (p.event === "ringing" || p.state === "ringing") {
          setIncoming({ id: p.id ?? p.call_id, number: p.from_number ?? p.number, status: "inbound", startedAt: Date.now() });
        } else if (p.event === "ended" || p.state === "ended" || p.state === "disconnected") {
          setIncoming(null);
          fetchActive();
        } else {
          fetchActive();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  const action = async (act: string, callId: string, extra: any = {}) => {
    const { error } = await supabase.functions.invoke("pp-ns-calls", { body: { action: act, call_id: callId, ...extra } });
    if (error) toast.error(error.message);
    else fetchActive();
  };

  if (!active.length && !incoming) return <EmptyState tab="active" />;

  return (
    <div className="p-4 space-y-3">
      {active.map((c) => (
        <ActiveCallCard
          key={c.id}
          call={c}
          muted={!!muted[c.id]}
          onMute={() => setMuted((m) => ({ ...m, [c.id]: !m[c.id] }))}
          onHold={() => action(c.status === "hold" ? "unhold" : "hold", c.id)}
          onTransfer={() => setTransferOpen(c.id)}
          onHangup={() => action("disconnect", c.id)}
        />
      ))}

      {transferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setTransferOpen(null)}>
          <div className="bg-white rounded-2xl p-4 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold text-sm mb-2">Transférer l'appel</div>
            <input value={transferTo} onChange={(e) => setTransferTo(e.target.value)} placeholder="Transférer vers..." className="w-full px-3 py-2 rounded-lg bg-slate-100 text-sm outline-none mb-3" />
            <div className="flex gap-2">
              <button onClick={() => setTransferOpen(null)} className="flex-1 py-2 rounded-lg text-sm text-slate-600 bg-slate-100">Annuler</button>
              <button onClick={() => { if (transferOpen && transferTo) { action("transfer", transferOpen, { destination: transferTo }); setTransferOpen(null); setTransferTo(""); } }} className="flex-1 py-2 rounded-lg text-sm text-white" style={{ background: PRIMARY }}>Transférer</button>
            </div>
          </div>
        </div>
      )}

      {incoming && (() => {
        const m = incomingMaestro || {};
        const client = m.client || m;
        const found = !!(m.client_id || client?.id);
        const fullName = found
          ? [client?.first_name, client?.last_name].filter(Boolean).join(" ") || client?.name
          : null;
        const stage = client?.mortgage_stage || client?.stage;
        const temp = client?.lead_temperature || m.lead_temperature;
        const prevCount = m.previous_calls_count ?? m.call_count;
        return (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center text-white p-6" style={{ background: PRIMARY }}>
            <div className="absolute inset-0 opacity-30 animate-pulse" style={{ background: PRIMARY }} />
            <div className="relative text-center mb-8 max-w-xs">
              <div className="text-sm opacity-80 mb-2">Appel entrant…</div>
              <div className="text-3xl font-bold">{fullName ?? incoming.name ?? incoming.number}</div>
              {(fullName || incoming.name) && <div className="text-sm opacity-80 mt-1">{incoming.number}</div>}
              {maestroLoading && <div className="text-[11px] opacity-70 mt-3">Recherche Maestro…</div>}
              {!maestroLoading && found && (
                <div className="mt-4 space-y-1.5">
                  {client?.company && <div className="text-xs opacity-90">🏢 {client.company}</div>}
                  {stage && (
                    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20">
                      {stage}
                    </span>
                  )}
                  {temp && (
                    <div className="text-xs opacity-90">
                      {temp === "hot" ? "🔥" : temp === "warm" ? "🌡️" : "❄️"} {temp}
                    </div>
                  )}
                  {prevCount > 0 && (
                    <div className="text-[11px] opacity-80">📋 {prevCount} appel{prevCount > 1 ? "s" : ""} précédent{prevCount > 1 ? "s" : ""}</div>
                  )}
                </div>
              )}
              {!maestroLoading && !found && (
                <div className="mt-4">
                  <div className="text-xs opacity-90 mb-2">👤 Nouveau contact</div>
                  <button
                    onClick={async () => {
                      try {
                        await supabase.functions.invoke("maestro-client-create", {
                          body: { phone: incoming.number, source: "inbound_call" },
                        });
                        toast.success("Créé dans Maestro");
                      } catch (e: any) {
                        toast.error("Échec création", { description: e?.message });
                      }
                    }}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-white/20 backdrop-blur"
                  >
                    + Créer dans Maestro
                  </button>
                </div>
              )}
            </div>
            <div className="relative flex gap-6">
              <button onClick={() => { action("reject", incoming.id); setIncoming(null); }} className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg" style={{ background: DANGER }}>
                <PhoneOff className="w-7 h-7" />
              </button>
              <button onClick={() => { action("answer", incoming.id); setIncoming(null); fetchActive(); }} className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg" style={{ background: SUCCESS }}>
                <Phone className="w-7 h-7" />
              </button>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

function ActiveCallCard({ call, muted, onMute, onHold, onTransfer, onHangup }: {
  call: ActiveCall; muted: boolean; onMute: () => void; onHold: () => void; onTransfer: () => void; onHangup: () => void;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const sec = Math.max(0, Math.floor((Date.now() - call.startedAt) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  const statusLabel = call.status === "ringing" ? "Sonnerie..." : call.status === "hold" ? "En attente" : "En communication";

  return (
    <div className="rounded-2xl p-5 text-white shadow-lg" style={{ background: PRIMARY }}>
      <div className="text-center">
        <div className="text-2xl font-bold">{call.name ?? call.number}</div>
        {call.name && <div className="text-sm opacity-80 mt-0.5">{call.number}</div>}
        <div className="text-3xl font-mono mt-3">{mm}:{ss}</div>
        <div className="text-xs opacity-80 mt-1">{statusLabel}</div>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-5">
        <ActionBtn label="Muet" active={muted} Icon={muted ? MicOff : Mic} onClick={onMute} />
        <ActionBtn label={call.status === "hold" ? "Reprendre" : "Attente"} Icon={call.status === "hold" ? Play : Pause} onClick={onHold} />
        <ActionBtn label="Transférer" Icon={ArrowRightLeft} onClick={onTransfer} />
        <ActionBtn label="Raccrocher" Icon={PhoneOff} onClick={onHangup} big danger />
      </div>
    </div>
  );
}

function ActionBtn({ label, Icon, onClick, active, big, danger }: { label: string; Icon: any; onClick: () => void; active?: boolean; big?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5">
      <div
        className={`rounded-full flex items-center justify-center ${big ? "w-14 h-14" : "w-12 h-12"} ${active ? "bg-white/40" : "bg-white/15"}`}
        style={danger ? { background: DANGER } : undefined}
      >
        <Icon className={`${big ? "w-6 h-6" : "w-5 h-5"} text-white`} />
      </div>
      <span className="text-[10px] text-white/90">{label}</span>
    </button>
  );
}

/* =================== Voicemails Tab (Phase 8) =================== */

type VM = {
  id: string;
  user_id: string;
  ns_vm_id: string | null;
  folder: string;
  from_number: string | null;
  from_name: string | null;
  duration_seconds: number | null;
  audio_url: string | null;
  transcript: string | null;
  is_read: boolean;
  received_at: string | null;
  created_at: string;
};

function fmtVmDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yest = new Date(); yest.setDate(now.getDate() - 1);
  const isEn = typeof document !== "undefined" && document.documentElement.lang === "en";
  const locale = isEn ? "en-CA" : "fr-CA";
  const hh = isEn
    ? `${String(((d.getHours() + 11) % 12) + 1)}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "AM" : "PM"}`
    : `${String(d.getHours()).padStart(2, "0")}h${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return `${isEn ? "Today" : "Aujourd'hui"} ${hh}`;
  if (d.toDateString() === yest.toDateString()) return `${isEn ? "Yesterday" : "Hier"} ${hh}`;
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short" }) + ` ${hh}`;
}
function fmtVmDur(s: number | null) {
  if (!s) return "—";
  const m = Math.floor(s / 60); const r = s % 60;
  return m === 0 ? `${r} sec` : `${m} min ${String(r).padStart(2, "0")} sec`;
}

function VoicemailsTab({
  userId, openDialer, registerRefresh,
}: { userId?: string; openDialer: (n: string) => void; registerRefresh: (fn: (() => void) | null) => void }) {
  const [items, setItems] = useState<VM[]>([]);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState<"inbox" | "saved">("inbox");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const sb: any = supabase;
    const { data } = await sb
      .from("planipret_voicemails")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as VM[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    registerRefresh(() => load());
    return () => registerRefresh(null);
  }, [load, registerRefresh]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`mcalls-vm:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "planipret_voicemails", filter: `user_id=eq.${userId}` }, (payload) => {
        const v = payload.new as VM;
        setItems((p) => [v, ...p]);
        toast(`📬 Nouveau voicemail de ${v.from_number ?? "inconnu"}`);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  const filtered = items.filter((v) => v.folder === folder);
  const unread = items.filter((v) => v.folder === "inbox" && !v.is_read).length;

  const markRead = async (vm: VM) => {
    if (vm.is_read) return;
    const sb: any = supabase;
    await sb.from("planipret_voicemails").update({ is_read: true }).eq("id", vm.id);
    setItems((p) => p.map((x) => x.id === vm.id ? { ...x, is_read: true } : x));
  };
  const saveVm = async (vm: VM) => {
    const sb: any = supabase;
    await sb.from("planipret_voicemails").update({ folder: "saved" }).eq("id", vm.id);
    setItems((p) => p.map((x) => x.id === vm.id ? { ...x, folder: "saved" } : x));
    toast.success("Voicemail sauvegardé");
  };
  const removeVm = async (vm: VM) => {
    if (!confirm("Supprimer ce voicemail ?")) return;
    if (vm.ns_vm_id) {
      await supabase.functions.invoke("pp-ns-voicemail", { body: { action: "delete", vm_id: vm.ns_vm_id } }).catch(() => null);
    }
    const sb: any = supabase;
    await sb.from("planipret_voicemails").delete().eq("id", vm.id);
    setItems((p) => p.filter((x) => x.id !== vm.id));
    toast.success("Voicemail supprimé");
  };
  const fetchTranscript = async (vm: VM) => {
    const { data, error } = await supabase.functions.invoke("ns-transcription", { body: { vm_id: vm.ns_vm_id ?? vm.id } });
    if (error || (data as any)?.success === false) { toast.error("Échec de la transcription"); return; }
    const txt = (data as any)?.transcript ?? (data as any)?.data?.transcript ?? "";
    if (txt) {
      const sb: any = supabase;
      await sb.from("planipret_voicemails").update({ transcript: txt }).eq("id", vm.id);
      setItems((p) => p.map((x) => x.id === vm.id ? { ...x, transcript: txt } : x));
    }
  };

  return (
    <div className="px-3 pt-3 pb-4">
      {/* Folder switch */}
      <div className="flex gap-1 mb-3 p-1 rounded-full"
        style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
        {([
          { k: "inbox" as const, label: `Reçus${unread ? ` (${unread})` : ""}` },
          { k: "saved" as const, label: "Sauvegardés" },
        ]).map((f) => {
          const active = folder === f.k;
          return (
            <button key={f.k} onClick={() => setFolder(f.k)}
              className="flex-1 py-1.5 text-[11px] font-semibold rounded-full transition"
              style={active
                ? { background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))", color: "#fff" }
                : { color: "var(--pp-text-muted)" }}>
              {f.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <ul className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="rounded-2xl h-16 animate-pulse"
              style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }} />
          ))}
        </ul>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3"
            style={{ background: "rgba(46,155,220,0.12)", color: "var(--pp-brand-accent)" }}>
            <VmIcon className="w-6 h-6" />
          </div>
          <div className="font-semibold" style={{ color: "var(--pp-text-secondary)" }}>
            {folder === "inbox" ? "Aucun voicemail reçu" : "Aucun voicemail sauvegardé"}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((vm) => {
            const open = expanded === vm.id;
            return (
              <li key={vm.id} className="rounded-2xl overflow-hidden"
                style={{
                  background: "var(--pp-bg-surface)",
                  border: "1px solid var(--pp-bg-border-2)",
                  borderLeft: vm.is_read ? "1px solid var(--pp-bg-border-2)" : "3px solid var(--pp-brand-accent)",
                }}>
                <button onClick={() => { setExpanded(open ? null : vm.id); markRead(vm); }}
                  className="w-full p-3 flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center relative shrink-0"
                    style={{ background: "rgba(46,155,220,0.12)", color: "var(--pp-brand-accent)" }}>
                    <VmIcon className="w-5 h-5" />
                    {!vm.is_read && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                        style={{ background: "var(--pp-brand-accent)", boxShadow: "0 0 0 2px var(--pp-bg-surface)" }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${vm.is_read ? "" : "font-semibold"}`} style={{ color: "var(--pp-text-primary)" }}>
                      {vm.from_name || vm.from_number || (console.warn("[MCalls/VM] unresolved voicemail", { id: vm.id, vm }), UNRESOLVED_FR)}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
                      {fmtVmDate(vm.received_at ?? vm.created_at)} · {fmtVmDur(vm.duration_seconds)}
                    </div>
                  </div>
                  {open ? <ChevronUp className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />
                        : <ChevronDown className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />}
                </button>

                {open && (
                  <div className="px-3 pb-3" style={{ borderTop: "1px solid var(--pp-bg-border)" }}>
                    <VmAudio vm={vm} />
                    <div className="mt-2">
                      {vm.transcript ? (
                        <div className="rounded-lg p-2 text-xs whitespace-pre-wrap"
                          style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
                          {vm.transcript}
                        </div>
                      ) : (
                        <button onClick={() => fetchTranscript(vm)}
                          className="w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
                          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
                          <FileText className="w-3.5 h-3.5" /> Obtenir la transcription
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 mt-3">
                      <VmAction icon={<Phone className="w-4 h-4" />} label="Rappeler" onClick={() => openDialer(vm.from_number ?? "")} accent />
                      {folder === "inbox" && <VmAction icon={<Save className="w-4 h-4" />} label="Garder" onClick={() => saveVm(vm)} />}
                      <VmAction icon={<Trash2 className="w-4 h-4" />} label="Suppr." onClick={() => removeVm(vm)} danger />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function VmAction({ icon, label, onClick, accent, danger }:
  { icon: React.ReactNode; label: string; onClick: () => void; accent?: boolean; danger?: boolean }) {
  const bg = danger ? "rgba(232,76,76,0.10)" : accent ? "rgba(46,155,220,0.12)" : "var(--pp-bg-elevated)";
  const color = danger ? "var(--pp-danger)" : accent ? "var(--pp-brand-accent)" : "var(--pp-text-secondary)";
  const border = danger ? "rgba(232,76,76,0.25)" : accent ? "rgba(46,155,220,0.30)" : "var(--pp-bg-border-2)";
  return (
    <button onClick={onClick}
      className="py-2 rounded-lg text-[11px] font-medium flex flex-col items-center gap-1 active:scale-95 transition"
      style={{ background: bg, color, border: `1px solid ${border}` }}>
      {icon}<span>{label}</span>
    </button>
  );
}

function VmAudio({ vm }: { vm: VM }) {
  const [src, setSrc] = useState<string | null>(vm.audio_url);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(vm.duration_seconds ?? 0);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    (async () => {
      if (src) return;
      const id = vm.ns_vm_id ?? vm.id;
      const { data } = await supabase.functions.invoke("pp-ns-voicemail", { body: { action: "audio", vm_id: id } });
      const url = (data as any)?.url ?? (data as any)?.audio_url;
      if (url) setSrc(url);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm.id]);

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };
  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };
  const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="rounded-lg p-3 mt-2"
      style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)" }}>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
          onEnded={() => setPlaying(false)}
          hidden
        />
      )}
      <div className="flex items-center gap-2">
        <button onClick={toggle} disabled={!src}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, var(--pp-brand-accent-2), var(--pp-brand-accent))" }}>
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <input type="range" min={0} max={dur || 0} step={0.1} value={progress}
          onChange={(e) => { const v = +e.target.value; setProgress(v); if (audioRef.current) audioRef.current.currentTime = v; }}
          className="flex-1" style={{ accentColor: "var(--pp-brand-accent)" }} />
        <span className="text-[10px] tabular-nums" style={{ color: "var(--pp-text-muted)" }}>
          {fmtT(progress)} / {fmtT(dur || 0)}
        </span>
        <button onClick={cycleSpeed}
          className="px-2 py-1 rounded text-[10px] font-semibold"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
          {speed}x
        </button>
      </div>
      {!src && <p className="text-[10px] mt-1" style={{ color: "var(--pp-text-faint)" }}>Chargement de l'audio…</p>}
    </div>
  );
}

