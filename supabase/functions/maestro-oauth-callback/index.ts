// maestro-oauth-callback — exchanges the authorization code, saves the token
// set on the broker's profile, then best-effort fetches /users/me to populate
// maestro_broker_id + maestro_email so all downstream Maestro calls just work.
//
// Body: { code, state, redirect_uri }
// State MUST match a row in planipret_maestro_oauth_states to resolve the user.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  exchangeAuthorizationCode,
  fetchMaestroUserProfile,
  getMaestroOAuthEnv,
  isMaestroOAuthConfigured,
  persistTokenSet,
} from "../_shared/maestro-oauth.ts";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const { code, state, redirect_uri } = body ?? {};
    if (!code) return j({ success: false, error: "code required" });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const env = getMaestroOAuthEnv();

    // Resolve the user this OAuth flow belongs to via the state we stored in start.
    let userId: string | null = null;
    let storedRedirect: string | null = null;
    let storedCodeVerifier: string | null = null;
    if (state) {
      const { data: st } = await admin
        .from("planipret_maestro_oauth_states")
        .select("user_id, redirect_uri, code_verifier")
        .eq("state", state)
        .maybeSingle();
      if (st) {
        userId = (st as any).user_id ?? null;
        storedRedirect = (st as any).redirect_uri ?? null;
        storedCodeVerifier = (st as any).code_verifier ?? null;
      }
    }

    if (!isMaestroOAuthConfigured(env)) {
      // Store the pending code so we can exchange later.
      await admin.from("planipret_integration_secrets").upsert({
        provider: "maestro_oauth_pending",
        key_name: `code_${state ?? Date.now()}`,
        value: JSON.stringify({ code, state, redirect_uri, user_id: userId, received_at: new Date().toISOString() }),
      }, { onConflict: "provider,key_name" });
      return j({
        success: true, pending: true,
        message: "Code stocké. En attente de configuration des endpoints Maestro.",
      });
    }

    const effectiveRedirect = redirect_uri ?? storedRedirect ?? "";
    if (storedRedirect && redirect_uri && storedRedirect !== redirect_uri) {
      console.warn("[maestro-oauth-callback] redirect_uri mismatch", { stored: storedRedirect, received: redirect_uri });
    }
    // Utiliser le code_verifier stocké si présent (flux PKCE mobile client_id=3)
    const codeVerifier = body?.code_verifier ?? storedCodeVerifier ?? null;
    const exch = await exchangeAuthorizationCode(env, code, effectiveRedirect, codeVerifier);

    if (!exch.ok || !exch.data) {
      await admin.from("planipret_integration_secrets").upsert({
        provider: "maestro_oauth_error", key_name: "last",
        value: JSON.stringify({ error: exch.error, http_status: exch.status, at: new Date().toISOString() }),
      }, { onConflict: "provider,key_name" });
      return j({ success: false, error: exch.error ?? "token_exchange_failed" });
    }

    // Clear previous error
    await admin.from("planipret_integration_secrets").delete().eq("provider", "maestro_oauth_error");

    // If we know the user, persist per-broker. Otherwise keep the global fallback
    // in planipret_integration_secrets so nothing is lost.
    if (userId) {
      const isMobile = !!storedCodeVerifier;
      await persistTokenSet(admin, userId, exch.data, isMobile);

      // Best-effort: hydrate maestro_broker_id + maestro_email from /users/me
      const me = await fetchMaestroUserProfile(env, exch.data.access_token);
      if (me) {
        const mid = (me as any).id ?? (me as any).user?.id ?? (me as any).user_id ?? null;
        const email = String((me as any).email ?? (me as any).user?.email ?? "").toLowerCase().trim();
        const patch: Record<string, unknown> = {};
        if (mid) patch.maestro_broker_id = String(mid);
        if (email) patch.maestro_email = email;
        if (Object.keys(patch).length) {
          await admin.from("planipret_profiles").update(patch).eq("user_id", userId);
        }
      }

      // Consume the state row.
      await admin.from("planipret_maestro_oauth_states").delete().eq("state", state);
    } else {
      await admin.from("planipret_integration_secrets").upsert({
        provider: "maestro_oauth", key_name: state ?? "default",
        value: JSON.stringify({ ...exch.data, obtained_at: new Date().toISOString() }),
      }, { onConflict: "provider,key_name" });
    }

    return j({
      success: true,
      user_bound: !!userId,
      has_refresh: !!exch.data.refresh_token,
      expires_in: exch.data.expires_in ?? null,
    });
  } catch (e) {
    console.error("[maestro-oauth-callback]", e);
    return j({ success: false, error: (e as Error).message });
  }
});
