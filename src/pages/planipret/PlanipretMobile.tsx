import { FormEvent, useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Home, Phone, MessageSquare, Users, Phone as PhoneIcon, X, Delete, Plus, Lock, PhoneOff, Settings as SettingsIcon, Search as SearchIcon, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import planipretLogo from "@/assets/planipret-logo.png.asset.json";
import avaWordmark from "@/assets/ava-wordmark.svg";
import avaLogo from "@/assets/ava-statistics-logo.png.asset.json";
import { usePullToRefresh, PullIndicator } from "@/hooks/usePullToRefresh";
import { useRealtimeManager } from "@/hooks/useRealtimeManager";
import InboundCallOverlay, { type InboundCall } from "@/components/InboundCallOverlay";
import { OfflineBanner, PlanipretErrorBoundary } from "@/components/PlanipretErrorBoundary";
import SessionTimeoutModal from "@/components/planipret/SessionTimeoutModal";
import PrivacyConsentGate from "@/components/planipret/PrivacyConsentGate";
import UniversalSearchBar from "@/components/planipret/UniversalSearchBar";
import { OnboardingTutorial } from "@/components/planipret/OnboardingTutorial";

import { useAvaNavigation } from "@/hooks/useAvaNavigation";
import AvaVoiceAgent from "@/components/planipret/mobile/AvaVoiceAgent";
import AvaChatSheet from "@/components/planipret/mobile/AvaChatSheet";
import MobileAuthScreen from "@/components/planipret/mobile/MobileAuthScreen";
import MobileHeaderControls from "@/components/planipret/mobile/MobileHeaderControls";
import PpActiveCallScreen from "@/components/planipret/PpActiveCallScreen";
import { useMplanipretTheme } from "@/hooks/useMplanipretTheme";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { ROUTES } from "@/lib/routes";
import { recordRedirect } from "@/lib/debug/navDebug";
import { useMplanipretSoftphone } from "@/hooks/useMplanipretSoftphone";
import MicDeniedBanner from "@/components/planipret/mobile/MicDeniedBanner";
import PermissionsPrimer from "@/components/planipret/mobile/PermissionsPrimer";
import { hasSeenPrimer } from "@/lib/native/permissions/orchestrator";
import { bootstrapPushIfNative } from "@/lib/native/pushBootstrap";


const ACCENT = "#2E9BDC";

export type PlanipretMobileContext = { profile: any; reloadProfile: () => Promise<void>; openDialer: (number?: string) => void; openAva: () => void; registerRefresh: (fn: (() => Promise<void> | void) | null) => void; softphone: ReturnType<typeof useMplanipretSoftphone> };

const TABS = [
  { to: "/mplanipret/home", labelKey: "tabs.home", Icon: Home },
  { to: "/mplanipret/calls", labelKey: "tabs.calls", Icon: Phone },
  { to: "_fab", label: "", Icon: Home },
  { to: "/mplanipret/messages", labelKey: "tabs.messages", Icon: MessageSquare },
  { to: "/mplanipret/contacts", labelKey: "tabs.contacts", Icon: Users },
];


const KEYS: Array<{ d: string; l?: string }> = [
  { d: "1", l: "" }, { d: "2", l: "ABC" }, { d: "3", l: "DEF" },
  { d: "4", l: "GHI" }, { d: "5", l: "JKL" }, { d: "6", l: "MNO" },
  { d: "7", l: "PQRS" }, { d: "8", l: "TUV" }, { d: "9", l: "WXYZ" },
  { d: "*" }, { d: "0", l: "+" }, { d: "#" },
];

type DialerContact = {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  display_name?: string;
  phone?: string;
  cell_phone?: string;
  work_phone?: string;
  home_phone?: string;
  extension?: string;
  email?: string;
  company?: string;
  source?: "personal" | "shared" | "directory";
};

function contactDisplayName(c: DialerContact): string {
  return (
    c.display_name ||
    c.name ||
    [c.first_name, c.last_name].filter(Boolean).join(" ") ||
    c.email ||
    c.phone ||
    "—"
  );
}
function contactPrimaryPhone(c: DialerContact): string | undefined {
  return c.cell_phone || c.phone || c.work_phone || c.home_phone || c.extension;
}

function Dialer({ open, onClose, initial, openMessages, softphone }: { open: boolean; onClose: () => void; initial?: string; openMessages: (n?: string) => void; softphone: ReturnType<typeof useMplanipretSoftphone> }) {
  const { t } = useMplanipretLang();
  const [mode, setMode] = useState<"keypad" | "search">("keypad");
  const [number, setNumber] = useState("");
  const [calling, setCalling] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<DialerContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (open) { setNumber(initial ?? ""); setMode("keypad"); setQuery(""); } }, [open, initial]);
  const append = (c: string) => setNumber((n) => (n + c).slice(0, 20));
  const back = () => setNumber((n) => n.slice(0, -1));
  const startHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => { setNumber(""); holdTimer.current = null; }, 1000);
  };
  const endHold = () => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; back(); } };
  const startCall = async (destOverride?: string) => {
    const destination = destOverride ?? number;
    if (!destination) return;
    setMicDenied(false);
    setCalling(true);
    const result = await softphone.placeCall(destination);
    setCalling(false);
    if (!result.ok) {
      if ("micState" in result && (result.micState === "denied" || result.micState === "unavailable")) {
        setMicDenied(true);
        return;
      }
      toast.error(("error" in result && result.error) || t("dialer.callFailed"));
      return;
    }
    toast.success(t("dialer.callStarted"));
    setNumber("");
    onClose();
  };



  // Load contacts (personal + shared + directory) once when opening Search mode
  useEffect(() => {
    if (!open || mode !== "search" || contacts.length > 0 || loadingContacts) return;
    let cancelled = false;
    (async () => {
      setLoadingContacts(true);
      try {
        const results: DialerContact[] = [];
        const [personal, shared, directory] = await Promise.all([
          supabase.functions.invoke("pp-ns-contacts", { body: { action: "list" } }),
          supabase.functions.invoke("pp-ns-contacts", { body: { action: "shared" } }),
          supabase.functions.invoke("pp-ns-contacts", { body: { action: "directory" } }),
        ]);
        for (const c of ((personal.data as any)?.contacts ?? [])) results.push({ ...c, source: "personal" });
        for (const c of ((shared.data as any)?.contacts ?? [])) results.push({ ...c, source: "shared" });
        for (const c of ((directory.data as any)?.directory ?? [])) results.push({ ...c, source: "directory" });
        if (!cancelled) setContacts(results);
      } catch (e) {
        console.error("[Dialer] load contacts failed", e);
      } finally {
        if (!cancelled) setLoadingContacts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, mode, contacts.length, loadingContacts]);

  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? contacts.filter((c) => {
        const hay = [
          contactDisplayName(c),
          c.email,
          c.company,
          c.extension,
          c.phone,
          c.cell_phone,
          c.work_phone,
          c.home_phone,
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(normalized);
      }).slice(0, 30)
    : [];

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="absolute inset-x-0 bottom-0 z-30 flex flex-col"
          style={{
            height: "85%",
            background: "var(--pp-bg-surface)",
            border: "1px solid var(--pp-bg-border-2)",
            borderRadius: "24px 24px 0 0",
            boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
          }}
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 280 }}>
          <div className="pt-3 pb-2 flex flex-col items-center relative">
            <div style={{ width: 36, height: 4, background: "var(--pp-bg-border-2)", borderRadius: 2 }} />
            <button onClick={onClose} className="absolute right-3 top-3 p-2.5 rounded-full" style={{ color: "var(--pp-text-secondary)", minWidth: 44, minHeight: 44 }} aria-label={t("common.close")}><X className="w-5 h-5 mx-auto" /></button>
          </div>
          <div className="flex-1 flex flex-col px-6 pt-2 overflow-hidden">
            {/* Segmented control: Keypad / Search */}
            <div className="mx-auto flex items-center gap-1 p-1 rounded-full" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
              {(["keypad", "search"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="px-4 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5"
                  style={{
                    background: mode === m ? "var(--pp-bg-surface)" : "transparent",
                    color: mode === m ? "var(--pp-text-primary)" : "var(--pp-text-muted)",
                    boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.25)" : "none",
                    minHeight: 36,
                  }}
                >
                  {m === "keypad" ? <PhoneIcon className="w-3.5 h-3.5" /> : <SearchIcon className="w-3.5 h-3.5" />}
                  {t(m === "keypad" ? "dialer.modeKeypad" : "dialer.modeSearch")}
                </button>
              ))}
            </div>

            {mode === "keypad" ? (
              <>
                <div className="text-center min-h-[56px] flex items-center justify-center px-5 py-4">
                  <span style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 300,
                    fontSize: number ? 32 : 16,
                    color: number ? "var(--pp-text-primary)" : "var(--pp-text-faint)",
                    letterSpacing: "-0.01em",
                  }}>
                    {number || t("dialer.enterNumber")}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-1 mx-auto" style={{ maxWidth: 288 }}>
                  {KEYS.map((k) => (
                    <button key={k.d} onClick={() => append(k.d)}
                      className="flex flex-col items-center justify-center transition active:scale-[0.92] pp-keypad-btn"
                      style={{
                        width: 72, height: 72, borderRadius: "50%",
                        background: "var(--pp-bg-elevated)",
                        border: "1px solid var(--pp-bg-border-2)",
                      }}>
                      <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 26, color: "var(--pp-text-primary)", lineHeight: 1 }}>{k.d}</span>
                      {k.l && <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 9, color: "var(--pp-text-muted)", marginTop: 3, letterSpacing: "0.05em" }}>{k.l}</span>}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 items-center gap-3 mt-5 mx-auto" style={{ maxWidth: 288 }}>
                  <button onClick={() => append("+")} className="mx-auto flex items-center justify-center active:scale-95 transition"
                    style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-muted)" }} aria-label={t("dialer.plus")}>
                    <Plus className="w-5 h-5" />
                  </button>
                  <button onClick={() => startCall()} disabled={!number || calling}
                    className="mx-auto flex items-center justify-center text-white disabled:opacity-50 active:scale-95 transition"
                    style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, #0D5C2A, #00D4AA)", boxShadow: "0 4px 20px rgba(0,212,170,0.5)" }} aria-label={t("common.call")}>
                    <PhoneIcon className="w-7 h-7" />
                  </button>
                  <button
                    onPointerDown={startHold}
                    onPointerUp={endHold}
                    onPointerLeave={() => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; } }}
                    onContextMenu={(e) => { e.preventDefault(); setNumber(""); }}
                    className="mx-auto flex items-center justify-center active:scale-95 transition"
                    style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-muted)" }} aria-label={t("dialer.clear")}>
                    <Delete className="w-5 h-5" />
                  </button>
                </div>
                {calling && <div className="mt-4 text-center text-sm" style={{ color: "var(--pp-text-muted)" }}>{t("dialer.callInProgress")}</div>}
              </>
            ) : (
              <div className="flex-1 flex flex-col mt-3 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
                  <SearchIcon className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("dialer.searchPh")}
                    className="flex-1 bg-transparent outline-none text-sm"
                    style={{ color: "var(--pp-text-primary)" }}
                  />
                  {query && (
                    <button onClick={() => setQuery("")} aria-label={t("dialer.clear")} style={{ color: "var(--pp-text-muted)" }}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto mt-3 -mx-2 px-2 pb-4">
                  {loadingContacts && contacts.length === 0 ? (
                    <div className="text-center text-sm py-8" style={{ color: "var(--pp-text-muted)" }}>{t("dialer.searching")}</div>
                  ) : !normalized ? (
                    <div className="text-center text-sm py-8" style={{ color: "var(--pp-text-muted)" }}>{t("dialer.typeToSearch")}</div>
                  ) : filtered.length === 0 ? (
                    <div className="text-center text-sm py-8" style={{ color: "var(--pp-text-muted)" }}>{t("dialer.noResults")}</div>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {filtered.map((c, i) => {
                        const dest = contactPrimaryPhone(c);
                        const label = contactDisplayName(c);
                        return (
                          <li key={(c.id ?? "") + i} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)", color: "white" }}>
                              {label.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: "var(--pp-text-primary)" }}>{label}</div>
                              <div className="text-xs truncate" style={{ color: "var(--pp-text-muted)" }}>
                                {c.extension ? `#${c.extension}` : dest || c.email || ""}
                                {c.source === "directory" && ` · ${t("dialer.internal")}`}
                              </div>
                            </div>
                            <button
                              disabled={!dest || calling}
                              onClick={() => dest && startCall(dest)}
                              className="p-2 rounded-full text-white disabled:opacity-40 active:scale-95 transition"
                              style={{ background: "linear-gradient(135deg, #0D5C2A, #00D4AA)" }}
                              aria-label={t("common.call")}
                            >
                              <PhoneIcon className="w-4 h-4" />
                            </button>
                            <button
                              disabled={!dest}
                              onClick={() => dest && openMessages(dest)}
                              className="p-2 rounded-full disabled:opacity-40 active:scale-95 transition"
                              style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
                              aria-label={t("dialer.sms")}
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
      {micDenied && (
        <div className="absolute left-0 right-0 z-30 px-4" style={{ bottom: "calc(env(safe-area-inset-bottom,0px) + 96px)" }}>
          <MicDeniedBanner onDismiss={() => setMicDenied(false)} />
        </div>
      )}
    </AnimatePresence>
  );
}

export default function PlanipretMobile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, setLang } = useMplanipretLang();
  // REST-only call control: outbound calls ring the broker's registered mobile device.
  const softphone = useMplanipretSoftphone();
  const attachRestCall = (softphone as any).attachRestCall as ((a: any) => void) | undefined;
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<"unauthenticated" | "missing_profile" | "load_failed" | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [dialerOpen, setDialerOpen] = useState(false);
  const [dialerInit, setDialerInit] = useState<string | undefined>(undefined);
  const [unreadMsg, setUnreadMsg] = useState(0);
  const [unreadVm, setUnreadVm] = useState(0);
  const [inbound, setInbound] = useState<InboundCall>(null);
  const [avaOpen, setAvaOpen] = useState(false);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [showPrimer, setShowPrimer] = useState(false);
  const openDialer = (n?: string) => { setDialerInit(n); setDialerOpen(true); };
  const openAva = () => setAvaOpen(true);
  const refreshFn = useRef<(() => Promise<void> | void) | null>(null);
  const registerRefresh = (fn: (() => Promise<void> | void) | null) => { refreshFn.current = fn; };
  const handlePull = async () => { if (refreshFn.current) await refreshFn.current(); };
  const { ref: scrollRef, pullDist, refreshing, threshold } = usePullToRefresh(handlePull);

  const onInboundRinging = useCallback((row: any) => {
    const controlId = row.ns_callid ?? row.ns_call_id ?? row.call_id ?? row.id;
    attachRestCall?.({
      id: controlId,
      direction: "in",
      other: row.caller_name || row.from_name || row.from_number || row.number || "—",
      status: "ringing-in",
    });
    setInbound({ call_id: controlId, from_number: row.from_number, caller_name: row.caller_name });
  }, [attachRestCall]);
  const onAiInsight = useCallback((row: any) => {
    toast(t("toasts.aiAnalysisReady"), {
      description: String(row.ai_summary ?? "").slice(0, 80),
      duration: 8000,
      action: { label: t("common.view"), onClick: () => navigate(`/mplanipret/calls?call=${row.id}`) },
    });
  }, [navigate, t]);
  useRealtimeManager(profile?.user_id, { onInboundRinging, onAiInsight });
  useAvaNavigation(profile?.user_id);

  // Detect active outbound/in-progress call → FAB pulses red & hangs up on tap
  useEffect(() => {
    if (!profile?.user_id) return;
    const refreshActive = async () => {
      let q: any = supabase
        .from("planipret_phone_calls")
        .select("id,ns_call_id,ns_callid,status,direction,from_number,to_number,from_name,to_name,started_at,answered_at")
        .in("status", ["active", "in_progress", "answered", "ringing", "outbound_ringing"])
        .order("created_at", { ascending: false })
        .limit(1);
      const filters = [
        profile.id ? `user_id.eq.${profile.id}` : null,
        profile.user_id ? `user_id.eq.${profile.user_id}` : null,
        profile.ns_extension ? `extension.eq.${profile.ns_extension}` : null,
        profile.extension ? `extension.eq.${profile.extension}` : null,
      ].filter(Boolean).join(",");
      if (filters) q = q.or(filters);
      const { data } = await q.maybeSingle();
      const row = data as any;
      const controlId = row?.ns_callid ?? row?.ns_call_id ?? row?.id ?? null;
      setActiveCallId(controlId);
      if (!row?.id) attachRestCall?.(null);
      if (row?.id) {
        const out = row.direction === "outbound" || row.direction === "out";
        attachRestCall?.({
          id: controlId,
          direction: out ? "out" : "in",
          other: (out ? row.to_name || row.to_number : row.from_name || row.from_number) || "—",
          number: (out ? row.to_number : row.from_number) || "",
          status: String(row.status).includes("ring") ? (out ? "ringing-out" : "ringing-in") : "active",
          startedAt: row.answered_at ? new Date(row.answered_at).getTime() : row.started_at ? new Date(row.started_at).getTime() : Date.now(),
        });
      }
    };
    refreshActive();
    const ch = supabase
      .channel("mplanipret-active-call")
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_calls" }, refreshActive)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.user_id, attachRestCall]);

  const hangupActive = async () => {
    if (!activeCallId) return;
    softphone.hangup();
    const { error } = await supabase.functions.invoke("pp-ns-calls", { body: { action: "disconnect", call_id: activeCallId } });
    if (error) toast.error(t("dialer.hangupFailed")); else toast.success(t("dialer.hungUp"));
  };

  useEffect(() => {
    if (!profile?.user_id) return;
    const refreshCounts = async () => {
      const [{ count: mc }, { count: vc }] = await Promise.all([
        supabase.from("planipret_phone_messages").select("id", { count: "exact", head: true }).eq("user_id", profile.user_id).eq("direction", "inbound").is("read_at", null),
        supabase.from("planipret_voicemails").select("id", { count: "exact", head: true }).eq("user_id", profile.user_id).eq("folder", "inbox").eq("is_read", false),
      ]);
      setUnreadMsg(mc ?? 0); setUnreadVm(vc ?? 0);
    };
    refreshCounts();
    const ch = supabase
      .channel("mplanipret-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_messages", filter: `user_id=eq.${profile.user_id}` }, refreshCounts)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_voicemails", filter: `user_id=eq.${profile.user_id}` }, refreshCounts)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.user_id, location.pathname]);

  const loadProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) {
      recordRedirect(location.pathname, ROUTES.MPLANIPRET, "PlanipretMobile.loadProfile", "no auth session — stay inside mobile app");
      setProfile(null);
      setAccessError("unauthenticated");
      setLoading(false);
      return;
    }
    // Capture Microsoft 365 tokens once after Azure SSO redirect.
    try {
      const captured = sessionStorage.getItem("pp_ms_captured");
      if (session.provider_token && captured !== session.access_token) {
        await supabase.functions.invoke("ms365-store-session", {
          body: {
            provider_token: session.provider_token,
            provider_refresh_token: (session as any).provider_refresh_token ?? null,
            expires_in: 3600,
            email: user.email,
            display_name: (user.user_metadata as any)?.full_name ?? (user.user_metadata as any)?.name ?? null,
          },
        });
        sessionStorage.setItem("pp_ms_captured", session.access_token);
      }
    } catch (_) { /* non-blocking */ }
    const { data, error } = await supabase.from("planipret_profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (error) {
      recordRedirect(location.pathname, ROUTES.MPLANIPRET, "PlanipretMobile.loadProfile", "profile load failed");
      setAccessError("load_failed");
      setLoading(false);
      return;
    }
    if (!data) {
      recordRedirect(location.pathname, ROUTES.MPLANIPRET, "PlanipretMobile.loadProfile", "missing planipret_profiles row");
      setAccessError("missing_profile");
      setLoading(false);
      return;
    }
    setAccessError(null);
    setProfile(data);
    setLoading(false);
    // Hydrate FR/EN from DB (source of truth across devices)
    if (data.language === "fr" || data.language === "en") {
      if (data.language !== lang) setLang(data.language);
    } else {
      // Fallback: no language stored → use current detected lang and persist back
      const fallback: "fr" | "en" = lang === "en" ? "en" : "fr";
      setLang(fallback);
      try {
        await supabase.from("planipret_profiles").update({ language: fallback }).eq("user_id", user.id);
      } catch { /* non-blocking */ }
    }
  };

  const submitMobileLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!loginEmail || !loginPassword) return;
    setLoginLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword });
    setLoginLoading(false);
    if (error) {
      toast.error(error.message || t("home.connectionImpossible"));
      return;
    }
    // On native, show the VoIP rationale primer (which runs the permission flow).
    // On web, this is a no-op.
    void hasSeenPrimer().then((seen) => { if (!seen) setShowPrimer(true); });
    toast.success(t("auth.success"));
    setLoading(true);
    await loadProfile();
  };

  useEffect(() => {
    loadProfile();
    if (location.pathname === ROUTES.MPLANIPRET) navigate(ROUTES.MPLANIPRET_HOME, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bootstrap push listeners + prompt primer once the profile is loaded (native only).
  useEffect(() => {
    if (!profile?.user_id) return;
    const ext = profile?.ns_extension || profile?.extension || "";
    void bootstrapPushIfNative(ext);
    void hasSeenPrimer().then((seen) => { if (!seen) setShowPrimer(true); });
  }, [profile?.user_id, profile?.ns_extension, profile?.extension]);

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#F7F9FC", color: "#5A6B85", fontFamily: "Urbanist,sans-serif" }}>{t("common.loading")}</div>;

  if (accessError === "unauthenticated") {
    return (
      <Frame>
        <MobileAuthScreen onLoggedIn={loadProfile} />
      </Frame>
    );
  }

  if (accessError) {
    return (
      <Frame>
        <div className="h-full flex items-center justify-center p-6" style={{ background: "var(--pp-bg-base)" }}>
          <div className="pp-card p-6 text-center max-w-xs" style={{ padding: 24 }}>
            <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(46,155,220,0.12)", color: "var(--pp-brand-accent)" }}>
              <Lock className="w-7 h-7" />
            </div>
            <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 18, color: "var(--pp-text-primary)", marginBottom: 8 }}>
              {t("access.missingTitle")}
            </h2>
            <p style={{ fontSize: 13, color: "var(--pp-text-secondary)", marginBottom: 16 }}>
              {accessError === "missing_profile"
                ? t("access.missingProfile")
                : t("access.loadFailed")}
            </p>
            <button onClick={loadProfile} className="pp-btn-primary inline-block">{t("common.retry")}</button>
          </div>
        </div>
      </Frame>
    );
  }

  if (profile && profile.mobile_app_enabled === false) {
    return (
      <Frame>
        <div className="h-full flex items-center justify-center p-6" style={{ background: "var(--pp-bg-base)" }}>
          <div className="pp-card p-6 text-center max-w-xs" style={{ padding: 24 }}>
            <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(46,155,220,0.12)", color: "var(--pp-brand-accent)" }}>
              <Lock className="w-7 h-7" />
            </div>
            <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 18, color: "var(--pp-text-primary)", marginBottom: 8 }}>{t("access.notActivated")}</h2>
            <p style={{ fontSize: 13, color: "var(--pp-text-secondary)", marginBottom: 16 }}>{t("access.notActivatedDesc")}</p>
            <a href="mailto:support@avastatistic.ca" className="pp-btn-primary inline-block">{t("access.contactSupport")}</a>
          </div>
        </div>
      </Frame>
    );
  }


  return (
    <Frame>
      {showPrimer && (
        <PermissionsPrimer
          extension={profile?.ns_extension || profile?.extension || ""}
          onDone={() => setShowPrimer(false)}
        />
      )}
      <div className="h-full flex flex-col relative overflow-hidden" style={{ background: "var(--pp-bg-base)" }}>

        {/* Top brand header — AVA (left) · Planiprêt (center) · Settings (right) */}
        <header
          className="relative flex items-center px-4 pp-mobile-header"
          style={{ marginTop: "calc(env(safe-area-inset-top, 0px) + 56px)", paddingTop: 18, paddingBottom: 12 }}
        >

          {/* AVA icon — left */}
          <div className="flex items-center gap-1.5">
            <img src={avaLogo.url} alt="AVA" className="w-7 h-7 rounded-lg object-cover"
              style={{ boxShadow: "0 0 12px rgba(155,127,232,0.45)" }} />
            <span className="flex items-center gap-1.5">
              <span className="pp-live-dot" />
              <span style={{ fontSize: 9, color: "var(--pp-success)", fontWeight: 700, letterSpacing: "0.05em" }}>REST</span>
            </span>
          </div>

          {/* Settings button — between AVA (left) and Planiprêt (center) */}
          <button
            type="button"
            onClick={() => navigate("/mplanipret/more")}
            aria-label="Paramètres"
            className="ml-3 flex items-center justify-center active:scale-95 transition"
            style={{
              width: 32, height: 32, borderRadius: 10,
              background: "var(--pp-bg-elevated)",
              border: "1px solid var(--pp-bg-border-2)",
              color: "var(--pp-text-secondary)",
            }}
          >
            <SettingsIcon className="w-4 h-4" />
          </button>

          {/* Planiprêt centered logo */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
            <img src={planipretLogo.url} alt="Planiprêt" className="w-7 h-7 rounded-lg object-cover" />
            <span style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 14, color: "var(--pp-text-primary)", letterSpacing: "-0.01em" }}>Planiprêt</span>
          </div>

          {/* Lang + theme + profile — right */}
          <MobileHeaderControls profile={profile} reloadProfile={loadProfile} />

        </header>

        <UniversalSearchBar />
        <div ref={scrollRef} className="flex-1 overflow-y-auto pb-[110px]">
          <PullIndicator pullDist={pullDist} refreshing={refreshing} threshold={threshold} color={ACCENT} />
          <PlanipretErrorBoundary key={location.pathname}>
            <Outlet context={{ profile, reloadProfile: loadProfile, openDialer, openAva, registerRefresh, softphone } satisfies PlanipretMobileContext} />
          </PlanipretErrorBoundary>
        </div>
        <SessionTimeoutModal />
        {profile && <PrivacyConsentGate profile={profile} onAccepted={loadProfile} />}
        {profile && profile.consent_accepted_at && !profile.onboarding_completed && (
          <OnboardingTutorial profile={profile} onDone={loadProfile} />
        )}

        {/* Center FAB — AVA (voice if enabled, chat otherwise) */}
        <button onClick={openAva}
          className="absolute left-1/2 -translate-x-1/2 z-20 rounded-full flex items-center justify-center active:scale-95 transition overflow-hidden"
          style={{
            background: profile?.voice_agent_enabled
              ? "linear-gradient(135deg, #2D1A5A, #9B7FE8, #E84CC9)"
              : "linear-gradient(135deg, #1E3A8A, #6366F1, #9B7FE8)",
            boxShadow: profile?.voice_agent_enabled
              ? "0 6px 28px rgba(232,76,201,0.55), 0 0 0 2px rgba(155,127,232,0.25)"
              : "0 6px 24px rgba(99,102,241,0.5), 0 0 0 2px rgba(99,102,241,0.2)",
            animation: profile?.voice_agent_enabled ? "pp-glow-purple 2s ease-in-out infinite" : undefined,
            width: 62, height: 62, bottom: 74, padding: 3,
          }}
          aria-label={profile?.voice_agent_enabled ? t("dialer.talkToAva") : t("dialer.chatWithAva")}>
          <img src={avaLogo.url} alt="AVA" className="w-full h-full rounded-full object-cover"
            style={{ background: "#060D1A" }} />
        </button>

        {/* Right FAB — Keypad (bleu) ou raccrocher (rouge) si appel actif */}
        <button onClick={activeCallId ? hangupActive : () => setDialerOpen(true)}
          className="absolute z-20 rounded-full flex items-center justify-center text-white active:scale-95 transition"
          style={{
            right: 18, bottom: 84,
            background: activeCallId
              ? "linear-gradient(135deg, #5A1010, #E84C4C)"
              : "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
            boxShadow: activeCallId
              ? "0 4px 20px rgba(232,76,76,0.6)"
              : "0 4px 20px rgba(46,155,220,0.55)",
            animation: activeCallId ? "pp-pulse-red 1.5s infinite" : undefined,
            width: 50, height: 50,
          }}
          aria-label={activeCallId ? t("dialer.hangup") : t("dialer.dialNumber")}>
          {activeCallId ? <PhoneOff className="w-5 h-5" /> : <PhoneIcon className="w-5 h-5" />}
        </button>


        {/* Tab bar (5 tabs + center FAB placeholder = 5 grid columns) */}
        <nav className="absolute bottom-[22px] inset-x-0 grid grid-cols-5 z-10 pp-mobile-tabbar"
          style={{ height: 70 }}>

          {TABS.map((tabItem) => {
            if (tabItem.to === "_fab") return <div key="fab-slot" />;
            const badge = tabItem.to.endsWith("/messages") ? unreadMsg : 0;
            return (
              <NavLink key={tabItem.to} to={tabItem.to}
                className="relative flex flex-col items-center justify-center gap-1 text-[9px] font-semibold pt-1.5"
                style={({ isActive }) => ({ color: isActive ? "var(--pp-brand-accent)" : "var(--pp-text-faint)" })}>
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute top-1 w-1 h-1 rounded-full" style={{ background: "var(--pp-brand-accent)" }} />
                    )}
                    <div className="relative">
                      <tabItem.Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.4 : 1.8} />
                      {badge > 0 && (
                        <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
                          style={{ background: "var(--pp-danger)" }}>
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </div>
                    <span style={{ letterSpacing: "0.02em" }}>{"labelKey" in tabItem ? t(tabItem.labelKey) : ""}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>


        {/* Powered by AVA footer */}
        <div className="absolute bottom-0 inset-x-0 h-[24px] flex items-center justify-center gap-2 z-10 pp-mobile-footer">
          <span style={{ fontFamily: "Urbanist,sans-serif", fontSize: 9, color: "var(--pp-text-muted)", letterSpacing: "0.14em", fontWeight: 600 }}>{t("footer.poweredBy")}</span>
          <img src={avaLogo.url} alt="AVA" className="w-3.5 h-3.5 rounded object-cover" />
          <span style={{ fontFamily: "Urbanist,sans-serif", fontSize: 9, color: "var(--pp-brand-accent-2)", letterSpacing: "0.10em", fontWeight: 700 }}>AVA</span>
          <span style={{ fontSize: 8.5, color: "var(--pp-text-faint)", letterSpacing: "0.1em" }}>· {t("footer.developedBy")}</span>
        </div>


        <Dialer open={dialerOpen} onClose={() => setDialerOpen(false)} initial={dialerInit} openMessages={(n) => { setDialerOpen(false); navigate(`/mplanipret/messages${n ? `?to=${encodeURIComponent(n)}` : ""}`); }} softphone={softphone} />
        <PpActiveCallScreen softphone={softphone} />
        <InboundCallOverlay call={inbound} onClose={() => setInbound(null)} />
        {avaOpen && profile?.user_id && (
          profile.voice_agent_enabled
            ? <AvaVoiceAgent userId={profile.user_id} onClose={() => setAvaOpen(false)} />
            : <AvaChatSheet userId={profile.user_id} onClose={() => setAvaOpen(false)} />
        )}
        <OfflineBanner />
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { theme } = useMplanipretTheme();
  return (
    <div className="planipret-scope planipret-mobile-scope planipret-mobile-frame-bg min-h-screen w-full flex items-center justify-center md:p-6"
      data-pp-theme={theme}
      style={{ background: theme === "dark"
        ? "linear-gradient(160deg, #060D1A 0%, #0A1425 100%)"
        : "linear-gradient(160deg, #EEF2F8 0%, #DCE3EC 100%)" }}>
      <div id="pp-mobile-frame" className="planipret-mobile-phone overflow-hidden w-full md:w-[390px] md:h-[844px] h-screen md:rounded-[44px] relative"
        style={{
          background: "var(--pp-bg-base)",
          border: "1px solid var(--pp-bg-border-2)",
          boxShadow: theme === "dark"
            ? "0 0 0 6px #08111F, 0 40px 120px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)"
            : "0 0 0 6px #FFFFFF, 0 40px 120px rgba(15,27,61,0.18), inset 0 1px 0 rgba(255,255,255,0.6)",
        }}>
        <div className="pp-aurora-bg" aria-hidden="true" />
        <div className="relative z-[1] h-full w-full">{children}</div>
      </div>
    </div>
  );
}


