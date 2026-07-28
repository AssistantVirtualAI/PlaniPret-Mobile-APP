import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  User, Lock, Phone, Info, Mail, Bell, Moon, HelpCircle, MessageCircle,
  LogOut, Trash2, ChevronRight, Bot, Sparkles, X, Download, Shield, BellOff,
  Settings as SettingsIcon, BarChart3, Voicemail, Edit3, Languages, Camera,
} from "lucide-react";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import { usePlanipretPush } from "@/hooks/usePlanipretPush";
import { Ms365ScopesCard } from "@/components/planipret/Ms365ScopesCard";
import { SiriShortcutsCard } from "@/components/planipret/SiriShortcutsCard";
import { safeEdgeFunction } from "@/lib/safeEdgeFunction";
import MNetworkSection from "@/components/planipret/mobile/MNetworkSection";
import MCallAudioSettings from "@/components/planipret/mobile/MCallAudioSettings";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { useMplanipretTheme } from "@/hooks/useMplanipretTheme";
import Ms365StatusBadge from "@/components/planipret/Ms365StatusBadge";
import { openMs365Authorize } from "@/lib/ms365OAuth";
import { useMplanipretSoftphone } from "@/hooks/useMplanipretSoftphone";
import { ppSipProvider, type PpSipSnapshot } from "@/lib/planipret/sip/ppSipProvider";
import { Radio } from "lucide-react";
import { ms365Connected } from "@/lib/planipret/ms365Connected";
import MaestroConnectCard from "@/components/planipret/mobile/MaestroConnectCard";
import { Link2 } from "lucide-react";

const initials = (name?: string) =>
  (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

export default function MMore() {
  const { profile, reloadProfile } = useOutletContext<PlanipretMobileContext>();
  const { t, lang, setLang } = useMplanipretLang();
  const { theme, toggle: toggleTheme } = useMplanipretTheme();
  const darkMode = theme === "dark";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [editOpen, setEditOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [dndOpen, setDndOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState<boolean>(() => localStorage.getItem("planipret_notif") === "1");
  const [agentOn, setAgentOn] = useState<boolean>(() => localStorage.getItem("planipret_agent_on") !== "0");
  const [monthStats, setMonthStats] = useState<{ calls: number; leads: number; sms: number; rate: number }>({ calls: 0, leads: 0, sms: 0, rate: 0 });
  const [ms365Detection, setMs365Detection] = useState<{
    tenant_id: string | null; client_id: string | null; loading: boolean;
  }>({ tenant_id: null, client_id: null, loading: true });

  const loadMs365Detection = async () => {
    setMs365Detection((d) => ({ ...d, loading: true }));
    const { data } = await supabase.functions.invoke("ms365-status", { body: {} });
    const pc = (data as any)?.detection ?? {};
    setMs365Detection({ tenant_id: pc.tenant_id ?? null, client_id: pc.client_id ?? null, loading: false });
  };
  useEffect(() => { loadMs365Detection(); }, []);

  useEffect(() => {
    if (params.get("ms365") === "ok") {
      toast.success(t("more.msConnected"));
      reloadProfile();
    }
  }, [params, t, reloadProfile]);

  // Load real performance stats (calls + SMS + leads this month)
  useEffect(() => {
    (async () => {
      if (!profile?.id) return;
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const sb: any = supabase;
      const [callsRes, smsRes, leadsRes] = await Promise.all([
        sb.from("planipret_phone_calls").select("id, duration_seconds").eq("user_id", profile.user_id).gte("started_at", start.toISOString()),
        sb.from("planipret_phone_messages").select("id").eq("user_id", profile.user_id).gte("created_at", start.toISOString()),
        sb.from("planipret_contacts").select("id").eq("user_id", profile.user_id).gte("created_at", start.toISOString()),
      ]);
      const callsArr: any[] = callsRes?.data ?? [];
      const total = callsArr.length;
      const connected = callsArr.filter((c) => (c.duration_seconds ?? 0) > 10).length;
      const rate = total ? Math.round((connected / total) * 100) : 0;
      setMonthStats({ calls: total, sms: (smsRes?.data ?? []).length, leads: (leadsRes?.data ?? []).length, rate });
    })();
  }, [profile?.id, profile?.user_id]);

  const { sipConnected, reregister } = useMplanipretSoftphone();
  const nsConnected = !!(profile?.ns_extension ?? profile?.extension) && sipConnected;
  const isMs365Connected = ms365Connected(profile);

  const [sipSnap, setSipSnap] = useState<PpSipSnapshot>(() => ppSipProvider.getSnapshot());
  useEffect(() => ppSipProvider.subscribe(setSipSnap), []);
  const sipStatusColor: Record<string, string> = {
    idle: "#94A3B8", connecting: "#F59E0B", connected: "#3B82F6",
    registered: "#10B981", disconnected: "#94A3B8", error: "#EF4444",
  };
  const sipStatusLabel = sipSnap.status === "registered"
    ? (lang === "en" ? "Registered" : "Enregistré")
    : sipSnap.status === "connecting"
    ? (lang === "en" ? "Connecting…" : "Connexion…")
    : sipSnap.status === "connected"
    ? (lang === "en" ? "Connected (not registered)" : "Connecté (non enregistré)")
    : sipSnap.status === "error"
    ? (lang === "en" ? "Error" : "Erreur")
    : sipSnap.status === "disconnected"
    ? (lang === "en" ? "Disconnected" : "Déconnecté")
    : (lang === "en" ? "Idle" : "Inactif");

  const reconnectNs = async () => {
    setReconnecting(true);
    const { data, error, status } = await safeEdgeFunction("ns-resolve-sip-credentials", { body: { client_type: "mobile" } });
    if (error || (data as any)?.success === false || (data as any)?.ok === false || (data as any)?.error) {
      setReconnecting(false);
      toast.error(status === 403 ? t("more.phoneUnauthorized") : ((data as any)?.error ?? error ?? t("more.connectionFailed")));
      return;
    }
    await reloadProfile();
    try { window.dispatchEvent(new CustomEvent("pp:sip-force-reregister", { detail: { force: true } })); } catch {}
    try { reregister?.(); } catch {}
    setReconnecting(false);
    toast.success(t("more.phoneConnected"));
  };

  const startMs365OAuth = (cfg: { client_id: string; tenant_id?: string }) => {
    const clientId = cfg.client_id;
    const tenant = cfg.tenant_id || "common";
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const state = user?.id ?? "";
      await openMs365Authorize({ clientId, tenant, state });
    });
  };

  const connectMs365 = async () => {
    const { data, error } = await supabase.functions.invoke("ms365-status", { body: {} });
    if (error) { toast.error("Configuration Microsoft inaccessible", { description: error.message }); return; }
    const cfg = ((data as any)?.detection ?? {}) as any;
    if (!cfg.client_id) { toast.error("Microsoft 365 n'est pas configuré côté admin"); return; }
    startMs365OAuth({ ...cfg, client_id: cfg.client_id });
  };

  const disconnectMs365 = async () => {
    if (!confirm(t("more.disconnectMs"))) return;
    await supabase.from("planipret_profiles").update({ ms365_access_token: null, ms365_refresh_token: null } as any).eq("user_id", profile.user_id);
    await reloadProfile();
    toast.success(t("more.msDisconnected"));
  };

  const toggleNotif = async (on: boolean) => {
    if (on && "Notification" in window) {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast.error(t("more.permissionDenied")); return; }
    }
    setNotifEnabled(on);
    localStorage.setItem("planipret_notif", on ? "1" : "0");
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const logout = async () => {
    if (!confirm(t("more.logoutConfirm"))) return;
    await supabase.auth.signOut();
    toast.success(t("more.logoutSuccess"));
    navigate("/login", { replace: true });
  };

  return (
    <div className="p-4 pb-2 space-y-4" style={{ background: "var(--pp-bg-deep)", minHeight: "100%" }}>
      {/* Profile hero */}
      <header
        className="pp-card flex items-center gap-3"
        style={{ padding: 14, background: "linear-gradient(135deg, rgba(46,155,220,0.10), rgba(155,127,232,0.06))" }}
      >
        <div
          className="flex items-center justify-center font-bold text-white relative"
          style={{
            width: 64, height: 64, borderRadius: "50%",
            background: profile?.avatar_url ? "transparent" : "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
            fontSize: 22, fontFamily: "Inter, sans-serif",
            boxShadow: "0 8px 24px -8px rgba(46,155,220,0.55)",
            overflow: "hidden",
          }}
        >
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initials(profile?.full_name)
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate" style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 17, color: "var(--pp-text-primary)" }}>
              {profile?.full_name ?? t("home.broker")}
            </p>
          </div>
          <p className="truncate" style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12, color: "var(--pp-text-muted)" }}>
            {profile?.extension ? `Ext ${profile.extension} · ${profile?.ns_domain ?? "planipret"}` : profile?.email}
          </p>
        </div>
        <button
          onClick={() => setEditOpen(true)}
          className="flex items-center gap-1.5 active:scale-95 transition"
          style={{
            padding: "6px 10px", borderRadius: 10,
            background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)",
            color: "var(--pp-text-secondary)", fontSize: 11, fontFamily: "DM Sans,sans-serif", fontWeight: 600,
          }}
        >
          <Edit3 className="w-3 h-3" /> {t("more.edit")}
        </button>
      </header>

      {/* Month stats — real data */}
      <div className="grid grid-cols-4 gap-2">
        <MiniStat label={lang === "en" ? "Calls" : "Appels"} value={monthStats.calls} accent="var(--pp-brand-accent)" />
        <MiniStat label="SMS" value={monthStats.sms} accent="#2E9BDC" />
        <MiniStat label={lang === "en" ? "Leads" : "Leads"} value={monthStats.leads} accent="var(--pp-color-success)" />
        <MiniStat label={lang === "en" ? "Rate" : "Taux"} value={`${monthStats.rate}%`} accent="var(--pp-color-agent)" />
      </div>

      <Section title={t("more.sections.pipeline")}>
        <Row icon={<Sparkles className="w-4 h-4" />} label={lang === "en" ? "Chat with AVA" : "Discuter avec AVA"} sub={lang === "en" ? "Personal AI assistant" : "Assistante IA personnelle"} onClick={() => navigate("/mplanipret/ava")} chevron />
        <Row icon={<Bell className="w-4 h-4" />} label={lang === "en" ? "AVA Notifications" : "Notifications AVA"} sub={lang === "en" ? "History & deep links" : "Historique et deep links"} onClick={() => navigate("/mplanipret/notifications")} chevron />
        <Row icon={<BarChart3 className="w-4 h-4" />} label={t("more.pipelineFiles")} onClick={() => navigate("/mplanipret/pipeline")} chevron />
        <Row icon={<BarChart3 className="w-4 h-4" />} label={t("more.performance")} onClick={() => navigate("/mplanipret/stats")} chevron />
      </Section>

      <Section title={t("more.sections.account")}>
        <Row icon={<User className="w-4 h-4" />} label={t("more.myProfile")} onClick={() => setEditOpen(true)} chevron />
        <Row icon={<Lock className="w-4 h-4" />} label={t("more.changePassword")} onClick={() => setPwOpen(true)} chevron />
        <Row icon={<Download className="w-4 h-4" />} label={t("more.myData")} sub={t("more.myDataSub")}
          onClick={async () => {
            toast.info(t("more.preparingExport"));
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pp-gdpr-export`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
              body: JSON.stringify({ broker_id: profile.id }),
            });
            if (!res.ok) { toast.error(t("more.exportFailed")); return; }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `mes-donnees-planipret.json`; a.click();
            URL.revokeObjectURL(url);
            toast.success(t("more.exportDownloaded"));
          }} chevron />
      </Section>

      <Section title={t("more.sections.phone")}>
        <Row
          icon={<Phone className="w-4 h-4" />}
          label={t("more.phoneConnection")}
          onClick={reconnectNs}
          right={<StatusPill ok={nsConnected} label={reconnecting ? "…" : nsConnected ? t("more.connected") : t("home.offline")} />}
        />
        <Row icon={<Info className="w-4 h-4" />} label={t("more.myExtension")}
          onClick={() => navigate("/mplanipret/extension-sync")}
          right={<span style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>{profile?.ns_extension ?? profile?.extension ?? "—"}</span>} chevron />
        <Row icon={<Voicemail className="w-4 h-4" />} label={t("more.voicemail")}
          onClick={() => navigate("/mplanipret/calls?tab=voicemails")} chevron />
        <Row
          icon={<Radio className="w-4 h-4" style={{ color: sipStatusColor[sipSnap.status] }} />}
          label={lang === "en" ? "SIP Status" : "État SIP"}
          sub={sipSnap.errorCause ? `${sipStatusLabel} — ${sipSnap.errorCause}` : sipStatusLabel}
          onClick={() => navigate("/mplanipret/sip-debug")}
          right={<span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: sipStatusColor[sipSnap.status], color: "#fff" }}>{sipSnap.status.toUpperCase()}</span>}
          chevron
        />
      </Section>

      <Section title={t("more.sections.availability")}>
        <Row
          icon={<BellOff className="w-4 h-4" style={profile?.dnd_enabled ? { color: "var(--pp-color-danger)" } : undefined} />}
          label={t("more.dnd")}
          sub={profile?.dnd_enabled ? t("more.dndActiveSub") : t("more.inactive")}
          right={<Toggle on={!!profile?.dnd_enabled} onChange={async (v) => {
            await supabase.from("planipret_profiles").update({ dnd_enabled: v } as any).eq("user_id", profile.user_id);
            await reloadProfile();
            toast.success(v ? t("more.dndEnabled") : t("home.dndDisabled"));
          }} />}
        />
        <Row icon={<SettingsIcon className="w-4 h-4" />} label={t("more.configureDnd")} onClick={() => setDndOpen(true)} chevron />
      </Section>

      {/* Maestro CRM Integration */}
      <Section title={lang === "en" ? "Maestro CRM" : "Maestro CRM"}>
        <div className="px-3 py-2">
          <MaestroConnectCard profile={profile} onUpdated={reloadProfile} />
        </div>
      </Section>

      <Section title={t("more.sections.integrations")}>
        <div className="px-3 pb-2 flex items-center justify-between gap-2">
          <Ms365StatusBadge />
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/mplanipret/diagnostics")} className="text-[11px] font-semibold" style={{ color: "#22c55e" }}>Endpoints →</button>
            <button onClick={() => navigate("/mplanipret/ms365-diagnostics")} className="text-[11px] font-semibold" style={{ color: "#3B82F6" }}>M365 →</button>
          </div>
        </div>
        <Row
          icon={<Mail className="w-4 h-4" />}
          label="Microsoft 365"
          sub={
            ms365Detection.loading ? (lang === "en" ? "Detecting…" : "Détection…")
              : ms365Detection.tenant_id || ms365Detection.client_id
                ? `Tenant ${ms365Detection.tenant_id ? "✓" : "✗"} · Client ${ms365Detection.client_id ? "✓" : "✗"}${isMs365Connected ? (lang === "en" ? " · Authenticated" : " · Authentifié") : (lang === "en" ? " · Not authenticated" : " · Non authentifié")}`
                : (lang === "en" ? "Backend config not found" : "Configuration backend introuvable")
          }
          onClick={isMs365Connected ? disconnectMs365 : connectMs365}
          right={<StatusPill ok={isMs365Connected} label={isMs365Connected ? t("more.connected") : "—"} />} chevron />
        <div style={{ padding: "0 12px 8px" }}>
          <div className="rounded-lg" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", padding: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--pp-text-muted)", letterSpacing: "0.06em", marginBottom: 6 }}>
              🔎 {lang === "en" ? "DETECTED CONFIG" : "CONFIG DÉTECTÉE"}
            </div>
            <div style={{ fontSize: 11, color: "var(--pp-text-secondary)", fontFamily: "monospace", lineHeight: 1.5 }}>
              <div>Tenant: {ms365Detection.loading ? "…" : (ms365Detection.tenant_id ?? "—")}</div>
              <div>Client: {ms365Detection.loading ? "…" : (ms365Detection.client_id ?? "—")}</div>
              <div>Auth  : {isMs365Connected ? "✅ token actif" : "⚠️ non lié"}</div>
            </div>
          </div>
        </div>
        {isMs365Connected && (
          <div style={{ padding: 8 }}>
            <Ms365ScopesCard profile={profile} onReconnect={connectMs365} />
          </div>
        )}
      </Section>

      <div className="pp-card" style={{ padding: 4 }}>
        <SiriShortcutsCard />
      </div>

      {profile?.voice_agent_enabled && (
        <Section title={t("more.sections.assistant")}>
          <Row icon={<Bot className="w-4 h-4" style={{ color: "var(--pp-color-agent)" }} />} label={t("more.voiceAssistant")}
            sub={t("more.voiceAssistantSub")}
            right={<Toggle on={agentOn} onChange={(v) => { setAgentOn(v); localStorage.setItem("planipret_agent_on", v ? "1" : "0"); }} />} />
          <Row icon={<Sparkles className="w-4 h-4" />} label={t("more.customizeAva")} onClick={() => setCustomizeOpen(true)} chevron />
        </Section>
      )}

      <Section title={t("more.sections.prefs")}>
        <Row icon={<Bell className="w-4 h-4" />} label={t("more.notifications")} right={<Toggle on={notifEnabled} onChange={toggleNotif} />} />
        <Row icon={<Moon className="w-4 h-4" />} label={t("more.darkMode")} right={<Toggle on={darkMode} onChange={toggleTheme} />} />
        <Row
          icon={<Languages className="w-4 h-4" />}
          label={t("more.language")}
          right={
            <div className="flex items-center gap-1 p-1 rounded-full" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
              {(["fr", "en"] as const).map((l) => {
                const active = lang === l;
                return (
                  <button
                    key={l}
                    onClick={async () => {
                      setLang(l);
                      if (profile?.user_id) {
                        await supabase.from("planipret_profiles").update({ language: l } as any).eq("user_id", profile.user_id);
                        await reloadProfile();
                      }
                    }}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition"
                    style={{
                      background: active ? "linear-gradient(135deg, #1A4A8A, #2E9BDC)" : "transparent",
                      color: active ? "#fff" : "var(--pp-text-muted)",
                    }}
                    aria-label={l === "fr" ? "Français" : "English"}
                  >
                    {l === "fr" ? "FR" : "EN"}
                  </button>
                );
              })}
            </div>
          }
        />
      </Section>

      <MNetworkSection />
      <MCallAudioSettings />
      <NotificationsSection profile={profile} reloadProfile={reloadProfile} />

      <Section title={t("more.sections.support")}>
        <Row icon={<HelpCircle className="w-4 h-4" />} label={t("more.helpCenter")} onClick={() => setHelpOpen(true)} chevron />
        <Row icon={<MessageCircle className="w-4 h-4" />} label={t("more.contactSupport")}
          onClick={() => { window.location.href = "mailto:support@avastatistic.ca?subject=Support%20Planipr%C3%AAt%20AI%20Portal"; }} chevron />
        <Row icon={<Shield className="w-4 h-4" />} label={t("more.privacy")} onClick={() => setPrivacyOpen(true)} chevron />
        <Row icon={<SettingsIcon className="w-4 h-4" />} label={t("more.diagnostic")} sub={t("more.diagnosticSub")}
          onClick={async () => {
            toast.info(t("more.diagnosticRunning"));
            const sb: any = supabase;
            const { data: lastCall } = await sb
              .from("planipret_phone_calls")
              .select("id, ns_call_id")
              .eq("user_id", profile.id)
              .order("started_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (!lastCall?.id) { toast.error(t("more.diagnosticNoCall")); return; }
            const { data, error } = await supabase.functions.invoke("pp-call-e2e-check", { body: { call_id: (lastCall as any).ns_call_id ?? lastCall.id } });
            if (error) { toast.error(error.message ?? t("more.diagnosticFailed")); return; }
            const r = (data as any)?.report ?? {};
            const flags = [
              `Ext: ${r.extension?.ok ? "✓" : "✗"}`,
              `Rec: ${r.recording?.ok ? "✓" : "✗"}`,
              `Tx: ${r.transcript?.ok ? "✓" : "✗"}`,
              `AI: ${r.ai_actions?.ok ? "✓" : "✗"}`,
            ].join(" · ");
            ((data as any)?.coherent ? toast.success : toast.warning)(`${t("more.diagnostic")}: ${flags}`);
          }} chevron />
        <Row icon={<Info className="w-4 h-4" />} label={t("more.appVersion")} right={<span style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>v1.0.0 (build 1)</span>} />
      </Section>

      <button
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 active:scale-[0.99] transition"
        style={{
          padding: "14px 16px", borderRadius: 14,
          background: "rgba(232,76,76,0.08)", border: "1px solid rgba(232,76,76,0.25)",
          color: "var(--pp-color-danger)", fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 14,
        }}
      >
        <LogOut className="w-4 h-4" /> {t("common.logout")}
      </button>

      {/* App Store guideline 5.1.1(v) / Play data-deletion policy */}
      <button
        onClick={() => setDeleteOpen(true)}
        className="w-full flex items-center justify-center gap-2 active:scale-[0.99] transition"
        style={{
          padding: "12px 16px", borderRadius: 14, background: "transparent",
          border: "1px solid rgba(232,76,76,0.18)",
          color: "var(--pp-color-danger)", fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 13,
        }}
      >
        <Trash2 className="w-4 h-4" /> {t("more.deleteAccount")}
      </button>

      {deleteOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => !deleting && setDeleteOpen(false)}
        >
          <div className="w-full pp-card" style={{ margin: 12, padding: 18, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{t("more.deleteAccount")}</h3>
            <p style={{ fontSize: 13, color: "var(--pp-text-faint)", marginBottom: 16 }}>{t("more.deleteAccountWarning")}</p>
            <div className="flex gap-8">
              <button onClick={() => setDeleteOpen(false)} disabled={deleting} className="flex-1"
                style={{ padding: "12px", borderRadius: 12, border: "1px solid var(--pp-border)", fontWeight: 600, fontSize: 14 }}>
                {t("common.cancel")}
              </button>
              <button
                onClick={async () => {
                  setDeleting(true);
                  const { error } = await supabase.functions.invoke("mobile-delete-account", { body: {} });
                  setDeleting(false);
                  if (error) { toast.error(error.message ?? t("more.deleteAccountFailed")); return; }
                  toast.success(t("more.deleteAccountDone"));
                  await supabase.auth.signOut();
                  navigate("/login", { replace: true });
                }}
                disabled={deleting}
                className="flex-1"
                style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(232,76,76,0.35)", background: "rgba(232,76,76,0.12)", color: "var(--pp-color-danger)", fontWeight: 700, fontSize: 14 }}
              >
                {deleting ? "…" : t("more.deleteAccountConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 16 }} />
      {editOpen && <EditProfileSheet profile={profile} onClose={() => setEditOpen(false)} onSaved={reloadProfile} />}
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
      {customizeOpen && <CustomizeSheet profile={profile} onClose={() => setCustomizeOpen(false)} onSaved={reloadProfile} />}
      {dndOpen && <DndSheet profile={profile} onClose={() => setDndOpen(false)} onSaved={reloadProfile} />}
      {pwOpen && <ChangePasswordSheet onClose={() => setPwOpen(false)} />}
      {privacyOpen && <PrivacySheet onClose={() => setPrivacyOpen(false)} lang={lang} />}
    </div>
  );
}

/* =================== Primitives =================== */

function MiniStat({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div className="pp-card" style={{ padding: 10, borderTop: `2px solid ${accent}` }}>
      <div style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 18, color: "var(--pp-text-primary)" }}>{value}</div>
      <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 10, color: "var(--pp-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5" style={{
      padding: "3px 8px", borderRadius: 999, fontSize: 10, fontFamily: "DM Sans,sans-serif", fontWeight: 600,
      background: ok ? "rgba(0,212,170,0.10)" : "rgba(232,76,76,0.10)",
      border: `1px solid ${ok ? "rgba(0,212,170,0.30)" : "rgba(232,76,76,0.25)"}`,
      color: ok ? "var(--pp-color-success)" : "var(--pp-color-danger)",
    }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ok ? "var(--pp-color-success)" : "var(--pp-color-danger)" }} />
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-2 mb-1.5" style={{ fontFamily: "DM Sans,sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "var(--pp-text-faint)" }}>
        {title}
      </p>
      <div className="pp-card overflow-hidden" style={{ padding: 0 }}>
        <div className="divide-y" style={{ borderColor: "var(--pp-bg-border)" }}>{children}</div>
      </div>
    </div>
  );
}

function Row({ icon, label, sub, onClick, right, chevron }: { icon: React.ReactNode; label: string; sub?: string; onClick?: () => void; right?: React.ReactNode; chevron?: boolean }) {
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`w-full px-4 ${sub ? "py-3" : "h-14"} flex items-center gap-3 text-left ${onClick ? "active:bg-[rgba(46,155,220,0.05)] transition" : ""}`}
      style={{ background: "transparent" }}
    >
      <span className="flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 10, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate" style={{ fontFamily: "Inter,sans-serif", fontWeight: 500, fontSize: 13.5, color: "var(--pp-text-primary)" }}>{label}</span>
        {sub && <span className="block truncate" style={{ fontFamily: "DM Sans,sans-serif", fontSize: 11, color: "var(--pp-text-muted)", marginTop: 2 }}>{sub}</span>}
      </span>
      {right}
      {chevron && <ChevronRight className="w-4 h-4" style={{ color: "var(--pp-text-faint)" }} />}
    </Comp>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className="rounded-full p-0.5 transition"
      style={{ width: 40, height: 24, background: on ? "linear-gradient(135deg, #1A4A8A, #2E9BDC)" : "var(--pp-bg-elevated)", border: `1px solid ${on ? "rgba(46,155,220,0.5)" : "var(--pp-bg-border-2)"}` }}
    >
      <span className="block rounded-full transition-transform" style={{ width: 18, height: 18, background: on ? "#fff" : "var(--pp-text-muted)", transform: on ? "translateX(16px)" : "translateX(0)", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
    </button>
  );
}

function NotificationsSection({ profile, reloadProfile }: { profile: any; reloadProfile: () => Promise<void> }) {
  const { t } = useMplanipretLang();
  const { subscribe, sendTest, busy } = usePlanipretPush();
  const setPref = async (field: string, val: boolean) => {
    await (supabase.from("planipret_profiles") as any).update({ [field]: val }).eq("user_id", profile.user_id);
    await reloadProfile();
  };
  const enablePush = async () => {
    const ok = await subscribe(profile.user_id);
    if (ok) await reloadProfile();
  };
  return (
    <Section title={t("more.pushNotifications")}>
      <Row icon={<Bell className="w-4 h-4" />} label={t("more.enablePush")} onClick={enablePush} sub={t("more.pushSub")} chevron />
      <Row icon={<Phone className="w-4 h-4" />} label={t("more.incomingCalls")} right={<Toggle on={!!profile?.notif_calls} onChange={(v) => setPref("notif_calls", v)} />} />
      <Row icon={<Bell className="w-4 h-4" />} label={t("more.newSms")} right={<Toggle on={!!profile?.notif_sms} onChange={(v) => setPref("notif_sms", v)} />} />
      <Row icon={<Voicemail className="w-4 h-4" />} label={t("more.newVoicemails")} right={<Toggle on={!!profile?.notif_voicemails} onChange={(v) => setPref("notif_voicemails", v)} />} />
      <Row icon={<Sparkles className="w-4 h-4" />} label={t("more.aiReady")} right={<Toggle on={!!profile?.notif_ai} onChange={(v) => setPref("notif_ai", v)} />} />
      <Row icon={<Bell className="w-4 h-4" />} label={t("more.reminders")} right={<Toggle on={!!profile?.notif_reminders} onChange={(v) => setPref("notif_reminders", v)} />} />
      <Row icon={<Sparkles className="w-4 h-4" />} label={t("more.hotLeadsNoFollow")} right={<Toggle on={profile?.notif_hot_leads !== false} onChange={(v) => setPref("notif_hot_leads", v)} />} />
      <Row icon={<Bell className="w-4 h-4" />} label={t("more.appointmentReminder")} right={<Toggle on={profile?.notif_appointment_reminder !== false} onChange={(v) => setPref("notif_appointment_reminder", v)} />} />
      <Row icon={<Phone className="w-4 h-4" />} label={t("more.untreatedMissedCalls")} right={<Toggle on={profile?.notif_missed_call !== false} onChange={(v) => setPref("notif_missed_call", v)} />} />
      <Row icon={<Sparkles className="w-4 h-4" />} label={t("more.morningBrief")} right={<Toggle on={profile?.notif_morning_brief !== false} onChange={(v) => setPref("notif_morning_brief", v)} />} />
      <Row icon={<Sparkles className="w-4 h-4" />} label={t("more.eodSummary")} right={<Toggle on={profile?.notif_eod_summary !== false} onChange={(v) => setPref("notif_eod_summary", v)} />} />
      <Row icon={<Sparkles className="w-4 h-4" />} label={busy ? t("more.sending") : t("more.testNotification")} onClick={() => sendTest(profile.user_id)} chevron />
    </Section>
  );
}

/* =================== Sheets =================== */

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex items-end" style={{ background: "rgba(4,11,22,0.7)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div className="w-full p-4 max-h-[80%] overflow-y-auto" onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--pp-bg-surface)", borderTop: "1px solid var(--pp-bg-border-2)", borderTopLeftRadius: 20, borderTopRightRadius: 20, boxShadow: "0 -20px 40px -10px rgba(0,0,0,0.5)" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 16, color: "var(--pp-text-primary)" }}>{title}</h2>
          <button onClick={onClose} className="flex items-center justify-center active:scale-95"
            style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)",
  color: "var(--pp-text-primary)", borderRadius: 10, padding: "10px 12px",
  fontSize: 13, fontFamily: "DM Sans,sans-serif", width: "100%",
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--pp-text-muted)", fontFamily: "DM Sans,sans-serif",
  display: "block", marginBottom: 4, marginTop: 8,
};
const primaryBtn: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
  color: "#fff", fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 13, marginTop: 12,
};

function EditProfileSheet({ profile, onClose, onSaved }: { profile: any; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t, lang } = useMplanipretLang();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `avatars/${profile.user_id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = urlData?.publicUrl;
      if (avatarUrl) {
        await supabase.from("planipret_profiles").update({ avatar_url: avatarUrl } as any).eq("user_id", profile.user_id);
        await onSaved();
        toast.success(lang === "en" ? "Photo updated" : "Photo mise à jour");
      }
    } catch (e: any) {
      toast.error(e?.message ?? (lang === "en" ? "Upload failed" : "Échec du téléversement"));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("planipret_profiles").update({ full_name: name } as any).eq("user_id", profile.user_id);
    setBusy(false);
    if (error) { toast.error(t("common.failed")); return; }
    toast.success(t("more.profileUpdated"));
    await onSaved();
    onClose();
  };

  return (
    <Sheet title={t("more.myProfile")} onClose={onClose}>
      {/* Avatar upload */}
      <div className="flex flex-col items-center mb-4">
        <div
          className="relative flex items-center justify-center font-bold text-white cursor-pointer"
          style={{ width: 72, height: 72, borderRadius: "50%", background: profile?.avatar_url ? "transparent" : "linear-gradient(135deg, #1A4A8A, #2E9BDC)", fontSize: 24, overflow: "hidden", boxShadow: "0 4px 16px -4px rgba(46,155,220,0.5)" }}
          onClick={() => fileRef.current?.click()}
        >
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initials(profile?.full_name)
          }
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)", opacity: uploading ? 1 : 0 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0"; }}
          >
            {uploading ? <span style={{ fontSize: 11, color: "#fff" }}>…</span> : <Camera className="w-5 h-5 text-white" />}
          </div>
        </div>
        <button onClick={() => fileRef.current?.click()} style={{ fontSize: 11, color: "var(--pp-brand-accent)", marginTop: 6, fontFamily: "DM Sans,sans-serif" }}>
          {lang === "en" ? "Change photo" : "Changer la photo"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
      </div>
      <label style={labelStyle}>{t("more.fullName")}</label>
      <input value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} />
      <label style={labelStyle}>{t("more.email")}</label>
      <input value={profile?.email ?? ""} readOnly style={{ ...fieldStyle, opacity: 0.6 }} />
      <label style={labelStyle}>{t("profile.extension")}</label>
      <input value={profile?.extension ?? ""} readOnly style={{ ...fieldStyle, opacity: 0.6 }} />
      <label style={labelStyle}>{t("more.domain")}</label>
      <input value={profile?.ns_domain ?? ""} readOnly style={{ ...fieldStyle, opacity: 0.6 }} />
      <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>
        {busy ? t("common.saving") : t("common.save")}
      </button>
    </Sheet>
  );
}

function ChangePasswordSheet({ onClose }: { onClose: () => void }) {
  const { t, lang } = useMplanipretLang();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (pw.length < 8) { toast.error(lang === "en" ? "Password must be at least 8 characters" : "Le mot de passe doit avoir au moins 8 caractères"); return; }
    if (pw !== confirm) { toast.error(lang === "en" ? "Passwords do not match" : "Les mots de passe ne correspondent pas"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "en" ? "Password updated successfully" : "Mot de passe mis à jour avec succès");
    onClose();
  };

  return (
    <Sheet title={lang === "en" ? "Change Password" : "Modifier le mot de passe"} onClose={onClose}>
      <label style={labelStyle}>{lang === "en" ? "New password" : "Nouveau mot de passe"}</label>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={fieldStyle} placeholder={lang === "en" ? "Min. 8 characters" : "Min. 8 caractères"} />
      <label style={labelStyle}>{lang === "en" ? "Confirm password" : "Confirmer le mot de passe"}</label>
      <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={fieldStyle} placeholder={lang === "en" ? "Repeat password" : "Répéter le mot de passe"} />
      <button onClick={save} disabled={busy || pw.length < 8 || pw !== confirm} style={{ ...primaryBtn, opacity: busy || pw.length < 8 || pw !== confirm ? 0.5 : 1 }}>
        {busy ? "…" : (lang === "en" ? "Update password" : "Mettre à jour")}
      </button>
    </Sheet>
  );
}

function PrivacySheet({ onClose, lang }: { onClose: () => void; lang: string }) {
  const isEn = lang === "en";
  return (
    <Sheet title={isEn ? "Privacy Policy" : "Politique de confidentialité"} onClose={onClose}>
      <div style={{ fontSize: 13, color: "var(--pp-text-secondary)", lineHeight: 1.7, fontFamily: "DM Sans,sans-serif" }}>
        <p style={{ fontWeight: 700, color: "var(--pp-text-primary)", marginBottom: 8 }}>Planiprêt AI Portal</p>
        <p style={{ marginBottom: 12 }}>
          {isEn
            ? "Your calls, messages, and data are stored for quality and compliance purposes. We never sell your data to third parties."
            : "Vos appels, messages et données sont stockés à des fins de qualité et de conformité. Nous ne vendons jamais vos données à des tiers."}
        </p>
        <p style={{ fontWeight: 600, color: "var(--pp-text-primary)", marginBottom: 4 }}>{isEn ? "Data Retention" : "Conservation des données"}</p>
        <ul style={{ paddingLeft: 16, listStyle: "disc", marginBottom: 12 }}>
          <li>{isEn ? "Calls & SMS: 365 days" : "Appels & SMS : 365 jours"}</li>
          <li>{isEn ? "Recordings: 90 days" : "Enregistrements : 90 jours"}</li>
          <li>{isEn ? "Audit logs: 730 days" : "Journaux d'audit : 730 jours"}</li>
        </ul>
        <p style={{ fontWeight: 600, color: "var(--pp-text-primary)", marginBottom: 4 }}>{isEn ? "Your Rights" : "Vos droits"}</p>
        <p style={{ marginBottom: 12 }}>
          {isEn
            ? "You may request export or deletion of your data at any time via Settings → My Data."
            : "Vous pouvez demander l'exportation ou la suppression de vos données à tout moment via Paramètres → Mes données."}
        </p>
        <p style={{ fontWeight: 600, color: "var(--pp-text-primary)", marginBottom: 4 }}>{isEn ? "Contact" : "Contact"}</p>
        <p>support@avastatistic.ca</p>
      </div>
      <button onClick={onClose} style={{ ...primaryBtn, marginTop: 16 }}>
        {isEn ? "Close" : "Fermer"}
      </button>
    </Sheet>
  );
}

function HelpSheet({ onClose }: { onClose: () => void }) {
  const { t } = useMplanipretLang();
  const faq = [
    { q: t("more.helpFaqCallQ"), a: t("more.helpFaqCallA") },
    { q: t("more.helpFaqAvaQ"), a: t("more.helpFaqAvaA") },
    { q: t("more.helpFaqCallsQ"), a: t("more.helpFaqCallsA") },
  ];
  return (
    <Sheet title={t("more.helpCenter")} onClose={onClose}>
      <div className="space-y-3">
        {faq.map((f, i) => (
          <div key={i} className="pb-3" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
            <p style={{ fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 13, color: "var(--pp-text-primary)" }}>{f.q}</p>
            <p style={{ fontFamily: "DM Sans,sans-serif", fontSize: 12, color: "var(--pp-text-secondary)", marginTop: 4 }}>{f.a}</p>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function CustomizeSheet({ profile, onClose, onSaved }: { profile: any; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useMplanipretLang();
  const [lang, setLang] = useState<string>(profile?.language ?? "fr");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    await supabase.from("planipret_profiles").update({ language: lang } as any).eq("user_id", profile.user_id);
    setBusy(false);
    toast.success(t("more.preferencesSaved"));
    await onSaved();
    onClose();
  };
  return (
    <Sheet title={t("more.customizeAva")} onClose={onClose}>
      <p style={{ ...labelStyle, marginTop: 0 }}>{t("more.avaRespondsIn")}</p>
      <div className="flex gap-2">
        {(["fr", "en"] as const).map((l) => {
          const active = lang === l;
          return (
            <button key={l} onClick={() => setLang(l)} className="flex-1"
              style={{ padding: "10px 12px", borderRadius: 12, fontSize: 13, fontWeight: 600, fontFamily: "Inter,sans-serif", background: active ? "linear-gradient(135deg, #1A4A8A, #2E9BDC)" : "var(--pp-bg-elevated)", border: `1px solid ${active ? "rgba(46,155,220,0.5)" : "var(--pp-bg-border-2)"}`, color: active ? "#fff" : "var(--pp-text-secondary)" }}>
              {l === "fr" ? "🇫🇷 Français" : "🇬🇧 English"}
            </button>
          );
        })}
      </div>
      <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>{busy ? "…" : t("common.save")}</button>
    </Sheet>
  );
}

function DndSheet({ profile, onClose, onSaved }: { profile: any; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useMplanipretLang();
  const [enabled, setEnabled] = useState<boolean>(!!profile?.dnd_enabled);
  const [auto, setAuto] = useState<boolean>(!!profile?.dnd_auto_schedule);
  const [start, setStart] = useState<string>(profile?.dnd_start_time?.slice(0, 5) ?? "18:00");
  const [end, setEnd] = useState<string>(profile?.dnd_end_time?.slice(0, 5) ?? "08:00");
  const [msg, setMsg] = useState<string>(profile?.dnd_message_fr ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("planipret_profiles").update({ dnd_enabled: enabled, dnd_auto_schedule: auto, dnd_start_time: start, dnd_end_time: end, dnd_message_fr: msg } as any).eq("user_id", profile.user_id);
    setBusy(false);
    if (error) { toast.error(t("common.failed")); return; }
    toast.success(t("more.dndSaved"));
    await onSaved();
    onClose();
  };
  return (
    <Sheet title={t("more.dnd")} onClose={onClose}>
      <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
        <span style={{ fontSize: 13, color: "var(--pp-text-primary)" }}>{t("more.enableDnd")}</span>
        <Toggle on={enabled} onChange={setEnabled} />
      </div>
      <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
        <span style={{ fontSize: 13, color: "var(--pp-text-primary)" }}>{t("more.autoSchedule")}</span>
        <Toggle on={auto} onChange={setAuto} />
      </div>
      {auto && (
        <div className="grid grid-cols-2 gap-3 py-3">
          <div>
            <label style={labelStyle}>{t("more.start")}</label>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t("more.end")}</label>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={fieldStyle} />
          </div>
        </div>
      )}
      <label style={labelStyle}>{t("more.autoReplyMessage")}</label>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} style={{ ...fieldStyle, resize: "none" }} />
      <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>{busy ? "…" : t("common.save")}</button>
    </Sheet>
  );
}
