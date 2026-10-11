import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2, RefreshCw, CheckCircle2, AlertCircle, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const REDIRECT_URI = "https://avastatistic.ca/auth/maestro/callback";

/**
 * "Reconnecter Maestro" — forces a fresh OAuth authorization for the signed-in
 * account and refreshes the displayed connection state. Used on both the admin
 * and the broker commission pages.
 */
export default function MaestroReconnectButton({ lang }: { lang: "fr" | "en" }) {
  const isFr = lang !== "en";
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data } = await supabase.functions.invoke("maestro-oauth-status", {
        body: {},
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      const d = (data ?? {}) as any;
      setConnected(Boolean(d?.connected || d?.status === "connected"));
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => { void check(); }, [check]);

  const reconnect = async () => {
    setBusy(true);
    try {
      try { localStorage.setItem("pp-maestro-return-url", window.location.pathname + window.location.search); } catch { /* ignore */ }
      const { data, error } = await supabase.functions.invoke("maestro-oauth-start", {
        body: { platform: "web", origin: window.location.origin, redirect_uri: REDIRECT_URI, force: true },
      });
      if (error) throw error;
      const url = (data as any)?.authorize_url;
      if (!url) throw new Error((data as any)?.error ?? "no_authorize_url");
      window.location.href = String(url);
    } catch (e: any) {
      toast.error(isFr ? "Impossible d'ouvrir Maestro" : "Cannot open Maestro", { description: e?.message });
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke("maestro-oauth-disconnect", {
        body: {},
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error) throw error;
      setConnected(false);
      toast.success(isFr ? "Déconnecté de Maestro" : "Disconnected from Maestro");
    } catch (e: any) {
      toast.error(isFr ? "Déconnexion impossible" : "Cannot disconnect", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      {connected !== null && (
        <span className="inline-flex items-center gap-1" style={{ fontSize: 11.5, color: "var(--pp-text-muted)" }}>
          {connected
            ? <><CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#16a34a" }} />{isFr ? "Maestro connecté" : "Maestro connected"}</>
            : <><AlertCircle className="w-3.5 h-3.5" style={{ color: "#f59e0b" }} />{isFr ? "Maestro non connecté" : "Maestro not connected"}</>}
        </span>
      )}
      <button
        onClick={reconnect}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
        style={{
          fontSize: 12, fontWeight: 700, color: "var(--pp-text-primary)",
          background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)",
          opacity: busy ? .6 : 1,
        }}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : connected ? <RefreshCw className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
        {isFr ? "Reconnecter Maestro" : "Reconnect Maestro"}
      </button>
      <button
        onClick={() => void check()}
        className="px-2 py-1.5 rounded-lg"
        style={{ fontSize: 11.5, fontWeight: 700, background: "transparent", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-muted)" }}
      >
        {isFr ? "Actualiser l'état" : "Refresh state"}
      </button>
      {connected && (
        <button
          onClick={() => void disconnect()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
          style={{ fontSize: 11.5, fontWeight: 700, background: "transparent", border: "1px solid var(--pp-bg-border)", color: "#dc2626", opacity: busy ? .6 : 1 }}
        >
          <LogOut className="w-3.5 h-3.5" />
          {isFr ? "Déconnecter Maestro" : "Log out of Maestro"}
        </button>
      )}
    </div>
  );
}
