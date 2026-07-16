/**
 * Live Microsoft 365 connection test panel.
 * Invokes the `ms365-connection-test` Edge Function and renders the results.
 *
 * Also exposes an "Admin re-test integration" action that re-runs the
 * backend Microsoft config test (`pp-test-integration`) and refreshes the
 * saved connection status shown in the parent card immediately.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronDown, ChevronRight, Copy, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type TestResult = {
  success: boolean;
  message?: string;
  [k: string]: any;
};

type Response = {
  summary: {
    total_tests: number;
    passed: number;
    failed: number;
    tested_at: string;
    elapsed_ms: number;
    tenant_id?: string | null;
    client_id?: string | null;
    core_passed?: boolean;
    admin_directory_failed?: number;
    status?: string;
    delegated_ok?: boolean;
  };
  results: Record<string, TestResult>;
};

const LABELS: Record<string, string> = {
  auth: "Authentification OAuth2 (app)",
  delegated: "Capacités utilisateur (Mail/Calendar/Teams)",
  organization: "Organisation Microsoft (info)",
  users: "Utilisateurs Microsoft (info)",
  app_registration: "Configuration App Azure (info)",
  permissions: "Permissions Graph (info)",
  config: "Configuration",
};

export default function Ms365LiveTestPanel({ onCompleted }: { onCompleted?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [retesting, setRetesting] = useState(false);
  const [data, setData] = useState<Response | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [detection, setDetection] = useState<{
    tenant_id: string | null;
    client_id: string | null;
    has_secret: boolean;
    auth_mode: string | null;
    loading: boolean;
  }>({ tenant_id: null, client_id: null, has_secret: false, auth_mode: null, loading: true });

  const expectedCallback = typeof window !== "undefined" ? `${window.location.origin}/auth/microsoft/callback` : "";

  async function loadDetection() {
    setDetection((d) => ({ ...d, loading: true }));
    const { data: res } = await supabase.functions.invoke("pp-integration-secrets");
    const ms = ((res as any)?.items ?? []).find((i: any) => i.provider === "microsoft");
    const pc = ms?.public_config ?? {};
    const keys: string[] = ms?.has_keys ?? [];
    setDetection({
      tenant_id: pc.tenant_id ?? null,
      client_id: pc.client_id ?? pc.client_secret_id ?? null,
      has_secret: keys.includes("client_secret") || keys.includes("MICROSOFT_CLIENT_SECRET"),
      auth_mode: pc.auth_mode ?? null,
      loading: false,
    });
  }

  useEffect(() => { loadDetection(); }, []);

  async function persistResult(success: boolean, message: string) {
    // Re-run backend config test so the parent card's saved status updates.
    try {
      await supabase.functions.invoke("pp-test-integration", {
        body: { integration_key: "ms365" },
      });
    } catch {
      // pp-test-integration already writes on its own; ignore local errors.
    }
    onCompleted?.();
  }

  async function runTest() {
    setLoading(true);
    setData(null);
    try {
      const { data: res, error } = await supabase.functions.invoke("ms365-connection-test", {
        body: {},
      });
      if (error) throw error;
      const parsed = res as Response;
      setData(parsed);
      const ok = parsed.summary.core_passed !== false || parsed.summary.status === "core_connected" || parsed.summary.status === "fully_connected";
      await persistResult(ok, `${parsed.summary.passed}/${parsed.summary.total_tests} tests`);
      loadDetection();
    } catch (e: any) {
      toast.error("Erreur test MS365: " + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  }

  async function adminRetest() {
    setRetesting(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("pp-test-integration", {
        body: { integration_key: "ms365" },
      });
      if (error) throw error;
      const ok = (res as any)?.success;
      const msg = (res as any)?.message ?? "—";
      if (ok) toast.success(`✅ ${msg}`); else toast.error(`❌ ${msg}`);
      await loadDetection();
      onCompleted?.();
    } catch (e: any) {
      toast.error("Ré-test échoué: " + (e?.message ?? String(e)));
    } finally {
      setRetesting(false);
    }
  }

  const rows = data ? Object.entries(data.results) : [];

  return (
    <div
      className="rounded-lg p-3 mt-4"
      style={{ background: "#0A1628", border: "1px solid #0E2A45" }}
    >
      {/* Detection header — always visible */}
      <div className="rounded-lg p-3 mb-3" style={{ background: "#0D1F35", border: "1px solid #0E2A45" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#8FA8C0", letterSpacing: "0.08em" }}>
          🔎 DÉTECTION CONFIGURATION MICROSOFT 365
        </div>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2 text-[12px]">
          <DetectionRow label="Tenant ID" value={detection.tenant_id} loading={detection.loading} mono />
          <DetectionRow label="Client ID" value={detection.client_id} loading={detection.loading} mono />
          <DetectionRow label="Auth mode" value={detection.auth_mode ?? (detection.has_secret ? "confidential" : "public/auto")} loading={detection.loading} />
          <DetectionRow label="Client Secret" value={detection.has_secret ? "Enregistré" : "Non requis si public"} loading={detection.loading} />
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div style={{ fontSize: 12, fontWeight: 700, color: "#E8EDF5" }}>
          🔬 Test en direct
        </div>
        {data && (
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "#4A7FA5" }}>
            <span
              className="px-2 py-0.5 rounded-full font-semibold"
              style={{
                background: data.summary.core_passed !== false || data.summary.status === "core_connected" || data.summary.status === "fully_connected" ? "rgba(46,220,120,0.12)" : "rgba(232,76,76,0.12)",
                border: `1px solid ${data.summary.core_passed !== false || data.summary.status === "core_connected" || data.summary.status === "fully_connected" ? "#1a6b3a" : "#5A1010"}`,
                color: data.summary.core_passed !== false || data.summary.status === "core_connected" || data.summary.status === "fully_connected" ? "#2EDC78" : "#E84C4C",
              }}
            >
              {data.summary.core_passed !== false || data.summary.status === "core_connected" || data.summary.status === "fully_connected" ? "✅ Core Microsoft connecté" : "❌ Core Microsoft non connecté"}
            </span>
            {!!data.summary.admin_directory_failed && <span>⚠️ {data.summary.admin_directory_failed} diagnostics annuaire limités</span>}
            <span>⏱ {data.summary.elapsed_ms}ms</span>
            <span>Testé le: {new Date(data.summary.tested_at).toLocaleString("fr-CA")}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runTest}
          disabled={loading}
          className="inline-flex items-center gap-2 disabled:opacity-60"
          style={{
            background: "#0078D4",
            color: "white",
            borderRadius: 10,
            padding: "10px 20px",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Connexion à Microsoft Azure...
            </>
          ) : (
            <>▶ Tester la connexion Microsoft</>
          )}
        </button>

        <button
          type="button"
          onClick={adminRetest}
          disabled={retesting}
          className="inline-flex items-center gap-2 disabled:opacity-60"
          title="Re-run backend Microsoft config test and refresh saved status"
          style={{
            background: "#0D1F35",
            border: "1px solid #2E9BDC",
            color: "#2E9BDC",
            borderRadius: 10,
            padding: "10px 16px",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {retesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Ré-tester intégration (admin)
        </button>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 space-y-2">
          {rows.map(([key, r]) => {
            const open = !!expanded[key];
            const isInfo = (r as any).informational === true;
            const icon = r.success ? (isInfo ? "ℹ️" : "✅") : isInfo ? "ℹ️" : "❌";
            return (
              <div
                key={key}
                className="rounded-lg"
                style={{ background: "#0D1F35", border: "1px solid #0E2A45" }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded((p) => ({ ...p, [key]: !p[key] }))}
                  className="w-full flex items-center gap-2 p-2.5 text-left"
                >
                  <span style={{ fontSize: 14 }}>{icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#E8EDF5", minWidth: 160 }}>
                    {LABELS[key] ?? key}
                  </span>
                  <span style={{ fontSize: 12, color: "#8FA8C0", flex: 1 }}>
                    {r.message ?? (r.success ? "OK" : "Erreur")}
                  </span>
                  {open ? (
                    <ChevronDown className="w-4 h-4" style={{ color: "#4A7FA5" }} />
                  ) : (
                    <ChevronRight className="w-4 h-4" style={{ color: "#4A7FA5" }} />
                  )}
                </button>
                {open && (
                  <div className="px-3 pb-3">
                    <pre
                      className="rounded p-2 overflow-x-auto"
                      style={{
                        background: "#040B16",
                        border: "1px solid #0E2A45",
                        color: "#8FA8C0",
                        fontSize: 11,
                        lineHeight: 1.5,
                      }}
                    >
                      {JSON.stringify(r, null, 2)}
                    </pre>
                    {r.recommendation && (
                      <div className="mt-2 p-2 rounded text-[11px]" style={{ background: "rgba(245,166,35,0.08)", border: "1px solid #4A3000", color: "#F5A623" }}>
                        {r.recommendation}
                      </div>
                    )}
                    {key === "app_registration" && expectedCallback && (
                      <RedirectCheck result={r} expected={expectedCallback} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetectionRow({ label, value, loading, mono }: { label: string; value: string | null; loading: boolean; mono?: boolean }) {
  const ok = !!value;
  return (
    <div className="flex items-start gap-2">
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 mt-0.5 animate-spin" style={{ color: "#4A7FA5" }} />
      ) : ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" style={{ color: "#00D4AA" }} />
      ) : (
        <XCircle className="w-3.5 h-3.5 mt-0.5" style={{ color: "#E84C4C" }} />
      )}
      <div className="min-w-0 flex-1">
        <div style={{ fontSize: 10, color: "#4A7FA5", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
        <div
          className="truncate"
          style={{ fontFamily: mono ? "monospace" : "inherit", fontSize: 12, color: ok ? "#E8EDF5" : "#8FA8C0" }}
          title={value ?? ""}
        >
          {loading ? "…" : (value ?? "Non détecté")}
        </div>
      </div>
    </div>
  );
}

function RedirectCheck({ result, expected }: { result: TestResult; expected: string }) {
  const all: string[] = [
    ...(result.redirect_uris_web ?? []),
    ...(result.redirect_uris_spa ?? []),
    ...(result.redirect_uris_public ?? []),
  ];
  const found = all.some((u) => u === expected);
  if (found) {
    return (
      <div
        className="mt-2 p-2 rounded text-[11px]"
        style={{ background: "rgba(46,220,120,0.08)", border: "1px solid #1a6b3a", color: "#2EDC78" }}
      >
        ✅ Redirect URI Supabase configurée dans Azure
      </div>
    );
  }
  return (
    <div
      className="mt-2 p-2 rounded text-[11px] flex items-center gap-2"
      style={{ background: "rgba(245,166,35,0.08)", border: "1px solid #4A3000", color: "#F5A623" }}
    >
      <span>⚠️ Redirect URI Supabase manquante — ajouter dans Azure:</span>
      <code
        style={{ background: "#040B16", padding: "2px 6px", borderRadius: 4, color: "#E8EDF5" }}
      >
        {expected}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(expected);
          toast.success("URI copiée");
        }}
        className="inline-flex items-center gap-1 px-2 py-1 rounded"
        style={{ background: "#0D1F35", border: "1px solid #0E2A45", color: "#2E9BDC" }}
      >
        <Copy className="w-3 h-3" />
        Copier
      </button>
    </div>
  );
}
