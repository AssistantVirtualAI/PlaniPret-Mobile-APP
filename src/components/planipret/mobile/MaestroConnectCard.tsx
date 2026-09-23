import { useEffect, useRef, useState, useCallback } from "react";
import { Link2, CheckCircle2, AlertCircle, Loader2, RefreshCw, LogOut, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { logDeepLink } from "@/lib/deepLinkDebug";
import { startNativeOAuthSession, canUseNativeAuthSession } from "@/lib/ms365AuthSession";

type Status = "loading" | "disconnected" | "pending" | "connected" | "error";

type StatusData = {
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
};

const EDGE_TIMEOUT_MS = 8_000;
const STATUS_COOLDOWN_MS = 60_000;
const STATUS_FRESH_MS = 5 * 60_000;
const POST_AUTH_WINDOW_MS = 60_000;
const POST_AUTH_POLL_DELAYS = [0, 2_000, 5_000];

// Shared across mounts: navigating between Commissions / Tâches remounts this
// card, and a forced status call on every mount made the app feel laggy.
const statusCache: { data: StatusData | null; at: number } = { data: null, at: 0 };

function statusFrom(data: StatusData): Status {
  if (data.status === "connected" || data.connected) return "connected";
  if (data.configured === false || data.status === "error" || data.error || data.last_error) return "error";
  if (data.status === "pending") return "pending";
  return "disconnected";
}

function readRecentPostAuthMarker(): boolean {
  try {
    const raw = localStorage.getItem("pp_maestro_just_connected");
    const timestamp = Number(raw);
    const fresh = Number.isFinite(timestamp) && timestamp > 0 && Date.now() - timestamp >= 0 && Date.now() - timestamp <= POST_AUTH_WINDOW_MS;
    if (!fresh) localStorage.removeItem("pp_maestro_just_connected");
    return fresh;
  } catch {
    return false;
  }
}

function clearPostAuthMarker() {
  try { localStorage.removeItem("pp_maestro_just_connected"); } catch { /* storage unavailable */ }
}

async function invokeMaestroEdge<T>(functionName: string, body: Record<string, unknown>, accessToken: string): Promise<T> {
  const baseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "");
  if (!baseUrl || !publishableKey) throw new Error("maestro_configuration_unavailable");

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (!response.ok) {
      const message = typeof payload === "object" && payload
        ? String((payload as Record<string, unknown>).error ?? (payload as Record<string, unknown>).message ?? `HTTP ${response.status}`)
        : `HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload as T;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("maestro_status_timeout");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Per-broker Maestro OAuth connect card for the mobile app.
 * Status checks are deliberately short, deduplicated and never trigger OAuth.
 * A disconnected Maestro account remains a non-blocking state: only an explicit
 * tap on "Se connecter à Maestro" starts an authorization session.
 */
export default function MaestroConnectCard() {
  const { lang } = useMplanipretLang();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>(() => (statusCache.data ? statusFrom(statusCache.data) : "loading"));
  const [data, setData] = useState<StatusData>(() => statusCache.data ?? {});
  const [busy, setBusy] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(() => (statusCache.at ? new Date(statusCache.at) : null));
  const [showDetails, setShowDetails] = useState(false);
  const pollTimers = useRef<number[]>([]);
  const authInFlight = useRef(false);
  const disconnectInFlight = useRef(false);
  const statusRequest = useRef<Promise<StatusData | null> | null>(null);
  const lastStatusStartedAt = useRef(statusCache.at);

  const isFr = lang === "fr";
  const L = {
    title: "Maestro",
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
    statusUnavailable: isFr ? "Statut Maestro temporairement indisponible. L’application reste utilisable; réessayez plus tard." : "Maestro status is temporarily unavailable. The app remains usable; try again later.",
    disconnectOk: isFr ? "Déconnecté de Maestro" : "Disconnected from Maestro",
    refresh: isFr ? "Rafraîchir" : "Refresh",
    details: isFr ? "Détails techniques" : "Technical details",
    checkedAt: isFr ? "Vérifié à" : "Checked at",
  };

  const clearPollTimers = useCallback(() => {
    pollTimers.current.forEach((timer) => window.clearTimeout(timer));
    pollTimers.current = [];
  }, []);

  const load = useCallback(async (force = false): Promise<StatusData | null> => {
    if (statusRequest.current) return statusRequest.current;
    if (!force && lastStatusStartedAt.current && Date.now() - lastStatusStartedAt.current < STATUS_COOLDOWN_MS) return null;

    lastStatusStartedAt.current = Date.now();
    const request = (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("maestro_session_required");
        const response = await invokeMaestroEdge<StatusData>("maestro-oauth-status", {}, session.access_token);
        statusCache.data = response ?? {};
        statusCache.at = Date.now();
        setData(response ?? {});
        setLastFetch(new Date());
        setStatus(statusFrom(response ?? {}));
        return response ?? {};
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "maestro_status_unavailable";
        const normalized = /timeout|abort|failed to fetch|network|load failed/i.test(message) ? "maestro_status_timeout" : message;
        // Keep the last known good status visible instead of flashing an error
        // when a background refresh fails while browsing the app.
        if (statusCache.data && (statusCache.data.connected || statusCache.data.status === "connected")) {
          setLastFetch(new Date());
          return null;
        }
        setData({ error: normalized });
        setLastFetch(new Date());
        setStatus("error");
        return null;
      } finally {
        statusRequest.current = null;
      }
    })();
    statusRequest.current = request;
    return request;
  }, []);

  // After a completed OAuth callback, perform at most three serial reads.
  // The marker expires, and every end state clears it, so no stale session can
  // create a repeated connection loop on subsequent app launches.
  const pollStatus = useCallback(() => {
    clearPollTimers();
    let attempt = 0;
    const run = async () => {
      const response = await load(true);
      if (response?.connected || response?.status === "connected" || attempt >= POST_AUTH_POLL_DELAYS.length - 1) {
        clearPostAuthMarker();
        return;
      }
      attempt += 1;
      const delay = POST_AUTH_POLL_DELAYS[attempt];
      pollTimers.current.push(window.setTimeout(() => { void run(); }, delay));
    };
    pollTimers.current.push(window.setTimeout(() => { void run(); }, POST_AUTH_POLL_DELAYS[0]));
  }, [clearPollTimers, load]);

  useEffect(() => {
    if (readRecentPostAuthMarker()) pollStatus();
    else if (!statusCache.data || Date.now() - statusCache.at > STATUS_FRESH_MS) void load(true);
    return clearPollTimers;
  }, [clearPollTimers, load, pollStatus]);

  // Refreshing status is passive. It never starts OAuth and is coalesced with
  // any request already underway, including app resume on a mobile device.
  useEffect(() => {
    const onConnected = () => pollStatus();
    const onVisible = () => { if (document.visibilityState === "visible") void load(false); };
    window.addEventListener("maestro:connected", onConnected);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    let remove: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener("appStateChange", ({ isActive }) => { if (isActive) void load(false); })
        .then((handle) => { remove = () => handle.remove(); })
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(isFr ? "Session Planiprêt expirée. Reconnectez-vous puis réessayez." : "Your Planiprêt session has expired. Sign in again and retry.");

      const isNative = Capacitor.isNativePlatform();
      const platform = isNative ? "mobile" : "web";
      const redirectUri = isNative ? "planipret://auth/maestro/callback" : `${window.location.origin}/auth/maestro/callback`;
      let mustForceLogin = force;
      try { mustForceLogin = mustForceLogin || localStorage.getItem("pp_maestro_force_login") === "1"; } catch { /* storage unavailable */ }
      const response = await invokeMaestroEdge<{ authorize_url?: string; error?: string }>(
        "maestro-oauth-start",
        { platform, redirect_uri: redirectUri, origin: window.location.origin, force: mustForceLogin },
        session.access_token,
      );
      const url = response?.authorize_url;
      if (!url) throw new Error(response?.error || "no_authorize_url");
      try { localStorage.removeItem("pp_maestro_force_login"); } catch { /* storage unavailable */ }

      if (isNative) {
        logDeepLink({ kind: "info", source: "MaestroConnect", detail: `opening Maestro with redirect_uri=${redirectUri}` });
        if (Capacitor.getPlatform() === "ios") {
          logDeepLink({ kind: "info", source: "MaestroConnect", detail: "auth path=ASWebAuthenticationSession" });
          let callbackUrl: string | null = null;
          try {
            callbackUrl = typeof startNativeOAuthSession === "function" && canUseNativeAuthSession()
              ? await startNativeOAuthSession(url, redirectUri)
              : null;
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logDeepLink({ kind: "error", source: "MaestroConnect", detail: `native auth session failed: ${message}` });
            throw new Error(isFr ? "La session Maestro n’a pas pu s’ouvrir. Synchronisez puis réinstallez l’app iOS." : "The Maestro session could not open. Sync and reinstall the iOS app.");
          }
          if (!callbackUrl) {
            logDeepLink({ kind: "info", source: "MaestroConnect", detail: "ASWebAuthenticationSession cancelled" });
            return;
          }
          const callback = new URL(callbackUrl);
          navigate(`/auth/maestro/callback${callback.search}`, { replace: true });
        } else {
          logDeepLink({ kind: "info", source: "MaestroConnect", detail: "auth path=Browser.open (android)" });
          await Browser.open({ url, presentationStyle: "fullscreen" });
        }
      } else {
        try { localStorage.setItem("pp_maestro_return_to", window.location.pathname + window.location.search); } catch { /* storage unavailable */ }
        window.location.href = url;
      }
      toast.info(L.opening);
    } catch (error: unknown) {
      const message = error instanceof Error && error.message === "maestro_status_timeout"
        ? (isFr ? "Maestro ne répond pas après 8 secondes. Réessayez sans fermer l’application." : "Maestro did not respond within 8 seconds. Retry without closing the app.")
        : L.statusUnavailable;
      toast.error(message);
    } finally {
      authInFlight.current = false;
      setBusy(false);
    }
  };

  const disconnect = async (): Promise<boolean> => {
    if (disconnectInFlight.current) return false;
    disconnectInFlight.current = true;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("maestro_session_required");
      await invokeMaestroEdge("maestro-oauth-disconnect", {}, session.access_token);
      try { localStorage.setItem("pp_maestro_force_login", "1"); } catch { /* storage unavailable */ }
      clearPostAuthMarker();
      toast.success(L.disconnectOk);
      await load(true);
      return true;
    } catch (error: unknown) {
      toast.error(L.statusUnavailable);
      return false;
    } finally {
      disconnectInFlight.current = false;
      setBusy(false);
    }
  };

  const dot = status === "connected" ? "#22c55e" : status === "error" ? "#ef4444" : status === "pending" ? "#f59e0b" : status === "loading" ? "#64748b" : "#f59e0b";
  const email = data.email ?? data.maestro_email;
  const brokerId = data.broker_id ?? data.maestro_broker_id;
  const errorMessage = data.configured === false ? L.notConfigured : L.statusUnavailable;

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

        {status === "pending" && <div style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>{L.pending}</div>}
        {status === "disconnected" && <div style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>{L.disconnected}{data.reason ? ` (${data.reason})` : ""}</div>}
        {status === "error" && (
          <div className="flex items-start gap-1" style={{ fontSize: 11, color: "#ef4444" }}>
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <div>{errorMessage}</div>
          </div>
        )}

        <div className="flex items-center justify-between mt-2" style={{ fontSize: 10, color: "var(--pp-text-muted)" }}>
          <button onClick={() => { void load(true); }} disabled={busy} className="flex items-center gap-1 disabled:opacity-60" style={{ background: "transparent", color: "var(--pp-text-muted)" }}>
            <RefreshCw className="w-3 h-3" /> {L.refresh}
          </button>
          {lastFetch && <span>{L.checkedAt} {lastFetch.toLocaleTimeString()}</span>}
        </div>

        <button onClick={() => setShowDetails((value) => !value)} className="flex items-center gap-1 mt-1" style={{ background: "transparent", fontSize: 10, color: "var(--pp-text-muted)" }}>
          <ChevronDown className="w-3 h-3" style={{ transform: showDetails ? "rotate(180deg)" : "none" }} /> {L.details}
        </button>
        {showDetails && (
          <pre style={{ marginTop: 6, padding: 8, background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)", borderRadius: 6, fontSize: 9, overflowX: "auto", color: "var(--pp-text-secondary)" }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        )}

        <div className="flex gap-2 mt-3">
          {status === "connected" ? (
            <button onClick={() => { void startAuth(false); }} disabled={busy || data.configured === false} className="flex items-center justify-center gap-1 flex-1 rounded-md" style={{ background: "#a855f7", color: "white", fontSize: 12, fontWeight: 600, padding: "8px 10px", opacity: busy || data.configured === false ? 0.5 : 1 }}>
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
              {L.connect}
            </button>
          ) : (
            <>
              <button onClick={async () => { if (await disconnect()) await startAuth(true); }} disabled={busy} className="flex items-center justify-center gap-1 flex-1 rounded-md" style={{ background: "var(--pp-bg-border-2)", color: "var(--pp-text-primary)", fontSize: 12, fontWeight: 600, padding: "8px 10px" }}>
                <RefreshCw className="w-3 h-3" /> {L.reconnect}
              </button>
              <button onClick={() => { void disconnect(); }} disabled={busy} className="flex items-center justify-center gap-1 rounded-md" style={{ background: "transparent", border: "1px solid #ef4444", color: "#ef4444", fontSize: 12, fontWeight: 600, padding: "8px 10px" }}>
                <LogOut className="w-3 h-3" /> {L.disconnect}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
