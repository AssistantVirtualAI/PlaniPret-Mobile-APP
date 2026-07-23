import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, ExternalLink, CheckCircle2, AlertTriangle, Clock, XCircle, AlertCircle, ShieldCheck, Wand2, RotateCcw, Copy } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { toast } from "sonner";

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


  // --- Guided setup wizard state ---
  const REDIRECT_URI = "https://avastatistic.ca/auth/maestro/callback";
  type ConfigCheck = {
    ok: boolean;
    ready: boolean;
    platform: string;
    redirect_uri: string;
    effective_client_id: string;
    authorize_host: string;
    checks: Array<{ id: string; label: string; ok: boolean; detail?: string }>;
  };
  const [cfg, setCfg] = useState<ConfigCheck | null>(null);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [whitelistConfirmed, setWhitelistConfirmed] = useState(false);

  const testConfig = async () => {
    setCfgLoading(true);
    setError(null);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("maestro-oauth-config-check", {
        body: { platform: "web", origin: "https://avastatistic.ca", redirect_uri: REDIRECT_URI },
      });
      if (fnErr) throw fnErr;
      setCfg(res as ConfigCheck);
    } catch (e: any) {
      setError(e?.message ?? "config_check_failed");
    } finally {
      setCfgLoading(false);
    }
  };

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(REDIRECT_URI);
      toast.success(lang === "fr" ? "redirect_uri copié" : "redirect_uri copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const resetSession = async () => {
    setError(null);
    try {
      // Wipe pending states, prior errors, then reload status.
      await supabase.from("planipret_maestro_oauth_states" as any).delete().eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "");
    } catch { /* ignore */ }
    try {
      await supabase.from("planipret_integration_secrets" as any).delete().eq("provider", "maestro_oauth_error");
    } catch { /* ignore */ }
    // Try to clear cookies scoped to current origin (best-effort; WebView/Safari usually blocks 3P cookies)
    try {
      document.cookie.split(";").forEach((c) => {
        const eq = c.indexOf("=");
        const name = (eq > -1 ? c.substring(0, eq) : c).trim();
        if (name) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
    } catch { /* ignore */ }
    setWhitelistConfirmed(false);
    setCfg(null);
    await load();
    toast.success(lang === "fr" ? "Session OAuth réinitialisée" : "OAuth session reset");
  };

  const retry = async () => {
    if (!data) return;
    if (!whitelistConfirmed) {
      toast.error(lang === "fr"
        ? "Confirme d'abord que le redirect_uri est whitelisté côté Maestro."
        : "Confirm the redirect_uri is whitelisted in Maestro first.");
      return;
    }
    setRetrying(true);
    setError(null);
    try {
      await supabase.from("planipret_integration_secrets" as any)
        .delete().eq("provider", "maestro_oauth_error");
    } catch { /* ignore */ }
    try {
      const { data: start, error: fnErr } = await supabase.functions.invoke("maestro-oauth-start", {
        body: {
          platform: "web",
          origin: "https://avastatistic.ca",
          redirect_uri: REDIRECT_URI,
        },
      });
      if (fnErr) throw fnErr;
      const startResp = start as any;
      if (startResp?.error) {
        throw new Error(`${startResp.error}${startResp.detail ? ` — ${startResp.detail}` : ""}`);
      }
      const url: string | undefined = startResp?.authorize_url;
      if (!url) throw new Error("no_authorize_url");

      let parsed: URL;
      try { parsed = new URL(url); } catch { throw new Error(`authorize_url_invalid: ${url}`); }
      if (parsed.protocol !== "https:") throw new Error(`authorize_url_not_https: ${url}`);
      window.location.href = parsed.toString();
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

      {/* Guided setup wizard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            {lang === "fr" ? "Assistant de configuration Maestro" : "Maestro configuration wizard"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="space-y-4">
            <li>
              <div className="font-medium mb-1">
                1. {lang === "fr" ? "Vérifier la config serveur" : "Verify server config"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={testConfig} disabled={cfgLoading}>
                  <ShieldCheck className={`h-4 w-4 mr-2 ${cfgLoading ? "animate-pulse" : ""}`} />
                  {lang === "fr" ? "Tester la config" : "Test config"}
                </Button>
                <Button size="sm" variant="outline" onClick={resetSession}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  {lang === "fr" ? "Réessayer (nouvelle session)" : "Retry (new session)"}
                </Button>
              </div>
              {cfg && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {lang === "fr" ? "Host authorize" : "Authorize host"}:{" "}
                    <code>{cfg.authorize_host || "—"}</code> · client_id:{" "}
                    <code>{cfg.effective_client_id || "—"}</code>
                  </div>
                  <ul className="space-y-1">
                    {cfg.checks.map((c) => (
                      <li key={c.id} className="flex items-start gap-2">
                        {c.ok
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                          : <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />}
                        <div className="min-w-0">
                          <div className="text-sm">{c.label}</div>
                          {c.detail && <div className="text-xs text-muted-foreground break-all">{c.detail}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {!cfg.ready && (
                    <div className="p-2 text-xs bg-amber-500/10 border border-amber-500/30 rounded text-amber-800">
                      {lang === "fr"
                        ? "Corrige les secrets manquants ou invalides avant de lancer l'OAuth."
                        : "Fix the missing/invalid secrets before launching OAuth."}
                    </div>
                  )}
                </div>
              )}
            </li>

            <li>
              <div className="font-medium mb-1">
                2. {lang === "fr" ? "Confirmer la whitelist Maestro" : "Confirm Maestro whitelist"}
              </div>
              <div className="p-3 rounded border bg-muted/40 space-y-2">
                <div className="text-xs text-muted-foreground">
                  {lang === "fr"
                    ? "Le redirect_uri exact envoyé par l'app :"
                    : "The exact redirect_uri sent by the app:"}
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs break-all flex-1">{REDIRECT_URI}</code>
                  <Button size="sm" variant="ghost" onClick={copyRedirect}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  {lang === "fr"
                    ? "Ouvre la console Maestro (client OAuth) et vérifie que cette URL exacte figure dans les Redirect URIs autorisés (caractère par caractère, sans / final supplémentaire)."
                    : "Open the Maestro console (OAuth client) and confirm this exact URL is listed in the allowed Redirect URIs (character-for-character, no trailing slash mismatch)."}
                </div>
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <Checkbox
                    checked={whitelistConfirmed}
                    onCheckedChange={(v) => setWhitelistConfirmed(v === true)}
                  />
                  <span className="text-sm">
                    {lang === "fr"
                      ? "J'ai vérifié que ce redirect_uri est whitelisté côté Maestro."
                      : "I confirmed this redirect_uri is whitelisted in Maestro."}
                  </span>
                </label>
              </div>
            </li>

            <li>
              <div className="font-medium mb-1">
                3. {lang === "fr" ? "Lancer / relancer l'OAuth" : "Start / restart OAuth"}
              </div>
              <div className="text-xs text-muted-foreground">
                {lang === "fr"
                  ? "Utilise le bouton de connexion ci-dessous. Il est actif seulement quand la whitelist est confirmée."
                  : "Use the connect button below. It only enables once the whitelist is confirmed."}
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>

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
                <Button onClick={retry} disabled={retrying || !data.configured || !whitelistConfirmed}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${retrying ? "animate-spin" : ""}`} />
                  {data.status === "connected" ? t.reconnect : t.connectToMaestro}
                </Button>
                {!whitelistConfirmed && (
                  <span className="text-xs text-muted-foreground self-center">
                    {lang === "fr"
                      ? "→ Confirme la whitelist à l'étape 2 pour activer."
                      : "→ Confirm whitelist at step 2 to enable."}
                  </span>
                )}
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
