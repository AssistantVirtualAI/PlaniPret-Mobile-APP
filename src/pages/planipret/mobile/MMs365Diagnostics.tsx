/**
 * Microsoft 365 diagnostics — mobile-friendly (no admin panel).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMs365Status } from "@/components/planipret/Ms365StatusBadge";
import { ArrowLeft, RefreshCw, LogIn, Copy, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const MS_SCOPES = [
  "openid", "profile", "email", "offline_access",
  "User.Read", "Mail.ReadWrite", "Mail.Send",
  "Calendars.ReadWrite", "Chat.Read", "Chat.ReadWrite",
  "Channel.ReadBasic.All", "ChannelMessage.Read.All", "ChannelMessage.Send",
  "Team.ReadBasic.All",
];

export default function MMs365Diagnostics() {
  const nav = useNavigate();
  const { data, loading, refresh } = useMs365Status(30_000);
  const [teamsCheck, setTeamsCheck] = useState<{ loading: boolean; ok: boolean | null; message: string; sample?: any[] }>({ loading: false, ok: null, message: "" });

  const callbackUrl = `${window.location.origin}/auth/microsoft/callback`;

  async function startLogin() {
    if (!data?.detection.tenant_id || !data?.detection.client_id) {
      toast.error("Configuration Microsoft manquante");
      return;
    }
    const params = new URLSearchParams({
      client_id: data.detection.client_id,
      response_type: "code",
      redirect_uri: callbackUrl,
      response_mode: "query",
      scope: MS_SCOPES.join(" "),
      prompt: "select_account",
    });
    window.location.href = `https://login.microsoftonline.com/${data.detection.tenant_id}/oauth2/v2.0/authorize?${params}`;
  }

  async function testTeams() {
    setTeamsCheck({ loading: true, ok: null, message: "" });
    try {
      const { data: res, error } = await supabase.functions.invoke("ms365-teams-list", { body: {} });
      if (error) throw error;
      const teams = (res as any)?.teams ?? [];
      const chats = (res as any)?.chats ?? [];
      if ((res as any)?.connected === false) {
        setTeamsCheck({ loading: false, ok: false, message: "Microsoft 365 non connecté — se connecter d'abord" });
        return;
      }
      setTeamsCheck({ loading: false, ok: true, message: `${teams.length} équipe(s), ${chats.length} chat(s) lisibles`, sample: teams.slice(0, 3) });
    } catch (e: any) {
      setTeamsCheck({ loading: false, ok: false, message: e?.message ?? String(e) });
    }
  }

  const statusColor = data?.status === "ok" ? "#2EDC78" : data?.status === "limited" ? "#F5A623" : "#E84C4C";
  const StatusIcon = data?.status === "ok" ? CheckCircle2 : data?.status === "limited" ? AlertTriangle : XCircle;

  return (
    <div className="min-h-screen p-4" style={{ background: "#060D1A", color: "#E8EDF5" }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => nav(-1)} className="p-2 rounded-lg" style={{ background: "#0A1628", border: "1px solid #0E2A45" }}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Diagnostics Microsoft 365</h1>
            <p className="text-xs" style={{ color: "#8FA8C0" }}>Triage rapide des erreurs de connexion</p>
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
                {loading ? "Analyse…" : data?.status === "ok" ? "Connexion Microsoft OK" : data?.status === "limited" ? "Connexion limitée" : "Panne de connexion"}
              </div>
              <div className="text-xs" style={{ color: "#8FA8C0" }}>
                {data?.user.connected ? `Compte: ${data.user.email ?? "?"}` : "Aucun compte utilisateur connecté"}
                {data?.user.expired && " · Token expiré"}
              </div>
            </div>
            <button onClick={startLogin} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "#0078D4", color: "white" }}>
              <LogIn className="w-3.5 h-3.5" />
              {data?.user.connected ? "Reconnecter" : "Se connecter"}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3 mb-3">
          <Card title="Configuration admin détectée">
            <Row ok={!!data?.detection.tenant_id} label="Tenant ID" value={data?.detection.tenant_id ?? "Non détecté"} mono />
            <Row ok={!!data?.detection.client_id} label="Client ID" value={data?.detection.client_id ?? "Non détecté"} mono />
            <Row ok={!!data?.detection.has_secret} label="Client Secret" value={data?.detection.has_secret ? "Enregistré" : "Manquant"} />
          </Card>
          <Card title="Session utilisateur">
            <Row ok={!!data?.user.connected} label="Compte connecté" value={data?.user.email ?? "—"} />
            <Row ok={!!data?.user.has_refresh} label="Refresh token" value={data?.user.has_refresh ? "Présent" : "Absent"} />
            <Row ok={!!data?.user.connected && !data?.user.expired} label="Access token"
              value={data?.user.expires_in_sec == null ? "—" : data.user.expires_in_sec > 0 ? `Valide (${Math.floor(data.user.expires_in_sec / 60)} min restantes)` : `Expiré depuis ${Math.abs(Math.floor(data.user.expires_in_sec / 60))} min`} />
            <Row ok={!!data?.user.scopes.length} label="Scopes accordés" value={`${data?.user.scopes.length ?? 0} scopes`} />
          </Card>
        </div>

        <Card title="URL de callback OAuth">
          <div className="flex items-center gap-2 flex-wrap">
            <code style={{ background: "#040B16", padding: "6px 10px", borderRadius: 6, fontSize: 11, color: "#E8EDF5", border: "1px solid #0E2A45" }}>{callbackUrl}</code>
            <button onClick={() => { navigator.clipboard.writeText(callbackUrl); toast.success("URI copiée"); }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
              style={{ background: "#0D1F35", border: "1px solid #0E2A45", color: "#2E9BDC" }}>
              <Copy className="w-3 h-3" /> Copier
            </button>
          </div>
          <p className="text-[11px] mt-2" style={{ color: "#8FA8C0" }}>
            Doit correspondre exactement à une redirect URI enregistrée dans Azure App Registration (Web).
          </p>
        </Card>

        <Card title="Lecture Teams (channels + chats)">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={testTeams} disabled={teamsCheck.loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-60"
              style={{ background: "#0078D4", color: "white" }}>
              {teamsCheck.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Tester la lecture Teams
            </button>
            {teamsCheck.ok !== null && (
              <span className="text-xs" style={{ color: teamsCheck.ok ? "#2EDC78" : "#E84C4C" }}>
                {teamsCheck.ok ? "✅" : "❌"} {teamsCheck.message}
              </span>
            )}
          </div>
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
