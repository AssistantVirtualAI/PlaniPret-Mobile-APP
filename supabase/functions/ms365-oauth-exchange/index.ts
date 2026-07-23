import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, microsoftOAuthErrorMessage, readMs365Config, requestMicrosoftToken } from "../_shared/ms365.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub;
    if (!userId) return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { code, redirect_uri, code_verifier } = await req.json();
    if (!code || !redirect_uri) return new Response(JSON.stringify({ success: false, error: "missing code/redirect_uri" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const cfg = await readMs365Config(admin);
    if (!cfg.clientId) return new Response(JSON.stringify({ success: false, error: "MS365 non configuré côté admin" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const requestedScope = MS365_DELEGATED_SCOPES;
    const tokenParams: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri, scope: requestedScope };
    if (code_verifier) tokenParams.code_verifier = String(code_verifier);
    console.log("[ms365-oauth-exchange] token request", { tenant: cfg.tenant, redirect_uri, clientId: cfg.clientId?.slice(0, 8), mode: cfg.authMode, pkce: !!code_verifier });
    const token = await requestMicrosoftToken(cfg, tokenParams, { preferPublic: cfg.authMode === "public" || (cfg.authMode === "auto" && !!code_verifier) });
    const d = token.data;
    if (!token.ok) {
      console.error("[ms365-oauth-exchange] MS token error", token.status, JSON.stringify(d));
      return new Response(JSON.stringify({ success: false, error: microsoftOAuthErrorMessage(d), details: d, auth_mode: token.usedClientSecret ? "confidential" : "public", retried_public: token.retriedPublic }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const meRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${d.access_token}` },
    });
    const me = await meRes.json().catch(() => ({}));

    const msEmail = me?.mail ?? me?.userPrincipalName ?? null;

    // Auto-link Maestro Telecom user by email (best-effort, non-blocking).
    let maestroLink: { user_id?: string; email?: string } | null = null;
    if (msEmail) {
      try {
        const linkRes = await admin.functions.invoke("maestro-actions", {
          body: { action: "find_user_by_email", payload: { email: msEmail } },
        });
        const u = (linkRes.data as any)?.user;
        if (u?.id) maestroLink = { user_id: String(u.id), email: u.email ?? msEmail };
      } catch (e) {
        console.warn("[ms365-oauth-exchange] maestro link failed", (e as any)?.message);
      }
    }

    await admin.from("planipret_profiles").update({
      ms365_access_token: d.access_token,
      ms365_refresh_token: d.refresh_token,
      ms365_scopes: d.scope ?? requestedScope,
      ms365_token_expiry: new Date(Date.now() + Number(d.expires_in ?? 3600) * 1000).toISOString(),
      ms365_email: msEmail,
      ...(maestroLink ? {
        maestro_telecom_user_id: maestroLink.user_id,
        maestro_telecom_email: maestroLink.email,
        maestro_telecom_linked_at: new Date().toISOString(),
      } : {}),
    }).eq("user_id", userId);
    return new Response(JSON.stringify({ success: true, ms_access_token: d.access_token, account: { email: msEmail, name: me?.displayName ?? null }, scopes: d.scope ?? requestedScope, auth_mode: token.usedClientSecret ? "confidential" : "public", retried_public: token.retriedPublic, maestro_link: maestroLink }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[ms365-oauth-exchange] unhandled", e?.message, e?.stack);
    return new Response(JSON.stringify({ success: false, error: e?.message ?? "Erreur" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
