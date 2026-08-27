// pp-maestro-full-sync — live end-to-end Maestro Telecom check + backfill.
//
// POST body: { user_id?: uuid, email?: string, days?: number, limit?: number,
//              probe_only?: boolean, force?: boolean }
//
// 1. Resolves the broker's telecom user id.
// 2. Probes every Telecom REST endpoint (read-only) and reports HTTP status.
// 3. Replays unsynced SMS (maestro-sync-message) and calls (maestro-sync-call)
//    so texts, call IDs, CDRs, recordings, transcripts and AI summaries land on
//    the Maestro Communications page.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getUser } from "../_shared/mobile-admin.ts";
import {
  getMaestroTelecomConfig,
  isMaestroTelecomConfigured,
  maestroTelecomFetch,
} from "../_shared/maestro-telecom.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const body = await req.json().catch(() => ({} as any));

  // Auth: the caller must be signed in. Non-admins may only run the sync for
  // their own broker profile — never for an arbitrary user_id / email.
  const caller = await getUser(req);
  if (!caller) return json({ ok: false, error: "unauthorized" }, 401);
  const [{ data: isPpAdmin }, { data: isSuper }] = await Promise.all([
    admin.rpc("is_planipret_admin", { _user_id: caller.id }),
    admin.rpc("is_super_admin", { _user_id: caller.id }),
  ]);
  const isAdmin = isPpAdmin === true || isSuper === true;
  if (!isAdmin) {
    if ((body?.user_id && String(body.user_id) !== caller.id) || body?.email) {
      return json({ ok: false, error: "forbidden" }, 403);
    }
    body.user_id = caller.id;
  }
  // Default target = the caller's own broker profile (never an arbitrary one).
  if (!body?.user_id && !body?.email) body.user_id = caller.id;
  const days = Math.min(Math.max(Number(body?.days ?? 14), 1), 90);
  const limit = Math.min(Math.max(Number(body?.limit ?? 30), 1), 200);
  const force = body?.force === true;
  const probeOnly = body?.probe_only === true;
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  // ── Resolve broker ────────────────────────────────────────────────
  let pq = admin
    .from("planipret_profiles")
    .select("id, user_id, email, maestro_broker_id, maestro_telecom_user_id")
    .limit(1);
  if (body?.user_id) pq = pq.eq("user_id", body.user_id);
  else if (body?.email) pq = pq.eq("email", body.email);
  else pq = pq.not("maestro_telecom_user_id", "is", null);
  const { data: profileRows } = await pq;
  const profile = profileRows?.[0] as any;
  if (!profile) return json({ ok: false, error: "broker_profile_not_found" }, 404);

  const telecomId = profile.maestro_telecom_user_id ? String(profile.maestro_telecom_user_id) : null;
  const userIds = [profile.user_id, profile.id].filter(Boolean).map(String) as string[];

  const cfg = await getMaestroTelecomConfig(admin);
  if (!isMaestroTelecomConfigured(cfg)) return json({ ok: false, error: "maestro_telecom_not_configured" }, 200);
  if (!telecomId) return json({ ok: false, error: "telecom_user_id_missing", profile: { email: profile.email } }, 200);

  // ── 1. Probe endpoints ────────────────────────────────────────────
  const me = encodeURIComponent(telecomId);
  const probes: Array<{ name: string; path: string }> = [
    { name: "sip", path: `/users/${me}/sip` },
    { name: "calls", path: `/users/${me}/calls` },
    { name: "inbox", path: `/users/${me}/inbox` },
    { name: "communications_recent", path: `/users/${me}/communications/recent` },
    { name: "communications_all", path: `/users/${me}/communications/all` },
  ];
  const endpoints: Record<string, unknown> = {};
  for (const p of probes) {
    const r = await maestroTelecomFetch(cfg, p.path, { method: "GET", maxAttempts: 2 });
    endpoints[p.name] = {
      status: r.status,
      ok: r.ok,
      count: Array.isArray(r.data) ? r.data.length : Array.isArray((r.data as any)?.data) ? (r.data as any).data.length : undefined,
      error: r.error ?? null,
    };
  }

  // ── 1b. Optional minimal write probes (isolates payload vs server errors) ──
  if (body?.write_probe === true) {
    const stamp = Date.now();
    const variants: Array<{ name: string; body: Record<string, unknown> }> = Array.isArray(body?.variants)
      ? (body.variants as any[])
      : [
          { name: "min_number", body: { provider_call_id: `probe-${stamp}-a`, status: "dialing", direction: "outbound", to_user_number: "+15145550123" } },
          { name: "to_user_id", body: { provider_call_id: `probe-${stamp}-b`, status: "dialing", direction: "outbound", to_user_id: Number(telecomId) } },
          { name: "bare", body: { provider_call_id: `probe-${stamp}-c` } },
        ];
    const variantResults: any[] = [];
    for (const v of variants) {
      const r = await maestroTelecomFetch(cfg, `/users/${me}/calls`, { method: "POST", maxAttempts: 1, body: v.body });
      variantResults.push({ name: v.name, status: r.status, ok: r.ok, data: r.data, error: r.error ?? null });
    }
    const callProbe = { status: variantResults[0].status, ok: variantResults[0].ok, data: variantResults[0].data, error: variantResults[0].error };
    const msgProbe = await maestroTelecomFetch(cfg, `/users/${me}/messages`, {
      method: "POST",
      maxAttempts: 1,
      body: { to_user_number: "+15145550123", message: `probe ${stamp}` },
    });
    return json({
      ok: true,
      broker: { email: profile.email, crm_id: profile.maestro_broker_id, telecom_id: telecomId },
      endpoints,
      write_probe: {
        variants: variantResults,
        call: { status: callProbe.status, ok: callProbe.ok, data: callProbe.data, error: callProbe.error ?? null },
        message: { status: msgProbe.status, ok: msgProbe.ok, data: msgProbe.data, error: msgProbe.error ?? null },
      },
    });
  }

  if (probeOnly) {
    return json({ ok: true, broker: { email: profile.email, crm_id: profile.maestro_broker_id, telecom_id: telecomId }, endpoints });
  }


  const invoke = async (fn: string, payload: Record<string, unknown>) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, success: !!(data as any)?.success, data };
    } catch (e) {
      return { status: 0, success: false, data: { error: (e as Error).message } };
    }
  };

  const runBackfill = async () => {
    // ── 2. SMS backfill ───────────────────────────────────────────────
    let mq = admin
      .from("planipret_phone_messages")
      .select("id, maestro_synced, created_at")
      .in("user_id", userIds)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!force) mq = mq.eq("maestro_synced", false);
    const { data: msgs } = await mq;
    const messages: any[] = [];
    for (const m of msgs ?? []) {
      const r = await invoke("maestro-sync-message", { message_id: (m as any).id, force: true });
      messages.push({ id: (m as any).id, success: r.success, status: r.status, error: (r.data as any)?.error ?? null });
    }

    // ── 3. Calls / CDR backfill ───────────────────────────────────────
    const { data: calls } = await admin
      .from("planipret_phone_calls")
      .select("id, maestro_call_id, maestro_synced, started_at")
      .in("user_id", userIds)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(limit);
    const pending = (calls ?? []).filter((c: any) => force || !c.maestro_call_id || !c.maestro_synced);
    const callResults: any[] = [];
    for (const c of pending) {
      const r = await invoke("maestro-sync-call", { call_id: (c as any).id, force: true });
      callResults.push({ id: (c as any).id, success: r.success, status: r.status, error: (r.data as any)?.error ?? null });
    }

    // ── 4. Media poll (recordings + transcriptions) ───────────────────
    const media = await invoke("maestro-media-poll", { limit: 25, max_age_hours: days * 24 });

    return {
      messages: {
        processed: messages.length,
        succeeded: messages.filter((m) => m.success).length,
        results: messages.slice(0, 20),
      },
      calls: {
        scanned: calls?.length ?? 0,
        processed: callResults.length,
        succeeded: callResults.filter((c) => c.success).length,
        results: callResults.slice(0, 20),
      },
      media: media.data,
    };
  };

  const broker = { email: profile.email, crm_id: profile.maestro_broker_id, telecom_id: telecomId };

  if (body?.wait === true) {
    const out = await runBackfill();
    return json({ ok: true, broker, endpoints, ...out });
  }

  // Default: run in the background so long backfills are not cut off.
  // @ts-ignore EdgeRuntime is available in Supabase edge functions
  EdgeRuntime.waitUntil(runBackfill().then((r) => console.log("[pp-maestro-full-sync] done", JSON.stringify(r))).catch((e) => console.error("[pp-maestro-full-sync] failed", e)));
  return json({ ok: true, accepted: true, broker, endpoints });
});

