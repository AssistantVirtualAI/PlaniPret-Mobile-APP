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
  extractMaestroBrokerId,
  fetchMaestroUserProfile,
  getMaestroOAuthEnv,
  isMaestroOAuthConfigured,
  persistTokenSet,
} from "../_shared/maestro-oauth.ts";
import { resolveMaestroIdForUser, resolveTelecomUserId } from "../_shared/maestro-broker-directory.ts";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function brokerIdFromAccessToken(accessToken: string): string | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    const candidate = payload?.broker_id ?? payload?.maestro_broker_id ?? payload?.user_id ?? payload?.sub ?? null;
    return candidate === null || candidate === undefined ? null : String(candidate).trim() || null;
  } catch {
    return null;
  }
}

async function saveIntegrationState(
  admin: ReturnType<typeof createClient>,
  provider: string,
  config: Record<string, unknown>,
) {
  const { error } = await admin.from("planipret_integration_secrets").upsert({
    provider,
    config,
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider" });
  if (error) console.error("[maestro-oauth-callback] integration state save failed", provider, error.message);
}

async function queueCommissionSync(userId: string) {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceKey) return;

  const job = fetch(`${baseUrl}/functions/v1/pp-maestro-commissions-sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "brokers", broker_ids: [userId] }),
  }).then(async (response) => {
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success !== true) {
      console.error("[maestro-oauth-callback] automatic commission sync failed", JSON.stringify({
        user_id: userId,
        status: response.status,
        code: result?.code ?? null,
        error: result?.error ?? "unknown_error",
      }));
      return;
    }
    console.info("[maestro-oauth-callback] automatic commission sync complete", JSON.stringify({
      user_id: userId,
      written: result?.written ?? 0,
      candidates: result?.candidates ?? 0,
    }));
  }).catch((error) => {
    console.error("[maestro-oauth-callback] automatic commission sync request failed", JSON.stringify({
      user_id: userId,
      error: error instanceof Error ? error.message : String(error),
    }));
  });

  const runtime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(job);
  else await job;
}

async function queueTasksSync(userId: string) {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceKey) return;

  const job = fetch(`${baseUrl}/functions/v1/planipret-task-api`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "list", user_id: userId, source: "maestro_oauth_callback", limit: 200 }),
  }).then(async (response) => {
    const result = await response.json().catch(() => ({}));
    console.info("[maestro-oauth-callback] automatic task sync", JSON.stringify({
      user_id: userId,
      status: response.status,
      success: result?.success ?? false,
      tasks: Array.isArray(result?.tasks) ? result.tasks.length : (result?.total ?? null),
      error: result?.error ?? null,
    }));
  }).catch((error) => {
    console.error("[maestro-oauth-callback] automatic task sync failed", JSON.stringify({
      user_id: userId,
      error: error instanceof Error ? error.message : String(error),
    }));
  });

  const runtime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(job);
  else await job;
}

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
      await saveIntegrationState(admin, "maestro_oauth_pending", {
        code,
        state,
        redirect_uri,
        user_id: userId,
        received_at: new Date().toISOString(),
      });
      return j({
        success: true, pending: true,
        message: "Code stocké. En attente de configuration des endpoints Maestro.",
      });
    }

    const effectiveRedirect = storedRedirect ?? redirect_uri ?? "";
    if (storedRedirect && redirect_uri && storedRedirect !== redirect_uri) {
      console.warn("[maestro-oauth-callback] redirect_uri mismatch", { stored: storedRedirect, received: redirect_uri });
    }
    // Utiliser le code_verifier stocké si présent (flux PKCE mobile client_id=3)
    const codeVerifier = body?.code_verifier ?? storedCodeVerifier ?? null;
    const exch = await exchangeAuthorizationCode(env, code, effectiveRedirect, codeVerifier);

    if (!exch.ok || !exch.data) {
      await saveIntegrationState(admin, "maestro_oauth_error", {
        error: exch.error,
        http_status: exch.status,
        state: state ?? null,
        user_id: userId,
        at: new Date().toISOString(),
      });
      return j({ success: false, error: exch.error ?? "token_exchange_failed" });
    }

    // Clear previous error
    await admin.from("planipret_integration_secrets").delete().eq("provider", "maestro_oauth_error");

    // If we know the user, persist per-broker. Otherwise keep the global fallback
    // in planipret_integration_secrets so nothing is lost.
    let resolvedBrokerId: string | null = null;
    let resolvedBy: string | null = null;
    let telecomUserId: string | null = null;
    let telecomMatchedBy: string | null = null;
    if (userId) {
      const isMobile = !!storedCodeVerifier;
      await persistTokenSet(admin, userId, exch.data, isMobile);

      // Read the id we had BEFORE this reconnect so we can detect a stale value.
      const { data: prevProf } = await admin
        .from("planipret_profiles")
        .select("id, user_id, maestro_broker_id")
        .or(`user_id.eq.${userId},id.eq.${userId}`)
        .limit(1)
        .maybeSingle();
      const previousId = (prevProf as any)?.maestro_broker_id
        ? String((prevProf as any).maestro_broker_id).trim()
        : null;

      // A reconnect must never retain a broker id from the previous Maestro
      // account while the fresh identity is being resolved.
      if ((prevProf as any)?.id) {
        await admin.from("planipret_profiles").update({ maestro_broker_id: null }).eq("id", (prevProf as any).id);
      }

      // Authoritative: GET /user with the *freshly issued* access token.
      const me = await fetchMaestroUserProfile(env, exch.data.access_token);
      if (me) {
        const mid = extractMaestroBrokerId(me);
        const email = String((me as any).email ?? (me as any).user?.email ?? "").toLowerCase().trim();
        const remoteName = [(me as any).first_name, (me as any).last_name].filter(Boolean).join(" ").trim();
        const patch: Record<string, unknown> = {};
        if (mid) {
          resolvedBrokerId = String(mid).trim();
          resolvedBy = "oauth_user_endpoint";
          patch.maestro_broker_id = resolvedBrokerId;
        }
        if (email) patch.maestro_email = email;
        if (Object.keys(patch).length) {
          const pid = (prevProf as any)?.id ?? null;
          const upd = admin.from("planipret_profiles").update(patch);
          const { error: upErr } = pid ? await upd.eq("id", pid) : await upd.eq("user_id", userId);
          if (upErr) console.error("[maestro-oauth-callback] profile patch failed", upErr.message);
        }
        if (previousId && resolvedBrokerId && previousId !== resolvedBrokerId) {
          console.warn("[maestro-oauth-callback] maestro_broker_id_changed", JSON.stringify({
            user_id: userId, previous: previousId, current: resolvedBrokerId,
          }));
        }
        // Names are intentionally NOT copied: Maestro's first_name/last_name can be
        // stale on shared/test accounts. Log a mismatch so it can be fixed upstream.
        if (remoteName) {
          const { data: prof } = await admin
            .from("planipret_profiles")
            .select("full_name, email")
            .eq("user_id", userId)
            .maybeSingle();
          const localName = String((prof as any)?.full_name ?? "").trim();
          if (localName && localName.toLowerCase() !== remoteName.toLowerCase()) {
            console.warn("[maestro-oauth-callback] maestro_name_mismatch", JSON.stringify({
              maestro_broker_id: mid, maestro_email: email,
              maestro_name: remoteName, local_name: localName, local_email: (prof as any)?.email ?? null,
            }));
          }
        }
      }


      // Some production OAuth responses expose the authenticated broker only
      // in the signed access-token claims while GET /user is unavailable.
      if (!resolvedBrokerId) {
        const tokenBrokerId = brokerIdFromAccessToken(exch.data.access_token);
        if (tokenBrokerId) {
          resolvedBrokerId = tokenBrokerId;
          resolvedBy = "oauth_token_claim";
          const pid = (prevProf as any)?.id ?? null;
          const upd = admin.from("planipret_profiles").update({ maestro_broker_id: tokenBrokerId });
          const { error: tokenUpErr } = pid ? await upd.eq("id", pid) : await upd.eq("user_id", userId);
          if (tokenUpErr) console.error("[maestro-oauth-callback] token broker id patch failed", tokenUpErr.message);
        }
      }

      // Fallback when /user gives no id: force a fresh directory match by email
      // (never trust the previously stored id after a reconnect).
      if (!resolvedBrokerId) {
        const r = await resolveMaestroIdForUser(admin, userId, { force: true });
        if (r.maestro_broker_id) {
          resolvedBrokerId = r.maestro_broker_id;
          resolvedBy = r.matched_by ?? "directory";
        } else {
          console.warn("[maestro-oauth-callback] broker_id_unresolved", JSON.stringify({ user_id: userId, error: r.error }));
        }
      }

      // Auto-detect the *telecom* user id for this broker (separate namespace
      // from the CRM/OAuth broker id) so call/SMS/recording sync works right away.
      try {
        if ((prevProf as any)?.id) {
          await admin.from("planipret_profiles")
            .update({ maestro_telecom_user_id: null, maestro_telecom_linked_at: null })
            .eq("id", (prevProf as any).id);
        }
        const tel = await resolveTelecomUserId(admin, userId, {
          candidate: resolvedBrokerId,
          force: true,
        });
        telecomUserId = tel.id;
        telecomMatchedBy = tel.matched_by;
        if (!tel.id) {
          console.warn("[maestro-oauth-callback] telecom_id_unresolved", JSON.stringify({ user_id: userId, error: tel.error }));
        }
      } catch (e) {
        console.error("[maestro-oauth-callback] telecom resolve failed", (e as Error).message);
      }

      // Consume the state row.
      await admin.from("planipret_maestro_oauth_states").delete().eq("state", state);

      // Every successful broker authentication immediately refreshes that
      // broker's official Commission Reports data. Run it in the background so
      // a long report history never blocks the OAuth redirect back to the app.
      await queueCommissionSync(userId);
      await queueTasksSync(userId);
    } else {
      await saveIntegrationState(admin, "maestro_oauth", {
        ...exch.data,
        state: state ?? null,
        obtained_at: new Date().toISOString(),
      });
    }

    return j({
      success: true,
      user_bound: !!userId,
      has_refresh: !!exch.data.refresh_token,
      expires_in: exch.data.expires_in ?? null,
      maestro_broker_id: resolvedBrokerId,
      matched_by: resolvedBy,
      maestro_telecom_user_id: telecomUserId,
      telecom_matched_by: telecomMatchedBy,
    });
  } catch (e) {
    console.error("[maestro-oauth-callback]", e);
    return j({ success: false, error: (e as Error).message });
  }
});
