/**
 * Admin tool: link Planiprêt portal broker emails to NetSapiens extensions.
 *
 * - Panel A: run auto-match (calls `ns-email-migration-match`).
 * - Panel B: stat summary.
 * - Panel C: manual review queue (fuzzy + no-match rows).
 * - Panel D: bulk onboarding email (calls `pp-broker-onboarding-email`).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Play, Mail, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

type LogRow = {
  id: string;
  broker_id: string | null;
  ns_extension: string | null;
  ns_email_from_api: string | null;
  portal_email: string | null;
  match_status: "matched" | "no_match" | "multiple_matches" | "manually_linked";
  match_confidence: "exact" | "fuzzy" | "manual" | null;
  reviewed: boolean;
  notes: string | null;
  created_at: string;
};

type Summary = {
  total_ns_extensions: number;
  total_portal_brokers: number;
  exact_matches_applied: number;
  fuzzy_matches_pending_review: number;
  no_match_ns_side: number;
  no_match_portal_side: number;
};

export default function NsMigrationPanel() {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  async function loadLogs() {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from("planipret_ns_migration_log")
      .select("*")
      .or("reviewed.eq.false,match_confidence.eq.fuzzy")
      .order("created_at", { ascending: false })
      .limit(500);
    setLoadingLogs(false);
    if (error) { toast.error("Chargement: " + error.message); return; }
    setLogs((data as LogRow[]) ?? []);
  }

  useEffect(() => { loadLogs(); }, []);

  async function runMatch() {
    setRunning(true);
    setSummary(null);
    const { data, error } = await supabase.functions.invoke("ns-email-migration-match", { body: {} });
    setRunning(false);
    if (error) { toast.error("Échec: " + error.message); return; }
    if (data?.summary) {
      setSummary(data.summary);
      toast.success(`Correspondance terminée — ${data.summary.exact_matches_applied} liens créés`);
    }
    await loadLogs();
  }

  async function confirmFuzzy(row: LogRow) {
    if (!row.broker_id || !row.ns_extension) return;
    setBusyRow(row.id);
    const { error } = await supabase.functions.invoke("ns-manual-link", {
      body: { action: "confirm", broker_id: row.broker_id, extension: row.ns_extension, log_id: row.id },
    });
    setBusyRow(null);
    if (error) return toast.error(error.message);
    toast.success(`Extension ${row.ns_extension} liée`);
    await loadLogs();
  }

  async function rejectRow(row: LogRow) {
    setBusyRow(row.id);
    const { error } = await supabase.functions.invoke("ns-manual-link", {
      body: { action: "reject", log_id: row.id },
    });
    setBusyRow(null);
    if (error) return toast.error(error.message);
    await loadLogs();
  }

  async function linkPortalBroker(row: LogRow, ext: string) {
    if (!row.broker_id || !ext) return;
    setBusyRow(row.id);
    const { error } = await supabase.functions.invoke("ns-manual-link", {
      body: { action: "link", broker_id: row.broker_id, extension: ext, log_id: row.id },
    });
    setBusyRow(null);
    if (error) return toast.error(error.message);
    toast.success(`Lien créé`);
    await loadLogs();
  }

  async function sendOnboarding(resend = false) {
    if (!confirm("Envoyer les instructions de connexion à TOUS les courtiers liés ?")) return;
    setSendingEmails(true);
    const { data, error } = await supabase.functions.invoke("pp-broker-onboarding-email", { body: { resend } });
    setSendingEmails(false);
    if (error) return toast.error(error.message);
    toast.success(`Emails envoyés: ${data?.sent ?? 0} (ignorés: ${data?.skipped ?? 0}, échecs: ${data?.failed ?? 0})`);
  }

  const fuzzy = logs.filter(l => l.match_confidence === "fuzzy");
  const noNs = logs.filter(l => l.match_status === "no_match" && !l.broker_id);
  const noPortal = logs.filter(l => l.match_status === "no_match" && l.broker_id);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
      <div>
        <h3 className="text-lg font-bold">🔗 Migration — Lier courriels aux extensions</h3>
        <p className="text-sm text-muted-foreground">
          Associe chaque courtier portail à son extension NetSapiens via correspondance d'email.
        </p>
      </div>

      <button
        onClick={runMatch}
        disabled={running}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)" }}
      >
        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        Lancer la correspondance automatique
      </button>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Liés automatiquement" value={summary.exact_matches_applied} tone="success" />
          <Stat label="À vérifier (fuzzy)" value={summary.fuzzy_matches_pending_review} tone="warn" />
          <Stat label="Sans correspondance NS" value={summary.no_match_ns_side} tone="danger" />
          <Stat label="Sans correspondance Portail" value={summary.no_match_portal_side} tone="danger" />
        </div>
      )}

      <div className="space-y-4">
        <Section title={`Correspondances approximatives (${fuzzy.length})`} icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}>
          {fuzzy.length === 0 ? <Empty /> : fuzzy.map((row) => (
            <Row key={row.id}>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">Extension <span className="font-mono">{row.ns_extension}</span></div>
                <div className="text-sm">NS&nbsp;: <span className="font-mono">{row.ns_email_from_api}</span></div>
                <div className="text-sm">Portail&nbsp;: <span className="font-mono">{row.portal_email}</span></div>
              </div>
              <button disabled={busyRow === row.id} onClick={() => confirmFuzzy(row)} className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white">Confirmer</button>
              <button disabled={busyRow === row.id} onClick={() => rejectRow(row)} className="px-3 py-1.5 text-sm rounded-md bg-muted">Rejeter</button>
            </Row>
          ))}
        </Section>

        <Section title={`Extensions NS sans courtier portail (${noNs.length})`} icon={<XCircle className="w-4 h-4 text-rose-500" />}>
          {noNs.length === 0 ? <Empty /> : noNs.map((row) => (
            <Row key={row.id}>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">Ext <span className="font-mono">{row.ns_extension}</span> · {row.notes}</div>
                <div className="text-sm font-mono">{row.ns_email_from_api ?? "(sans email)"}</div>
              </div>
              <button disabled={busyRow === row.id} onClick={() => rejectRow(row)} className="px-3 py-1.5 text-sm rounded-md bg-muted">Ignorer</button>
            </Row>
          ))}
        </Section>

        <Section title={`Courtiers portail sans extension NS (${noPortal.length})`} icon={<XCircle className="w-4 h-4 text-rose-500" />}>
          {noPortal.length === 0 ? <Empty /> : noPortal.map((row) => (
            <PortalNoExtRow key={row.id} row={row} busy={busyRow === row.id} onLink={(ext) => linkPortalBroker(row, ext)} onReject={() => rejectRow(row)} />
          ))}
        </Section>
      </div>

      <div className="border-t border-border pt-4 flex items-center gap-3">
        <button onClick={() => sendOnboarding(false)} disabled={sendingEmails}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background font-semibold disabled:opacity-60">
          {sendingEmails ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          Envoyer les instructions de connexion aux courtiers liés
        </button>
        <button onClick={() => sendOnboarding(true)} disabled={sendingEmails}
          className="text-xs text-muted-foreground underline">
          Forcer le renvoi
        </button>
        {loadingLogs && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "success" | "warn" | "danger" }) {
  const bg = tone === "success" ? "from-emerald-50 to-emerald-100 border-emerald-200"
    : tone === "warn" ? "from-amber-50 to-amber-100 border-amber-200"
    : "from-rose-50 to-rose-100 border-rose-200";
  const fg = tone === "success" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-rose-700";
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${bg} p-3`}>
      <div className={`text-2xl font-bold ${fg}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-sm font-semibold">{icon}{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/30">{children}</div>;
}

function Empty() { return <div className="text-xs text-muted-foreground italic px-2">Aucun</div>; }

function PortalNoExtRow({ row, busy, onLink, onReject }: { row: LogRow; busy: boolean; onLink: (ext: string) => void; onReject: () => void }) {
  const [ext, setExt] = useState("");
  return (
    <Row>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{row.notes}</div>
        <div className="text-sm font-mono">{row.portal_email}</div>
      </div>
      <input value={ext} onChange={(e) => setExt(e.target.value)} placeholder="Extension" className="w-24 px-2 py-1 text-sm rounded-md border border-border bg-background" />
      <button disabled={busy || !ext} onClick={() => onLink(ext)} className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white disabled:opacity-50">
        <CheckCircle2 className="w-4 h-4 inline" /> Lier
      </button>
      <button disabled={busy} onClick={onReject} className="px-3 py-1.5 text-sm rounded-md bg-muted">Ignorer</button>
    </Row>
  );
}
