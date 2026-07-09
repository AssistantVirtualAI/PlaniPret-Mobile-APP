import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Users, Phone, MessageSquare, Mic, Plug,
  BarChart3, LogOut, ShieldCheck, CheckSquare, Search, ChevronRight, Sparkles, Smartphone, PlugZap,
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
import { PlanipretLangSwitch } from "@/components/planipret/PlanipretLangSwitch";
import { useMplanipretSoftphone } from "@/hooks/useMplanipretSoftphone";
import PpActiveCallScreen from "@/components/planipret/PpActiveCallScreen";
import planipretLogo from "@/assets/planipret-logo.png.asset.json";
import { toast } from "sonner";

type NavBadge = "brokers" | "missed" | "integrations" | "audit";
type NavItem = { to: string; label: string; Icon: any; badge?: NavBadge };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Pilotage",
    items: [
      { to: "/planipret/admin/overview", label: "Vue d'ensemble", Icon: LayoutDashboard },
      { to: "/planipret/admin/reports",  label: "Rapports",       Icon: BarChart3 },
      { to: "/planipret/admin/ava",      label: "AVA Analytics",  Icon: Sparkles },
    ],
  },
  {
    title: "Courtiers",
    items: [
      { to: "/planipret/admin/users", label: "Courtiers", Icon: Users, badge: "brokers" },
    ],
  },
  {
    title: "Communications",
    items: [
      { to: "/planipret/admin/calls",      label: "Appels",        Icon: Phone,         badge: "missed" },
      { to: "/planipret/admin/messages",   label: "Messages",      Icon: MessageSquare },
      { to: "/planipret/admin/recordings", label: "Enregistrements", Icon: Mic },
    ],
  },
  {
    title: "Système",
    items: [
      { to: "/planipret/admin/integrations",    label: "Intégrations", Icon: Plug,        badge: "integrations" },
      { to: "/planipret/admin/mobile-devices",  label: "Devices mobiles", Icon: Smartphone },
      { to: "/planipret/admin/sip-diagnostic",  label: "Diagnostic SIP",  Icon: PlugZap },
      { to: "/planipret/admin/compliance",      label: "Conformité",   Icon: ShieldCheck },
      { to: "/planipret/admin/audit-checklist", label: "Audit",        Icon: CheckSquare, badge: "audit" },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  "/planipret/admin/overview": "Vue d'ensemble",
  "/planipret/admin/users": "Gestion des courtiers",
  "/planipret/admin/calls": "Historique des appels",
  "/planipret/admin/messages": "Messages",
  "/planipret/admin/recordings": "Enregistrements d'appels",
  "/planipret/admin/integrations": "Intégrations",
  "/planipret/admin/reports": "Rapports & Analytics",
  "/planipret/admin/audit-checklist": "Audit système",
  "/planipret/admin/compliance": "Conformité PIPEDA · Loi 25",
  "/planipret/admin/ava": "AVA — Analytics",
  "/planipret/admin/mobile-devices": "Vérification devices mobiles",
  "/planipret/admin/sip-diagnostic": "Diagnostic SIP — 113_web",
};

const initials = (n?: string) =>
  (n ?? "A").split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "A";

export default function PlanipretAdminLayout() {
  const { lang, setLang } = useMplanipretLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [missingIntegrations, setMissingIntegrations] = useState(0);
  const [missedCalls, setMissedCalls] = useState(0);
  const [brokerCount, setBrokerCount] = useState(0);
  const [auditScore, setAuditScore] = useState<number | null>(null);
  const { status: rtStatus } = useAdminRealtime();
  const softphone = useMplanipretSoftphone();
  const realtimeOk = rtStatus === "live";
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialNumber, setDialNumber] = useState("");
  const [dialing, setDialing] = useState(false);

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
      const { data } = await supabase.from("planipret_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      if (data && data.role && data.role !== "admin") { navigate("/mplanipret", { replace: true }); return; }
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
      if (!session?.user) { navigate("/login", { replace: true }); return; }
      await loadProfile(session.user);
    })();

    return () => { cancelled = true; };
  }, [navigate]);

  const logout = async () => { await supabase.auth.signOut(); navigate("/login", { replace: true }); };

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

  if (loading) {
    return (
      <div className="planipret-scope planipret-admin-scope min-h-screen flex items-center justify-center"
        style={{ color: "var(--pp-text-muted)", fontFamily: "'Epilogue', sans-serif" }}>
        Chargement…
      </div>
    );
  }

  const title = PAGE_TITLES[location.pathname] ?? "Tableau de bord";
  const dateLabel = new Date().toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const sectionLabel = NAV.find((g) => g.items.some((i) => i.to === location.pathname))?.title ?? "Administration";

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
    <div className="planipret-scope planipret-admin-scope min-h-screen flex"
      style={{ background: "var(--pp-bg-base)", fontFamily: "'Epilogue', sans-serif" }}>
      {/* Mobile redirect notice */}
      <div className="md:hidden fixed inset-0 z-50 flex items-center justify-center p-6"
        style={{ background: "var(--pp-bg-base)" }}>
        <div className="text-center max-w-xs pp-card" style={{ padding: 24 }}>
          <h2 className="pp-heading" style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
            Dashboard admin
          </h2>
          <p style={{ fontSize: 13, color: "var(--pp-text-secondary)", marginBottom: 16 }}>
            Le dashboard admin est optimisé pour desktop. Sur mobile, utilisez l'application courtier.
          </p>
          <button onClick={() => navigate("/mplanipret")} className="pp-btn-primary">
            Ouvrir l'app mobile
          </button>
        </div>
      </div>

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
              <div className="pp-sidebar-brand" style={{ fontSize: 15 }}>Planiprêt</div>
              <div className="pp-sidebar-sub" style={{ fontSize: 11 }}>Admin Portal</div>
            </div>
          </div>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV.map((group) => (
            <div key={group.title}>
              <div className="pp-nav-section">{group.title}</div>
              {group.items.map(({ to, label, Icon, badge }) => (
                <NavLink key={to} to={to} end
                  className={({ isActive }) => `pp-nav-item ${isActive ? "is-active" : ""}`}>
                  {({ isActive }) => (
                    <>
                      <Icon className="w-[17px] h-[17px] flex-shrink-0"
                        style={{ color: isActive ? "var(--pp-brand-accent-2)" : "var(--pp-text-muted)" }} />
                      <span className="flex-1 truncate">{label}</span>
                      {renderBadge(badge)}
                    </>
                  )}
                </NavLink>
              ))}
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
      <div className="hidden md:flex flex-1 flex-col ml-[248px]">
        <header className="pp-app-header sticky top-0 flex items-center justify-between px-7 z-30" style={{ height: 64 }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="pp-eyebrow">{sectionLabel}</span>
            <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--pp-text-faint)" }} />
            <h1 className="pp-heading truncate" style={{ fontWeight: 700, fontSize: 18 }}>{title}</h1>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setPaletteOpen(true)}
              className="pp-search-bar flex items-center gap-2 px-3 h-9 text-xs"
              style={{ minWidth: 280, fontFamily: "'Epilogue', sans-serif" }}>
              <Search className="w-3.5 h-3.5" />
              <span className="flex-1 text-left">Rechercher courtiers, appels, intégrations…</span>
              <kbd className="pp-kbd">⌘K</kbd>
            </button>

            <div className="flex items-center gap-1.5"
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
              className="flex items-center gap-1.5 rounded-full px-2 py-1"
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



            <div className="hidden lg:flex flex-col items-end" style={{ paddingLeft: 4, borderLeft: "1px solid var(--pp-bg-border)", paddingInline: "12px 0", marginLeft: 4 }}>
              <span className="capitalize" style={{ fontSize: 10.5, color: "var(--pp-text-muted)", fontFamily: "'Urbanist', sans-serif", fontWeight: 500, letterSpacing: "0.02em" }}>
                {dateLabel}
              </span>
            </div>
          </div>
        </header>
        <main className="flex-1 p-7 overflow-y-auto">
          <Outlet context={{ profile, softphone }} />
        </main>
      </div>

      <PpActiveCallScreen softphone={softphone} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <SessionTimeoutModal />
    </div>
  );
}
