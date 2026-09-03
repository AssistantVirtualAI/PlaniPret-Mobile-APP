import { useEffect, useRef, useState, useCallback } from "react";
import { Link2, CheckCircle2, AlertCircle, Loader2, RefreshCw, LogOut, Bug, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { logDeepLink } from "@/lib/deepLinkDebug";
// Import statique : le import() dynamique renvoyait un module vide dans le
// bundle natif ("ie is not a function"), ce qui cassait « Reconnecter ».
import { startNativeOAuthSession, canUseNativeAuthSession } from "@/lib/ms365AuthSession";

type Status = "loading" | "disconnected" | "pending" | "connected" | "error";


interface StatusData {
  status?: "connected" | "pending" | "not_configured" | "disconnected" | "error";
  connected?: boolean;
  broker_id?: string | null;
  maestro_broker_id?: string | null;
  email?: string | null;
  maestro_email?: string | null;
  scope?: string | null;
  expires_at?: string | null;
  error?: string | null;
  last_error?: { message?: string | null } | null;
  configured?: boolean;
  reason?: string | null;
  user_id?: string | null;
  expires_in?: number | null;

}

/**
 * Per-broker Maestro OAuth connect card for the mobile app.
 * Uses PKCE flow (mobile client_id=3) and returns via planipret:// deep link.
 */
export default function MaestroConnectCard() {
  const { t, lang } = useMplanipretLang();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<StatusData>({});
  const [busy, setBusy] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const pollTimers = useRef<number[]>([]);
  const authInFlight = useRef(false);

  const isFr = lang === "fr";
  const L = {
    title: isFr ? "Maestro" : "Maestro",
    sub: isFr ? "Connectez votre compte Maestro à AVA" : "Connect your Maestro account to AVA",
    connect: isFr ? "Se connecter à Maestro" : "Connect to Maestro",
    reconnect: isFr ? "Reconnecter" : "Reconnect",
    disconnect: isFr ? "Déconnecter" : "Disconnect",
    connected: isFr ? "Connecté" : "Connected",
    opening: isFr ? "Ouverture de Maestro…" : "Opening Maestro…",
    error: isFr ? "Erreur" : "Error",
    disconnected: isFr ? "Non connecté" : "Not connected",
    pending: isFr ? "Connexion en attente" : "Connection pending",
    notConfigured: isFr ? "Maestro n'est pas configuré côté serveur" : "Maestro is not configured on the server",
    disconnectOk: isFr ? "Déconnecté de Maestro" : "Disconnected from Maestro",
    refresh: isFr ? "Rafraîchir" : "Refresh",
    details: isFr ? "Détails techniques" : "Technical details",
    checkedAt: isFr ? "Vérifié à" : "Checked at",
  };

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: res, error } = await supabase.functions.invoke("maestro-oauth-status", {
        body: {},
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error) throw error;
      const d = (res ?? {}) as StatusData;
      setData(d);
      setLastFetch(new Date());
      if (d.status === "connected" || d.connected) setStatus("connected");
      else if (d.configured === false) setStatus("error");
      else if (d.status === "pending") setStatus("pending");
      else if (d.status === "error" || d.error || d.last_error) setStatus("error");
      else setStatus("disconnected");
      return d;
    } catch (e: any) {
      setData({ error: e?.message || "status_failed" });
      setLastFetch(new Date());
      setStatus("error");
      return null;
    }
  }, []);

  // Poll a few times so the UI catches up with the server write after OAuth.
  const pollStatus = useCallback(() => {
    pollTimers.current.forEach((t) => window.clearTimeout(t));
    pollTimers.current = [0, 1500, 4000, 8000].map((delay) =>
      window.setTimeout(async () => {
        const d = await load();
        if (d?.status === "connected" || d?.connected) {
          try { localStorage.removeItem("pp_maestro_just_connected"); } catch {}
        }
      }, delay),
    );
  }, [load]);

  useEffect(() => {
    let justConnected = false;
    try { justConnected = !!localStorage.getItem("pp_maestro_just_connected"); } catch {}
    if (justConnected) pollStatus(); else load();
    return () => pollTimers.current.forEach((t) => window.clearTimeout(t));
  }, [load, pollStatus]);

  // Refresh whenever the OAuth callback finishes, the app resumes from the
  // in-app browser, or the tab becomes visible again.
  useEffect(() => {
    const onConnected = () => pollStatus();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("maestro:connected", onConnected);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    let remove: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener("appStateChange", ({ isActive }) => { if (isActive) load(); })
        .then((h) => { remove = () => h.remove(); })
        .catch(() => {});
    }
    return () => {
      window.removeEventListener("maestro:connected", onConnected);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      remove?.();
    };
  }, [load, pollStatus]);


  const startAuth = async (force = false) => {
    if (authInFlight.current) return;
    authInFlight.current = true;
    setBusy(true);
    try {
      const isNative = Capacitor.isNativePlatform();

      const platform = isNative ? "mobile" : "web";
      const redirectUri = isNative
        ? "planipret://auth/maestro/callback"
        : `${window.location.origin}/auth/maestro/callback`;

      let mustForceLogin = force;
      try { mustForceLogin = mustForceLogin || localStorage.getItem("pp_maestro_force_login") === "1"; } catch { /* ignore */ }
      const { data: res, error } = await supabase.functions.invoke("maestro-oauth-start", {
        body: { platform, redirect_uri: redirectUri, origin: window.location.origin, force: mustForceLogin },
      });
      if (error) throw error;
      const url = (res as any)?.authorize_url;
      if (!url) throw new Error((res as any)?.error || "no_authorize_url");
      try { localStorage.removeItem("pp_maestro_force_login"); } catch { /* ignore */ }

      if (isNative) {
        logDeepLink({ kind: "info", source: "MaestroConnect", detail: `opening Maestro with redirect_uri=${redirectUri}` });
        if (Capacitor.getPlatform() === "ios") {
          // Browser.open cannot return a custom-scheme callback on iOS
          // ("Unable to display URL"): ASWebAuthenticationSession is mandatory.
          logDeepLink({ kind: "info", source: "MaestroConnect", detail: "auth path=ASWebAuthenticationSession" });
          let callbackUrl: string | null = null;
          try {
            callbackUrl = typeof startNativeOAuthSession === "function" && canUseNativeAuthSession()
              ? await startNativeOAuthSession(url, redirectUri, mustForceLogin)
              : null;
          } catch (e: any) {
            logDeepLink({ kind: "error", source: "MaestroConnect", detail: `native auth session failed: ${e?.message ?? e}` });
            throw new Error(isFr ? "La session Maestro n’a pas pu s’ouvrir. Synchronisez puis réinstallez l’app iOS." : "The Maestro session could not open. Sync and reinstall the iOS app.");
          }
          if (!callbackUrl) {
            // User cancelled ASWebAuthenticationSession. Browser.open is not a
            // valid fallback for a custom iOS scheme ("Unable to display URL").
            logDeepLink({ kind: "info", source: "MaestroConnect", detail: "ASWebAuthenticationSession cancelled" });
            return;
          }
          try { localStorage.setItem("pp_maestro_callback_url", callbackUrl); } catch {}
          const callback = new URL(callbackUrl);
          // NE PAS faire `window.location.href` ici : sur iOS/Android cela
          // recharge tout le WebView depuis capacitor://localhost/auth/... et
          // l'app reste bloquée sur l'écran « Démarrage… ». On route côté
          // client pour rester dans l'application déjà montée.
          navigate(`/auth/maestro/callback${callback.search}`, { replace: true });
        } else {
          logDeepLink({ kind: "info", source: "MaestroConnect", detail: "auth path=Browser.open (android)" });
          await Browser.open({ url, presentationStyle: "fullscreen" });
        }
      } else {
        window.location.href = url;
      }
      toast.info(L.opening);
      try { localStorage.setItem("pp_maestro_just_connected", String(Date.now())); } catch {}
      // Refresh status shortly after — the deep-link callback will complete auth
      pollStatus();

    } catch (e: any) {
      toast.error(e?.message || L.error);
    } finally {
      authInFlight.current = false;
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("maestro-oauth-disconnect", { body: {} });
      if (error) throw error;
      // The next connection must show Maestro's login page instead of silently
      // reusing the browser/webview SSO session.
      try { localStorage.setItem("pp_maestro_force_login", "1"); } catch { /* ignore */ }
      window.dispatchEvent(new Event("maestro:connected"));
      toast.success(L.disconnectOk);
      await load();
    } catch (e: any) {
      toast.error(e?.message || L.error);
    } finally {
      setBusy(false);
    }
  };

  const dot =
    status === "connected" ? "#22c55e" :
    status === "error" ? "#ef4444" :
    status === "pending" ? "#f59e0b" :
    status === "loading" ? "#64748b" : "#f59e0b";
  const email = data.email ?? data.maestro_email;
  const brokerId = data.broker_id ?? data.maestro_broker_id;
  const errorMessage = data.error ?? data.last_error?.message ?? L.error;

  return (
    <div style={{ padding: "0 12px 8px" }}>
      <div className="rounded-lg" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", padding: 12 }}>
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="w-4 h-4" style={{ color: "#a855f7" }} />
          <div className="flex-1">
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pp-text-primary)" }}>{L.title}</div>
            <div style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>{L.sub}</div>
          </div>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, display: "inline-block" }} />
        </div>

        {status === "loading" && (
          <div className="flex items-center gap-2" style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>
            <Loader2 className="w-3 h-3 animate-spin" /> …
          </div>
        )}

        {status === "connected" && (
          <div style={{ fontSize: 11, color: "var(--pp-text-secondary)", fontFamily: "monospace", lineHeight: 1.6 }}>
            <div className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" style={{ color: "#22c55e" }} /> {L.connected}</div>
            {email && <div>✉ {email}</div>}
            {brokerId && <div>ID: {brokerId}</div>}
            {data.scope && <div>Scope: {data.scope}</div>}
          </div>
        )}

        {status === "pending" && (
          <div style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>{L.pending}</div>
        )}

        {status === "disconnected" && (
          <div style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>
            {L.disconnected}{data.reason ? ` (${data.reason})` : ""}
          </div>
        )}

        {status === "error" && (
          <div className="flex items-start gap-1" style={{ fontSize: 11, color: "#ef4444" }}>
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <div>{data.configured === false ? L.notConfigured : errorMessage}</div>
          </div>
        )}

        <div className="flex items-center justify-between mt-2" style={{ fontSize: 10, color: "var(--pp-text-muted)" }}>
          <button onClick={() => load()} className="flex items-center gap-1" style={{ background: "transparent", color: "var(--pp-text-muted)" }}>
            <RefreshCw className="w-3 h-3" /> {L.refresh}
          </button>
          {lastFetch && <span>{L.checkedAt} {lastFetch.toLocaleTimeString()}</span>}
        </div>

        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1 mt-1"
          style={{ background: "transparent", fontSize: 10, color: "var(--pp-text-muted)" }}
        >
          <ChevronDown className="w-3 h-3" style={{ transform: showDetails ? "rotate(180deg)" : "none" }} /> {L.details}
        </button>
        {showDetails && (
          <pre style={{ marginTop: 6, padding: 8, background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)", borderRadius: 6, fontSize: 9, overflowX: "auto", color: "var(--pp-text-secondary)" }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        )}


        <div className="flex gap-2 mt-3">
          {status !== "connected" ? (
            <button
              onClick={() => startAuth(false)}
              disabled={busy || data.configured === false}
              className="flex items-center justify-center gap-1 flex-1 rounded-md"
              style={{
                background: "#a855f7", color: "white", fontSize: 12, fontWeight: 600,
                padding: "8px 10px", opacity: busy || data.configured === false ? 0.5 : 1,
              }}
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
              {L.connect}
            </button>
          ) : (
            <>
              <button
                onClick={async () => {
                  try { await supabase.functions.invoke("maestro-oauth-disconnect", { body: {} }); } catch { /* ignore */ }
                  await startAuth(true);
                }}
                disabled={busy}
                className="flex items-center justify-center gap-1 flex-1 rounded-md"
                style={{ background: "var(--pp-bg-border-2)", color: "var(--pp-text-primary)", fontSize: 12, fontWeight: 600, padding: "8px 10px" }}
              >
                <RefreshCw className="w-3 h-3" /> {L.reconnect}
              </button>
              <button
                onClick={disconnect}
                disabled={busy}
                className="flex items-center justify-center gap-1 rounded-md"
                style={{ background: "transparent", border: "1px solid #ef4444", color: "#ef4444", fontSize: 12, fontWeight: 600, padding: "8px 10px" }}
              >
                <LogOut className="w-3 h-3" /> {L.disconnect}
              </button>
            </>
          )}
        </div>

        <Link
          to="/mplanipret/deep-link-debug"
          className="flex items-center gap-1 mt-2"
          style={{ fontSize: 10, color: "var(--pp-text-muted)", textDecoration: "none" }}
        >
          <Bug className="w-3 h-3" /> {isFr ? "Debug deep links" : "Deep link debug"}
        </Link>
      </div>
    </div>
  );
}
