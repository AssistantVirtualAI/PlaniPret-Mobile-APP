import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2, MinusCircle,
  RefreshCw, FileDown, ChevronDown, ChevronRight, ShieldCheck,
  Zap, Clock, Copy, ExternalLink, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { downloadPdfBlob } from "@/lib/pdf/downloadBlob";
import { jsPDF } from "jspdf";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Status = "pass" | "fail" | "warn" | "skip" | "running";
type Item = { id: string; name: string; description?: string; status: Status; detail?: string; ms?: number };
type Section = { id: string; title: string; emoji: string; items: Item[] };
type Report = {
  ok: boolean;
  generated_at: string;
  score: number;
  totals: { pass: number; fail: number; warn: number; skip: number; total: number };
  sections: Section[];
};

type Priority = "critical" | "high" | "medium" | "low";
type QuickFix = { label: string; icon: string; action: () => void };
type ManualItem = { id: string; label: string; hint: string; instructions?: string[]; copyText?: string; copyLabel?: string; link?: { label: string; href: string } };

const C = {
  bg: "#030810",
  surface: "#0A1628",
  surfaceMuted: "#06122A",
  border: "#0E2A45",
  borderAccent: "rgba(46,155,220,0.25)",
  text: "#E8EDF5",
  textMuted: "#4A7FA5",
  textSecondary: "#94B4D4",
  pass: "#00D4AA",
  fail: "#E84C4C",
  warn: "#F5A623",
  info: "#2E9BDC",
  skip: "#2A4A6A",
  critical: "#E84C4C",
  high: "#F5A623",
  medium: "#F5D423",
  low: "#7FA5C4",
};

// Priority mapping for known failed items
const PRIORITY_MAP: Record<string, { priority: Priority; eta: string }> = {
  "secret-ELEVENLABS_DEFAULT_AGENT_ID": { priority: "critical", eta: "5 min" },
  "claude": { priority: "critical", eta: "2 min" },
  "secret-ANTHROPIC_API_KEY": { priority: "critical", eta: "2 min" },
  "secret-MICROSOFT_CLIENT_ID": { priority: "high", eta: "20 min" },
  "secret-MICROSOFT_CLIENT_SECRET": { priority: "high", eta: "20 min" },
  "secret-MICROSOFT_TENANT_ID": { priority: "high", eta: "20 min" },
  "secret-MAESTRO_API_URL": { priority: "high", eta: "Contact Kanguru" },
  "secret-MAESTRO_API_KEY": { priority: "high", eta: "Contact Kanguru" },
  "secret-MAESTRO_WEBHOOK_SECRET": { priority: "high", eta: "Contact Kanguru" },
  "secret-OPENAI_API_KEY": { priority: "medium", eta: "5 min" },
  "secret-ELEVENLABS_AVA_VOICE_ID": { priority: "medium", eta: "1 min" },
  "rt-planipret_phone_calls": { priority: "high", eta: "1 min" },
  "rt-planipret_phone_messages": { priority: "high", eta: "1 min" },
  "rt-planipret_voicemails": { priority: "high", eta: "1 min" },
};

const PRIORITY_COLOR: Record<Priority, string> = {
  critical: C.critical, high: C.high, medium: C.medium, low: C.low,
};

function StatusIcon({ s }: { s: Status }) {
  if (s === "pass") return <CheckCircle2 className="w-4 h-4" style={{ color: C.pass }} />;
  if (s === "fail") return <XCircle className="w-4 h-4" style={{ color: C.fail }} />;
  if (s === "warn") return <AlertTriangle className="w-4 h-4" style={{ color: C.warn }} />;
  if (s === "running") return <Loader2 className="w-4 h-4 animate-spin" style={{ color: C.info }} />;
  return <MinusCircle className="w-4 h-4" style={{ color: C.skip }} />;
}

function sectionScore(items: Item[]) {
  const testable = items.filter((i) => i.status !== "skip");
  if (testable.length === 0) return { pct: 0, pass: 0, total: 0 };
  const pass = testable.filter((i) => i.status === "pass").length;
  return { pct: Math.round((pass / testable.length) * 100), pass, total: testable.length };
}

function scoreColor(pct: number) {
  if (pct >= 90) return C.pass;
  if (pct >= 70) return C.warn;
  return C.fail;
}

function ScoreCircle({ pct, label }: { pct: number; label: string }) {
  const color = scoreColor(pct);
  return (
    <div
      className="relative flex items-center justify-center rounded-full"
      style={{
        width: 120, height: 120,
        background: `conic-gradient(${color} ${pct * 3.6}deg, rgba(255,255,255,0.06) 0)`,
      }}
    >
      <div
        className="absolute inset-[6px] rounded-full flex flex-col items-center justify-center"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
      >
        <div className="text-3xl font-bold" style={{ color: C.text, fontFamily: "Inter,sans-serif" }}>{pct}%</div>
        <div className="text-[10px] uppercase tracking-wider" style={{ color: C.textMuted }}>{label}</div>
      </div>
    </div>
  );
}


const DICT = {
  fr: {
    title: "Audit système",
    subtitle: "Vérification automatisée de la configuration technique et de conformité du portail Planiprêt.",
    scoreLabel: "Score global",
    kpiCompleted: "Complétés",
    kpiPartial: "Partiels",
    kpiMissing: "Manquants",
    kpiIgnored: "Ignorés",
    running: "Audit en cours…",
    runAudit: "Relancer l'audit",
    exportPdf: "Exporter en PDF",
    neverRun: "Jamais exécuté",
    lastRun: (n: number) => `Dernière exécution il y a ${n} min`,
    nextStepsTitle: "Prochaines étapes recommandées",
    auditError: "Erreur d'audit : ",
    scorePerfect: "Parfait",
    scoreExcellent: "Excellent",
    scoreAttention: "Attention",
    scoreAction: "Action requise",
    manualTitle: "Vérifications manuelles",
    manualEta: "À faire avant mise en production",
    markedDone: "Complété le",
    hideInstructions: "Masquer les instructions",
    showInstructions: "Voir les instructions",
    priorityCritical: "Critique",
    priorityHigh: "Élevée",
    priorityMedium: "Moyenne",
    priorityLow: "Faible",
    sectionEtaDb: "Base de données",
    sectionEtaRealtime: "Temps réel",
    sectionEtaSecrets: "Secrets & clés API",
    sectionEtaFunctions: "Fonctions edge",
    sectionEtaExternal: "Services externes",
    mcNsWebhookLabel: "Configurer le webhook NetSapiens",
    mcNsWebhookHint: "Connecter NetSapiens pour recevoir les événements d'appel en temps réel.",
    mcNsWebhookInstructions: [
      "1. Connectez-vous au portail d'administration NetSapiens.",
      "2. Accédez à Domaine > Configuration > Webhooks.",
      "3. Ajoutez un nouveau webhook pour les événements d'appel.",
      "4. Collez l'URL ci-dessous dans le champ de destination.",
      "5. Sélectionnez les événements : début, fin et transfert d'appel.",
      "6. Enregistrez la configuration.",
      "7. Testez avec un appel entrant pour confirmer la réception.",
    ],
    mcNsWebhookCopyLabel: "Copier l'URL du webhook",
    mcMaestroWebhookLabel: "Configurer le webhook Maestro",
    mcMaestroWebhookHint: "Connecter Maestro CRM pour synchroniser les dossiers automatiquement.",
    mcMaestroWebhookCopyLabel: "Copier l'URL du webhook",
    mcElMicLabel: "Tester le micro ElevenLabs",
    mcElMicHint: "Vérifier que l'agent vocal IA peut capter et traiter l'audio correctement.",
    mcElMicLinkLabel: "Configurer ElevenLabs",
    mcOutboundLabel: "Tester un appel sortant",
    mcOutboundHint: "Effectuer un appel test depuis le portail pour valider la téléphonie.",
    mcSmsLabel: "Tester l'envoi d'un SMS",
    mcSmsHint: "Envoyer un SMS test pour valider l'intégration de messagerie.",
    mcVoicemailLabel: "Tester la messagerie vocale",
    mcVoicemailHint: "Laisser un message vocal test et vérifier sa réception et sa transcription.",
    mcM365Label: "Valider l'intégration Microsoft 365",
    mcM365Hint: "Confirmer la synchronisation du calendrier et des courriels.",
    mcAdminUserLabel: "Créer un utilisateur administrateur",
    mcAdminUserHint: "S'assurer qu'au moins un compte administrateur est actif.",
    mcAdminUserLinkLabel: "Gérer les utilisateurs",
    mcPipelineLabel: "Tester le pipeline complet",
    mcPipelineHint: "Simuler un parcours client de bout en bout (appel, IA, suivi).",
    mcResendLabel: "Configurer SPF/DKIM pour Resend",
    mcResendHint: "Valider l'authentification du domaine d'envoi de courriels.",
    mcIosLabel: "Tester l'application iOS",
    mcIosHint: "Vérifier les notifications et la connexion sur un appareil iOS.",
    mcAndroidLabel: "Tester l'application Android",
    mcAndroidHint: "Vérifier les notifications et la connexion sur un appareil Android.",
    mcRetentionLabel: "Configurer la rétention des données",
    mcRetentionHint: "Définir les délais de conservation conformes à la Loi 25.",
    mcRetentionLinkLabel: "Voir la conformité",
    noPdfReport: "Aucun rapport à exporter",
    pdfTitle: "Rapport d'audit Planiprêt",
    pdfGeneratedAt: "Généré le",
    pdfScoreLabel: "Score :",
    pdfManualChecklist: "Vérifications manuelles",
    pdfDownloaded: "PDF téléchargé",
    pdfFailed: "Échec de l'export PDF : ",
    configureAzure: "Configurer Azure",
    emailKanguru: "Email Kanguru",
    configureOpenAI: "Configurer OpenAI",
    configureClaude: "Configurer Claude",
    viewRealtime: "Voir Realtime",
    copied: "Copié",
    copyDefault: "Copier",
  },
  en: {
    title: "System audit",
    subtitle: "Automated check of the Planiprêt portal's technical configuration and compliance.",
    scoreLabel: "Overall score",
    kpiCompleted: "Completed",
    kpiPartial: "Partial",
    kpiMissing: "Missing",
    kpiIgnored: "Skipped",
    running: "Audit running…",
    runAudit: "Re-run audit",
    exportPdf: "Export as PDF",
    neverRun: "Never run",
    lastRun: (n: number) => `Last run ${n} min ago`,
    nextStepsTitle: "Recommended next steps",
    auditError: "Audit error: ",
    scorePerfect: "Perfect",
    scoreExcellent: "Excellent",
    scoreAttention: "Attention",
    scoreAction: "Action required",
    manualTitle: "Manual checks",
    manualEta: "To do before going live",
    markedDone: "Completed on",
    hideInstructions: "Hide instructions",
    showInstructions: "Show instructions",
    priorityCritical: "Critical",
    priorityHigh: "High",
    priorityMedium: "Medium",
    priorityLow: "Low",
    sectionEtaDb: "Database",
    sectionEtaRealtime: "Realtime",
    sectionEtaSecrets: "Secrets & API keys",
    sectionEtaFunctions: "Edge functions",
    sectionEtaExternal: "External services",
    mcNsWebhookLabel: "Configure the NetSapiens webhook",
    mcNsWebhookHint: "Connect NetSapiens to receive call events in real time.",
    mcNsWebhookInstructions: [
      "1. Log in to the NetSapiens admin portal.",
      "2. Go to Domain > Configuration > Webhooks.",
      "3. Add a new webhook for call events.",
      "4. Paste the URL below into the destination field.",
      "5. Select the events: call start, end, and transfer.",
      "6. Save the configuration.",
      "7. Test with an inbound call to confirm delivery.",
    ],
    mcNsWebhookCopyLabel: "Copy webhook URL",
    mcMaestroWebhookLabel: "Configure the Maestro webhook",
    mcMaestroWebhookHint: "Connect Maestro CRM to sync files automatically.",
    mcMaestroWebhookCopyLabel: "Copy webhook URL",
    mcElMicLabel: "Test the ElevenLabs microphone",
    mcElMicHint: "Verify that the AI voice agent can capture and process audio correctly.",
    mcElMicLinkLabel: "Configure ElevenLabs",
    mcOutboundLabel: "Test an outbound call",
    mcOutboundHint: "Make a test call from the portal to validate telephony.",
    mcSmsLabel: "Test sending an SMS",
    mcSmsHint: "Send a test SMS to validate the messaging integration.",
    mcVoicemailLabel: "Test voicemail",
    mcVoicemailHint: "Leave a test voicemail and verify its receipt and transcription.",
    mcM365Label: "Validate the Microsoft 365 integration",
    mcM365Hint: "Confirm calendar and email synchronization.",
    mcAdminUserLabel: "Create an admin user",
    mcAdminUserHint: "Ensure at least one admin account is active.",
    mcAdminUserLinkLabel: "Manage users",
    mcPipelineLabel: "Test the full pipeline",
    mcPipelineHint: "Simulate an end-to-end client journey (call, AI, follow-up).",
    mcResendLabel: "Configure SPF/DKIM for Resend",
    mcResendHint: "Validate the authentication of the sending email domain.",
    mcIosLabel: "Test the iOS app",
    mcIosHint: "Check notifications and login on an iOS device.",
    mcAndroidLabel: "Test the Android app",
    mcAndroidHint: "Check notifications and login on an Android device.",
    mcRetentionLabel: "Configure data retention",
    mcRetentionHint: "Set retention periods compliant with Bill 25.",
    mcRetentionLinkLabel: "View compliance",
    noPdfReport: "No report to export",
    pdfTitle: "Planiprêt audit report",
    pdfGeneratedAt: "Generated on",
    pdfScoreLabel: "Score:",
    pdfManualChecklist: "Manual checks",
    pdfDownloaded: "PDF downloaded",
    pdfFailed: "PDF export failed: ",
    configureAzure: "Configure Azure",
    emailKanguru: "Email Kanguru",
    configureOpenAI: "Configure OpenAI",
    configureClaude: "Configure Claude",
    viewRealtime: "View Realtime",
    copied: "Copied",
    copyDefault: "Copy",
  },
};

export default function PAAuditChecklist() {
  const { lang } = useMplanipretLang();
  const t = DICT[lang as "fr" | "en"];
  const nav = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [manualState, setManualState] = useState<Record<string, { done: boolean; at?: string }>>(() => {
    try {
      const raw = localStorage.getItem("pp-audit-manual");
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const out: Record<string, { done: boolean; at?: string }> = {};
      for (const k of Object.keys(parsed)) {
        const v = parsed[k];
        out[k] = typeof v === "boolean" ? { done: v } : v;
      }
      return out;
    } catch { return {}; }
  });
  const [expandedManual, setExpandedManual] = useState<Record<string, boolean>>({});

  const PRIORITY_LABEL: Record<Priority, string> = {
    critical: t.priorityCritical,
    high: t.priorityHigh,
    medium: t.priorityMedium,
    low: t.priorityLow,
  };

  const SECTION_ETA: Record<string, string> = {
    db: t.sectionEtaDb,
    realtime: t.sectionEtaRealtime,
    secrets: t.sectionEtaSecrets,
    functions: t.sectionEtaFunctions,
    external: t.sectionEtaExternal,
  };

  const MANUAL_CHECKLIST: ManualItem[] = [
    { id: "m-ns-webhook", label: t.mcNsWebhookLabel,
      hint: t.mcNsWebhookHint,
      instructions: t.mcNsWebhookInstructions as unknown as string[],
      copyText: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ns-webhook-receiver`,
      copyLabel: t.mcNsWebhookCopyLabel },
    { id: "m-maestro-webhook", label: t.mcMaestroWebhookLabel,
      hint: t.mcMaestroWebhookHint,
      copyText: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/maestro-webhook-receiver`,
      copyLabel: t.mcMaestroWebhookCopyLabel },
    { id: "m-el-mic", label: t.mcElMicLabel,
      hint: t.mcElMicHint,
      link: { label: t.mcElMicLinkLabel, href: "/planipret/admin/integrations#elevenlabs" } },
    { id: "m-outbound", label: t.mcOutboundLabel, hint: t.mcOutboundHint },
    { id: "m-sms", label: t.mcSmsLabel, hint: t.mcSmsHint },
    { id: "m-voicemail", label: t.mcVoicemailLabel, hint: t.mcVoicemailHint },
    { id: "m-m365", label: t.mcM365Label, hint: t.mcM365Hint },
    { id: "m-admin", label: t.mcAdminUserLabel,
      hint: t.mcAdminUserHint,
      link: { label: t.mcAdminUserLinkLabel, href: "/planipret/admin/users" } },
    { id: "m-pipeline", label: t.mcPipelineLabel, hint: t.mcPipelineHint },
    { id: "m-resend", label: t.mcResendLabel, hint: t.mcResendHint },
    { id: "m-ios", label: t.mcIosLabel, hint: t.mcIosHint },
    { id: "m-android", label: t.mcAndroidLabel, hint: t.mcAndroidHint },
    { id: "m-retention", label: t.mcRetentionLabel,
      hint: t.mcRetentionHint,
      link: { label: t.mcRetentionLinkLabel, href: "/planipret/admin/compliance" } },
  ];

  // Load persisted manual state from DB
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("planipret_settings").select("manual_checklist_state").limit(1).maybeSingle();
        const state = (data as any)?.manual_checklist_state;
        if (state && typeof state === "object" && Object.keys(state).length > 0) {
          setManualState(state);
        }
      } catch { /* ignore — falls back to localStorage */ }
    })();
  }, []);

  const persistManual = async (next: Record<string, { done: boolean; at?: string }>) => {
    localStorage.setItem("pp-audit-manual", JSON.stringify(next));
    try {
      const { data: row } = await supabase.from("planipret_settings").select("id").limit(1).maybeSingle();
      if ((row as any)?.id) {
        await supabase.from("planipret_settings").update({ manual_checklist_state: next as any }).eq("id", (row as any).id);
      }
    } catch (e) {
      console.warn("persistManual failed", e);
    }
  };

  const runAudit = async () => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("pp-audit-runner", { body: {} });
      if (error) throw error;
      setReport(data as Report);
      sessionStorage.setItem("pp-audit-cache", JSON.stringify({ at: Date.now(), data }));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pp-audit-cache");
      if (raw) {
        const { at, data } = JSON.parse(raw);
        if (Date.now() - at < 5 * 60 * 1000) { setReport(data); return; }
      }
    } catch {/* ignore */}
    runAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleManual = (id: string) => {
    setManualState((s) => {
      const cur = s[id]?.done ?? false;
      const next = { ...s, [id]: { done: !cur, at: !cur ? new Date().toISOString() : undefined } };
      persistManual(next);
      return next;
    });
  };

  const ageMin = useMemo(() => {
    if (!report?.generated_at) return null;
    return Math.max(0, Math.round((Date.now() - new Date(report.generated_at).getTime()) / 60000));
  }, [report]);

  // Quick-fix dispatcher
  const quickFix = (itemId: string): QuickFix | null => {
    if (itemId === "secret-ELEVENLABS_DEFAULT_AGENT_ID") {
      return { label: t.mcElMicLinkLabel, icon: "🚀", action: () => nav("/planipret/admin/integrations#elevenlabs") };
    }
    if (itemId.startsWith("secret-MICROSOFT_")) {
      return { label: t.configureAzure, icon: "⚙️", action: () => nav("/planipret/admin/integrations#microsoft") };
    }
    if (itemId.startsWith("secret-MAESTRO_")) {
      return {
        label: t.emailKanguru, icon: "📧",
        action: () => { window.location.href = "mailto:support@kanguru.ca?subject=Identifiants%20API%20Maestro%20pour%20Planipr%C3%AAt&body=Bonjour%2C%0A%0ANous%20avons%20besoin%20de%20MAESTRO_API_URL%20et%20MAESTRO_API_KEY%20pour%20activer%20l%27int%C3%A9gration%20Maestro%20dans%20notre%20portail%20Planipr%C3%AAt.%0A%0AMerci."; },
      };
    }
    if (itemId === "secret-OPENAI_API_KEY") {
      return { label: t.configureOpenAI, icon: "🔑", action: () => nav("/planipret/admin/integrations#nsapi") };
    }
    if (itemId === "secret-ELEVENLABS_AVA_VOICE_ID") {
      return { label: t.mcElMicLinkLabel, icon: "🎙️", action: () => nav("/planipret/admin/integrations#elevenlabs") };
    }
    if (itemId === "claude" || itemId === "secret-ANTHROPIC_API_KEY") {
      return { label: t.configureClaude, icon: "🔧", action: () => nav("/planipret/admin/integrations#anthropic") };
    }
    if (itemId.startsWith("rt-")) {
      return { label: t.viewRealtime, icon: "📡", action: () => toast.info(t.sectionEtaRealtime) };
    }
    return null;
  };

  // Next-steps recommendations from current failures
  const nextSteps = useMemo(() => {
    if (!report) return [] as { id: string; label: string; priority: Priority; eta: string; action?: QuickFix }[];
    const failed = report.sections.flatMap((s) => s.items).filter((i) => i.status === "fail");
    return failed
      .map((it) => {
        const pr = PRIORITY_MAP[it.id];
        if (!pr) return null;
        return {
          id: it.id, label: it.name, priority: pr.priority, eta: pr.eta,
          action: quickFix(it.id) ?? undefined,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const order: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return order[a.priority as Priority] - order[b.priority as Priority];
      }) as any;
  }, [report]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportPdf = () => {
    if (!report) {
      toast.error(t.noPdfReport);
      return;
    }
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 40;
      let y = margin;

      const line = (txt: string, size = 10, bold = false, color: [number, number, number] = [20, 20, 20]) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
        const wrapped = doc.splitTextToSize(String(txt ?? ""), pageW - margin * 2);
        for (const l of wrapped) {
          if (y > pageH - margin) { doc.addPage(); y = margin; }
          doc.text(l, margin, y);
          y += size * 1.25;
        }
      };
      const hr = () => {
        if (y > pageH - margin) { doc.addPage(); y = margin; }
        doc.setDrawColor(200); doc.line(margin, y, pageW - margin, y); y += 8;
      };

      line(t.pdfTitle, 18, true, [10, 30, 60]);
      line(`${t.pdfGeneratedAt} ${new Date(report.generated_at).toLocaleString("fr-CA")}`, 9, false, [100, 100, 100]);
      y += 6;
      line(`${t.pdfScoreLabel} ${report.score}%`, 14, true, [0, 100, 80]);
      line(`[OK] ${report.totals.pass}   [!] ${report.totals.warn}   [X] ${report.totals.fail}   [-] ${report.totals.skip}   (Total ${report.totals.total})`, 10);
      hr();

      const icon = (s: Status) => s === "pass" ? "[OK]" : s === "fail" ? "[X]" : s === "warn" ? "[!]" : s === "skip" ? "[-]" : "[..]";

      for (const sec of report.sections) {
        y += 4;
        line(`${sec.title}`, 13, true, [10, 30, 60]);
        for (const it of sec.items) {
          const color: [number, number, number] =
            it.status === "pass" ? [0, 130, 90] :
            it.status === "fail" ? [180, 40, 40] :
            it.status === "warn" ? [180, 120, 0] : [110, 110, 110];
          line(`${icon(it.status)} ${it.name}`, 10, true, color);
          if (it.detail) line(it.detail, 9, false, [80, 80, 80]);
        }
        hr();
      }

      line(t.pdfManualChecklist, 13, true, [10, 30, 60]);
      for (const m of MANUAL_CHECKLIST) {
        const done = manualState[m.id]?.done;
        line(`${done ? "[X]" : "[ ]"} ${m.label}`, 10, true, done ? [0, 130, 90] : [60, 60, 60]);
        line(m.hint, 9, false, [110, 110, 110]);
      }

      const filename = `audit-planipret-${new Date().toISOString().slice(0, 10)}.pdf`;
      const blob = doc.output("blob");
      downloadPdfBlob(blob, filename);
      toast.success(t.pdfDownloaded);
    } catch (e: any) {
      console.error("[audit] exportPdf error", e);
      toast.error(`${t.pdfFailed}${e?.message || e}`);
    }
  };

  return (
    <div className="min-h-full p-6 md:p-8" style={{ background: C.bg, color: C.text }}>
      {/* Header */}
      <div className="flex flex-col gap-2 mb-6">
        <h1 className="font-bold" style={{ fontFamily: "Inter,sans-serif", fontSize: 28, color: C.text }}>
          {t.title}
        </h1>
        <p style={{ fontFamily: "DM Sans,sans-serif", fontSize: 14, color: C.textMuted }}>
          {t.subtitle}
        </p>
      </div>

      {/* Score card */}
      <div
        className="rounded-2xl p-6 mb-6 flex flex-col md:flex-row items-center gap-6"
        style={{ background: C.surface, border: `1px solid ${C.border}`, position: "relative", overflow: "hidden" }}
      >
        <div className="absolute inset-x-0 top-0 h-[2px]"
             style={{ background: "linear-gradient(90deg, transparent, #2E9BDC, #00D4AA, transparent)" }} />
        <ScoreCircle pct={report?.score ?? 0} label={t.scoreLabel} />

        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
          <Kpi label={t.kpiCompleted} value={report?.totals.pass ?? 0} color={C.pass} icon="✅" />
          <Kpi label={t.kpiPartial} value={report?.totals.warn ?? 0} color={C.warn} icon="⚠️" />
          <Kpi label={t.kpiMissing} value={report?.totals.fail ?? 0} color={C.fail} icon="❌" />
          <Kpi label={t.kpiIgnored} value={report?.totals.skip ?? 0} color={C.skip} icon="⏭️" />
        </div>

        <div className="flex flex-col gap-2 md:items-end">
          <button
            onClick={runAudit}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition active:scale-95 disabled:opacity-60"
            style={{ background: "linear-gradient(90deg,#2E9BDC,#00D4AA)", color: "#03101A" }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {loading ? t.running : t.runAudit}
          </button>
          <button
            onClick={exportPdf}
            className="px-4 py-2 rounded-xl text-xs flex items-center gap-2 border"
            style={{ borderColor: C.borderAccent, color: C.textSecondary, background: "transparent" }}
          >
            <FileDown className="w-3.5 h-3.5" /> {t.exportPdf}
          </button>
          <div className="text-[11px]" style={{ color: C.textMuted }}>
            {ageMin == null ? t.neverRun : t.lastRun(ageMin)}
          </div>
        </div>
      </div>

      {/* Score breakdown by category */}
      {report && (
        <div className="rounded-2xl p-4 mb-6 grid grid-cols-2 md:grid-cols-5 gap-3"
             style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          {report.sections.map((sec) => {
            const sc = sectionScore(sec.items);
            return (
              <div key={sec.id} className="rounded-xl p-3"
                   style={{ background: "rgba(3,8,16,0.5)", border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-2 mb-1">
                  <span>{sec.emoji}</span>
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: C.textMuted }}>{sec.title}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold tabular-nums" style={{ color: scoreColor(sc.pct) }}>
                    {sc.pass}/{sc.total}
                  </span>
                  <span className="text-xs" style={{ color: scoreColor(sc.pct) }}>{sc.pct}%</span>
                </div>
                <div className="text-[10px] mt-1" style={{ color: C.textMuted }}>{SECTION_ETA[sec.id] ?? ""}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Next steps card */}
      {nextSteps.length > 0 && (
        <div className="rounded-2xl p-5 mb-6"
             style={{ background: "linear-gradient(135deg, rgba(46,155,220,0.08), rgba(0,212,170,0.04))",
                      border: `1px solid ${C.borderAccent}` }}>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5" style={{ color: C.info }} />
            <h3 className="font-semibold" style={{ color: C.text }}>{t.nextStepsTitle}</h3>
          </div>
          <div className="space-y-2">
            {nextSteps.slice(0, 8).map((s: any, idx: number) => (
              <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg"
                   style={{ background: "rgba(3,8,16,0.4)" }}>
                <span className="text-xs tabular-nums w-5" style={{ color: C.textMuted }}>{idx + 1}.</span>
                <span className="text-[10px] px-2 py-0.5 rounded font-semibold whitespace-nowrap"
                      style={{ background: `${PRIORITY_COLOR[s.priority as Priority]}22`, color: PRIORITY_COLOR[s.priority as Priority] }}>
                  {PRIORITY_LABEL[s.priority as Priority]}
                </span>
                <span className="flex-1 text-sm truncate" style={{ color: C.text }}>{s.label}</span>
                <span className="text-[11px] flex items-center gap-1" style={{ color: C.textMuted }}>
                  <Clock className="w-3 h-3" />{s.eta}
                </span>
                {s.action && (
                  <button onClick={s.action}
                          className="text-[11px] px-2 py-1 rounded-md flex items-center gap-1 hover:bg-white/5"
                          style={{ color: C.info, border: `1px solid ${C.borderAccent}` }}>
                    {s.action.icon} {s.action.label}<ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-6 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", height: 8 }}>
        {report && (
          <div className="h-full transition-all"
               style={{ width: `${(report.totals.pass / (report.totals.total || 1)) * 100}%`,
                        background: `linear-gradient(90deg, ${C.pass}, ${C.info})` }} />
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl p-4 text-sm"
             style={{ background: "rgba(232,76,76,0.08)", border: `1px solid rgba(232,76,76,0.25)`, color: "#FFB4B4" }}>
          {t.auditError}{error}
        </div>
      )}

      {/* Sections */}
      <div className="space-y-4">
        {(report?.sections ?? []).map((sec) => {
          const score = sectionScore(sec.items);
          const isCollapsed = !!collapsed[sec.id];
          return (
            <div key={sec.id} className="rounded-2xl overflow-hidden"
                 style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [sec.id]: !c[sec.id] }))}
                className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-3">
                  {isCollapsed ? <ChevronRight className="w-4 h-4" style={{ color: C.textMuted }} />
                               : <ChevronDown className="w-4 h-4" style={{ color: C.textMuted }} />}
                  <span className="text-xl">{sec.emoji}</span>
                  <span className="font-semibold" style={{ color: C.text }}>{sec.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(255,255,255,0.04)", color: C.textMuted }}>
                    {sec.items.length} items
                  </span>
                </div>
                <ScoreBadge pct={score.pct} pass={score.pass} total={score.total}
                  labelPerfect={t.scorePerfect} labelExcellent={t.scoreExcellent}
                  labelAttention={t.scoreAttention} labelAction={t.scoreAction} />
              </button>

              {!isCollapsed && (
                <div className="border-t" style={{ borderColor: C.border }}>
                  {sec.items.map((item) => {
                    const prio = PRIORITY_MAP[item.id];
                    const fix = item.status === "fail" ? quickFix(item.id) : null;
                    return (
                      <div key={item.id}
                           className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0"
                           style={{ borderColor: "rgba(14,42,69,0.5)" }}>
                        <div className="mt-0.5"><StatusIcon s={item.status} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" style={{ color: C.text }}>{item.name}</span>
                            {prio && item.status === "fail" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                                    style={{ background: `${PRIORITY_COLOR[prio.priority]}22`, color: PRIORITY_COLOR[prio.priority] }}>
                                {PRIORITY_LABEL[prio.priority]}
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <div className="text-xs mt-0.5" style={{ color: C.textMuted }}>{item.description}</div>
                          )}
                          {item.detail && (
                            <div className="text-xs mt-1"
                                 style={{ color: item.status === "fail" ? "#FFB4B4"
                                                : item.status === "pass" ? "#7FE7CB"
                                                : item.status === "warn" ? "#FFD58A"
                                                : C.textMuted }}>
                              {item.detail}
                            </div>
                          )}
                        </div>
                        {fix && (
                          <button onClick={fix.action}
                                  className="text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1 hover:bg-white/5 shrink-0"
                                  style={{ color: C.info, border: `1px solid ${C.borderAccent}` }}>
                            {fix.icon} {fix.label}
                          </button>
                        )}
                        {item.ms != null && (
                          <div className="text-[11px] tabular-nums shrink-0" style={{ color: C.textMuted }}>{item.ms}ms</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Manual checklist */}
        <div className="rounded-2xl overflow-hidden"
             style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: C.border }}>
            <ShieldCheck className="w-5 h-5" style={{ color: C.info }} />
            <span className="font-semibold" style={{ color: C.text }}>{t.manualTitle}</span>
            <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(255,255,255,0.04)", color: C.textMuted }}>
              {Object.values(manualState).filter((v) => v?.done).length}/{MANUAL_CHECKLIST.length}
            </span>
            <span className="ml-auto text-[11px]" style={{ color: C.textMuted }}>{t.manualEta}</span>
          </div>
          {MANUAL_CHECKLIST.map((m) => {
            const checked = !!manualState[m.id]?.done;
            const doneAt = manualState[m.id]?.at;
            const showInstr = !!expandedManual[m.id];
            const hasInstr = (m.instructions?.length ?? 0) > 0 || m.copyText || m.link;
            return (
              <div key={m.id}
                   className="px-4 py-3 border-b last:border-b-0"
                   style={{ borderColor: "rgba(14,42,69,0.5)" }}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={checked} onChange={() => toggleManual(m.id)}
                         className="mt-1 accent-cyan-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: checked ? C.textMuted : C.text,
                                                      textDecoration: checked ? "line-through" : undefined }}>
                      {m.label}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: C.textMuted }}>{m.hint}</div>
                    {doneAt && (
                      <div className="text-[10px] mt-1" style={{ color: C.pass }}>
                        {t.markedDone} {new Date(doneAt).toLocaleString("fr-CA")}
                      </div>
                    )}
                  </div>
                  {hasInstr && (
                    <button onClick={() => setExpandedManual((s) => ({ ...s, [m.id]: !s[m.id] }))}
                            className="text-[11px] px-2 py-1 rounded-md shrink-0 hover:bg-white/5"
                            style={{ color: C.textSecondary, border: `1px solid ${C.border}` }}>
                      📋 {showInstr ? t.hideInstructions : t.showInstructions}
                    </button>
                  )}
                </div>
                {showInstr && hasInstr && (
                  <div className="mt-3 ml-7 p-3 rounded-lg space-y-2"
                       style={{ background: "rgba(3,8,16,0.5)", border: `1px solid ${C.border}` }}>
                    {m.instructions?.map((step, i) => (
                      <div key={i} className="text-xs" style={{ color: C.textSecondary }}>{step}</div>
                    ))}
                    <div className="flex gap-2 flex-wrap pt-1">
                      {m.copyText && (
                        <button onClick={() => { navigator.clipboard.writeText(m.copyText!); toast.success(t.copied); }}
                                className="text-[11px] px-2 py-1 rounded-md flex items-center gap-1 hover:bg-white/5"
                                style={{ color: C.info, border: `1px solid ${C.borderAccent}` }}>
                          <Copy className="w-3 h-3" /> {m.copyLabel ?? t.copyDefault}
                        </button>
                      )}
                      {m.link && (
                        <button onClick={() => nav(m.link!.href)}
                                className="text-[11px] px-2 py-1 rounded-md flex items-center gap-1 hover:bg-white/5"
                                style={{ color: C.info, border: `1px solid ${C.borderAccent}` }}>
                          <ExternalLink className="w-3 h-3" /> {m.link.label}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div className="rounded-xl p-3 flex items-center gap-3"
         style={{ background: "rgba(3,8,16,0.5)", border: `1px solid ${C.border}` }}>
      <div className="text-xl">{icon}</div>
      <div>
        <div className="text-lg font-bold tabular-nums" style={{ color }}>{value}</div>
        <div className="text-[10px] uppercase tracking-wider" style={{ color: C.textMuted }}>{label}</div>
      </div>
    </div>
  );
}

function ScoreBadge({ pct, pass, total, labelPerfect, labelExcellent, labelAttention, labelAction }: { pct: number; pass: number; total: number; labelPerfect: string; labelExcellent: string; labelAttention: string; labelAction: string }) {
  const color = pct === 100 ? C.pass : pct >= 80 ? C.info : pct >= 60 ? C.warn : C.fail;
  const label = pct === 100 ? labelPerfect : pct >= 80 ? labelExcellent : pct >= 60 ? labelAttention : labelAction;
  return (
    <div className="flex items-center gap-2">
      <div className="text-xs font-semibold tabular-nums" style={{ color }}>{pass}/{total}</div>
      <div className="px-2 py-1 rounded-full text-[10px] uppercase tracking-wider"
           style={{ background: `${color}22`, color }}>{label}</div>
    </div>
  );
}
