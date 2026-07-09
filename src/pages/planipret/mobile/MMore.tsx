import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  User, Lock, Phone, Info, Mail, Bell, Moon, HelpCircle, MessageCircle,
  LogOut, ChevronRight, Bot, Sparkles, X, Download, Shield, BellOff, Settings as SettingsIcon, BarChart3, Voicemail, Edit3, Languages,
} from "lucide-react";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import { usePlanipretPush } from "@/hooks/usePlanipretPush";
import { CalendarSyncCard } from "@/components/planipret/CalendarSyncCard";
import { Ms365ScopesCard } from "@/components/planipret/Ms365ScopesCard";
import { SiriShortcutsCard } from "@/components/planipret/SiriShortcutsCard";
import { safeEdgeFunction } from "@/lib/safeEdgeFunction";
import MNetworkSection from "@/components/planipret/mobile/MNetworkSection";
import MCallAudioSettings from "@/components/planipret/mobile/MCallAudioSettings";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const initials = (name?: string) =>
  (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

export default function MMore() {
  const { profile, reloadProfile } = useOutletContext<PlanipretMobileContext>();
  const { t, lang, setLang } = useMplanipretLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [editOpen, setEditOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [dndOpen, setDndOpen] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState<boolean>(() => localStorage.getItem("planipret_notif") === "1");
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem("planipret_dark") === "1");
  const [agentOn, setAgentOn] = useState<boolean>(() => localStorage.getItem("planipret_agent_on") !== "0");
  const [monthStats, setMonthStats] = useState<{ calls: number; leads: number; rate: number }>({ calls: 0, leads: 0, rate: 0 });
  const [msSetupOpen, setMsSetupOpen] = useState(false);
  const [msForm, setMsForm] = useState({ tenant_id: "", client_id: "", client_secret: "" });
  const [msSaving, setMsSaving] = useState(false);

  useEffect(() => { if (params.get("ms365") === "ok") toast.success(t("more.msConnected")); }, [params, t]);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    localStorage.setItem("planipret_dark", darkMode ? "1" : "0");
  }, [darkMode]);

  useEffect(() => {
    (async () => {
      if (!profile?.id) return;
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const sb: any = supabase;
      const callsRes: any = await sb
        .from("planipret_phone_calls")
        .select("id, duration_seconds")
        .eq("broker_id", profile.id)
        .gte("started_at", start.toISOString());
      const callsArr: any[] = callsRes?.data ?? [];
      const total = callsArr.length;
      const connected = callsArr.filter((c) => (c.duration_seconds ?? 0) > 10).length;
      const rate = total ? Math.round((connected / total) * 100) : 0;
      const leadsRes: any = await sb
        .from("planipret_contacts")
        .select("id")
        .eq("broker_id", profile.id)
        .gte("created_at", start.toISOString());
      const leadsCount: number = (leadsRes?.data ?? []).length;
      setMonthStats({ calls: total, leads: leadsCount, rate });
    })();
  }, [profile?.id]);

  const nsConnected = !!profile?.ns_jwt && (!profile?.ns_jwt_expires_at || new Date(profile.ns_jwt_expires_at) > new Date());
  const ms365Connected = !!profile?.ms365_access_token;

  const reconnectNs = async () => {
    setReconnecting(true);
    const { data, error, status } = await safeEdgeFunction("ns-auth", { body: { action: "refresh" } });
    setReconnecting(false);
    if (error || (data as any)?.success === false) {
      toast.error(status === 403 ? t("more.phoneUnauthorized") : ((data as any)?.error ?? error ?? t("more.connectionFailed")));
      return;
    }
    toast.success(t("more.phoneConnected"));
    await reloadProfile();
  };

  const startMs365OAuth = (cfg: { client_id: string; tenant_id?: string }) => {
    const clientId = cfg.client_id;
    const tenant = cfg.tenant_id || "common";
    const redirect = `${window.location.origin}/auth/microsoft/callback`;
    const scope = encodeURIComponent("openid profile email offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite Chat.ReadWrite ChannelMessage.Send Team.ReadBasic.All Channel.ReadBasic.All");
    supabase.auth.getUser().then(({ data: { user } }) => {
      const state = user?.id ?? "";
      window.location.href = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirect)}&response_mode=query&scope=${scope}&state=${state}`;
    });
  };

  const connectMs365 = async () => {
    const { data, error } = await supabase.functions.invoke("pp-integration-secrets");
    if (error) { toast.error("Configuration Microsoft inaccessible", { description: error.message }); return; }
    const microsoft = ((data as any)?.items ?? []).find((i: any) => i.provider === "microsoft");
    const cfg = (microsoft?.public_config ?? {}) as any;
    if (!cfg.client_id && !cfg.client_secret_id) {
      setMsForm({ tenant_id: cfg.tenant_id ?? "", client_id: cfg.client_id ?? cfg.client_secret_id ?? "", client_secret: "" });
      setMsSetupOpen(true);
      return;
    }
    startMs365OAuth({ ...cfg, client_id: cfg.client_id ?? cfg.client_secret_id });
  };

  const saveMsCredentials = async () => {
    if (!msForm.client_id.trim() || !msForm.tenant_id.trim() || !msForm.client_secret.trim()) {
      toast.error("Tenant ID, Client ID et Client Secret requis");
      return;
    }
    setMsSaving(true);
    const { data, error } = await supabase.functions.invoke("pp-integration-secrets", {
      body: {
        provider: "microsoft",
        config: {
          tenant_id: msForm.tenant_id.trim(),
          client_id: msForm.client_id.trim(),
          client_secret: msForm.client_secret.trim(),
          redirect_uri: `${window.location.origin}/auth/microsoft/callback`,
        },
      },
    });
    setMsSaving(false);
    if (error || (data as any)?.error) {
      const detail = (data as any)?.details ?? (data as any)?.message ?? error?.message;
      toast.error((data as any)?.error ?? "Échec de l'enregistrement", { description: detail });
      return;
    }
    toast.success("Credentials enregistrés");
    setMsSetupOpen(false);
    startMs365OAuth({ client_id: msForm.client_id.trim(), tenant_id: msForm.tenant_id.trim() });
  };

  const disconnectMs365 = async () => {
    if (!confirm(t("more.disconnectMs"))) return;
    await supabase.from("planipret_profiles").update({ ms365_access_token: null, ms365_refresh_token: null }).eq("user_id", profile.user_id);
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
            background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
            fontSize: 22, fontFamily: "Inter, sans-serif",
            boxShadow: "0 8px 24px -8px rgba(46,155,220,0.55)",
          }}
        >
          {initials(profile?.full_name)}
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

      {/* Month stats */}
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label={t("more.monthStats.calls")} value={monthStats.calls} accent="var(--pp-brand-accent)" />
        <MiniStat label={t("more.monthStats.leads")} value={monthStats.leads} accent="var(--pp-color-success)" />
        <MiniStat label={t("more.monthStats.rate")} value={`${monthStats.rate}%`} accent="var(--pp-color-agent)" />
      </div>

      <Section title={t("more.sections.pipeline")}>
        <Row icon={<Sparkles className="w-4 h-4" />} label="Discuter avec AVA" sub="Assistante IA personnelle" onClick={() => navigate("/mplanipret/ava")} chevron />
        <Row icon={<Bell className="w-4 h-4" />} label="Notifications AVA" sub="Historique et deep links" onClick={() => navigate("/mplanipret/notifications")} chevron />
        <Row icon={<BarChart3 className="w-4 h-4" />} label={t("more.pipelineFiles")} onClick={() => navigate("/mplanipret/pipeline")} chevron />
        <Row icon={<BarChart3 className="w-4 h-4" />} label={t("more.performance")} onClick={() => navigate("/mplanipret/stats")} chevron />
      </Section>

      <Section title={t("more.sections.account")}>
        <Row icon={<User className="w-4 h-4" />} label={t("more.myProfile")} onClick={() => setEditOpen(true)} chevron />
        <Row icon={<Lock className="w-4 h-4" />} label={t("more.changePassword")} onClick={() => navigate("/reset-password")} chevron />
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
      </Section>

      <Section title={t("more.sections.availability")}>
        <Row
          icon={<BellOff className="w-4 h-4" style={profile?.dnd_enabled ? { color: "var(--pp-color-danger)" } : undefined} />}
          label={t("more.dnd")}
          sub={profile?.dnd_enabled ? t("more.dndActiveSub") : t("more.inactive")}
          right={<Toggle on={!!profile?.dnd_enabled} onChange={async (v) => {
            await supabase.from("planipret_profiles").update({ dnd_enabled: v }).eq("user_id", profile.user_id);
            await reloadProfile();
            toast.success(v ? t("more.dndEnabled") : t("home.dndDisabled"));
          }} />}
        />
        <Row icon={<SettingsIcon className="w-4 h-4" />} label={t("more.configureDnd")} onClick={() => setDndOpen(true)} chevron />
      </Section>

      <Section title={t("more.sections.integrations")}>
        <Row icon={<Mail className="w-4 h-4" style={{ color: "#3FA3F0" }} />} label="Microsoft 365"
          onClick={ms365Connected ? disconnectMs365 : connectMs365}
          right={<StatusPill ok={ms365Connected} label={ms365Connected ? t("more.connected") : "—"} />} chevron />
        {ms365Connected && (
          <div style={{ padding: 8 }}>
            <Ms365ScopesCard profile={profile} onReconnect={connectMs365} />
            <CalendarSyncCard profile={profile} />
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
        <Row icon={<Moon className="w-4 h-4" />} label={t("more.darkMode")} right={<Toggle on={darkMode} onChange={setDarkMode} />} />
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
                        await supabase.from("planipret_profiles").update({ language: l }).eq("user_id", profile.user_id);
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
        <Row icon={<Shield className="w-4 h-4" />} label={t("more.privacy")} onClick={() => navigate("/planipret/privacy")} chevron />
        <Row icon={<SettingsIcon className="w-4 h-4" />} label={t("more.diagnostic")} sub={t("more.diagnosticSub")}
          onClick={async () => {
            toast.info(t("more.diagnosticRunning"));
            const sb: any = supabase;
            const { data: lastCall } = await sb
              .from("planipret_phone_calls")
              .select("id, ns_call_id")
              .eq("broker_id", profile.id)
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

      <div style={{ height: 16 }} />

      {editOpen && <EditProfileSheet profile={profile} onClose={() => setEditOpen(false)} onSaved={reloadProfile} />}
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
      {customizeOpen && <CustomizeSheet profile={profile} onClose={() => setCustomizeOpen(false)} onSaved={reloadProfile} />}
      {dndOpen && <DndSheet profile={profile} onClose={() => setDndOpen(false)} onSaved={reloadProfile} />}
      {msSetupOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.58)", display: "flex", alignItems: "center", justifyContent: "center", padding: "max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))" }} onClick={() => !msSaving && setMsSetupOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, maxHeight: "calc(100vh - 32px)", background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", borderRadius: 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.45)" }}>
            <div style={{ padding: "18px 18px 10px", borderBottom: "1px solid var(--pp-bg-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--pp-text-primary)" }}>Configurer Microsoft 365</div>
              <button onClick={() => !msSaving && setMsSetupOpen(false)} style={{ width: 40, height: 40, borderRadius: 12, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}><X className="w-5 h-5" /></button>
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.45, color: "var(--pp-text-muted)", margin: 0 }}>
              Récupérez ces valeurs dans Azure Portal → App registrations → votre app.
            </p>
            </div>
            <div style={{ padding: 18, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {(["tenant_id", "client_id", "client_secret"] as const).map((k) => (
              <div key={k} style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--pp-text-primary)", marginBottom: 4 }}>
                  {k === "tenant_id" ? "Tenant ID" : k === "client_id" ? "Client ID / Secret ID" : "Client Secret (valeur)"}
                </label>
                <input
                  type={k === "client_secret" ? "password" : "text"}
                  value={msForm[k]}
                  onChange={(e) => setMsForm((f) => ({ ...f, [k]: e.target.value }))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  autoComplete="off"
                  style={{ width: "100%", minWidth: 0, padding: "12px 12px", borderRadius: 10, border: "1px solid var(--pp-bg-border-2)", background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", fontSize: 14, fontFamily: "Fira Code, monospace", boxSizing: "border-box" }}
                />
              </div>
            ))}
            </div>
            <div style={{ display: "flex", gap: 8, padding: "12px 18px max(18px, env(safe-area-inset-bottom))", borderTop: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-surface)" }}>
              <button onClick={() => setMsSetupOpen(false)} disabled={msSaving} style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid var(--pp-bg-border-2)", background: "transparent", color: "var(--pp-text-primary)" }}>Annuler</button>
              <button onClick={saveMsCredentials} disabled={msSaving} style={{ flex: 1, padding: 12, borderRadius: 8, border: "none", background: "var(--pp-brand-accent)", color: "var(--pp-on-accent, #fff)", fontWeight: 600 }}>
                {msSaving ? "Enregistrement..." : "Enregistrer & connecter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =================== Primitives =================== */

function MiniStat({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div
      className="pp-card"
      style={{ padding: 10, borderTop: `2px solid ${accent}` }}
    >
      <div style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 18, color: "var(--pp-text-primary)" }}>
        {value}
      </div>
      <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 10, color: "var(--pp-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="flex items-center gap-1.5"
      style={{
        padding: "3px 8px", borderRadius: 999, fontSize: 10, fontFamily: "DM Sans,sans-serif", fontWeight: 600,
        background: ok ? "rgba(0,212,170,0.10)" : "rgba(232,76,76,0.10)",
        border: `1px solid ${ok ? "rgba(0,212,170,0.30)" : "rgba(232,76,76,0.25)"}`,
        color: ok ? "var(--pp-color-success)" : "var(--pp-color-danger)",
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ok ? "var(--pp-color-success)" : "var(--pp-color-danger)" }} />
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="px-2 mb-1.5"
        style={{ fontFamily: "DM Sans,sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "var(--pp-text-faint)" }}
      >
        {title}
      </p>
      <div
        className="pp-card overflow-hidden"
        style={{ padding: 0 }}
      >
        <div className="divide-y" style={{ borderColor: "var(--pp-bg-border)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Row({
  icon, label, sub, onClick, right, chevron,
}: { icon: React.ReactNode; label: string; sub?: string; onClick?: () => void; right?: React.ReactNode; chevron?: boolean }) {
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`w-full px-4 ${sub ? "py-3" : "h-14"} flex items-center gap-3 text-left ${onClick ? "active:bg-[rgba(46,155,220,0.05)] transition" : ""}`}
      style={{ background: "transparent" }}
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: 32, height: 32, borderRadius: 10,
          background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)",
          color: "var(--pp-text-secondary)",
        }}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate" style={{ fontFamily: "Inter,sans-serif", fontWeight: 500, fontSize: 13.5, color: "var(--pp-text-primary)" }}>
          {label}
        </span>
        {sub && (
          <span className="block truncate" style={{ fontFamily: "DM Sans,sans-serif", fontSize: 11, color: "var(--pp-text-muted)", marginTop: 2 }}>
            {sub}
          </span>
        )}
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
      style={{
        width: 40, height: 24,
        background: on ? "linear-gradient(135deg, #1A4A8A, #2E9BDC)" : "var(--pp-bg-elevated)",
        border: `1px solid ${on ? "rgba(46,155,220,0.5)" : "var(--pp-bg-border-2)"}`,
      }}
    >
      <span
        className="block rounded-full transition-transform"
        style={{
          width: 18, height: 18,
          background: on ? "#fff" : "var(--pp-text-muted)",
          transform: on ? "translateX(16px)" : "translateX(0)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }}
      />
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

/* =================== Sheets (dark) =================== */

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-end"
      style={{ background: "rgba(4,11,22,0.7)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full p-4 max-h-[80%] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--pp-bg-surface)",
          borderTop: "1px solid var(--pp-bg-border-2)",
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          boxShadow: "0 -20px 40px -10px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 16, color: "var(--pp-text-primary)" }}>{title}</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center active:scale-95"
            style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  background: "var(--pp-bg-deep)",
  border: "1px solid var(--pp-bg-border-2)",
  color: "var(--pp-text-primary)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: "DM Sans,sans-serif",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--pp-text-muted)", fontFamily: "DM Sans,sans-serif",
  display: "block", marginBottom: 4, marginTop: 8,
};

const primaryBtn: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
  color: "#fff", fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 13,
  marginTop: 12,
};

function EditProfileSheet({ profile, onClose, onSaved }: { profile: any; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useMplanipretLang();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("planipret_profiles").update({ full_name: name }).eq("user_id", profile.user_id);
    setBusy(false);
    if (error) { toast.error(t("common.failed")); return; }
    toast.success(t("more.profileUpdated"));
    await onSaved();
    onClose();
  };
  return (
    <Sheet title={t("more.myProfile")} onClose={onClose}>
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
    await supabase.from("planipret_profiles").update({ language: lang }).eq("user_id", profile.user_id);
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
            <button
              key={l}
              onClick={() => setLang(l)}
              className="flex-1"
              style={{
                padding: "10px 12px", borderRadius: 12, fontSize: 13, fontWeight: 600, fontFamily: "Inter,sans-serif",
                background: active ? "linear-gradient(135deg, #1A4A8A, #2E9BDC)" : "var(--pp-bg-elevated)",
                border: `1px solid ${active ? "rgba(46,155,220,0.5)" : "var(--pp-bg-border-2)"}`,
                color: active ? "#fff" : "var(--pp-text-secondary)",
              }}
            >
              {l === "fr" ? "🇫🇷 Français" : "🇬🇧 English"}
            </button>
          );
        })}
      </div>
      <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>
        {busy ? "…" : t("common.save")}
      </button>
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
    const { error } = await supabase.from("planipret_profiles").update({
      dnd_enabled: enabled,
      dnd_auto_schedule: auto,
      dnd_start_time: start,
      dnd_end_time: end,
      dnd_message_fr: msg,
    }).eq("user_id", profile.user_id);
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
      <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>
        {busy ? "…" : t("common.save")}
      </button>
    </Sheet>
  );
}
