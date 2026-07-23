// POST /functions/v1/maestro-pipeline-test
// Runs a sequence of 7 health checks against Maestro and returns per-step status.
import {
  adminClient,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  hmacSha256Hex,
  json,
  maestroFetch,
} from "../_shared/maestro.ts";

interface Step { name: string; ok: boolean; ms: number; details?: unknown }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = adminClient();
  const cfg = await getMaestroConfig(admin);
  const out: Step[] = [];
  const run = async (name: string, fn: () => Promise<{ ok: boolean; details?: unknown }>) => {
    const t = Date.now();
    try {
      const r = await fn();
      out.push({ name, ok: r.ok, ms: Date.now() - t, details: r.details });
    } catch (e: any) {
      out.push({ name, ok: false, ms: Date.now() - t, details: { error: e?.message } });
    }
  };

  if (!cfg.url || !cfg.key) {
    return json({ success: false, error: "maestro_not_configured" }, 200);
  }
  const tok = cfg.key;

  await run("1. API connection", async () => {
    const r = await maestroFetch(cfg, { method: "GET", path: "/api/v1/clients?limit=1", token: tok });
    return { ok: r.ok, details: { status: r.status } };
  });

  await run("2. Client lookup", async () => {
    const r = await maestroFetch(cfg, { method: "GET", path: "/api/v1/clients/lookup?phone=%2B15140000000", token: tok });
    return { ok: r.status < 500, details: { status: r.status } };
  });

  await run("3. POST CDR (dry)", async () => {
    const r = await maestroFetch(cfg, {
      method: "POST", path: "/api/v1/calls/cdr", token: tok,
      idempotencyKey: `test-${Date.now()}`,
      body: { call_id: `test-${Date.now()}`, direction: "outbound", caller_number: "+15140000000", callee_number: "+15140000001", duration_sec: 1, test: true },
    });
    return { ok: r.ok || r.status === 409 || r.status === 400, details: { status: r.status } };
  });

  await run("4. POST transcript (dry)", async () => {
    const r = await maestroFetch(cfg, {
      method: "POST", path: `/api/v1/calls/test-${Date.now()}/transcript`, token: tok,
      body: { language: "fr-CA", text: "test", segments: [], confidence: 0.9 },
    });
    return { ok: r.ok || r.status === 404, details: { status: r.status } };
  });

  await run("5. POST ai_summary (dry)", async () => {
    const r = await maestroFetch(cfg, {
      method: "POST", path: `/api/v1/calls/test-${Date.now()}/ai_summary`, token: tok,
      body: { summary_text: "test", key_points: [], next_actions: [], sentiment: "neutral" },
    });
    return { ok: r.ok || r.status === 404, details: { status: r.status } };
  });

  await run("6. POST task (dry)", async () => {
    const r = await maestroFetch(cfg, {
      method: "POST", path: `/api/v1/clients/test/tasks`, token: tok,
      body: { title: "test", priority: "low" },
    });
    return { ok: r.ok || r.status === 404 || r.status === 400, details: { status: r.status } };
  });

  await run("7. Webhook signature", async () => {
    if (!cfg.webhookSecret) return { ok: false, details: { error: "MAESTRO_WEBHOOK_SECRET missing" } };
    const sample = JSON.stringify({ ping: true });
    const sig = await hmacSha256Hex(cfg.webhookSecret, sample);
    return { ok: sig.length === 64, details: { sig_len: sig.length } };
  });

  const passed = out.filter((s) => s.ok).length;
  return json({ success: passed === out.length, passed, total: out.length, steps: out });
});
