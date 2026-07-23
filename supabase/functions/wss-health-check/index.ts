// Periodic WSS health check for SIP endpoints.
// Probes WebSocket upgrade on ports 7443 (expected OK) and 5067 (expected FAIL — SIP/TLS only).
// Stores results in pbx_wss_health_checks and returns the latest snapshot.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Probe = {
  host: string;
  port: number;
  url: string;
  ok: boolean;
  latency_ms: number;
  error: string | null;
};

const TARGETS: Array<{ host: string; port: number }> = [
  { host: "pbxnode.lemtel.tel", port: 7443 },
  { host: "node.lemtelcloud.net", port: 7443 },
  { host: "pbxnode.lemtel.tel", port: 5067 },
  { host: "node.lemtelcloud.net", port: 5067 },
];

const TIMEOUT_MS = 6000;

async function probeWss(host: string, port: number): Promise<Probe> {
  const url = `wss://${host}:${port}`;
  const started = performance.now();
  const result: Probe = { host, port, url, ok: false, latency_ms: 0, error: null };

  try {
    const ws = new WebSocket(url, ["sip"]);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        try { ws.close(); } catch (_) { /* ignore */ }
        reject(new Error(`timeout_${TIMEOUT_MS}ms`));
      }, TIMEOUT_MS);

      ws.onopen = () => {
        clearTimeout(timer);
        try { ws.close(1000, "health-check"); } catch (_) { /* ignore */ }
        resolve();
      };
      ws.onerror = (ev) => {
        clearTimeout(timer);
        // Deno's WebSocket ErrorEvent has a `message` field at runtime.
        const msg = (ev as unknown as { message?: string })?.message || "ws_error";
        reject(new Error(msg));
      };
      ws.onclose = (ev) => {
        if (!ev.wasClean && !result.ok) {
          clearTimeout(timer);
          reject(new Error(`closed_${ev.code}_${ev.reason || "no_reason"}`));
        }
      };
    });
    result.ok = true;
  } catch (err) {
    result.ok = false;
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    result.latency_ms = Math.round(performance.now() - started);
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (req.method === "GET") {
    // Return latest stored results (last 50)
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "missing_env" }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await admin
      .from("pbx_wss_health_checks")
      .select("*")
      .order("checked_at", { ascending: false })
      .limit(50);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, results: data ?? [] });
  }

  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const probes = await Promise.all(TARGETS.map((t) => probeWss(t.host, t.port)));
  const checked_at = new Date().toISOString();

  // Persist (best-effort)
  if (SUPABASE_URL && SERVICE_KEY) {
    try {
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      await admin.from("pbx_wss_health_checks").insert(
        probes.map((p) => ({
          host: p.host,
          port: p.port,
          url: p.url,
          ok: p.ok,
          latency_ms: p.latency_ms,
          error: p.error,
          checked_at,
        })),
      );
    } catch (e) {
      console.error("[wss-health-check] persist_failed", e);
    }
  }

  const failures = probes.filter((p) => p.port === 7443 && !p.ok);
  if (failures.length > 0) {
    console.error("[wss-health-check] CRITICAL — 7443 WSS unreachable", failures);
  }

  return json({
    ok: failures.length === 0,
    checked_at,
    probes,
    summary: {
      total: probes.length,
      up: probes.filter((p) => p.ok).length,
      down: probes.filter((p) => !p.ok).length,
      critical_failures: failures.length,
    },
  });
});
