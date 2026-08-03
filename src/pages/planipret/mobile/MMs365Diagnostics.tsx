/**
 * Microsoft 365 diagnostics — mobile-friendly (no admin panel).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMs365Status } from "@/components/planipret/Ms365StatusBadge";
import { ArrowLeft, RefreshCw, LogIn, Copy, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { buildMs365AuthorizeUrl, getMs365RedirectUri } from "@/lib/ms365OAuth";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

export default function MMs365Diagnostics() {
  const nav = useNavigate();
  const { t } = useMplanipretLang();
  const { data, loading, refresh } = useMs365Status(30_000);
  const [teamsCheck, setTeamsCheck] = useState<{ loading: boolean; ok: boolean | null; message: string; sample?: any[] }>({ loading: false, ok: null, message: "" });
  const [importState, setImportState] = useState<{ loading: boolean; ok: boolean | null; message: string }>({ loading: false, ok: null, message: "" });

  async function runImport(mode: "initial" | "delta" | "manual") {
    setImportState({ loading: true, ok: null, message: "" });
    try {
      const { data: res, error } = await supabase.functions.invoke("ms365-full-import", { body: { mode } });
      if (error) throw error;
      const summary = (res as any)?.summary ?? res;
      setImportState({ loading: false, ok: true, message: `${t("screens.ms365Diag.importDoneLabel")} ${mode} ${t("screens.ms365Diag.importDoneSuffix")} (${JSON.stringify(summary)})` });
      toast.success(t("screens.ms365Diag.syncStartedToast"));
    } catch (e: any) {
      setImportState({ loading: false, ok: false, message: e?.message ?? String(e) });
      toast.error(t("screens.ms365Diag.syncFailedToast"));
    }
  }

  const callbackUrl = getMs365RedirectUri();

  async function startLogin() {
    if (!data?.detection.tenant_id || !data?.detection.client_id) {
      toast.error(t("screens.ms365Diag.missingConfigToast"));
      return;
    }
    window.location.href = await buildMs365AuthorizeUrl({
      clientId: data.detection.client_id,
      tenant: data.detection.tenant_id,
      prompt: "select_account",
    });
  }

  async function testTeams() {
    setTeamsCheck({ loading: true, ok: null, message: "" });
    try {
      const { data: res, error } = await supabase.functions.invoke("ms365-teams-list", { body: {} });
      if (error) throw error;
      const teams = (res as any)?.teams ?? [];
      const chats = (res as any)?.chats ?? [];
      if ((res as any)?.connected === false) {
        setTeamsCheck({ loading: false, ok: false, message: t("screens.ms365Diag.notConnectedFirst") });
        return;
      }
      setTeamsCheck({ loading: false, ok: true, message: `${teams.length} ${t("screens.ms365Diag.teamsResultLabel")}, ${chats.length} ${t("screens.ms365Diag.chatsResultLabel")}`, sample: teams.slice(0, 3) });
    } catch (e: any) {
      setTeamsCheck({ loading: false, ok: false, message: e?.message ?? String(e) });
    }
  }

  const statusColor = data?.status === "ok" ? "#2EDC78" : data?.status === "limited" ? "#F5A623" : "#E84C4C";
  const StatusIcon = data?.status === "ok" ? CheckCircle2 : data?.status === "limited" ? AlertTriangle : XCircle;

  return (
    <div className="min-h-full p-4 pb-8" style={{ background: "#060D1A", color: "#E8EDF5" }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => nav(-1)} className="p-2 rounded-lg" style={{ background: "#0A1628", border: "1px solid #0E2A45" }}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{t("screens.ms365Diag.title")}</h1>
            <p className="text-xs" style={{ color: "#8FA8C0" }}>{t("screens.ms365Diag.subtitle")}</p>
          </div>
          <button onClick={refresh} className="p-2 rounded-lg" style={{ background: "#0A1628", border: "1px solid #0E2A45" }}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="rounded-xl p-4 mb-3" style={{ background: "#0A1628", border: `1px solid ${statusColor}44` }}>
          <div className="flex items-center gap-3">
            <StatusIcon className="w-8 h-8" style={{ color: statusColor }} />
            <div className="flex-1">
              <div className="text-base font-bold" style={{ color: statusColor }}>
                {loading ? t("screens.ms365Diag.analyzing") : data?.status === "ok" ? t("screens.ms365Diag.connectionOk") : data?.status === "limited" ? t("screens.ms365Diag.connectionLimited") : t("screens.ms365Diag.connectionDown")}
              </div>
              <div className="text-xs" style={{ color: "#8FA8C0" }}>
                {data?.user.connected ? `${t("screens.ms365Diag.account")}: ${data.user.email ?? "?"}` : t("screens.ms365Diag.noAccountConnected")}
                {data?.user.expired && ` · ${t("screens.ms365Diag.tokenExpired")}`}
              </div>
            </div>
            <button onClick={startLogin} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "#0078D4", color: "white" }}>
              <LogIn className="w-3.5 h-3.5" />
              {data?.user.connected ? t("screens.ms365Diag.reconnect") : t("screens.ms365Diag.login")}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3 mb-3">
          <Card title={t("screens.ms365Diag.adminConfigTitle")}>
            <Row ok={!!data?.detection.tenant_id} label={t("screens.ms365Diag.tenantId")} value={data?.detection.tenant_id ?? t("screens.ms365Diag.notDetected")} mono />
            <Row ok={!!data?.detection.client_id} label={t("screens.ms365Diag.clientId")} value={data?.detection.client_id ?? t("screens.ms365Diag.notDetected")} mono />
            <Row ok={true} label={t("screens.ms365Diag.oauthMode")} value={data?.detection.auth_mode ?? "auto"} />
            <Row ok={!!data?.detection.has_secret || data?.detection.auth_mode !== "confidential"} label={t("screens.ms365Diag.clientSecret")} value={data?.detection.has_secret ? t("screens.ms365Diag.secretRegistered") : t("screens.ms365Diag.secretNotRequired")} />
          </Card>
          <Card title={t("screens.ms365Diag.userSessionTitle")}>
            <Row ok={!!data?.user.connected} label={t("screens.ms365Diag.accountConnected")} value={data?.user.email ?? "—"} />
            <Row ok={!!data?.user.has_refresh} label={t("screens.ms365Diag.refreshToken")} value={data?.user.has_refresh ? t("screens.ms365Diag.present") : t("screens.ms365Diag.absent")} />
            <Row ok={!!data?.user.connected && !data?.user.expired} label={t("screens.ms365Diag.accessToken")}
              value={data?.user.expires_in_sec == null ? "—" : data.user.expires_in_sec > 0 ? `${t("screens.ms365Diag.validRemaining")} (${Math.floor(data.user.expires_in_sec / 60)} ${t("screens.ms365Diag.minRemaining")})` : `${t("screens.ms365Diag.expiredSince")} ${Math.abs(Math.floor(data.user.expires_in_sec / 60))} ${t("screens.ms365Diag.minAgo")}`} />
            <Row ok={!!data?.user.scopes.length} label={t("screens.ms365Diag.scopesGranted")} value={`${data?.user.scopes.length ?? 0} ${t("screens.ms365Diag.scopes")}`} />
          </Card>
        </div>

        <Card title={t("screens.ms365Diag.callbackUrlTitle")}>
          <div className="flex items-center gap-2 flex-wrap">
            <code style={{ background: "#040B16", padding: "6px 10px", borderRadius: 6, fontSize: 11, color: "#E8EDF5", border: "1px solid #0E2A45" }}>{callbackUrl}</code>
            <button onClick={() => { navigator.clipboard.writeText(callbackUrl); toast.success(t("screens.ms365Diag.copiedToast")); }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
              style={{ background: "#0D1F35", border: "1px solid #0E2A45", color: "#2E9BDC" }}>
              <Copy className="w-3 h-3" /> {t("screens.ms365Diag.copy")}
            </button>
          </div>
          <p className="text-[11px] mt-2" style={{ color: "#8FA8C0" }}>
            {t("screens.ms365Diag.webLabel")}: {callbackUrl} · {t("screens.ms365Diag.nativeLabel")}: {data?.detection.redirect_uris?.native?.[0] ?? "capacitor://localhost/auth/microsoft/callback"}
          </p>
        </Card>

        <Card title={t("screens.ms365Diag.teamsTitle")}>
          <div className="flex items-center gap-2 mb-2">
            <button onClick={testTeams} disabled={teamsCheck.loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-60"
              style={{ background: "#0078D4", color: "white" }}>
              {teamsCheck.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {t("screens.ms365Diag.testTeams")}
            </button>
            {teamsCheck.ok !== null && (
              <span className="text-xs" style={{ color: teamsCheck.ok ? "#2EDC78" : "#E84C4C" }}>
                {teamsCheck.ok ? "✅" : "❌"} {teamsCheck.message}
              </span>
            )}
          </div>
        </Card>

        <Card title={t("screens.ms365Diag.fullSyncTitle")}>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <button onClick={() => runImport("initial")} disabled={importState.loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-60"
              style={{ background: "#0078D4", color: "white" }}>
              {importState.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {t("screens.ms365Diag.initialImport")}
            </button>
            <button onClick={() => runImport("delta")} disabled={importState.loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-60"
              style={{ background: "#0D1F35", border: "1px solid #0E2A45", color: "#2E9BDC" }}>
              {t("screens.ms365Diag.deltaImport")}
            </button>
            {importState.ok !== null && (
              <span className="text-xs" style={{ color: importState.ok ? "#2EDC78" : "#E84C4C" }}>
                {importState.ok ? "✅" : "❌"} {importState.message}
              </span>
            )}
          </div>
          <p className="text-[11px]" style={{ color: "#8FA8C0" }}>
            {t("screens.ms365Diag.fullSyncDesc")}
          </p>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3 mb-3" style={{ background: "#0A1628", border: "1px solid #0E2A45" }}>
      <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#8FA8C0" }}>{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ ok, label, value, mono }: { ok: boolean; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" style={{ color: "#2EDC78" }} /> : <XCircle className="w-3.5 h-3.5 mt-0.5" style={{ color: "#E84C4C" }} />}
      <div className="min-w-0 flex-1">
        <div style={{ fontSize: 10, color: "#4A7FA5", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
        <div className="truncate" style={{ fontFamily: mono ? "monospace" : "inherit", color: "#E8EDF5" }} title={value}>{value}</div>
      </div>
    </div>
  );
}
