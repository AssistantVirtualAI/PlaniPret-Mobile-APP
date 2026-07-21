import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ExternalLink, CheckCircle2, AlertTriangle, Clock, XCircle, AlertCircle } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const DICT = {
  fr: {
    title: "Maestro OAuth",
    subtitle: "État de la connexion broker Maestro",
    refresh: "Rafraîchir",
    statusLabel: "Statut",
    unknownError: "Erreur inconnue",
    cannotStartConnection: "Impossible de démarrer la connexion Maestro",
    statusConnected: "Connecté",
    statusPending: "En attente",
    statusNotConfigured: "Non configuré",
    statusDisconnected: "Déconnecté",
    statusError: "Erreur",
    lastAuthError: "Dernière erreur d'autorisation",
    redirectUri: "Redirect URI",
    configuredEndpoints: "Endpoints configurés",
    yes: "Oui",
    noMissingSecrets: "Non (secrets manquants côté serveur)",
    lastConnection: "Dernière connexion",
    pendingCodes: "Codes en attente",
    tokenExpiration: "Expiration token",
    maestroBrokerId: "Maestro broker id",
    maestroEmail: "Maestro email",
    reconnect: "Reconnecter",
    connectToMaestro: "Se connecter à Maestro",
    secretsNotice: (
      <>
        Les secrets <code>MAESTRO_OAUTH_AUTHORIZE_URL</code>, <code>MAESTRO_OAUTH_TOKEN_URL</code>,{" "}
        <code>MAESTRO_OAUTH_CLIENT_ID</code> et <code>MAESTRO_OAUTH_CLIENT_SECRET</code> doivent être renseignés côté serveur.
      </>
    ),
  },
  en: {
    title: "Maestro OAuth",
    subtitle: "Maestro broker connection status",
    refresh: "Refresh",
    statusLabel: "Status",
    unknownError: "Unknown error",
    cannotStartConnection: "Unable to start the Maestro connection",
    statusConnected: "Connected",
    statusPending: "Pending",
    statusNotConfigured: "Not configured",
    statusDisconnected: "Disconnected",
    statusError: "Error",
    lastAuthError: "Last authorization error",
    redirectUri: "Redirect URI",
    configuredEndpoints: "Configured endpoints",
    yes: "Yes",
    noMissingSecrets: "No (missing secrets server-side)",
    lastConnection: "Last connection",
    pendingCodes: "Pending codes",
    tokenExpiration: "Token expiration",
    maestroBrokerId: "Maestro broker id",
    maestroEmail: "Maestro email",
    reconnect: "Reconnect",
    connectToMaestro: "Connect to Maestro",
    secretsNotice: (
      <>
        The secrets <code>MAESTRO_OAUTH_AUTHORIZE_URL</code>, <code>MAESTRO_OAUTH_TOKEN_URL</code>,{" "}
        <code>MAESTRO_OAUTH_CLIENT_ID</code> and <code>MAESTRO_OAUTH_CLIENT_SECRET</code> must be set server-side.
      </>
    ),
  },
};

type StatusResp = {
  status: "connected" | "pending" | "not_configured" | "disconnected" | "error";
  configured: boolean;
  last_connected_at: string | null;
  expires_in: number | null;
  pending_count: number;
  redirect_uri: string;
  maestro_broker_id?: string | null;
  maestro_email?: string | null;
  last_error: { message: string; at: string | null; http_status?: number } | null;
};

export default function PAMaestroStatus() {
  const { lang } = useMplanipretLang();
  const t = DICT[lang];
  const [data, setData] = useState<StatusResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("maestro-oauth-status");
      if (fnErr) throw fnErr;
      setData(res as StatusResp);
    } catch (e: any) {
      setError(e?.message ?? t.unknownError);
    } finally {
      setLoading(false);
    }
  }, [t.unknownError]);

  useEffect(() => { load(); }, [load]);

  const badge = () => {
    if (!data) return null;
    const map: Record<StatusResp["status"], { label: string; cls: string; Icon: any }> = {
      connected:      { label: t.statusConnected,     cls: "bg-emerald-600",  Icon: CheckCircle2 },
      pending:        { label: t.statusPending,       cls: "bg-amber-600",    Icon: Clock },
      not_configured: { label: t.statusNotConfigured, cls: "bg-slate-600",    Icon: AlertTriangle },
      disconnected:   { label: t.statusDisconnected,  cls: "bg-red-600",      Icon: XCircle },
      error:          { label: t.statusError,         cls: "bg-red-700",      Icon: AlertCircle },
    };
    const m = map[data.status];
    const Icon = m.Icon;
    return <Badge className={`${m.cls} text-white gap-1.5`}><Icon className="h-3.5 w-3.5" />{m.label}</Badge>;
  };

  const retry = async () => {
    if (!data) return;
    setRetrying(true);
    try {
      await supabase.from("planipret_integration_secrets" as any)
        .delete().eq("provider", "maestro_oauth_error");
    } catch { /* ignore */ }
    try {
      // Maestro n'a enregistré QUE https://avastatistic.ca/auth/maestro/callback.
      // On force ce redirect_uri même depuis les previews Lovable.
      const { data: start, error: fnErr } = await supabase.functions.invoke("maestro-oauth-start", {
        body: {
          origin: "https://avastatistic.ca",
          redirect_uri: "https://avastatistic.ca/auth/maestro/callback",
        },
      });
      if (fnErr) throw fnErr;
      const url = (start as any)?.authorize_url;
      if (url) { window.location.href = url; return; }
      throw new Error((start as any)?.error ?? "no_authorize_url");
    } catch (e: any) {
      setError(e?.message ?? t.cannotStartConnection);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {t.refresh}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t.statusLabel}</CardTitle>
          {badge()}
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-600">{error}</div>}

          {data?.last_error && (
            <div className="p-3 bg-red-500/10 border border-red-500/40 rounded space-y-1">
              <div className="flex items-center gap-2 text-red-700 font-medium">
                <AlertCircle className="h-4 w-4" />
                {t.lastAuthError}
              </div>
              <div className="text-red-700 text-sm break-words">{data.last_error.message}</div>
              <div className="text-xs text-muted-foreground">
                {data.last_error.http_status ? `HTTP ${data.last_error.http_status} · ` : ""}
                {data.last_error.at ? new Date(data.last_error.at).toLocaleString() : ""}
              </div>
            </div>
          )}

          {data && (
            <>
              <Row label={t.redirectUri} value={<code className="text-xs break-all">{data.redirect_uri}</code>} />
              <Row label={t.configuredEndpoints} value={data.configured ? t.yes : t.noMissingSecrets} />
              <Row label={t.lastConnection} value={data.last_connected_at ? new Date(data.last_connected_at).toLocaleString() : "—"} />
              <Row label={t.pendingCodes} value={String(data.pending_count)} />
              {data.expires_in != null && <Row label={t.tokenExpiration} value={`${data.expires_in}s`} />}
              {data.maestro_broker_id && <Row label={t.maestroBrokerId} value={<code className="text-xs">{data.maestro_broker_id}</code>} />}
              {data.maestro_email && <Row label={t.maestroEmail} value={data.maestro_email} />}

              <div className="pt-4 flex flex-wrap gap-2">
                <Button onClick={retry} disabled={retrying || !data.configured}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${retrying ? "animate-spin" : ""}`} />
                  {data.status === "connected" ? t.reconnect : t.connectToMaestro}
                </Button>
              </div>

              {data.status === "not_configured" && (
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  {t.secretsNotice}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
