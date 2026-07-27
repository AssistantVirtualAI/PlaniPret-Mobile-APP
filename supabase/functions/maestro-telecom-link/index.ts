// maestro-telecom-link — resolve the broker's Maestro Telecom user id and
// persist it on planipret_profiles.maestro_broker_id.
//
// POST body: { action: "link", ms_access_token?: string }
//
// Strategy:
//   1. Use the broker's Maestro OAuth token (stored after OAuth flow) to call
//      GET /users/me?machine=1 — this returns the authenticated broker's profile.
//   2. Try to extract the user id from the JWT payload and call
//      GET /users/{id}?machine=1 directly for maximum reliability.
//   3. Fall back to ms_access_token if provided.
//   4. NEVER use the machine API key alone — it always returns the machine account
//      (Carlo, id=67) instead of the authenticated broker.
//
// Never throws — all failures return 200 with { ok:false, error }.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  getMaestroTelecomConfig,
  isMaestroTelecomConfigured,
} from "../_shared/maestro-telecom.ts";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Extract numeric user id from a JWT payload (sub, id, or user_id field). */
function extractJwtUserId(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const rawId = payload?.sub ?? payload?.id ?? payload?.user_id ?? null;
    if (rawId && /^\d+$/.test(String(rawId))) return String(rawId);
  } catch { /* ignore */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return j({ ok: false, error: "unauthorized" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return j({ ok: false, error: "unauthorized" });

    // Planiprêt scope guard
    const { data: isMember } = await admin.rpc("is_planipret_member", { _user_id: userId });
    if (isMember !== true) return j({ ok: false, error: "forbidden" });

    const body = await req.json().catch(() => ({} as any));
    const msAccessToken: string | null = body?.ms_access_token ?? null;

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select("id, user_id, email, ms365_email, maestro_broker_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return j({ ok: false, error: "profile_not_found" });

    const brokerEmail = String(
      (profile as any).ms365_email ?? (profile as any).email ?? "",
    ).toLowerCase().trim();

    const cfg = await getMaestroTelecomConfig(admin);
    if (!isMaestroTelecomConfigured(cfg)) return j({ ok: false, error: "not_configured" });

    // Prefer the broker's Maestro OAuth token — it is scoped to the authenticated
    // broker and returns the correct user profile (not the machine account).
    const maestroToken = await getUserMaestroAccessToken(admin, userId);

    // Build candidate (token, url) pairs — most reliable first.
    const attempts: Array<{ label: string; token: string; url: string }> = [];

    if (maestroToken) {
      const jwtId = extractJwtUserId(maestroToken);
      if (jwtId) {
        // Most reliable: direct user endpoint with the broker's own id from JWT
        attempts.push({
          label: "maestro_oauth_jwt_id",
          token: maestroToken,
          url: `${cfg.url}/users/${jwtId}?machine=1`,
        });
      }
      // Auto-resolved "me" endpoint with OAuth token
      attempts.push({
        label: "maestro_oauth_me",
        token: maestroToken,
        url: `${cfg.url}/user?machine=1`,
      });
      attempts.push({
        label: "maestro_oauth_users_me",
        token: maestroToken,
        url: `${cfg.url}/users/me?machine=1`,
      });
    }

    if (msAccessToken) {
      const jwtId = extractJwtUserId(msAccessToken);
      if (jwtId) {
        attempts.push({
          label: "ms_token_jwt_id",
          token: msAccessToken,
          url: `${cfg.url}/users/${jwtId}?machine=1`,
        });
      }
      attempts.push({
        label: "ms_token_me",
        token: msAccessToken,
        url: `${cfg.url}/user?machine=1`,
      });
    }

    // NOTE: We intentionally do NOT add machine_key attempts here because the
    // machine key always returns the machine account (Carlo, id=67) and would
    // overwrite the broker's real id.

    let matched: { id: string; email: string } | null = null;
    const trace: any[] = [];

    for (const a of attempts) {
      try {
        const r = await fetch(a.url, {
          method: "GET",
          headers: { Authorization: `Bearer ${a.token}`, Accept: "application/json" },
        });
        const status = r.status;
        let data: any = null;
        try { data = await r.json(); } catch { /* ignore */ }
        const returnedId = String(data?.id ?? data?.user?.id ?? data?.user_id ?? "");
        const returnedEmail = String(data?.email ?? data?.user?.email ?? "").toLowerCase().trim();
        trace.push({ via: a.label, url: a.url, status, returned_id: returnedId, returned_email: returnedEmail });
        if (!r.ok) continue;
        if (!returnedId) continue;

        // If we have the broker's email, validate it matches.
        // If the API doesn't return an email (some endpoints omit it), accept the id anyway.
        if (brokerEmail && returnedEmail && returnedEmail !== brokerEmail) {
          console.warn(`[maestro-telecom-link] email mismatch via ${a.label}: returned=${returnedEmail} expected=${brokerEmail} — skipping`);
          continue;
        }

        matched = { id: returnedId, email: returnedEmail || brokerEmail };
        break;
      } catch (e) {
        trace.push({ via: a.label, error: (e as Error).message });
      }
    }

    if (!matched) {
      const anyServerError = trace.some((t) => t.status && t.status >= 500);
      const anyNotFound = trace.some((t) => t.status === 404);
      const noToken = !maestroToken && !msAccessToken;
      return j({
        ok: false,
        error: noToken
          ? "no_maestro_token_connect_maestro_first"
          : anyNotFound || anyServerError
          ? "endpoint_not_ready"
          : "no_match",
        hint: noToken
          ? "Le broker doit d'abord se connecter via le flux OAuth Maestro avant d'appeler maestro-telecom-link."
          : undefined,
        trace,
      });
    }

    await admin
      .from("planipret_profiles")
      .update({ maestro_broker_id: matched.id })
      .eq("user_id", userId);

    return j({ ok: true, maestro_id: matched.id, email: matched.email });
  } catch (e) {
    console.error("[maestro-telecom-link]", e);
    return j({ ok: false, error: (e as Error).message ?? "error" });
  }
});
