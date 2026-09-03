// pp-connections-keepalive — keeps Microsoft 365 and Maestro OAuth sessions alive.
// - Authenticated call (mobile app boot / resume): refreshes the caller's tokens.
// - { all: true } with the service role: refreshes every broker whose token is
//   near expiry. Safe to call repeatedly; it is idempotent.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Profile = {
  id: string;
  user_id: string;
  ms365_refresh_token: string | null;
  ms365_token_expiry: string | null;
  maestro_refresh_token: string | null;
  maestro_token_expires_at: string | null;
};

const SELECT =
  "id, user_id, ms365_refresh_token, ms365_token_expiry, maestro_refresh_token, maestro_token_expires_at";

// Refresh only when the token is about to die. Each Microsoft refresh can
// trigger a "new sign-in" alert on the broker's account, so we never refresh
// proactively "just in case" — only within this window before expiry.
const MS_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const MAESTRO_REFRESH_WINDOW_MS = 10 * 60 * 1000;

async function keepAlive(admin: ReturnType<typeof createClient>, p: Profile) {
  const out = { ms365: "skipped" as string, maestro: "skipped" as string };

  if (p.ms365_refresh_token) {
    const exp = p.ms365_token_expiry ? Date.parse(p.ms365_token_expiry) : 0;
    if (!exp || exp - Date.now() < MS_REFRESH_WINDOW_MS) {
      try {
        const token = await refreshMicrosoftAccessToken(admin as any, p as any, MS365_DELEGATED_SCOPES);
        out.ms365 = token ? "refreshed" : "failed";
      } catch (e) {
        console.warn("[keepalive] ms365 refresh failed", p.user_id, (e as Error).message);
        out.ms365 = "failed";
      }
    } else {
      out.ms365 = "fresh";
    }
  }

  if (p.maestro_refresh_token) {
    const mexp = p.maestro_token_expires_at ? Date.parse(p.maestro_token_expires_at) : 0;
    if (!mexp || mexp - Date.now() < MAESTRO_REFRESH_WINDOW_MS) {
      try {
        // getUserMaestroAccessToken refreshes + persists when near expiry.
        const token = await getUserMaestroAccessToken(admin as any, p.user_id);
        out.maestro = token ? "ok" : "failed";
      } catch (e) {
        console.warn("[keepalive] maestro refresh failed", p.user_id, (e as Error).message);
        out.maestro = "failed";
      }
    } else {
      out.maestro = "fresh";
    }
  }

  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({} as any));

    if (body?.all === true) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const isService = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "\u0000");
      if (!isService) return j({ error: "forbidden" }, 403);

      const cutoff = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { data: rows } = await admin
        .from("planipret_profiles")
        .select(SELECT)
        .or(
          `and(ms365_refresh_token.not.is.null,or(ms365_token_expiry.is.null,ms365_token_expiry.lt.${cutoff})),` +
            `and(maestro_refresh_token.not.is.null,or(maestro_token_expires_at.is.null,maestro_token_expires_at.lt.${cutoff}))`,
        );
      let refreshed = 0;
      for (const r of (rows ?? []) as Profile[]) {
        const res = await keepAlive(admin, r);
        if (res.ms365 === "refreshed" || res.maestro === "ok") refreshed++;
      }
      return j({ success: true, scanned: rows?.length ?? 0, refreshed });
    }

    // Per-user (authenticated) keepalive
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return j({ error: "unauthorized" }, 401);
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return j({ error: "unauthorized" }, 401);

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select(SELECT)
      .eq("user_id", u.user.id)
      .maybeSingle();
    if (!profile) return j({ error: "no_profile" }, 404);

    const result = await keepAlive(admin, profile as Profile);
    return j({
      success: true,
      ...result,
      ms365_connected: result.ms365 !== "failed" && !!(profile as Profile).ms365_refresh_token,
      maestro_connected: result.maestro === "ok" || result.maestro === "fresh",
    });
  } catch (e) {
    console.error("[pp-connections-keepalive]", e);
    return j({ error: (e as Error).message }, 500);
  }
});
