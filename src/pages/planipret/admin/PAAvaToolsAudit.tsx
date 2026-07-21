// PAAvaToolsAudit — Contrôle des permissions et audit des outils AVA.
//
// - Liste les 39+ outils déclarés côté registry (`ava-tools.ts` via
//   elevenlabs-manage-agent list_tools) + vérifie l'état de chaque catégorie
//   (email, calendrier, contacts, SMS, stats, appels, voicemail, résumés,
//   réglages).
// - Bouton "Resync" qui rafraîchit la session sur 401 et affiche les détails
//   des erreurs (nom d'outil, statut, message).
// - Bouton "Tester read_emails" qui appelle live ms365-actions pour inbox,
//   sent, drafts et affiche le tri + le premier sujet + confirme l'absence
//   de $count.
import { useEffect, useMemo, useState } from "react";
import { adminInvoke } from "@/lib/adminInvoke";
import { useBusyGuard } from "@/lib/guardOnce";
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Mail, Calendar, Users, MessageSquare, BarChart3, Phone, Voicemail, Sparkles, Settings } from "lucide-react";

type ExpectedTool = { name: string; category: string; icon: any; label: string };

const CATEGORIES: Record<string, { icon: any; label: string }> = {
  email:      { icon: Mail,          label: "Emails (M365)" },
  calendar:   { icon: Calendar,      label: "Calendrier (M365)" },
  contacts:   { icon: Users,         label: "Contacts" },
  sms:        { icon: MessageSquare, label: "SMS" },
  stats:      { icon: BarChart3,     label: "Stats & rapports" },
  calls:      { icon: Phone,         label: "Appels & historique" },
  voicemail:  { icon: Voicemail,     label: "Voicemail" },
  summary:    { icon: Sparkles,      label: "Résumés & IA" },
  settings:   { icon: Settings,      label: "Navigation & réglages" },
  maestro:    { icon: Users,         label: "Maestro CRM" },
};

const EXPECTED: ExpectedTool[] = [
  // email
  ...["read_emails","send_email","propose_email_reply","summarize_inbox"].map(n => ({ name: n, category: "email", icon: Mail, label: n })),
  // calendar
  ...["get_calendar_today","get_calendar_week","get_upcoming_meetings","create_appointment","update_calendar_event","delete_calendar_event"].map(n => ({ name: n, category: "calendar", icon: Calendar, label: n })),
  // contacts
  ...["find_contact","search_contact","search_ms365_contacts"].map(n => ({ name: n, category: "contacts", icon: Users, label: n })),
  // sms
  ...["send_sms"].map(n => ({ name: n, category: "sms", icon: MessageSquare, label: n })),
  // stats
  ...["get_my_stats","get_daily_briefing","get_coaching_summary","get_hot_leads"].map(n => ({ name: n, category: "stats", icon: BarChart3, label: n })),
  // calls
  ...["make_call","get_active_calls","hangup_call","get_call_history","get_recording","get_transcript"].map(n => ({ name: n, category: "calls", icon: Phone, label: n })),
  // voicemail
  ...["get_voicemails","get_voicemail_recording","generate_voicemail_greeting"].map(n => ({ name: n, category: "voicemail", icon: Voicemail, label: n })),
  // summary
  ...["analyze_call","push_call_summary","push_client_note","push_communication_log"].map(n => ({ name: n, category: "summary", icon: Sparkles, label: n })),
  // settings & nav
  ...["navigate_to","open_settings","explain_feature","get_integration_status"].map(n => ({ name: n, category: "settings", icon: Settings, label: n })),
  // maestro
  ...["search_client","get_client_profile","get_client_history","create_task","create_client","get_pending_tasks","get_upcoming_appointments"].map(n => ({ name: n, category: "maestro", icon: Users, label: n })),
];

type SyncErr = { tool: string; status: number; message: string };

export default function PAAvaToolsAudit() {
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  const [syncErrors, setSyncErrors] = useState<SyncErr[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [readEmailsResult, setReadEmailsResult] = useState<any>(null);
  const [readEmailsLoading, setReadEmailsLoading] = useState(false);
  const syncGuard = useBusyGuard();
  const testGuard = useBusyGuard();

  const load = async () => {
    setLoading(true); setLastError(null);
    const r = await adminInvoke<any>("elevenlabs-manage-agent", { action: "list_tools" });
    setLoading(false);
    if (!r.ok) { setLastError(`${r.error?.status} — ${r.error?.message}`); return; }
    const tools: any[] = r.data?.tools ?? r.data?.data?.tools ?? [];
    const names = new Set<string>(tools.map((t: any) => t?.tool_config?.name ?? t?.name).filter(Boolean));
    setRegistered(names);
    setLastSyncedAt(r.data?.synced_at ?? null);
  };

  useEffect(() => { load(); }, []);

  const resync = () => syncGuard.run(async () => {
    setSyncErrors([]); setLastError(null);
    const r = await adminInvoke<any>("elevenlabs-manage-agent", { action: "sync_all_tools" });
    if (!r.ok) {
      setLastError(`Sync échoué: ${r.error?.status} — ${r.error?.message}${r.error?.refreshed ? " (après refresh session)" : ""}`);
      return;
    }
    if (Array.isArray(r.data?.errors_detailed)) setSyncErrors(r.data.errors_detailed);
    await load();
  });

  const testReadEmails = () => testGuard.run(async () => {
    setReadEmailsLoading(true); setReadEmailsResult(null);
    const folders = ["inbox", "sent", "drafts"];
    const results: any = {};
    for (const f of folders) {
      const r = await adminInvoke<any>("ms365-actions", { action: "read_emails", folder: f, top: 5 });
      const emails = r.data?.emails ?? [];
      const first = emails[0];
      results[f] = {
        ok: !!r.data?.success,
        count: emails.length,
        firstSubject: first?.subject ?? null,
        firstDate: first?.receivedDateTime ?? first?.sentDateTime ?? first?.lastModifiedDateTime ?? null,
        hasCount: r.data?.total !== null && r.data?.total !== undefined, // should be null except for `unread`
        error: r.error?.message ?? r.data?.error ?? null,
      };
    }
    setReadEmailsLoading(false);
    setReadEmailsResult(results);
  });

  const grouped = useMemo(() => {
    const out: Record<string, ExpectedTool[]> = {};
    for (const t of EXPECTED) (out[t.category] ??= []).push(t);
    return out;
  }, []);

  const missingByCat = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [cat, tools] of Object.entries(grouped)) {
      out[cat] = tools.filter(t => !registered.has(t.name)).length;
    }
    return out;
  }, [grouped, registered]);

  const totalExpected = EXPECTED.length;
  const totalPresent = EXPECTED.filter(t => registered.has(t.name)).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 22 }}>
            Audit des permissions AVA
          </h1>
          <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }} className="mt-0.5">
            Vérifie que l'agent AVA a accès à email, calendrier, contacts, SMS, stats, appels, voicemail, résumés et réglages.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load} disabled={loading}
            className="px-3 py-1.5 rounded-md border text-xs flex items-center gap-1.5"
            style={{ borderColor: "var(--pp-border,#ddd)" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </button>
          <button
            onClick={resync} disabled={syncGuard.busy}
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-white flex items-center gap-1.5"
            style={{ background: "#1A4A8A", opacity: syncGuard.busy ? 0.7 : 1 }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncGuard.busy ? "animate-spin" : ""}`} />
            {syncGuard.busy ? "Resync…" : "Resync outils ElevenLabs"}
          </button>
        </div>
      </div>

      {/* Global counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Attendus" value={totalExpected} />
        <Card label="Enregistrés" value={totalPresent} tone={totalPresent === totalExpected ? "ok" : "warn"} />
        <Card label="Manquants" value={totalExpected - totalPresent} tone={totalExpected - totalPresent > 0 ? "err" : "ok"} />
        <Card label="Dernière sync" value={lastSyncedAt ? new Date(lastSyncedAt).toLocaleString("fr-CA") : "—"} />
      </div>

      {lastError && (
        <div className="p-3 rounded-md flex items-start gap-2" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#7F1D1D", fontSize: 13 }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="whitespace-pre-wrap">{lastError}</div>
        </div>
      )}

      {syncErrors.length > 0 && (
        <div className="p-3 rounded-md" style={{ background: "#FFFBEB", border: "1px solid #FCD34D", fontSize: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Erreurs de sync ({syncErrors.length})</div>
          <div className="space-y-1">
            {syncErrors.map((e, i) => (
              <div key={i} className="flex gap-2">
                <code>{e.tool}</code>
                <span style={{ color: "#A16207" }}>[{e.status}]</span>
                <span style={{ color: "#7C2D12" }}>{e.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grouped permission cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Object.entries(grouped).map(([cat, tools]) => {
          const Cat = CATEGORIES[cat];
          const missing = missingByCat[cat] ?? 0;
          return (
            <div key={cat} className="rounded-md border p-3" style={{ borderColor: "var(--pp-border,#e5e5e5)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2" style={{ fontWeight: 700, fontSize: 13 }}>
                  <Cat.icon className="w-4 h-4" style={{ color: "#1A4A8A" }} />
                  {Cat.label}
                </div>
                {missing === 0
                  ? <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "#16A34A" }}><CheckCircle2 className="w-3 h-3" /> Complet</span>
                  : <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "#DC2626" }}><XCircle className="w-3 h-3" /> {missing} manquant{missing > 1 ? "s" : ""}</span>}
              </div>
              <ul className="space-y-1">
                {tools.map(t => {
                  const present = registered.has(t.name);
                  return (
                    <li key={t.name} className="flex items-center justify-between text-[12px]">
                      <code style={{ background: "var(--pp-surface-alt,#f5f5f7)", padding: "1px 6px", borderRadius: 4 }}>{t.name}</code>
                      {present
                        ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#16A34A" }} />
                        : <XCircle className="w-3.5 h-3.5" style={{ color: "#DC2626" }} />}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Live MS365 read_emails test */}
      <div className="rounded-md border p-4" style={{ borderColor: "var(--pp-border,#e5e5e5)" }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Test live — ms365-actions.read_emails</div>
            <div style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>
              Vérifie inbox, sent et drafts avec le tri approprié et confirme l'absence de <code>$count</code>.
            </div>
          </div>
          <button
            onClick={testReadEmails} disabled={testGuard.busy || readEmailsLoading}
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-white"
            style={{ background: "#0D7A5F", opacity: testGuard.busy ? 0.7 : 1 }}
          >
            {readEmailsLoading ? "Test en cours…" : "Lancer le test"}
          </button>
        </div>
        {readEmailsResult && (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: "var(--pp-text-faint)" }}>
                <th className="text-left py-1">Dossier</th>
                <th className="text-left py-1">Statut</th>
                <th className="text-left py-1">Nombre</th>
                <th className="text-left py-1">Premier sujet</th>
                <th className="text-left py-1">Date</th>
                <th className="text-left py-1">$count absent</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(readEmailsResult).map(([folder, r]: any) => (
                <tr key={folder} className="border-t" style={{ borderColor: "var(--pp-border,#eee)" }}>
                  <td className="py-1"><code>{folder}</code></td>
                  <td className="py-1">
                    {r.ok
                      ? <span style={{ color: "#16A34A" }}>OK</span>
                      : <span style={{ color: "#DC2626" }}>ERR — {r.error ?? "?"}</span>}
                  </td>
                  <td className="py-1">{r.count}</td>
                  <td className="py-1 max-w-[240px] truncate">{r.firstSubject ?? "—"}</td>
                  <td className="py-1">{r.firstDate ? new Date(r.firstDate).toLocaleString("fr-CA") : "—"}</td>
                  <td className="py-1">
                    {r.hasCount
                      ? <span style={{ color: "#DC2626" }}>Non ($count présent)</span>
                      : <span style={{ color: "#16A34A" }}>Oui</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: any; tone?: "ok" | "err" | "warn" }) {
  const color = tone === "ok" ? "#16A34A" : tone === "err" ? "#DC2626" : tone === "warn" ? "#D97706" : "var(--pp-text-primary,#111)";
  return (
    <div className="p-3 rounded-md border" style={{ borderColor: "var(--pp-border,#e5e5e5)" }}>
      <div style={{ fontSize: 11, color: "var(--pp-text-faint,#666)" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
