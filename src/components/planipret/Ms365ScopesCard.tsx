import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

type Profile = { ms365_access_token?: string | null; ms365_scopes?: string | null } & Record<string, any>;

const REQUIRED: { scope: string; label: string; purpose: string }[] = [
  { scope: "User.Read", label: "Profil", purpose: "Identité de base" },
  { scope: "Mail.ReadWrite", label: "Courriels — lecture", purpose: "Analyser la boîte de réception" },
  { scope: "Mail.Send", label: "Courriels — envoi", purpose: "Répondre depuis AVA" },
  { scope: "Calendars.ReadWrite", label: "Calendrier", purpose: "Planifier des rendez-vous" },
  { scope: "Chat.ReadWrite", label: "Teams — chats", purpose: "Lire/envoyer messages 1:1" },
  { scope: "ChannelMessage.Send", label: "Teams — canaux", purpose: "Poster dans les canaux" },
  { scope: "Team.ReadBasic.All", label: "Teams — équipes", purpose: "Liste des équipes" },
  { scope: "Channel.ReadBasic.All", label: "Teams — canaux", purpose: "Liste des canaux" },
];

export function Ms365ScopesCard({ profile, onReconnect }: { profile: Profile | null; onReconnect: () => void }) {
  const connected = !!profile?.ms365_access_token;
  const granted = (profile?.ms365_scopes ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const has = (s: string) => granted.includes(s.toLowerCase());
  const missing = REQUIRED.filter((r) => !has(r.scope));
  const showAll = !connected || !profile?.ms365_scopes || missing.length > 0;

  if (!connected) return null;

  return (
    <div className="pp-card" style={{ padding: 12, marginTop: 8 }}>
      <div className="flex items-center gap-2 mb-2">
        {missing.length === 0 ? (
          <><CheckCircle2 className="w-4 h-4" style={{ color: "#22c55e" }} /><div className="text-sm font-semibold" style={{ color: "var(--pp-text-primary)" }}>Microsoft 365 — permissions OK</div></>
        ) : (
          <><AlertTriangle className="w-4 h-4" style={{ color: "#f59e0b" }} /><div className="text-sm font-semibold" style={{ color: "var(--pp-text-primary)" }}>Permissions manquantes ({missing.length})</div></>
        )}
      </div>
      {showAll && (
        <div className="space-y-1 mb-2">
          {REQUIRED.map((r) => {
            const ok = has(r.scope);
            return (
              <div key={r.scope} className="flex items-center justify-between text-xs">
                <div>
                  <div style={{ color: "var(--pp-text-primary)" }}>{r.label}</div>
                  <div style={{ color: "var(--pp-text-muted)" }}>{r.purpose}</div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: ok ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)", color: ok ? "#22c55e" : "#f59e0b" }}>
                  {ok ? "Accordée" : "Manquante"}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {missing.length > 0 && (
        <>
          <div className="text-[11px] mb-2" style={{ color: "var(--pp-text-muted)" }}>
            Reconnectez votre compte pour accorder les nouvelles permissions. Vous serez redirigé vers Microsoft.
          </div>
          <button onClick={onReconnect} className="w-full text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))", color: "white" }}>
            <RefreshCw className="w-3 h-3" /> Reconnecter Microsoft 365
          </button>
        </>
      )}
    </div>
  );
}
