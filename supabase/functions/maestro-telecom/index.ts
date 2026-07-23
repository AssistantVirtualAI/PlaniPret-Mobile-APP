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
    if (path.includes("{me}")) {
      const { data: prof } = await admin
        .from("planipret_profiles")
        .select("maestro_broker_id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      const meId = prof?.maestro_broker_id;
      if (!meId) return json({ ok: false, error: "no_maestro_broker_id", needs_link: true }, 200);
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

    const endpoint = `${url.pathname}${url.search}`;
    const r = await maestroTelecomFetch(cfg, endpoint, {
      method,
      body: method !== "GET" ? reqBody : undefined,
      token: userToken ?? undefined,
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
