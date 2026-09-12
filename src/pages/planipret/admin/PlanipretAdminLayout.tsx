import { useEffect, useState } from "react";
import BrokerAuthScreen from "@/components/planipret/broker/BrokerAuthScreen";
import { isPlanipretEmail } from "@/components/planipret/PortalDomainGate";
import { signOutMicrosoft } from "@/lib/ms365AuthLogin";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { PrefetchNavLink } from "@/components/PrefetchLink";
import { supabase } from "@/integrations/supabase/client";
import PortalDomainGate from "@/components/planipret/PortalDomainGate";
import {
  LayoutDashboard, Users, Phone, MessageSquare, Mic, Plug,
  BarChart3, LogOut, Sun, Moon, ShieldCheck, ShieldAlert, CheckSquare, Search, ChevronRight, Sparkles, Smartphone, PlugZap, Bot, Activity, Gauge, Zap, Music, Rocket, UserSquare2, AlertTriangle, FileText,
} from "lucide-react";
import SessionTimeoutModal from "@/components/planipret/SessionTimeoutModal";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { usePlanipretNsAutoSync } from "@/hooks/usePlanipretNsAutoSync";
import NotificationsBell from "@/components/planipret/admin/NotificationsBell";
import CommandPalette from "@/components/planipret/admin/CommandPalette";
import { WorkspaceHeaderExtras } from "@/components/portals/WorkspaceHeaderExtras";
import { getPlanipretBrokerDirectoryCount } from "@/lib/planipret/adminDirectory";
import { getPlanipretCallCount } from "@/lib/planipret/adminCounts";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { useMplanipretTheme } from "@/hooks/useMplanipretTheme";
import HighReadabilityToggle from "@/components/planipret/broker/HighReadabilityToggle";
import { PlanipretLangSwitch } from "@/components/planipret/PlanipretLangSwitch";
import { useMplanipretSoftphone } from "@/hooks/useMplanipretSoftphone";
import PpActiveCallScreen from "@/components/planipret/PpActiveCallScreen";
import planipretLogo from "@/assets/planipret-logo.png.asset.json";
import { toast } from "sonner";
import { PLANIPRET_PROFILE_SAFE_COLUMNS } from "@/lib/planipret/profileColumns";

type NavBadge = "brokers" | "missed" | "integrations" | "audit";
type NavKey = "overview" | "reports" | "ava" | "avaAgent" | "avaLogs" | "avaToolsAudit" | "avaConfirmations" | "brokers" | "calls" | "messages" | "recordings" | "integrations" | "mobileDevices" | "mobileApp" | "holdMusic" | "sipDiagnostic" | "compliance" | "auditChecklist" | "accessLog" | "diagnostics" | "maestroSync" | "maestroDashboard" | "syncedCalls" | "telecomMapping" | "didReconcile" | "commissions" | "commissionsMonthly" | "commissionAudit" | "brokerCommissions" | "phoneNumbers" | "tasks" | "broker360" | "maestroTasks" | "maestroClients" | "brokerPerformance" | "brokerStats" | "brokerJourney" | "taskBoard" | "brokerDaily" | "maestroHealth" | "maestroPending" | "microsoftAuth" | "contracts";
type SectionKey = "pilotage" | "brokers" | "communications" | "system";
type PageKey = "overview" | "users" | "calls" | "messages" | "recordings" | "integrations" | "reports" | "auditChecklist" | "accessLog" | "compliance" | "ava" | "avaAgent" | "avaLogs" | "avaToolsAudit" | "avaConfirmations" | "mobileDevices" | "holdMusic" | "sipDiagnostic" | "diagnostics" | "maestroSync" | "maestroDashboard" | "syncedCalls" | "telecomMapping" | "didReconcile" | "commissions" | "commissionsMonthly" | "commissionAudit" | "brokerCommissions" | "phoneNumbers" | "tasks" | "broker360" | "maestroTasks" | "maestroClients" | "brokerPerformance" | "brokerStats" | "brokerJourney" | "taskBoard" | "brokerDaily" | "maestroHealth" | "maestroPending" | "microsoftAuth" | "contracts";

const NAV: Array<{ sectionKey: SectionKey; items: Array<{ to: string; key: NavKey; Icon: any; badge?: NavBadge }> }> = [
  {
    sectionKey: "pilotage",
    items: [
      { to: "/planipret/admin/overview", key: "overview", Icon: LayoutDashboard },
      { to: "/planipret/admin/reports",  key: "reports",  Icon: BarChart3 },
      { to: "/planipret/admin/ava",       key: "ava",      Icon: Sparkles },
      { to: "/planipret/admin/ava-agent",  key: "avaAgent", Icon: Bot },
      { to: "/planipret/admin/ava-logs",   key: "avaLogs",  Icon: Activity },
      { to: "/planipret/admin/ava-tools-audit", key: "avaToolsAudit", Icon: Activity },
      { to: "/planipret/admin/ava-confirmations", key: "avaConfirmations", Icon: CheckSquare },
      { to: "/planipret/admin/maestro-dashboard", key: "maestroDashboard", Icon: Gauge },
    ],
  },
  {
    sectionKey: "brokers",
    items: [
      { to: "/planipret/admin/users", key: "brokers", Icon: Users, badge: "brokers" },
    ],
  },
  {
    sectionKey: "communications",
    items: [
      { to: "/planipret/admin/calls",      key: "calls",       Icon: Phone,         badge: "missed" },
      { to: "/planipret/admin/messages",   key: "messages",    Icon: MessageSquare },
      { to: "/planipret/admin/recordings", key: "recordings",  Icon: Mic },
      { to: "/planipret/admin/synced-calls", key: "syncedCalls", Icon: BarChart3 },
      { to: "/planipret/admin/commissions", key: "commissions", Icon: BarChart3 },
      { to: "/planipret/admin/commissions-monthly", key: "commissionsMonthly", Icon: BarChart3 },
      { to: "/planipret/admin/broker-commissions", key: "brokerCommissions", Icon: BarChart3 },
      { to: "/planipret/admin/commission-audit", key: "commissionAudit", Icon: BarChart3 },
      { to: "/planipret/admin/tasks", key: "tasks", Icon: CheckSquare },
      { to: "/planipret/admin/broker-360", key: "broker360", Icon: UserSquare2 },
      { to: "/planipret/admin/maestro-tasks", key: "maestroTasks", Icon: CheckSquare },
      { to: "/planipret/admin/maestro-clients", key: "maestroClients", Icon: Users },
      { to: "/planipret/admin/broker-performance", key: "brokerPerformance", Icon: BarChart3 },
      { to: "/planipret/admin/broker-stats", key: "brokerStats", Icon: Users },
      { to: "/planipret/admin/broker-journey", key: "brokerJourney", Icon: UserSquare2 },
      { to: "/planipret/admin/task-board", key: "taskBoard", Icon: CheckSquare },
      { to: "/planipret/admin/broker-daily", key: "brokerDaily", Icon: CheckSquare },
      { to: "/planipret/admin/maestro-health", key: "maestroHealth", Icon: Zap },
      { to: "/planipret/admin/maestro-pending", key: "maestroPending", Icon: AlertTriangle },
      { to: "/planipret/admin/contracts", key: "contracts", Icon: FileText },
    ],
  },
  {
    sectionKey: "system",
    items: [
      { to: "/planipret/admin/integrations",    key: "integrations",    Icon: Plug,        badge: "integrations" },
      { to: "/planipret/admin/mobile-devices",  key: "mobileDevices",   Icon: Smartphone },
      { to: "/planipret/admin/mobile-app",      key: "mobileApp",       Icon: Rocket },
      { to: "/planipret/admin/hold-music",      key: "holdMusic",       Icon: Music },
      { to: "/planipret/admin/sip-diagnostic",  key: "sipDiagnostic",   Icon: PlugZap },
      { to: "/planipret/admin/diagnostics",     key: "diagnostics",     Icon: Gauge },
      { to: "/planipret/admin/maestro-sync",    key: "maestroSync",     Icon: Zap },
      { to: "/planipret/admin/microsoft-auth",  key: "microsoftAuth",   Icon: ShieldAlert },
      { to: "/planipret/admin/telecom-mapping", key: "telecomMapping",  Icon: Plug },
      { to: "/planipret/admin/did-reconcile",   key: "didReconcile",    Icon: PlugZap },
      { to: "/planipret/admin/phone-numbers",   key: "phoneNumbers",    Icon: Phone },
      { to: "/planipret/admin/compliance",      key: "compliance",      Icon: ShieldCheck },
      { to: "/planipret/admin/audit-checklist", key: "auditChecklist",  Icon: CheckSquare, badge: "audit" },
      { to: "/planipret/admin/access-log",      key: "accessLog",       Icon: ShieldAlert },
    ],
  },
];

/** Emails with unrestricted (super admin) sidebar access. */
const SUPER_ADMIN_EMAILS = ["mhassoun@assistantvirtualai.com"];

/** Reduced navigation for regular org admins (Marc, Gilles, etc.). */
const NAV_REGULAR: typeof NAV = [
  {
    sectionKey: "pilotage",
    items: [
      { to: "/planipret/admin/overview", key: "overview", Icon: LayoutDashboard },
      { to: "/planipret/admin/reports",  key: "reports",  Icon: BarChart3 },
      { to: "/planipret/admin/ava",      key: "ava",      Icon: Sparkles },
      { to: "/planipret/admin/ava-confirmations", key: "avaConfirmations", Icon: CheckSquare },
    ],
  },
  {
    sectionKey: "communications",
    items: [
      { to: "/planipret/admin/users",      key: "brokers",     Icon: Users, badge: "brokers" },
      { to: "/planipret/admin/calls",      key: "calls",       Icon: Phone, badge: "missed" },
      { to: "/planipret/admin/messages",   key: "messages",    Icon: MessageSquare },
      { to: "/planipret/admin/recordings", key: "recordings",  Icon: Mic },
      { to: "/planipret/admin/commissions", key: "commissions", Icon: BarChart3 },
      { to: "/planipret/admin/commissions-monthly", key: "commissionsMonthly", Icon: BarChart3 },
      { to: "/planipret/admin/broker-commissions", key: "brokerCommissions", Icon: BarChart3 },
      { to: "/planipret/admin/commission-audit", key: "commissionAudit", Icon: BarChart3 },
      { to: "/planipret/admin/tasks",      key: "tasks",       Icon: CheckSquare },
      { to: "/planipret/admin/broker-360", key: "broker360",  Icon: UserSquare2 },
      { to: "/planipret/admin/maestro-tasks", key: "maestroTasks", Icon: CheckSquare },
      { to: "/planipret/admin/maestro-clients", key: "maestroClients", Icon: Users },
      { to: "/planipret/admin/broker-performance", key: "brokerPerformance", Icon: BarChart3 },
      { to: "/planipret/admin/broker-stats", key: "brokerStats", Icon: Users },
      { to: "/planipret/admin/broker-journey", key: "brokerJourney", Icon: UserSquare2 },
      { to: "/planipret/admin/task-board", key: "taskBoard", Icon: CheckSquare },
      { to: "/planipret/admin/broker-daily", key: "brokerDaily", Icon: CheckSquare },
      { to: "/planipret/admin/maestro-health", key: "maestroHealth", Icon: Zap },
      { to: "/planipret/admin/maestro-pending", key: "maestroPending", Icon: AlertTriangle },
      { to: "/planipret/admin/contracts", key: "contracts", Icon: FileText },
      { to: "/planipret/admin/hold-music", key: "holdMusic",   Icon: Music },
      { to: "/planipret/admin/access-log", key: "accessLog",  Icon: ShieldAlert },

    ],
  },
];

const PAGE_KEY_BY_PATH: Record<string, PageKey> = {
  "/planipret/admin/overview": "overview",
  "/planipret/admin/users": "users",
  "/planipret/admin/calls": "calls",
  "/planipret/admin/messages": "messages",
  "/planipret/admin/recordings": "recordings",
  "/planipret/admin/integrations": "integrations",
  "/planipret/admin/reports": "reports",
  "/planipret/admin/audit-checklist": "auditChecklist",
  "/planipret/admin/access-log": "accessLog",
  "/planipret/admin/compliance": "compliance",
  "/planipret/admin/ava": "ava",
  "/planipret/admin/ava-agent": "avaAgent",
  "/planipret/admin/ava-logs": "avaLogs",
  "/planipret/admin/ava-tools-audit": "avaToolsAudit",
  "/planipret/admin/ava-confirmations": "avaConfirmations",
  "/planipret/admin/mobile-devices": "mobileDevices",
  "/planipret/admin/hold-music": "holdMusic",
  "/planipret/admin/sip-diagnostic": "sipDiagnostic",
  "/planipret/admin/diagnostics": "diagnostics",
  "/planipret/admin/maestro-sync": "maestroSync",
  "/planipret/admin/microsoft-auth": "microsoftAuth",
  "/planipret/admin/contracts": "contracts",
  "/planipret/admin/synced-calls": "syncedCalls",
  "/planipret/admin/commissions": "commissions",
  "/planipret/admin/commissions-monthly": "commissionsMonthly",
  "/planipret/admin/commission-audit": "commissionAudit",
  "/planipret/admin/broker-commissions": "brokerCommissions",
  "/planipret/admin/tasks": "tasks",
  "/planipret/admin/broker-360": "broker360",
  "/planipret/admin/maestro-tasks": "maestroTasks",
  "/planipret/admin/maestro-clients": "maestroClients",
  "/planipret/admin/broker-performance": "brokerPerformance",
  "/planipret/admin/broker-stats": "brokerStats",
  "/planipret/admin/broker-journey": "brokerJourney",
  "/planipret/admin/task-board": "taskBoard",
  "/planipret/admin/broker-daily": "brokerDaily",
  "/planipret/admin/maestro-health": "maestroHealth",
  "/planipret/admin/maestro-pending": "maestroPending",
  "/planipret/admin/telecom-mapping": "telecomMapping",
  "/planipret/admin/did-reconcile": "didReconcile",
  "/planipret/admin/phone-numbers": "phoneNumbers",
};

const initials = (n?: string) =>
  (n ?? "A").split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "A";

export default function PlanipretAdminLayout() {
  const { lang, setLang, t: tt } = useMplanipretLang();
  const { theme, toggle: toggleTheme } = useMplanipretTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [anon, setAnon] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [missingIntegrations, setMissingIntegrations] = useState(0);
  const [missedCalls, setMissedCalls] = useState(0);
  const [brokerCount, setBrokerCount] = useState(0);
  const [auditScore, setAuditScore] = useState<number | null>(null);
  const { status: rtStatus } = useAdminRealtime();
  const softphone = useMplanipretSoftphone(true, { primary: true, clientType: "web" });
  const realtimeOk = rtStatus === "live";
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialNumber, setDialNumber] = useState("");
  const [dialing, setDialing] = useState(false);
  const [mobileNoticeDismissed, setMobileNoticeDismissed] = useState(() => {
    try { return localStorage.getItem("pp_admin_mobile_notice") === "dismissed"; } catch { return false; }
  });

  // Auto-sync NS-API in the background for every admin page. Idempotent via
  // module-level in-flight guard, safe to mount once at the layout.
  usePlanipretNsAutoSync();

  // Keyboard shortcuts
  useEffect(() => {
    let gPressed = 0;
    const MAP: Record<string, string> = {
      o: "/planipret/admin/overview", u: "/planipret/admin/users",
      c: "/planipret/admin/calls", m: "/planipret/admin/messages",
      v: "/planipret/admin/recordings", r: "/planipret/admin/reports",
      i: "/planipret/admin/integrations",
    };
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return false;
      const tag = t.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
    };
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setPaletteOpen((o) => !o); return;
      }
      if (isTyping(e)) return;
      if (e.key === "/") { e.preventDefault(); setPaletteOpen(true); return; }
      if (e.key === "g") { gPressed = Date.now(); return; }
      if (gPressed && Date.now() - gPressed < 1000 && MAP[e.key.toLowerCase()]) {
        gPressed = 0; navigate(MAP[e.key.toLowerCase()]);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async (user: any) => {
      const { data } = await supabase.from("planipret_profiles").select(PLANIPRET_PROFILE_SAFE_COLUMNS).eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      // Un profil courtier ne doit pas éjecter un admin/super admin réel :
      // on vérifie les rôles serveur avant de renvoyer vers l'app mobile.
      if (data && data.role && data.role !== "admin") {
        const [superRes, ppAdminRes] = await Promise.all([
          supabase.rpc("is_super_admin", { _user_id: user.id }),
          supabase.rpc("is_planipret_admin", { _user_id: user.id }),
        ]);
        if (cancelled) return;
        if (superRes.data !== true && ppAdminRes.data !== true) {
          navigate("/mplanipret", { replace: true });
          return;
        }
      }
      setUserEmail((user.email ?? "").toLowerCase());
      setProfile(data ?? { full_name: user.email, role: "admin" });
      setLoading(false);
      if (data && (data.language === "fr" || data.language === "en")) {
        if (data.language !== lang) setLang(data.language);
      } else if (data) {
        const fallback: "fr" | "en" = lang === "en" ? "en" : "fr";
        setLang(fallback);
        try {
          await supabase.from("planipret_profiles").update({ language: fallback }).eq("user_id", user.id);
        } catch { /* non-blocking */ }
      }

      try {
        const bc = await getPlanipretBrokerDirectoryCount();
        if (!cancelled) setBrokerCount(bc);
      } catch { /* ignore */ }
      try {
        const since = new Date(); since.setHours(0, 0, 0, 0);
        // Same definition/query helper as /admin/calls when filtering Direction = Manqué.
        const mc = await getPlanipretCallCount({ direction: "missed", from: since.toISOString() });
        if (!cancelled) setMissedCalls(mc);
      } catch { /* ignore */ }
      try {
        const { data: sec } = await supabase.functions.invoke("pp-integration-secrets");
        const present = new Set(((sec as any)?.items ?? []).filter((i: any) => i.has_keys?.length).map((i: any) => i.provider));
        const required = ["elevenlabs", "anthropic", "maestro", "microsoft"];
        if (!cancelled) setMissingIntegrations(required.filter((p) => !present.has(p)).length);
      } catch { /* ignore */ }
      try {
        const cached = localStorage.getItem("pp:audit:score");
        if (cached && !cancelled) setAuditScore(Number(cached));
      } catch { /* ignore */ }
    };

    (async () => {
      let session = (await supabase.auth.getSession()).data.session;
      if (!session?.user) {
        await new Promise<void>((resolve) => {
          const sub = supabase.auth.onAuthStateChange((_e, s) => {
            if (s?.user) { session = s; sub.data.subscription.unsubscribe(); resolve(); }
          });
          setTimeout(() => { sub.data.subscription.unsubscribe(); resolve(); }, 2000);
        });
      }
      if (cancelled) return;
      if (!session?.user) { setAnon(true); setLoading(false); return; }
      // Hard gate: only Microsoft 365 @planipret accounts (or platform super
      // admins) may reach the admin interface. Anything else is signed out.
      const email = session.user.email ?? "";
      if (!isPlanipretEmail(email)) {
        const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: session.user.id });
        if (cancelled) return;
        if (isSuper !== true) {
          try { await supabase.auth.signOut(); } catch { /* ignore */ }
          setAnon(true);
          setAuthError(
            "Ce compte Microsoft n'est pas un compte @planipret. Utilisez votre compte professionnel Planiprêt.",
          );
          setLoading(false);
          return;
        }
      }
      setAnon(false);
      setAuthError(null);

      await loadProfile(session.user);
    })();

    return () => { cancelled = true; };
  }, [navigate]);

  const logout = async () => {
    setAnon(true);
    setLoading(false);
    // Ends the Supabase session AND the Microsoft 365 session, then returns
    // to the Planiprêt admin portal sign-in screen.
    await signOutMicrosoft("/planipret/admin");
  };

  const startWebCall = async () => {
    const destination = dialNumber.trim();
    if (!destination || dialing) return;
    setDialing(true);
    try {
      const res = await softphone.placeCall(destination);
      if (res.via === "none") {
        toast.error(res.error || "Appel impossible");
        return;
      }
      setDialNumber("");
      toast.success(res.via === "webrtc" ? "Appel web démarré" : "Appel lancé");
    } finally {
      setDialing(false);
    }
  };

  if (anon) {
    return (
      <div className="planipret-scope planipret-admin-scope planipret-broker-scope" data-pp-theme={theme}>
        <BrokerAuthScreen
          msRedirect={location.pathname.startsWith("/planipret/admin") ? location.pathname : "/planipret/admin/overview"}
          initialError={authError}
          variant="admin"
          title="Connexion administrateur"
          subtitle="Accédez aux appels, commissions, utilisateurs et rapports Planiprêt."
        />
      </div>
    );
  }

  if (loading) {

    return (
      <div data-pp-theme={theme} className="planipret-scope planipret-admin-scope min-h-screen flex items-center justify-center"
        style={{ color: "var(--pp-text-muted)", fontFamily: "'Epilogue', sans-serif" }}>
        Chargement…
      </div>
    );
  }

  const pageKey = PAGE_KEY_BY_PATH[location.pathname];
  const title = pageKey ? tt(`adminPortal.pageTitles.${pageKey}`) : tt("adminPortal.dashboardTitle");
  const dateLabel = new Date().toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const isSuperAdmin = !!userEmail && SUPER_ADMIN_EMAILS.includes(userEmail);
  const navGroups = isSuperAdmin ? NAV : NAV_REGULAR;
  const sectionKey = navGroups.find((g) => g.items.some((i) => i.to === location.pathname))?.sectionKey;
  const sectionLabel = sectionKey ? tt(`adminPortal.sections.${sectionKey}`) : tt("adminPortal.administration");

  const renderBadge = (b?: NavBadge) => {
    if (b === "brokers" && brokerCount > 0) {
      return (
        <span style={{
          fontSize: 10, fontWeight: 700, color: "var(--pp-text-secondary)",
          background: "#EEF2F7", borderRadius: 6, padding: "1px 7px",
        }}>{brokerCount}</span>
      );
    }
    if (b === "missed" && missedCalls > 0) {
      return (
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#fff", background: "var(--pp-danger)",
          borderRadius: 999, minWidth: 18, height: 18, display: "inline-flex",
          alignItems: "center", justifyContent: "center", padding: "0 6px",
        }}>{missedCalls}</span>
      );
    }
    if (b === "integrations" && missingIntegrations > 0) {
      return <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--pp-warning)", boxShadow: "0 0 0 4px rgba(201,168,76,0.20)" }} />;
    }
    if (b === "audit" && auditScore !== null) {
      return (
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#8A6E1F",
          background: "rgba(201,168,76,0.14)", border: "1px solid rgba(201,168,76,0.35)",
          borderRadius: 6, padding: "1px 7px",
        }}>{auditScore}%</span>
      );
    }
    return null;
  };

  return (
    <PortalDomainGate>
    <div data-pp-theme={theme} className="planipret-scope planipret-admin-scope min-h-screen flex"
      style={{ background: "var(--pp-bg-base)", fontFamily: "'Epilogue', sans-serif" }}>
      {/* Mobile redirect notice (dismissible) */}
      {!mobileNoticeDismissed && (
        <div className="md:hidden fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "var(--pp-bg-base)" }}>
          <div className="text-center max-w-xs pp-card" style={{ padding: 24 }}>
            <h2 className="pp-heading" style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
              {tt("adminPortal.mobileNoticeTitle")}
            </h2>
            <p style={{ fontSize: 13, color: "var(--pp-text-secondary)", marginBottom: 16 }}>
              {tt("adminPortal.mobileNoticeBody")}
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => navigate("/mplanipret")} className="pp-btn-primary">
                {tt("adminPortal.openMobileApp")}
              </button>
              <button
                onClick={() => {
                  try { localStorage.setItem("pp_admin_mobile_notice", "dismissed"); } catch { /* noop */ }
                  setMobileNoticeDismissed(true);
                }}
                style={{
                  fontSize: 13, padding: "8px 12px", borderRadius: 10,
                  border: "1px solid var(--pp-bg-border)", background: "transparent",
                  color: "var(--pp-text-secondary)",
                }}
              >
                Continuer sur mobile
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Sidebar */}
      <aside className="pp-sidebar hidden md:flex flex-col fixed left-0 top-0 h-screen w-[248px] z-40">
        {/* Brand */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
          <div className="flex items-center gap-3">
            <img
              src={planipretLogo.url}
              alt="Planiprêt"
              style={{
                width: 38, height: 38, borderRadius: 10, objectFit: "cover",
                background: "#fff",
                boxShadow: "0 4px 12px -4px rgba(30,58,95,0.4)",
                border: "1px solid var(--pp-bg-border)",
              }}
            />
            <div className="min-w-0">
              <div className="pp-sidebar-brand" style={{ fontSize: 15 }}>{tt("adminPortal.brand")}</div>
              <div className="pp-sidebar-sub" style={{ fontSize: 11 }}>{tt("adminPortal.subBrand")}</div>
            </div>
          </div>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.sectionKey}>
              <div className="pp-nav-section">{tt(`adminPortal.sections.${group.sectionKey}`)}</div>
              {group.items.map(({ to, key, Icon, badge }) => {
                const raw = tt(`adminPortal.nav.${key}`);
                const label = raw && !raw.startsWith("adminPortal.")
                  ? raw
                  : (key === "diagnostics" ? (lang === "en" ? "Diagnostics" : "Diagnostic")
                    : key === "maestroSync" ? (lang === "en" ? "Maestro sync" : "Sync Maestro")
                    : key === "contracts" ? (lang === "en" ? "Contracts" : "Contrats")
                    : key === "commissionAudit" ? (lang === "en" ? "Commission audit" : "Audit commissions")
                    : key === "brokerCommissions" ? (lang === "en" ? "Broker commissions" : "Commissions par courtier")
                    : key === "microsoftAuth" ? (lang === "en" ? "Microsoft sign-ins" : "Connexions Microsoft")

                    : key === "telecomMapping" ? (lang === "en" ? "Telecom mapping" : "Mapping Telecom")
                    : key === "didReconcile" ? (lang === "en" ? "DID reconciliation" : "Réconciliation DID")
                    : key === "phoneNumbers" ? (lang === "en" ? "Phone numbers" : "Numéros de téléphone")
                    : key === "mobileApp" ? (lang === "en" ? "Mobile app" : "Application mobile")
                    : key === "avaToolsAudit" ? (lang === "en" ? "AVA tools audit" : "Audit outils AVA")
                    : key);
                return (
                  <PrefetchNavLink key={to} to={to} end
                    className={({ isActive }) => `pp-nav-item ${isActive ? "is-active" : ""}`}>
                    {({ isActive }) => (
                      <>
                        <Icon className="w-[17px] h-[17px] flex-shrink-0"
                          style={{ color: isActive ? "var(--pp-brand-accent-2)" : "var(--pp-text-muted)" }} />
                        <span className="flex-1 truncate">{label}</span>
                        {renderBadge(badge)}
                      </>
                    )}
                  </PrefetchNavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Profile footer */}
        <div style={{ padding: 14, borderTop: "1px solid var(--pp-bg-border)", background: "#FAFBFD" }}>
          <div className="flex items-center gap-3">
            <div className="rounded-full flex items-center justify-center text-white flex-shrink-0"
              style={{
                width: 36, height: 36,
                background: "linear-gradient(135deg, #1E3A5F, #3B6FA0)",
                fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: 12,
                boxShadow: "0 2px 8px -2px rgba(30,58,95,0.4)",
              }}>
              {initials(profile?.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--pp-text-primary)", fontFamily: "'Urbanist', sans-serif" }}>
                {profile?.full_name ?? "Admin"}
              </p>
              <p style={{ fontSize: 10.5, color: "var(--pp-text-muted)", letterSpacing: "0.04em" }}>
                Super Admin
              </p>
            </div>
            <button onClick={logout} title="Déconnexion"
              className="flex items-center justify-center rounded-lg transition"
              style={{ width: 30, height: 30, color: "var(--pp-text-muted)", border: "1px solid transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#FFF1F1"; e.currentTarget.style.color = "var(--pp-danger)"; e.currentTarget.style.borderColor = "rgba(178,58,72,0.20)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--pp-text-muted)"; e.currentTarget.style.borderColor = "transparent"; }}>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="hidden md:flex flex-1 min-w-0 flex-col ml-[248px]">
        <header className="pp-app-header sticky top-0 flex items-center justify-between gap-4 px-5 xl:px-7 z-30 overflow-hidden" style={{ height: 64 }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="pp-eyebrow">{sectionLabel}</span>
            <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--pp-text-faint)" }} />
            <h1 className="pp-heading truncate" style={{ fontWeight: 700, fontSize: 18 }}>{title}</h1>
          </div>

          <div className="flex items-center gap-2 min-w-0 shrink">
            <button onClick={() => setPaletteOpen(true)}
              className="pp-search-bar hidden 2xl:flex items-center gap-2 px-3 h-9 text-xs shrink"
              style={{ minWidth: 200, fontFamily: "'Epilogue', sans-serif" }}>
              <Search className="w-3.5 h-3.5" />
              <span className="flex-1 text-left">Rechercher courtiers, appels, intégrations…</span>
              <kbd className="pp-kbd">⌘K</kbd>
            </button>

            <HighReadabilityToggle compact />

            <button onClick={toggleTheme} aria-label="Theme"
              title={theme === "dark" ? "Mode clair" : "Mode sombre"}
              className="flex items-center justify-center rounded-lg shrink-0"
              style={{ width: 32, height: 32, color: "var(--pp-text-muted)", border: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-elevated)" }}>
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="hidden md:flex items-center gap-1.5 shrink-0"
              style={{
                background: realtimeOk ? "rgba(13,122,95,0.10)" : "#F0F4F9",
                border: `1px solid ${realtimeOk ? "rgba(13,122,95,0.25)" : "var(--pp-bg-border)"}`,
                borderRadius: 999, padding: "4px 10px",
              }}>
              <span className={realtimeOk ? "pp-live-dot" : ""}
                style={!realtimeOk ? { width: 7, height: 7, borderRadius: "50%", background: "var(--pp-text-faint)", display: "inline-block" }
                  : { width: 7, height: 7, borderRadius: "50%", display: "inline-block" }} />
              <span style={{ fontSize: 10.5, fontWeight: 600, color: realtimeOk ? "var(--pp-success)" : "var(--pp-text-muted)", letterSpacing: "0.04em" }}>
                {realtimeOk ? "EN DIRECT" : "RECONNEXION…"}
              </span>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); void startWebCall(); }}
              className="hidden lg:flex items-center gap-1.5 rounded-full px-2 py-1"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}
            >
              <Phone className="h-3.5 w-3.5" style={{ color: "var(--pp-brand-accent-2)" }} />
              <input
                value={dialNumber}
                onChange={(e) => setDialNumber(e.target.value)}
                placeholder="Composer…"
                inputMode="tel"
                className="w-28 bg-transparent text-xs outline-none"
                style={{ color: "var(--pp-text-primary)" }}
              />
              <button
                type="submit"
                disabled={!dialNumber.trim() || dialing}
                className="rounded-full px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
                style={{ background: "var(--pp-brand-accent-2)", color: "var(--pp-bg-base)" }}
              >
                {dialing ? "…" : "Appeler"}
              </button>
            </form>

            <NotificationsBell />
            <WorkspaceHeaderExtras />

            {/* FR/EN switch — synced with mobile via planipret_profiles.language */}
            <PlanipretLangSwitch />



            <div className="hidden 2xl:flex flex-col items-end" style={{ paddingLeft: 4, borderLeft: "1px solid var(--pp-bg-border)", paddingInline: "12px 0", marginLeft: 4 }}>
              <span className="capitalize" style={{ fontSize: 10.5, color: "var(--pp-text-muted)", fontFamily: "'Urbanist', sans-serif", fontWeight: 500, letterSpacing: "0.02em" }}>
                {dateLabel}
              </span>
            </div>
          </div>
        </header>
        <main className="pa-main flex-1 min-w-0 p-5 md:p-7" style={{ overflowX: "clip", overflowY: "visible" }}>
          <Outlet context={{ profile, softphone }} />
        </main>
      </div>

      <PpActiveCallScreen softphone={softphone} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <SessionTimeoutModal />
    </div>
    </PortalDomainGate>
  );
}
