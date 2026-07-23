import { useEffect, useState, useCallback } from "react";
import { Link2, CheckCircle2, AlertCircle, Loader2, RefreshCw, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Status = "loading" | "disconnected" | "connected" | "error";

interface StatusData {
  connected?: boolean;
  broker_id?: string | null;
  email?: string | null;
  scope?: string | null;
  expires_at?: string | null;
  error?: string | null;
  configured?: boolean;
}

/**
 * Per-broker Maestro OAuth connect card for the mobile app.
 * Uses PKCE flow (mobile client_id=3) and returns via planipret:// deep link.
 */
export default function MaestroConnectCard() {
  const { t, lang } = useMplanipretLang();
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<StatusData>({});
  const [busy, setBusy] = useState(false);

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
    notConfigured: isFr ? "Maestro n'est pas configuré côté serveur" : "Maestro is not configured on the server",
    disconnectOk: isFr ? "Déconnecté de Maestro" : "Disconnected from Maestro",
  };

  const load = useCallback(async () => {
    try {
      const { data: res, error } = await supabase.functions.invoke("maestro-oauth-status", { body: {} });
      if (error) throw error;
      const d = (res ?? {}) as StatusData;
      setData(d);
      if (d.configured === false) setStatus("error");
      else if (d.connected) setStatus("connected");
      else if (d.error) setStatus("error");
      else setStatus("disconnected");
    } catch (e: any) {
      setData({ error: e?.message || "status_failed" });
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startAuth = async () => {
    setBusy(true);
    try {
      const isNative = Capacitor.isNativePlatform();
      const platform = isNative ? "mobile" : "web";
      const redirectUri = isNative
        ? "planipret://auth/maestro/callback"
        : `${window.location.origin}/auth/maestro/callback`;

      const { data: res, error } = await supabase.functions.invoke("maestro-oauth-start", {
        body: { platform, redirect_uri: redirectUri, origin: window.location.origin },
      });
      if (error) throw error;
      const url = (res as any)?.authorize_url;
      const resError = (res as any)?.error;
      if (!url) throw new Error(resError || "no_authorize_url");
      // Validate URL before opening — prevents Safari "l'adresse n'est pas valide"
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") throw new Error(`URL doit être https, reçu: ${parsed.protocol}`);
      } catch (urlErr: any) {
        throw new Error(`URL Maestro invalide: ${urlErr?.message ?? url}`);
      }
      if (isNative) {
        await Browser.open({ url, presentationStyle: "popover" });
      } else {
        window.location.href = url;
      }
      toast.info(L.opening);
      // Refresh status shortly after — the deep-link callback will complete auth
      setTimeout(() => { load(); }, 3000);
    } catch (e: any) {
      toast.error(e?.message || L.error);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("maestro-oauth-disconnect", { body: {} });
      if (error) throw error;
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
    status === "loading" ? "#64748b" : "#f59e0b";

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
            {data.email && <div>✉ {data.email}</div>}
            {data.broker_id && <div>ID: {data.broker_id}</div>}
            {data.scope && <div>Scope: {data.scope}</div>}
          </div>
        )}

        {status === "disconnected" && (
          <div style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>{L.disconnected}</div>
        )}

        {status === "error" && (
          <div className="flex items-start gap-1" style={{ fontSize: 11, color: "#ef4444" }}>
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <div>{data.configured === false ? L.notConfigured : (data.error || L.error)}</div>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          {status !== "connected" ? (
            <button
              onClick={startAuth}
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
                onClick={startAuth}
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
      </div>
    </div>
  );
}
