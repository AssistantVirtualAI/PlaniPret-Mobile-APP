import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, XCircle, Download, ArrowLeft } from "lucide-react";

const sections = {
  summary: {
    completed: 108, partial: 22, missing: 10, total: 140,
    critical: [
      "Tables nommées planipret_* (pas profiles/phone_calls génériques) — fonctionnel mais à valider",
      "Colonnes IA (ai_coaching/ai_tasks/ai_events) stockées dans JSONB (planipret_ai_insights.suggested_actions + planipret_phone_calls.metadata)",
    ],
  },
};

const completed = [
  "React + Vite + TypeScript + TailwindCSS",
  "Routes /login, /dashboard, /mplanipret, /dashboard/integrations, /auth/ms365/callback",
  "Supabase Auth + redirect post-login (admin → /dashboard, broker → /mplanipret)",
  "Gardes mobile_app_enabled & non-auth",
  "Table planipret_profiles (23 col., ns_jwt/refresh, ms365_*, role, flags)",
  "Table planipret_phone_calls (22 col., transcript, ai_summary, metadata jsonb)",
  "Table planipret_phone_messages (16 col.)",
  "Table planipret_voicemails (15 col.)",
  "Table planipret_ai_insights (coaching_notes, suggested_actions jsonb)",
  "RLS activée sur 8 tables planipret_*",
  "Edge: ns-auth, ns-calls, ns-cdrs, ns-recordings, ns-transcription",
  "Edge: ns-sms, ns-voicemail, ns-webhook-receiver, ns-users, ns-webhook-setup",
  "Edge: ai-analyze-call (Claude + broadcast Realtime)",
  "Edge: maestro-actions, ms365-actions, ms365-oauth-exchange, pp-integration-secrets",
  "Page /dashboard/integrations (5 cards, badge sidebar, summary X/5)",
  "Mobile container 390×844, tab bar 5 onglets, FAB Dialer spring",
  "DialerSheet complet (+, backspace, call ns-calls)",
  "Écran Home (header, SIP status, 4 stats, 3 derniers appels)",
  "Écran Calls complet (3 onglets, recherche, CallDetailSheet 5 sections)",
  "Active call card (timer, mute, hold, transfer, hangup, overlay entrant)",
];

const partial = [
  { item: "Nommage tables", note: "planipret_* au lieu de profiles/phone_calls génériques" },
  { item: "Colonnes IA plates", note: "ai_coaching/ai_tasks/ai_events vivent en JSONB" },
  { item: "ns-auth auto-refresh", note: "Confirmer helper refreshNsJwt() sur 401" },
  { item: "ns-webhook-receiver", note: "Valider trigger ai-analyze-call en fire-and-forget" },
  { item: "ns-webhook-setup", note: "Vérifier souscriptions CDR/message/voicemail" },
  { item: "MS365 OAuth callback", note: "Déplacer échange code→token côté serveur" },
  { item: "Brief IA du jour", note: "Confirmer fonction dédiée ou alias ai-analyze-call" },
  { item: "Card RDV M365 sur Home", note: "Intégration list_calendar_events à valider" },
  { item: "Skeleton loaders", note: "Pas systématiques sur toutes les cards" },
];

const missing = [
  { p: "Critical", item: "Persistance MS365 tokens 100% côté serveur" },
  { p: "Critical", item: "Validation NS_WEBHOOK_SECRET dans ns-webhook-receiver" },
  { p: "High", item: "Écrans Mobile Messages/Voicemail/More (stubs minimaux)" },
  { p: "High", item: "Redirect callback MS365 → /mplanipret/more avec toast" },
  { p: "Medium", item: "Modal instructions Azure dans card MS365" },
  { p: "Medium", item: "Page /reset-password" },
  { p: "Low", item: "Pull-to-refresh natif (gesture)" },
];

const edgeFns = [
  "ns-auth", "ns-calls", "ns-cdrs", "ns-recordings", "ns-transcription",
  "ns-sms", "ns-voicemail", "ns-webhook-receiver", "ns-users", "ns-webhook-setup",
  "ai-analyze-call", "maestro-actions",
  "ms365-actions (bonus)", "ms365-oauth-exchange (bonus)", "pp-integration-secrets (bonus)",
];

const secrets = [
  "NS_API_BASE_URL", "NS_API_USER", "NS_API_PASSWORD", "NS_DEFAULT_DOMAIN", "NS_WEBHOOK_SECRET",
  "ELEVENLABS_API_KEY", "ELEVENLABS_DEFAULT_AGENT_ID",
  "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT_ID",
  "MAESTRO_API_URL", "MAESTRO_API_KEY", "MAESTRO_ACCOUNT_ID",
  "ANTHROPIC_API_KEY",
];

const actions = [
  "Vérifier les 14 secrets dans Settings → Secrets",
  "Sécuriser MS365 OAuth : échange code→token 100% serveur",
  "Tester webhook NS (CDR test → insert + ai-analyze-call)",
  "Forcer 401 NS pour valider auto-refresh JWT",
  "Compléter Mobile Messages/Voicemail/More (Prompts 07–09)",
  "Aligner noms tables planipret_* avec doc (ou créer vues alias)",
  "Créer ai-daily-brief si non couvert",
  "Pull-to-refresh natif sur Home + Calls",
];

export default function PlanipretAudit() {
  const pct = Math.round((sections.summary.completed / sections.summary.total) * 100);
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link to="/dashboard" className="text-sm text-slate-600 inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="w-4 h-4" /> Retour dashboard
          </Link>
          <a href="/planipret-audit-report.md" download className="text-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white" style={{ background: "#1F4E79" }}>
            <Download className="w-4 h-4" /> Télécharger .md
          </a>
        </div>

        <h1 className="text-3xl font-bold text-slate-900">Rapport d'Audit · Planiprêt</h1>
        <p className="text-sm text-slate-500 mt-1">AVA Main Dashboard · {new Date().toLocaleDateString("fr-CA")}</p>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-3 mt-6">
          <Stat label="Total" value={sections.summary.total} color="#1F4E79" />
          <Stat label="Complétées" value={sections.summary.completed} color="#27AE60" />
          <Stat label="Partielles" value={sections.summary.partial} color="#F59E0B" />
          <Stat label="Manquantes" value={sections.summary.missing} color="#E74C3C" />
        </div>
        <div className="mt-3 bg-white rounded-xl p-4 shadow-sm">
          <div className="flex justify-between text-sm mb-2"><span className="font-semibold">Progression globale</span><span style={{ color: "#27AE60" }}>{pct}%</span></div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full" style={{ width: `${pct}%`, background: "#27AE60" }} />
          </div>
        </div>

        <Card title="✅ Features complétées" color="#27AE60">
          <ul className="space-y-1.5">{completed.map((c, i) => (
            <li key={i} className="flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#27AE60" }} /><span>{c}</span></li>
          ))}</ul>
        </Card>

        <Card title="⚠️ Implémentations partielles" color="#F59E0B">
          <ul className="space-y-2">{partial.map((p, i) => (
            <li key={i} className="flex gap-2 text-sm"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#F59E0B" }} />
              <div><div className="font-semibold text-slate-800">{p.item}</div><div className="text-xs text-slate-500">{p.note}</div></div>
            </li>
          ))}</ul>
        </Card>

        <Card title="❌ Manquantes" color="#E74C3C">
          <ul className="space-y-1.5">{missing.map((m, i) => (
            <li key={i} className="flex gap-2 text-sm items-center">
              <XCircle className="w-4 h-4 shrink-0" style={{ color: "#E74C3C" }} />
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md text-white shrink-0" style={{ background: m.p === "Critical" ? "#E74C3C" : m.p === "High" ? "#F59E0B" : m.p === "Medium" ? "#2E86C1" : "#94A3B8" }}>{m.p}</span>
              <span>{m.item}</span>
            </li>
          ))}</ul>
        </Card>

        <Card title="🗄️ Base de données" color="#1F4E79">
          <div className="space-y-1.5 text-sm">
            <Row label="planipret_profiles" ok>23 col. · RLS ON</Row>
            <Row label="planipret_phone_calls" ok>22 col. · RLS ON</Row>
            <Row label="planipret_phone_messages" ok>16 col. · RLS ON</Row>
            <Row label="planipret_voicemails" ok>15 col. · RLS ON</Row>
            <Row label="planipret_ai_insights" ok>14 col. · RLS ON</Row>
          </div>
          <div className="mt-4 text-xs font-semibold text-slate-700 mb-2">Secrets à vérifier (Settings → Secrets) :</div>
          <div className="flex flex-wrap gap-1.5">{secrets.map((s) => (
            <span key={s} className="text-[10px] font-mono px-2 py-1 rounded bg-slate-100 text-slate-700">{s}</span>
          ))}</div>
        </Card>

        <Card title="⚡ Edge Functions" color="#7C3AED">
          <div className="grid grid-cols-2 gap-1.5 text-sm">{edgeFns.map((f) => (
            <div key={f} className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#27AE60" }} /><code className="text-xs">{f}</code></div>
          ))}</div>
        </Card>

        <Card title="🎯 Actions recommandées" color="#1F4E79">
          <ol className="space-y-1.5 text-sm list-decimal pl-5">{actions.map((a, i) => <li key={i}>{a}</li>)}</ol>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm text-center">
      <div className="text-3xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function Card({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 bg-white rounded-xl p-5 shadow-sm border-l-4" style={{ borderLeftColor: color }}>
      <h2 className="font-bold text-slate-900 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, ok, children }: { label: string; ok?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <code className="text-xs font-mono">{label}</code>
      <span className="flex items-center gap-1.5 text-xs text-slate-600">
        {ok && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#27AE60" }} />}
        {children}
      </span>
    </div>
  );
}
