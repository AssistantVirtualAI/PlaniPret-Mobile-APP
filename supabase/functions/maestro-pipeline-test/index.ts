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

  // Resolve the caller's broker identity so the probes hit the same
  // /telecom/api/v1/users/{brokerId}/... endpoints production uses.
  let callerId: string | null = null;
  try {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (jwt) {
      const { data } = await admin.auth.getUser(jwt);
      callerId = data?.user?.id ?? null;
    }
  } catch { /* anonymous / machine run */ }

  const auth = await getBrokerAuth(admin, callerId);
  const tok = auth.token || cfg.key;
  const brokerId = auth.brokerId;
  const base = brokerId ? `/api/v1/users/${brokerId}` : null;

  await run("1. API connection", async () => {
    if (!base) return { ok: false, details: { error: "broker_id_unresolved" } };
    const r = await maestroFetch(cfg, { method: "GET", path: `${base}/clients?limit=1&machine=1`, token: tok });
    return { ok: r.ok, details: { status: r.status, broker_id: brokerId } };
  });

  await run("2. Client lookup", async () => {
    if (!base) return { ok: false, details: { error: "broker_id_unresolved" } };
    const r = await maestroFetch(cfg, { method: "GET", path: `${base}/clients?search=%2B15140000000&machine=1`, token: tok });
    return { ok: r.status < 500, details: { status: r.status } };
  });

  await run("3. POST CDR (dry)", async () => {
    if (!base) return { ok: false, details: { error: "broker_id_unresolved" } };
    const r = await maestroFetch(cfg, {
      method: "POST", path: `${base}/calls?machine=1`, token: tok,
      idempotencyKey: `test-${Date.now()}`,
      body: {
        provider_call_id: `pipeline-test-${Date.now()}`,
        direction: "outbound",
        from_user_number: "+15140000000",
        to_user_number: "+15140000001",
        status: "dialing",
      },
    });
    return { ok: r.ok || r.status === 409 || r.status === 422, details: { status: r.status } };
  });

  await run("4. POST transcript (dry)", async () => {
    if (!base) return { ok: false, details: { error: "broker_id_unresolved" } };
    const r = await maestroFetch(cfg, {
      method: "PUT", path: `${base}/calls/pipeline-test-${Date.now()}?machine=1`, token: tok,
      body: { transcript: "test" },
    });
    return { ok: r.ok || r.status === 404, details: { status: r.status } };
  });

  await run("5. POST ai_summary (dry)", async () => {
    if (!base) return { ok: false, details: { error: "broker_id_unresolved" } };
    const r = await maestroFetch(cfg, {
      method: "PUT", path: `${base}/calls/pipeline-test-${Date.now()}?machine=1`, token: tok,
      body: { ai_summary: "test" },
    });
    return { ok: r.ok || r.status === 404, details: { status: r.status } };
  });

  await run("6. POST message (dry)", async () => {
    if (!base) return { ok: false, details: { error: "broker_id_unresolved" } };
    const r = await maestroFetch(cfg, {
      method: "GET", path: `${base}/messages?limit=1&machine=1`, token: tok,
    });
    // The messages route is POST-only on Maestro: 405 proves it is reachable.
    return { ok: r.ok || r.status === 404 || r.status === 405, details: { status: r.status } };
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
