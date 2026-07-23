import { useEffect, useState, useCallback } from "react";
import { Link2, CheckCircle2, AlertCircle, Loader2, RefreshCw, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type CardStatus = "loading" | "disconnected" | "connected" | "error" | "not_configured";

interface StatusResponse {
  /** "connected" | "pending" | "not_configured" | "disconnected" | "error" */
  status?: string;
  configured?: boolean;
  maestro_broker_id?: string | null;
  maestro_email?: string | null;
  expires_in?: number | null;
  last_error?: { message: string; at: string | null } | null;
  last_connected_at?: string | null;
}

/**
 * Per-broker Maestro OAuth connect card for the mobile app.
 * Uses PKCE flow (mobile client_id=3) and returns via planipret:// deep link.
 * Reads the `status` field from maestro-oauth-status (not `connected`).
 */
export default function MaestroConnectCard() {
  const { lang } = useMplanipretLang();
  const [cardStatus, setCardStatus] = useState<CardStatus>("loading");
  const [data, setData] = useState<StatusResponse>({});
  const [busy, setBusy] = useState(false);

  const isFr = lang === "fr";
  const L = {
    title: "Maestro",
    sub: isFr ? "Connectez votre compte Maestro à AVA" : "Connect your Maestro account to AVA",
    connect: isFr ? "Se connecter à Maestro" : "Connect to Maestro",
    reconnect: isFr ? "Reconnecter" : "Reconnect",
    disconnect: isFr ? "Déconnecter" : "Disconnect",
    connected: isFr ? "Connecté" : "Connected",
    opening: isFr ? "Ouverture de Maestro…" : "Opening Maestro…",
    error: isFr ? "Erreur de connexion" : "Connection error",
    disconnected: isFr ? "Non connecté" : "Not connected",
    notConfigured: isFr ? "Maestro n'est pas configuré côté serveur" : "Maestro is not configured on the server",
    disconnectOk: isFr ? "Déconnecté de Maestro" : "Disconnected from Maestro",
    pending: isFr ? "Connexion en attente…" : "Connection pending…",
  };

  const load = useCallback(async () => {
    try {
      const { data: res, error } = await supabase.functions.invoke("maestro-oauth-status", { body: {} });
      if (error) throw error;
      const d = (res ?? {}) as StatusResponse;
      setData(d);
      // maestro-oauth-status returns { status: "connected"|"disconnected"|"not_configured"|"error"|"pending" }
      const s = d.status ?? "disconnected";
      if (s === "connected") setCardStatus("connected");
      else if (s === "not_configured" || d.configured === false) setCardStatus("not_configured");
      else if (s === "error") setCardStatus("error");
      else setCardStatus("disconnected");
    } catch (e: any) {
      setData({ last_error: { message: e?.message || "status_failed", at: null } });
      setCardStatus("error");
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
      // Refresh status after callback completes
      setTimeout(() => { load(); }, 3000);
      setTimeout(() => { load(); }, 8000);
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
    cardStatus === "connected" ? "#22c55e" :
    cardStatus === "error" ? "#ef4444" :
    cardStatus === "not_configured" ? "#6b7280" :
    cardStatus === "loading" ? "#64748b" : "#f59e0b";

  const isConnected = cardStatus === "connected";
  const isNotConfigured = cardStatus === "not_configured";

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

        {cardStatus === "loading" && (
          <div className="flex items-center gap-2" style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>
            <Loader2 className="w-3 h-3 animate-spin" /> …
          </div>
        )}

        {isConnected && (
          <div style={{ fontSize: 11, color: "var(--pp-text-secondary)", fontFamily: "monospace", lineHeight: 1.6 }}>
            <div className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" style={{ color: "#22c55e" }} /> {L.connected}</div>
            {data.maestro_email && <div>✉ {data.maestro_email}</div>}
            {data.maestro_broker_id && <div>ID: {data.maestro_broker_id}</div>}
            {data.expires_in != null && <div>Expire dans: {Math.floor(data.expires_in / 3600)}h</div>}
          </div>
        )}

        {cardStatus === "disconnected" && (
          <div style={{ fontSize: 11, color: "var(--pp-text-secondary)" }}>{L.disconnected}</div>
        )}

        {isNotConfigured && (
          <div className="flex items-start gap-1" style={{ fontSize: 11, color: "#6b7280" }}>
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <div>{L.notConfigured}</div>
          </div>
        )}

        {cardStatus === "error" && (
          <div className="flex items-start gap-1" style={{ fontSize: 11, color: "#ef4444" }}>
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <div>{data.last_error?.message || L.error}</div>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          {!isConnected ? (
            <button
              onClick={startAuth}
              disabled={busy || isNotConfigured}
              className="flex items-center justify-center gap-1 flex-1 rounded-md"
              style={{
                background: "#a855f7", color: "white", fontSize: 12, fontWeight: 600,
                padding: "8px 10px", opacity: busy || isNotConfigured ? 0.5 : 1,
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
