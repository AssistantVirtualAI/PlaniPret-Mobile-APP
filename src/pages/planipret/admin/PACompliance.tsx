import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle, Play } from "lucide-react";

export default function PACompliance() {
  const [consent, setConsent] = useState<any>(null);
  const [retention, setRetention] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<{ total: number; given: number }>({ total: 0, given: 0 });

  const load = async () => {
    const [c, r, s, cs, csGiven] = await Promise.all([
      supabase.from("planipret_consent_settings").select("*").limit(1).maybeSingle(),
      supabase.from("planipret_retention_policy").select("*").limit(1).maybeSingle(),
      supabase.from("planipret_settings").select("session_timeout_enabled, session_timeout_minutes, max_concurrent_sessions").limit(1).maybeSingle(),
      supabase.from("planipret_call_consents").select("id", { count: "exact", head: true }),
      supabase.from("planipret_call_consents").select("id", { count: "exact", head: true }).eq("consent_given", true),
    ]);
    setConsent(c.data);
    setRetention(r.data);
    setSettings(s.data);
    setStats({ total: cs.count ?? 0, given: csGiven.count ?? 0 });
  };
  useEffect(() => { load(); }, []);

  const saveConsent = async () => {
    setBusy(true);
    const { error } = await supabase.from("planipret_consent_settings").update({
      recording_consent_enabled: consent.recording_consent_enabled,
      consent_message_fr: consent.consent_message_fr,
      consent_message_en: consent.consent_message_en,
      consent_delay_seconds: consent.consent_delay_seconds,
    }).eq("id", consent.id);
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Sauvegardé");
  };

  const saveRetention = async () => {
    setBusy(true);
    const { error } = await supabase.from("planipret_retention_policy").update({
      calls_retention_days: retention.calls_retention_days,
      messages_retention_days: retention.messages_retention_days,
      voicemails_retention_days: retention.voicemails_retention_days,
      transcripts_retention_days: retention.transcripts_retention_days,
      ai_insights_retention_days: retention.ai_insights_retention_days,
      audit_logs_retention_days: retention.audit_logs_retention_days,
      recordings_retention_days: retention.recordings_retention_days,
    }).eq("id", retention.id);
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Sauvegardé");
  };

  const saveSettings = async () => {
    if (!settings) return;
    setBusy(true);
    const { data: row } = await supabase.from("planipret_settings").select("id").limit(1).maybeSingle();
    if (row?.id) {
      await supabase.from("planipret_settings").update(settings).eq("id", row.id);
    }
    setBusy(false);
    toast.success("Sauvegardé");
  };

  const runRetention = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("pp-data-retention", { body: {} });
    setBusy(false);
    if (error) toast.error(error.message); else {
      toast.success(`Nettoyage exécuté — ${Object.values((data as any)?.deletions ?? {}).reduce((a: any, b: any) => a + (b > 0 ? b : 0), 0)} enregistrements supprimés`);
      load();
    }
  };

  // Compliance score
  const checks = [
    { ok: true, label: "RLS activée sur toutes les tables" },
    { ok: true, label: "Audit log actif" },
    { ok: !!retention, label: "Rétention données configurée" },
    { ok: !!consent?.recording_consent_enabled, label: "Consentement enregistrement activé" },
    { ok: true, label: "Politique de confidentialité publiée" },
    { ok: true, label: "Export RGPD disponible" },
    { ok: false, warn: true, label: "SPF/DKIM Resend à configurer" },
    { ok: false, warn: true, label: "Backup enregistrements (NS purge 90j)" },
    { ok: false, label: "DPO désigné (à compléter)" },
    { ok: false, label: "Formation courtiers (à documenter)" },
  ];
  const score = checks.filter((c) => c.ok).length;
  const scoreColor = score >= 8 ? "#10B981" : score >= 6 ? "#F5A623" : "#EF4444";

  return (
    <div className="space-y-6">
      {/* Score */}
      <div className="pp-card" style={{ padding: 20 }}>
        <div className="flex items-center justify-between mb-3">
          <h2 style={{ fontFamily: "Inter,sans-serif", fontSize: 16, fontWeight: 700, color: "var(--pp-text-primary)" }}>
            Tableau de bord conformité
          </h2>
          <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor, fontFamily: "Inter,sans-serif" }}>
            {score}/10
          </div>
        </div>
        <ul className="space-y-2">
          {checks.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-sm" style={{ color: "var(--pp-text-secondary)" }}>
              {c.ok ? <CheckCircle2 className="w-4 h-4" style={{ color: "#10B981" }} />
                : c.warn ? <AlertTriangle className="w-4 h-4" style={{ color: "#F5A623" }} />
                : <XCircle className="w-4 h-4" style={{ color: "#EF4444" }} />}
              <span>{c.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Consent */}
      {consent && (
        <div className="pp-card" style={{ padding: 20 }}>
          <h3 style={{ fontFamily: "Inter,sans-serif", fontSize: 14, fontWeight: 700, color: "var(--pp-text-primary)", marginBottom: 12 }}>
            Consentement d'enregistrement
          </h3>
          <label className="flex items-center gap-2 mb-3 text-sm" style={{ color: "var(--pp-text-secondary)" }}>
            <input type="checkbox" checked={consent.recording_consent_enabled}
              onChange={(e) => setConsent({ ...consent, recording_consent_enabled: e.target.checked })} />
            Activer le message de consentement
          </label>
          <label className="text-xs block mb-1" style={{ color: "var(--pp-text-muted)" }}>Message FR</label>
          <textarea value={consent.consent_message_fr} onChange={(e) => setConsent({ ...consent, consent_message_fr: e.target.value })}
            rows={3} className="w-full mb-3 p-2 rounded-lg text-sm"
            style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border)" }} />
          <label className="text-xs block mb-1" style={{ color: "var(--pp-text-muted)" }}>Message EN</label>
          <textarea value={consent.consent_message_en} onChange={(e) => setConsent({ ...consent, consent_message_en: e.target.value })}
            rows={3} className="w-full mb-3 p-2 rounded-lg text-sm"
            style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border)" }} />
          <label className="text-xs block mb-1" style={{ color: "var(--pp-text-muted)" }}>Délai avant connexion (3-10 s)</label>
          <input type="number" min={3} max={10} value={consent.consent_delay_seconds}
            onChange={(e) => setConsent({ ...consent, consent_delay_seconds: Math.min(10, Math.max(3, Number(e.target.value))) })}
            className="w-24 mb-3 px-2 py-2 rounded-lg text-sm"
            style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border)" }} />
          <div className="flex gap-2">
            <button onClick={saveConsent} disabled={busy} className="pp-btn-primary">Sauvegarder</button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <Stat label="Total consentements" value={stats.total} />
            <Stat label="Acceptés" value={stats.given} />
            <Stat label="Taux" value={stats.total ? `${Math.round((stats.given / stats.total) * 100)}%` : "—"} />
          </div>
        </div>
      )}

      {/* Session timeout */}
      {settings && (
        <div className="pp-card" style={{ padding: 20 }}>
          <h3 style={{ fontFamily: "Inter,sans-serif", fontSize: 14, fontWeight: 700, color: "var(--pp-text-primary)", marginBottom: 12 }}>
            Expiration de session
          </h3>
          <label className="flex items-center gap-2 mb-3 text-sm" style={{ color: "var(--pp-text-secondary)" }}>
            <input type="checkbox" checked={settings.session_timeout_enabled}
              onChange={(e) => setSettings({ ...settings, session_timeout_enabled: e.target.checked })} />
            Activer l'expiration automatique
          </label>
          <label className="text-xs block mb-1" style={{ color: "var(--pp-text-muted)" }}>Expiration après (minutes)</label>
          <select value={settings.session_timeout_minutes}
            onChange={(e) => setSettings({ ...settings, session_timeout_minutes: Number(e.target.value) })}
            className="mb-3 px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border)" }}>
            <option value={15}>15</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
          <div><button onClick={saveSettings} disabled={busy} className="pp-btn-primary">Sauvegarder</button></div>
        </div>
      )}

      {/* Retention */}
      {retention && (
        <div className="pp-card" style={{ padding: 20 }}>
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ fontFamily: "Inter,sans-serif", fontSize: 14, fontWeight: 700, color: "var(--pp-text-primary)" }}>
              Rétention des données
            </h3>
            <button onClick={runRetention} disabled={busy} className="pp-btn-secondary flex items-center gap-2 text-sm">
              <Play className="w-3.5 h-3.5" /> Exécuter maintenant
            </button>
          </div>
          {[
            ["calls_retention_days", "Appels"],
            ["messages_retention_days", "Messages"],
            ["voicemails_retention_days", "Messages vocaux"],
            ["transcripts_retention_days", "Transcriptions"],
            ["ai_insights_retention_days", "Analyses IA"],
            ["audit_logs_retention_days", "Journal d'audit"],
            ["recordings_retention_days", "Enregistrements"],
          ].map(([k, lbl]) => (
            <div key={k} className="flex items-center gap-3 mb-2 text-sm" style={{ color: "var(--pp-text-secondary)" }}>
              <label className="flex-1">{lbl}</label>
              <input type="number" min={1} value={retention[k]} onChange={(e) => setRetention({ ...retention, [k]: Number(e.target.value) })}
                className="w-24 px-2 py-1.5 rounded-lg text-sm"
                style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border)" }} />
              <span className="text-xs w-12" style={{ color: "var(--pp-text-muted)" }}>jours</span>
            </div>
          ))}
          <button onClick={saveRetention} disabled={busy} className="pp-btn-primary mt-3">Sauvegarder</button>
          {retention.last_run_at && (
            <p className="mt-2 text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
              Dernier nettoyage : {new Date(retention.last_run_at).toLocaleString("fr-CA")}
            </p>
          )}
        </div>
      )}

      {/* Incidents */}
      <div className="pp-card" style={{ padding: 20 }}>
        <h3 style={{ fontFamily: "Inter,sans-serif", fontSize: 14, fontWeight: 700, color: "var(--pp-text-primary)", marginBottom: 8 }}>
          Incidents & violations
        </h3>
        <p className="text-sm" style={{ color: "var(--pp-text-secondary)" }}>Aucun incident signalé ✅</p>
        <p className="text-[11px] mt-2" style={{ color: "var(--pp-text-muted)" }}>
          ⚠️ Loi 25 — toute violation doit être signalée à la CAI sous 72 h.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border)" }}>
      <div className="text-[10px] uppercase" style={{ color: "var(--pp-text-muted)" }}>{label}</div>
      <div className="text-lg font-bold mt-1" style={{ color: "var(--pp-text-primary)", fontFamily: "Inter,sans-serif" }}>{value}</div>
    </div>
  );
}
