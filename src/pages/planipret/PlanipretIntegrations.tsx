/**
 * Planiprêt Integrations admin page.
 *
 * Single source of truth for integration credentials and toggles.
 * Saving a card calls `pp-save-integration`; testing calls `pp-test-integration`.
 * The mobile app reads `planipret_integration_config` via Supabase Realtime
 * (see `src/services/IntegrationSync.ts`).
 *
 * Batch 1 (this file): foundation + NS-API + Claude IA cards.
 * Batch 2/3: Microsoft 365, ElevenLabs, Maestro, Webhooks, Mobile App, Compliance.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  IntegrationCard, IntegrationStatus, Field, TextInput, SecretInput,
  InfoBanner, CopyButton,
} from "@/components/planipret/admin/integrations/IntegrationCard";
import NsLiveTestPanel from "@/components/planipret/admin/integrations/NsLiveTestPanel";
import NsRecordingsProbe from "@/components/planipret/admin/integrations/NsRecordingsProbe";
import NsTranscriptionProbe from "@/components/planipret/admin/integrations/NsTranscriptionProbe";
import CallE2ECheck from "@/components/planipret/admin/integrations/CallE2ECheck";
import Ms365LiveTestPanel from "@/components/planipret/admin/integrations/Ms365LiveTestPanel";
import NsMigrationPanel from "@/components/planipret/admin/integrations/NsMigrationPanel";
import NsCapabilitiesPanel from "@/components/planipret/admin/integrations/NsCapabilitiesPanel";
import NsSyncDashboardPanel from "@/components/planipret/admin/integrations/NsSyncDashboardPanel";

type Row = {
  integration_key: string;
  is_enabled: boolean;
  is_configured: boolean;
  config_data: Record<string, string>;
  last_tested_at: string | null;
  last_test_result: string | null;
  last_test_success: boolean | null;
};



function deriveStatus(row?: Row): IntegrationStatus {
  if (!row) return "unconfigured";
  if (!row.is_configured) return "unconfigured";
  if (row.last_test_success === false) return "error";
  if (row.last_test_success === true) return "connected";
  return "pending";
}

export default function PlanipretIntegrations() {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(true);
  const [backendSecrets, setBackendSecrets] = useState<
    Record<string, { configured: boolean; present: string[]; missing: string[] }>
  >({});

  // Per-card editable state (uncommitted form values)
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});

  async function refresh() {
    const { data, error } = await supabase
      .from("planipret_integration_config")
      .select("integration_key,is_enabled,is_configured,config_data,last_tested_at,last_test_result,last_test_success");
    if (error) { toast.error("Chargement impossible: " + error.message); setLoading(false); return; }
    const map: Record<string, Row> = {};
    (data ?? []).forEach((r: any) => { map[r.integration_key] = r as Row; });
    setRows(map);
    setLoading(false);
  }

  async function refreshBackendSecrets() {
    const { data, error } = await supabase.functions.invoke("pp-backend-secrets-status", { body: {} });
    if (!error && (data as any)?.secrets) setBackendSecrets((data as any).secrets);
  }

  useEffect(() => {
    refresh();
    refreshBackendSecrets();
    const channel = supabase
      .channel("pp-integration-config")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "planipret_integration_config" },
        () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);


  // Health pills
  const health = useMemo(() => {
    const list = Object.values(rows);
    return {
      connected: list.filter((r) => deriveStatus(r) === "connected").length,
      pending:   list.filter((r) => deriveStatus(r) === "pending" || deriveStatus(r) === "unconfigured").length,
      errors:    list.filter((r) => deriveStatus(r) === "error").length,
    };
  }, [rows]);

  function getField(key: string, field: string, fallback = "") {
    const backendValues = (backendSecrets[key] as any)?.values as Record<string, string> | undefined;
    return draft[key]?.[field]
      ?? rows[key]?.config_data?.[field]
      ?? backendValues?.[field]
      ?? fallback;
  }
  function setField(key: string, field: string, value: string) {
    setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? {}), [field]: value } }));
  }

  async function save(key: string, requiredFields: string[]) {
    const cfg = { ...(rows[key]?.config_data ?? {}), ...(draft[key] ?? {}) };
    for (const f of requiredFields) {
      if (!cfg[f]) { toast.error(`Champ requis: ${f}`); return; }
    }
    const { data, error } = await supabase.functions.invoke("pp-save-integration", {
      body: { integration_key: key, config: draft[key] ?? {} },
    });
    if (error || (data && (data as any).error)) {
      toast.error(`Échec: ${(data as any)?.error ?? error?.message}`);
      return;
    }
    toast.success("✅ Intégration sauvegardée et synchronisée");
    setDraft((d) => ({ ...d, [key]: {} }));
    refresh();
  }

  async function toggleEnabled(key: string, next: boolean) {
    const { error } = await supabase.functions.invoke("pp-save-integration", {
      body: { integration_key: key, is_enabled: next },
    });
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Activée" : "Désactivée");
    refresh();
  }

  async function test(key: string) {
    const { data, error } = await supabase.functions.invoke("pp-test-integration", {
      body: { integration_key: key },
    });
    if (error) { toast.error(error.message); return; }
    const ok = (data as any)?.success;
    const msg = (data as any)?.message ?? "—";
    if (ok) toast.success(`✅ ${msg}`); else toast.error(`❌ ${msg}`);
    refresh();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: "#4A7FA5" }}>
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement des intégrations…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p style={{ fontSize: 13, color: "#4A7FA5", maxWidth: 720 }}>
            Configurez vos intégrations une seule fois — elles se synchronisent automatiquement
            avec l'application mobile pour les 350 courtiers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HealthPill color="#00D4AA" bg="#0D3D2A" border="#1A5A3F" label={`${health.connected} connectées`} />
          <HealthPill color="#F5A623" bg="#2A1A00" border="#4A3000" label={`${health.pending} en attente`} />
          <HealthPill color="#E84C4C" bg="#3D1010" border="#5A1A1A" label={`${health.errors} erreurs`} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ───────── CARD 2 — NS-API ───────── */}
        <IntegrationCard
          integrationKey="ns_api" name="NS-API (NetSapiens)"
          backendSecrets={backendSecrets.ns_api}
          description="Système téléphonique — appels, CDRs, voicemails, SMS, enregistrements"
          emoji="📞"
          status={deriveStatus(rows.ns_api)}
          enabled={rows.ns_api?.is_enabled ?? false}
          lastTestedAt={rows.ns_api?.last_tested_at}
          lastTestResult={rows.ns_api?.last_test_result}
          lastTestSuccess={rows.ns_api?.last_test_success}
          onToggleEnabled={(v) => toggleEnabled("ns_api", v)}
          onSave={() => save("ns_api", ["base_url", "api_key", "domain"])}
          onTest={() => test("ns_api")}
        >
          <InfoBanner>
            Obtenez votre API Key depuis le portail NetSapiens : <code>voice.ava-telecom.ca/portal → Apps → API Keys → Create New Key</code>
            <div className="mt-2">
              <a href="https://voice.ava-telecom.ca/portal" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "#0D1F35", border: "1px solid #0E2A45", color: "#2E9BDC" }}>
                Ouvrir le portail NS →
              </a>
            </div>
          </InfoBanner>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Serveur NS-API (Base URL)" required>
              <TextInput value={getField("ns_api", "base_url", "https://voice.ava-telecom.ca/ns-api/v2")}
                onChange={(e) => setField("ns_api", "base_url", e.target.value)}
                placeholder="https://voice.ava-telecom.ca/ns-api/v2" />
            </Field>
            <Field label="API Key" required hint="Format: nsr_XXXXXXXXXX — fournie par Keeny">
              <SecretInput value={draft.ns_api?.api_key ?? ""}
                onChange={(v) => setField("ns_api", "api_key", v)}
                hasSavedValue={!!rows.ns_api?.config_data?.api_key}
                placeholder="nsr_••••••••••••••••••••••••••••••••" />
            </Field>
            <Field label="Domaine par défaut" required>
              <TextInput value={getField("ns_api", "domain", "planipret.ca")}
                onChange={(e) => setField("ns_api", "domain", e.target.value)}
                placeholder="planipret.ca" />
            </Field>
            <Field label="Domaine de fallback (sandbox)" hint="Utilisé pour les tests — ns-api.com">
              <TextInput value={getField("ns_api", "fallback_domain", "")}
                onChange={(e) => setField("ns_api", "fallback_domain", e.target.value)}
                placeholder="mhassoun.assistantvirtualai.com" />
            </Field>
          </div>

          <NsLiveTestPanel domain={getField("ns_api", "domain", "planipret.ca") || "planipret.ca"} />
          <div className="mt-4">
            <NsRecordingsProbe domain={getField("ns_api", "domain", "planipret.ca") || "planipret.ca"} />
            <NsTranscriptionProbe />
          </div>
          <div className="mt-4">
            <CallE2ECheck />
          </div>

          <div className="mt-4">
            <NsMigrationPanel />
          </div>
          <NsCapabilitiesPanel domain={getField("ns_api", "domain", "planipret.ca") || "planipret.ca"} />
          <div className="mt-4">
            <NsSyncDashboardPanel />
          </div>
        </IntegrationCard>

        {/* ───────── CARD 5 — CLAUDE IA ───────── */}
        <IntegrationCard
          integrationKey="anthropic" name="Claude IA (Anthropic)"
          backendSecrets={backendSecrets.anthropic}
          description="Analyse des appels, coaching IA, résumés, scoring des leads"
          emoji="🤖"
          status={deriveStatus(rows.anthropic)}
          enabled={rows.anthropic?.is_enabled ?? false}
          lastTestedAt={rows.anthropic?.last_tested_at}
          lastTestResult={rows.anthropic?.last_test_result}
          lastTestSuccess={rows.anthropic?.last_test_success}
          onToggleEnabled={(v) => toggleEnabled("anthropic", v)}
          onSave={() => save("anthropic", ["api_key"])}
          onTest={() => test("anthropic")}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Anthropic API Key" required hint="console.anthropic.com → API Keys">
              <SecretInput value={draft.anthropic?.api_key ?? ""}
                onChange={(v) => setField("anthropic", "api_key", v)}
                hasSavedValue={!!rows.anthropic?.config_data?.api_key}
                placeholder="sk-ant-••••••••••••••••••••••••" />
            </Field>
            <Field label="Modèle IA" hint="claude-sonnet-4-5 recommandé (rapide & intelligent)">
              <select
                value={getField("anthropic", "model", "claude-sonnet-4-5")}
                onChange={(e) => setField("anthropic", "model", e.target.value)}
                style={{ background: "#0D1F35", border: "1px solid #0E2A45", borderRadius: 10, padding: "10px 14px", color: "#E8EDF5", fontSize: 13, width: "100%", outline: "none" }}>
                <option value="claude-sonnet-4-5">claude-sonnet-4-5 (recommandé)</option>
                <option value="claude-opus-4-1">claude-opus-4-1 (analyses complexes)</option>
                <option value="claude-haiku-4-5">claude-haiku-4-5 (économique)</option>
              </select>
            </Field>
            <Field label="Température" hint="0 = précis · 1 = créatif">
              <TextInput type="number" step="0.1" min={0} max={1}
                value={getField("anthropic", "temperature", "0.7")}
                onChange={(e) => setField("anthropic", "temperature", e.target.value)} />
            </Field>
            <Field label="Tokens max par analyse" hint="500 – 4000">
              <TextInput type="number" min={500} max={4000}
                value={getField("anthropic", "max_tokens", "1000")}
                onChange={(e) => setField("anthropic", "max_tokens", e.target.value)} />
            </Field>
          </div>
          <div className="mt-3">
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "#0D1F35", border: "1px solid #0E2A45", color: "#2E9BDC" }}>
              Ouvrir Anthropic Console →
            </a>
          </div>
        </IntegrationCard>

        {/* ───────── CARD 1 — MICROSOFT 365 ───────── */}
        {(() => {
          const ms = backendSecrets.ms365;
          const backendValues = (ms as any)?.values as Record<string, string> | undefined;
          const clientIdVal =
            draft.ms365?.client_id ??
            rows.ms365?.config_data?.client_id ??
            backendValues?.client_id ??
            "";
          const tenantVal =
            draft.ms365?.tenant_id ??
            rows.ms365?.config_data?.tenant_id ??
            backendValues?.tenant_id ??
            "";
          const clientSecretPresent =
            !!rows.ms365?.config_data?.client_secret ||
            (ms?.present ?? []).includes("MICROSOFT_CLIENT_SECRET");
          const clientIdMissing = !clientIdVal;
          const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL ?? "";
          const edgeCallbackUrl = `${supabaseUrl}/functions/v1/ms365-auth-callback`;
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          const webCallbackUrl = `${origin}/auth/microsoft/callback`;
          const iosScheme = "msauth.com.assistantvirtualai.softphone://auth";
          const androidScheme = "msauth://com.assistantvirtualai.softphone/callback";
          return (
        <IntegrationCard
          integrationKey="ms365" name="Microsoft 365"
          backendSecrets={ms}
          description="Outlook Email · Calendar · Teams Chat · OneDrive"
          emoji="🔵" fullWidth
          status={deriveStatus(rows.ms365)}
          enabled={rows.ms365?.is_enabled ?? false}
          lastTestedAt={rows.ms365?.last_tested_at}
          lastTestResult={rows.ms365?.last_test_result}
          lastTestSuccess={rows.ms365?.last_test_success}
          onToggleEnabled={(v) => toggleEnabled("ms365", v)}
          onSave={() => save("ms365", ["tenant_id", "client_id"])}
          onTest={() => test("ms365")}
          testDisabled={clientIdMissing}
          testDisabledReason="Configuration incomplète — Client ID manquant"
        >
          {clientIdMissing && (
            <InfoBanner tone="warn">
              <strong>Configuration incomplète — Client ID manquant.</strong>{" "}
              Renseignez <code>MICROSOFT_CLIENT_ID</code> dans les secrets backend
              ou saisissez-le ci-dessous pour activer le test de connexion.
            </InfoBanner>
          )}
          <InfoBanner>
            Créez une App Registration dans Azure AD pour <strong>planipret.ca</strong>.
            Permissions requises (Application): <code>Mail.ReadWrite</code>, <code>Mail.Send</code>,
            <code>Calendars.ReadWrite</code>, <code>Chat.ReadWrite</code>, <code>Files.ReadWrite.All</code>, <code>User.Read.All</code>.
            <div className="mt-2 flex items-center gap-2">
              <a href="https://portal.azure.com" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "#0D1F35", border: "1px solid #0E2A45", color: "#2E9BDC" }}>
                Ouvrir Azure Portal →
              </a>
            </div>
          </InfoBanner>

          {/* Read-only Redirect URIs to register in Azure AD */}
          <div className="rounded-lg p-3 mb-4"
            style={{ background: "#0A1628", border: "1px solid #0E2A45" }}>
            <div className="flex items-center justify-between mb-2">
              <div style={{ fontSize: 12, fontWeight: 700, color: "#E8EDF5" }}>
                🔗 Redirect URIs Azure à enregistrer
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: "#0D1F35", border: "1px solid #0E2A45", color: "#4A7FA5" }}>
                Lecture seule
              </span>
            </div>
            <p className="mb-3" style={{ fontSize: 11, color: "#4A7FA5", lineHeight: 1.6 }}>
              Ajoutez ces URIs dans <em>App Registration → Authentication</em> selon la plateforme.
              Web = portail admin/mobile PWA · iOS/Android = app native Capacitor · Edge = fonction serveur.
            </p>
            {[
              { platform: "Web (this origin)", hint: "Plateforme « Web » — portail Planiprêt courant", uri: webCallbackUrl },
              { platform: "Web (Edge fn)",     hint: "Plateforme « Web » — callback serveur Supabase", uri: edgeCallbackUrl },
              { platform: "iOS / macOS",       hint: "Plateforme « Mobile and desktop applications »", uri: iosScheme },
              { platform: "Android",           hint: "Plateforme « Android » — package + signature hash", uri: androidScheme },
            ].map((r) => (
              <div key={r.platform} className="flex items-center gap-2 mb-2 last:mb-0">
                <div className="flex-shrink-0 px-2 py-1 rounded text-[10px] font-semibold"
                  style={{ background: "#0D1F35", border: "1px solid #0E2A45", color: "#2E9BDC", minWidth: 90, textAlign: "center" }}>
                  {r.platform}
                </div>
                <input readOnly value={r.uri}
                  style={{ background: "#0D1F35", border: "1px solid #0E2A45", borderRadius: 8, padding: "6px 10px", color: "#E8EDF5", fontSize: 12, fontFamily: "monospace", flex: 1 }} />
                <CopyButton value={r.uri} label="Copier" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Tenant ID" required hint="Auto-rempli depuis MICROSOFT_TENANT_ID">
              <TextInput value={tenantVal}
                onChange={(e) => setField("ms365", "tenant_id", e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000" />
            </Field>
            <Field label="Client ID (Application ID)" required
              hint={clientIdMissing ? "⚠️ À compléter — MICROSOFT_CLIENT_ID manquant" : "Auto-rempli depuis MICROSOFT_CLIENT_ID (modifiable)"}>
              <div className="relative">
                <TextInput value={clientIdVal}
                  onChange={(e) => setField("ms365", "client_id", e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000" />
                {clientIdMissing && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: "rgba(245,166,35,0.15)", border: "1px solid #4A3000", color: "#F5A623" }}>
                    À compléter
                  </span>
                )}
              </div>
            </Field>
            <Field label="Client Secret" hint="Auto-détecté depuis MICROSOFT_CLIENT_SECRET · masqué">
              <SecretInput value={draft.ms365?.client_secret ?? ""}
                onChange={(v) => setField("ms365", "client_secret", v)}
                hasSavedValue={clientSecretPresent} />
            </Field>
            <Field label="Redirect URI (frontend fallback)" hint="Route interne — non utilisée pour Azure">
              <TextInput readOnly value={`${typeof window !== "undefined" ? window.location.origin : ""}/auth/ms365/callback`} />
            </Field>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            {[
              { k: "scope_mail",     label: "📧 Outlook Mail" },
              { k: "scope_calendar", label: "📅 Calendar" },
              { k: "scope_teams",    label: "💬 Teams Chat" },
              { k: "scope_onedrive", label: "📁 OneDrive" },
            ].map((s) => {
              const on = getField("ms365", s.k, "true") === "true";
              return (
                <button key={s.k} type="button"
                  onClick={() => setField("ms365", s.k, on ? "false" : "true")}
                  className="px-3 py-2 rounded-lg text-xs font-medium text-left"
                  style={{
                    background: on ? "rgba(46,155,220,0.1)" : "#0D1F35",
                    border: `1px solid ${on ? "#2E9BDC" : "#0E2A45"}`,
                    color: on ? "#2E9BDC" : "#8FA8C0",
                  }}>
                  {on ? "✓ " : ""}{s.label}
                </button>
              );
            })}
          </div>

          <Ms365LiveTestPanel />
        </IntegrationCard>
          );
        })()}

        {/* ───────── CARD 4 — ELEVENLABS ───────── */}
        <IntegrationCard
          integrationKey="elevenlabs" name="ElevenLabs — Agent AVA"
          backendSecrets={backendSecrets.elevenlabs}
          description="Agent vocal IA · Voix française québécoise"
          emoji="🎙️"
          status={deriveStatus(rows.elevenlabs)}
          enabled={rows.elevenlabs?.is_enabled ?? false}
          lastTestedAt={rows.elevenlabs?.last_tested_at}
          lastTestResult={rows.elevenlabs?.last_test_result}
          lastTestSuccess={rows.elevenlabs?.last_test_success}
          onToggleEnabled={(v) => toggleEnabled("elevenlabs", v)}
          onSave={() => save("elevenlabs", ["api_key"])}
          onTest={() => test("elevenlabs")}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="ElevenLabs API Key" required hint="elevenlabs.io → Profile → API Keys">
              <SecretInput value={draft.elevenlabs?.api_key ?? ""}
                onChange={(v) => setField("elevenlabs", "api_key", v)}
                hasSavedValue={!!rows.elevenlabs?.config_data?.api_key}
                placeholder="sk_•••••••••••••••••••••••••••••" />
            </Field>
            <Field label="Agent ID par défaut" hint="ID de l'agent à utiliser pour les nouveaux courtiers">
              <TextInput value={getField("elevenlabs", "default_agent_id")}
                onChange={(e) => setField("elevenlabs", "default_agent_id", e.target.value)}
                placeholder="agent_xxxxxxxxxxxxx" />
            </Field>
            <Field label="Nom de l'agent">
              <TextInput value={getField("elevenlabs", "agent_name", "AVA - Planiprêt")}
                onChange={(e) => setField("elevenlabs", "agent_name", e.target.value)} />
            </Field>
            <Field label="Voice ID (Charlotte FR-CA)" hint="Par défaut: XB0fDUnXU5powFXDhCwa">
              <TextInput value={getField("elevenlabs", "voice_id", "XB0fDUnXU5powFXDhCwa")}
                onChange={(e) => setField("elevenlabs", "voice_id", e.target.value)} />
            </Field>
          </div>
          <InfoBanner tone="warn">
            L'agent vocal sera activable <strong>par courtier</strong> depuis Gestion Utilisateurs (+25 $/mois par activation).
          </InfoBanner>
        </IntegrationCard>

        {/* ───────── CARD 3 — MAESTRO CRM ───────── */}
        <IntegrationCard
          integrationKey="maestro" name="Maestro CRM (Kanguru)"
          backendSecrets={backendSecrets.maestro}
          description="Clients · Tâches · RDV · Pipeline · SMS"
          emoji="🏢"
          status={deriveStatus(rows.maestro)}
          enabled={rows.maestro?.is_enabled ?? false}
          lastTestedAt={rows.maestro?.last_tested_at}
          lastTestResult={rows.maestro?.last_test_result}
          lastTestSuccess={rows.maestro?.last_test_success}
          onToggleEnabled={(v) => toggleEnabled("maestro", v)}
          onSave={() => save("maestro", ["api_url", "api_key"])}
          onTest={() => test("maestro")}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="API URL Maestro" required>
              <TextInput value={getField("maestro", "api_url")}
                onChange={(e) => setField("maestro", "api_url", e.target.value)}
                placeholder="https://api.maestro-crm.ca/v1" />
            </Field>
            <Field label="API Key" required>
              <SecretInput value={draft.maestro?.api_key ?? ""}
                onChange={(v) => setField("maestro", "api_key", v)}
                hasSavedValue={!!rows.maestro?.config_data?.api_key} />
            </Field>
            <Field label="Webhook secret" hint="Pour vérifier les webhooks entrants Maestro">
              <SecretInput value={draft.maestro?.webhook_secret ?? ""}
                onChange={(v) => setField("maestro", "webhook_secret", v)}
                hasSavedValue={!!rows.maestro?.config_data?.webhook_secret} />
            </Field>
            <Field label="Pipeline par défaut (ID)">
              <TextInput value={getField("maestro", "default_pipeline_id")}
                onChange={(e) => setField("maestro", "default_pipeline_id", e.target.value)}
                placeholder="pipeline_prêt_hypothécaire" />
            </Field>
          </div>
        </IntegrationCard>

        {/* ───────── CARD 6 — WEBHOOKS ───────── */}
        <IntegrationCard
          integrationKey="webhooks" name="Webhooks & Automatisation"
          backendSecrets={backendSecrets.webhooks}
          description="Pipeline post-appel — notifications événements en temps réel"
          emoji="🔗"
          status={deriveStatus(rows.webhooks)}
          enabled={rows.webhooks?.is_enabled ?? false}
          lastTestedAt={rows.webhooks?.last_tested_at}
          lastTestResult={rows.webhooks?.last_test_result}
          lastTestSuccess={rows.webhooks?.last_test_success}
          onToggleEnabled={(v) => toggleEnabled("webhooks", v)}
          onSave={() => save("webhooks", ["endpoint_url", "secret"])}
          onTest={() => test("webhooks")}
        >
          <InfoBanner>
            Les événements sont envoyés en POST JSON avec l'en-tête <code>x-pp-signature</code> (HMAC-SHA256).
            <div className="mt-2">
              <CopyButton
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/functions/v1/ns-webhook-receiver`}
                label="Copier URL réception NS"
              />
            </div>
          </InfoBanner>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Endpoint URL" required hint="POST signé pour vos automatisations">
              <TextInput value={getField("webhooks", "endpoint_url")}
                onChange={(e) => setField("webhooks", "endpoint_url", e.target.value)}
                placeholder="https://hooks.zapier.com/..." />
            </Field>
            <Field label="Secret de signature" required hint="Utilisé pour HMAC x-pp-signature">
              <div className="flex gap-2">
                <SecretInput value={draft.webhooks?.secret ?? ""}
                  onChange={(v) => setField("webhooks", "secret", v)}
                  hasSavedValue={!!rows.webhooks?.config_data?.secret} />
                <button type="button"
                  onClick={() => {
                    const buf = new Uint8Array(32);
                    crypto.getRandomValues(buf);
                    const hex = Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
                    setField("webhooks", "secret", hex);
                    toast.success("Secret généré — pensez à sauvegarder");
                  }}
                  className="px-3 rounded-lg text-xs font-semibold whitespace-nowrap"
                  style={{ background: "#0D1F35", border: "1px solid #2E9BDC", color: "#2E9BDC" }}>
                  Générer
                </button>
              </div>
            </Field>
            <Field label="Timeout (ms)" hint="2000 – 30000">
              <TextInput type="number" min={2000} max={30000}
                value={getField("webhooks", "timeout_ms", "10000")}
                onChange={(e) => setField("webhooks", "timeout_ms", e.target.value)} />
            </Field>
            <Field label="Tentatives en cas d'échec" hint="0 – 5">
              <TextInput type="number" min={0} max={5}
                value={getField("webhooks", "retry_attempts", "3")}
                onChange={(e) => setField("webhooks", "retry_attempts", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
            {[
              { k: "evt_call_completed",   label: "📞 Appel terminé" },
              { k: "evt_voicemail_new",    label: "📬 Voicemail" },
              { k: "evt_sms_inbound",      label: "💬 SMS entrant" },
              { k: "evt_lead_hot",         label: "🔥 Lead chaud" },
              { k: "evt_appointment_book", label: "📅 RDV pris" },
              { k: "evt_transcript_ready", label: "📝 Transcript prêt" },
            ].map((s) => {
              const on = getField("webhooks", s.k, "true") === "true";
              return (
                <button key={s.k} type="button"
                  onClick={() => setField("webhooks", s.k, on ? "false" : "true")}
                  className="px-3 py-2 rounded-lg text-xs font-medium text-left"
                  style={{
                    background: on ? "rgba(46,155,220,0.1)" : "#0D1F35",
                    border: `1px solid ${on ? "#2E9BDC" : "#0E2A45"}`,
                    color: on ? "#2E9BDC" : "#8FA8C0",
                  }}>
                  {on ? "✓ " : ""}{s.label}
                </button>
              );
            })}
          </div>
        </IntegrationCard>

        {/* ───────── CARD 7 — MOBILE APP ───────── */}
        <IntegrationCard
          integrationKey="mobile_app" name="Application Mobile"
          backendSecrets={backendSecrets.mobile_app}
          description="iOS · Android · Notifications push — synchronisation 350 courtiers"
          emoji="📱" fullWidth
          status={deriveStatus(rows.mobile_app)}
          enabled={rows.mobile_app?.is_enabled ?? false}
          lastTestedAt={rows.mobile_app?.last_tested_at}
          lastTestResult={rows.mobile_app?.last_test_result}
          lastTestSuccess={rows.mobile_app?.last_test_success}
          onToggleEnabled={(v) => toggleEnabled("mobile_app", v)}
          onSave={() => save("mobile_app", ["app_url"])}
          onTest={() => test("mobile_app")}
        >
          <InfoBanner>
            Statut en direct des courtiers connectés. La configuration est lue par l'app mobile via Realtime
            (table <code>planipret_integration_config</code>).
          </InfoBanner>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="URL de l'application" required>
              <TextInput value={getField("mobile_app", "app_url", `${typeof window !== "undefined" ? window.location.origin : ""}/mplanipret`)}
                onChange={(e) => setField("mobile_app", "app_url", e.target.value)}
                placeholder="https://app.planipret.ca/mplanipret" />
            </Field>
            <Field label="Version minimale supportée" hint="Force-update si version inférieure">
              <TextInput value={getField("mobile_app", "min_version", "1.0.0")}
                onChange={(e) => setField("mobile_app", "min_version", e.target.value)}
                placeholder="1.0.0" />
            </Field>
            <Field label="Firebase Server Key (FCM)" hint="Notifications push Android">
              <SecretInput value={draft.mobile_app?.fcm_server_key ?? ""}
                onChange={(v) => setField("mobile_app", "fcm_server_key", v)}
                hasSavedValue={!!rows.mobile_app?.config_data?.fcm_server_key} />
            </Field>
            <Field label="APNs Key ID (iOS)" hint="Notifications push iOS">
              <TextInput value={getField("mobile_app", "apns_key_id")}
                onChange={(e) => setField("mobile_app", "apns_key_id", e.target.value)}
                placeholder="ABCD123456" />
            </Field>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            {[
              { k: "feat_calls",         label: "📞 Appels" },
              { k: "feat_messaging",     label: "💬 SMS" },
              { k: "feat_voicemail",     label: "📬 Voicemail" },
              { k: "feat_ava_voice",     label: "🎙️ AVA Voice" },
              { k: "feat_ava_chat",      label: "🤖 AVA Chat" },
              { k: "feat_calendar",      label: "📅 Agenda" },
              { k: "feat_crm",           label: "🏢 CRM" },
              { k: "feat_push",          label: "🔔 Push" },
            ].map((s) => {
              const on = getField("mobile_app", s.k, "true") === "true";
              return (
                <button key={s.k} type="button"
                  onClick={() => setField("mobile_app", s.k, on ? "false" : "true")}
                  className="px-3 py-2 rounded-lg text-xs font-medium text-left"
                  style={{
                    background: on ? "rgba(46,155,220,0.1)" : "#0D1F35",
                    border: `1px solid ${on ? "#2E9BDC" : "#0E2A45"}`,
                    color: on ? "#2E9BDC" : "#8FA8C0",
                  }}>
                  {on ? "✓ " : ""}{s.label}
                </button>
              );
            })}
          </div>
        </IntegrationCard>

        {/* ───────── CARD 8 — COMPLIANCE ───────── */}
        <IntegrationCard
          integrationKey="compliance" name="Conformité PIPEDA / Loi 25"
          backendSecrets={backendSecrets.compliance}
          description="Rétention des données · Consentements · Audit"
          emoji="🔏" fullWidth
          status={deriveStatus(rows.compliance)}
          enabled={rows.compliance?.is_enabled ?? false}
          lastTestedAt={rows.compliance?.last_tested_at}
          lastTestResult={rows.compliance?.last_test_result}
          lastTestSuccess={rows.compliance?.last_test_success}
          onToggleEnabled={(v) => toggleEnabled("compliance", v)}
          onSave={() => save("compliance", ["dpo_email"])}
          onTest={() => test("compliance")}
        >
          <InfoBanner tone="warn">
            Loi 25 (Québec) et PIPEDA exigent un consentement explicite pour l'enregistrement d'appels
            et une politique de rétention documentée. Les durées s'appliquent via l'edge function <code>pp-data-retention</code>.
          </InfoBanner>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Email du DPO" required hint="Responsable de la protection des données">
              <TextInput value={getField("compliance", "dpo_email")}
                onChange={(e) => setField("compliance", "dpo_email", e.target.value)}
                placeholder="dpo@planipret.ca" />
            </Field>
            <Field label="Juridiction" hint="QC / CA / autre">
              <select
                value={getField("compliance", "jurisdiction", "QC")}
                onChange={(e) => setField("compliance", "jurisdiction", e.target.value)}
                style={{ background: "#0D1F35", border: "1px solid #0E2A45", borderRadius: 10, padding: "10px 14px", color: "#E8EDF5", fontSize: 13, width: "100%", outline: "none" }}>
                <option value="QC">Québec (Loi 25)</option>
                <option value="CA">Canada (PIPEDA)</option>
                <option value="EU">Europe (RGPD)</option>
              </select>
            </Field>
            <Field label="Région de stockage" hint="Localisation des données">
              <select
                value={getField("compliance", "data_region", "ca-central-1")}
                onChange={(e) => setField("compliance", "data_region", e.target.value)}
                style={{ background: "#0D1F35", border: "1px solid #0E2A45", borderRadius: 10, padding: "10px 14px", color: "#E8EDF5", fontSize: 13, width: "100%", outline: "none" }}>
                <option value="ca-central-1">🇨🇦 Canada Central</option>
                <option value="us-east-1">🇺🇸 US East</option>
                <option value="eu-west-1">🇪🇺 EU West</option>
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <div style={{ fontSize: 12, color: "#4A7FA5", fontWeight: 600, marginBottom: 8 }}>
              Durées de rétention (jours)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { k: "retention_calls",       label: "Appels", def: "365" },
                { k: "retention_messages",    label: "SMS", def: "365" },
                { k: "retention_voicemails",  label: "Voicemails", def: "180" },
                { k: "retention_recordings",  label: "Enregistrements", def: "90" },
                { k: "retention_transcripts", label: "Transcripts", def: "730" },
                { k: "retention_insights",    label: "IA / Insights", def: "730" },
                { k: "retention_audit",       label: "Audit logs", def: "730" },
              ].map((f) => (
                <Field key={f.k} label={f.label}>
                  <TextInput type="number" min={1} max={3650}
                    value={getField("compliance", f.k, f.def)}
                    onChange={(e) => setField("compliance", f.k, e.target.value)} />
                </Field>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
            {[
              { k: "consent_call_recording", label: "🎙️ Consentement enregistrement" },
              { k: "consent_ai_analysis",    label: "🤖 Consentement analyse IA" },
              { k: "consent_marketing",      label: "📣 Consentement marketing" },
              { k: "right_to_erasure",       label: "🗑️ Droit à l'oubli activé" },
              { k: "data_portability",       label: "📤 Portabilité activée" },
              { k: "encryption_at_rest",     label: "🔒 Chiffrement au repos" },
            ].map((s) => {
              const on = getField("compliance", s.k, "true") === "true";
              return (
                <button key={s.k} type="button"
                  onClick={() => setField("compliance", s.k, on ? "false" : "true")}
                  className="px-3 py-2 rounded-lg text-xs font-medium text-left"
                  style={{
                    background: on ? "rgba(46,155,220,0.1)" : "#0D1F35",
                    border: `1px solid ${on ? "#2E9BDC" : "#0E2A45"}`,
                    color: on ? "#2E9BDC" : "#8FA8C0",
                  }}>
                  {on ? "✓ " : ""}{s.label}
                </button>
              );
            })}
          </div>
        </IntegrationCard>


      </div>
    </div>
  );
}

function HealthPill({ color, bg, border, label }: { color: string; bg: string; border: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
      style={{ background: bg, border: `1px solid ${border}`, color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}

