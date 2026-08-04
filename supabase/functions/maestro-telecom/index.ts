// Maestro Telecom REST API compatibility proxy.
// Kept for existing mobile clients; config is resolved from Planiprêt admin
// integration settings first, then env vars. Missing/failed Maestro calls must
// never break the mobile NS flow.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  getMaestroTelecomConfig,
  isMaestroTelecomConfigured,
  maestroTelecomFetch,
} from "../_shared/maestro-telecom.ts";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const cfg = await getMaestroTelecomConfig(admin);
    if (!isMaestroTelecomConfigured(cfg)) {
      return json({ ok: false, error: "maestro_telecom_not_configured" }, 200);
    }

    const body = await req.json().catch(() => ({} as any));
    let { path, method = "GET", body: reqBody, query } = body as {
      path?: string; method?: string; body?: unknown; query?: Record<string, string>;
    };
    if (!path || typeof path !== "string") return json({ error: "missing_path" }, 400);

    // Resolve {me} → current broker's Maestro id
    let resolvedMeId: string | number | null = null;
    if (path.includes("{me}")) {
      const { data: prof } = await admin
        .from("planipret_profiles")
        .select("maestro_broker_id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      const meId = prof?.maestro_broker_id;
      if (!meId) return json({ ok: false, error: "no_maestro_broker_id", needs_link: true }, 200);
      resolvedMeId = meId;
      path = path.replaceAll("{me}", encodeURIComponent(String(meId)));
    }

    const url = new URL(`https://local${path.startsWith("/") ? path : `/${path}`}`);
    if (query && typeof query === "object") {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    // Prefer the broker's per-user OAuth token when available (auto-refresh),
    // fall back to the machine key from the shared config.
    const userToken = await getUserMaestroAccessToken(admin, u.user.id);
    if (!userToken) {
      return json({ ok: false, error: "maestro_reconnect_required", needs_reauth: true }, 200);
    }

    const endpoint = `${url.pathname}${url.search}`;
    let upstreamBody = method !== "GET" ? reqBody : undefined;
    // Maestro's call-create contract distinguishes the external destination
    // (outbound) from the external caller + internal recipient (inbound).
    // Sending an inbound caller as `to_user_number` makes the upstream route
    // resolve the caller as its destination and currently returns HTTP 500.
    if (method === "POST" && /\/users\/[^/]+\/calls$/.test(url.pathname)
      && reqBody && typeof reqBody === "object") {
      const call = { ...(reqBody as Record<string, unknown>) };
      if (call.direction === "inbound") {
        const externalCaller = call.from_user_number ?? call.to_user_number;
        delete call.to_user_number;
        call.from_user_number = externalCaller;
        call.to_user_id = resolvedMeId !== null && Number.isFinite(Number(resolvedMeId))
          ? Number(resolvedMeId)
          : resolvedMeId;
      }
      upstreamBody = call;
    }
    const r = await maestroTelecomFetch(cfg, endpoint, {
      method,
      body: upstreamBody,
      token: userToken,
    });

    if (!r.ok) {
      console.error("[maestro-telecom]", method, endpoint, r.status, JSON.stringify(r.data ?? r.error).slice(0, 500));
      return json({ ok: false, error: "maestro_error", status: r.status, details: r.data ?? r.error }, 200);
    }
    return json({ ok: true, status: r.status, data: r.data });
  } catch (e) {
    console.error("[maestro-telecom]", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
