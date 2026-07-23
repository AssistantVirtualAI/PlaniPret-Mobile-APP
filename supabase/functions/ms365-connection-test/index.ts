// Live Microsoft 365 connection test using app-only OAuth2 (client_credentials).
// Returns { summary, results } with 5 sub-tests. CORS enabled.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const adminUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let saved: Record<string, string> = {};
  if (adminUrl && serviceRole) {
    try {
      const { createClient } = await import("npm:@supabase/supabase-js@2");
      const admin = createClient(adminUrl, serviceRole);
      const [{ data: secret }, { data: cfg }] = await Promise.all([
        admin.from("planipret_integration_secrets").select("config").in("provider", ["microsoft", "ms365"]).limit(1).maybeSingle(),
        admin.from("planipret_integration_config").select("config_data").eq("integration_key", "ms365").maybeSingle(),
      ]);
      saved = { ...((cfg?.config_data ?? {}) as Record<string, string>), ...((secret?.config ?? {}) as Record<string, string>) };
    } catch (e) { console.error("ms365 config read failed", e); }
  }
  const TENANT_ID = saved.tenant_id ?? Deno.env.get("MICROSOFT_TENANT_ID") ?? "";
  const CLIENT_ID = saved.client_id ?? saved.client_secret_id ?? Deno.env.get("MICROSOFT_CLIENT_ID") ?? "";
  const CLIENT_SECRET = saved.client_secret ?? Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? "";
  const AUTH_MODE = String(saved.auth_mode ?? saved.client_type ?? (saved.public_client === "true" ? "public" : "auto")).toLowerCase();

  const results: Record<string, any> = {};

  if (!TENANT_ID || !CLIENT_ID || (!CLIENT_SECRET && AUTH_MODE === "confidential")) {
    return new Response(
      JSON.stringify({
        summary: {
          total_tests: 0,
          passed: 0,
          failed: 1,
          tested_at: new Date().toISOString(),
          elapsed_ms: Date.now() - startedAt,
          tenant_id: TENANT_ID || null,
          client_id: CLIENT_ID ? CLIENT_ID.substring(0, 8) + "..." : null,
        },
        results: {
          config: {
            success: false,
            message: "❌ Secrets manquants",
            missing: [
              !TENANT_ID && "MICROSOFT_TENANT_ID",
              !CLIENT_ID && "MICROSOFT_CLIENT_ID",
              !CLIENT_SECRET && AUTH_MODE === "confidential" && "MICROSOFT_CLIENT_SECRET",
            ].filter(Boolean),
          },
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let appToken = "";

  // TEST 1 — app-only token (only for confidential Microsoft apps)
  if (!CLIENT_SECRET) {
    results.auth = {
      success: true,
      informational: true,
      auth_mode: "public",
      message: "ℹ️ App Microsoft publique détectée — aucun client secret envoyé; les tests réels passent par le token utilisateur.",
    };
  } else try {
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          scope: "https://graph.microsoft.com/.default",
        }),
      },
    );
    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
      appToken = tokenData.access_token;
      results.auth = {
        success: true,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        message: `✅ Token obtenu — expire dans ${tokenData.expires_in}s`,
      };
    } else {
      results.auth = {
        success: false,
        error: tokenData.error,
        error_description: tokenData.error_description,
        message: `❌ Échec auth: ${tokenData.error_description ?? tokenData.error ?? "inconnu"}`,
      };
    }
  } catch (e) {
    results.auth = {
      success: false,
      error: String(e),
      message: `❌ Erreur réseau: ${String(e)}`,
    };
  }

  if (appToken) {
    // Helper: mark 403/InsufficientPrivileges as informational (not a real error)
    const mkAdminResult = (r: Response, d: any, extra: Record<string, unknown>, required: string, okMsg: string, recNoAccess: string) => {
      const err = d?.error?.code ?? d?.error?.message ?? "";
      const forbidden = r.status === 403 || /Insufficient|Authorization_RequestDenied/i.test(String(err));
      if (r.ok) return { success: true, category: "admin_directory", informational: true, required, ...extra, message: okMsg };
      if (forbidden) return {
        success: true, // informational: not a failure
        category: "admin_directory",
        informational: true,
        degraded: "app_permission_missing",
        required,
        message: "ℹ️ Diagnostic annuaire non disponible (permission Application non accordée)",
        recommendation: "Sans impact sur Mail/Calendar/Teams. Ajoutez la permission Application dans Azure uniquement si vous voulez ce diagnostic.",
      };
      return { success: false, category: "admin_directory", informational: true, required, message: `⚠️ ${d?.error?.message ?? "erreur"}`, recommendation: recNoAccess };
    };

    // TEST 2 — organization (informational)
    try {
      const r = await fetch("https://graph.microsoft.com/v1.0/organization", { headers: { Authorization: `Bearer ${appToken}` } });
      const d = await r.json();
      const org = d.value?.[0];
      results.organization = mkAdminResult(r, d, {
        display_name: org?.displayName, tenant_id: org?.id, country: org?.countryLetterCode,
        verified_domains: org?.verifiedDomains?.map((v: any) => v.name),
      }, "Organization.Read.All (Application)", `✅ Organisation: ${org?.displayName}`, "Diagnostic annuaire uniquement.");
    } catch (e) {
      results.organization = { success: false, informational: true, category: "admin_directory", error: String(e), message: `❌ ${String(e)}` };
    }

    // TEST 3 — users (informational)
    try {
      const r = await fetch("https://graph.microsoft.com/v1.0/users?$top=5&$select=displayName,mail,userPrincipalName", { headers: { Authorization: `Bearer ${appToken}` } });
      const d = await r.json();
      results.users = mkAdminResult(r, d, {
        count: d.value?.length ?? 0,
        sample: d.value?.map((u: any) => ({ name: u.displayName, email: u.mail || u.userPrincipalName })),
      }, "User.Read.All (Application)", `✅ ${d.value?.length ?? 0} utilisateurs`, "Diagnostic annuaire uniquement.");
    } catch (e) {
      results.users = { success: false, informational: true, category: "admin_directory", error: String(e), message: `❌ ${String(e)}` };
    }

    // TEST 4 — app registration (informational)
    try {
      const r = await fetch(`https://graph.microsoft.com/v1.0/applications?$filter=appId eq '${CLIENT_ID}'&$select=displayName,web,spa,publicClient`, { headers: { Authorization: `Bearer ${appToken}` } });
      const d = await r.json();
      const app = d.value?.[0];
      results.app_registration = mkAdminResult(r, d, {
        app_name: app?.displayName,
        redirect_uris_web: app?.web?.redirectUris ?? [],
        redirect_uris_spa: app?.spa?.redirectUris ?? [],
        redirect_uris_public: app?.publicClient?.redirectUris ?? [],
      }, "Application.Read.All (Application)", app ? `✅ App: ${app.displayName}` : "ℹ️ App non listable", "Diagnostic Azure App Registration uniquement.");
    } catch (e) {
      results.app_registration = { success: false, informational: true, category: "admin_directory", error: String(e), message: `❌ ${String(e)}` };
    }

    // TEST 5 — service principal (informational)
    try {
      const r = await fetch(`https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${CLIENT_ID}'&$select=displayName,appRoles`, { headers: { Authorization: `Bearer ${appToken}` } });
      const d = await r.json();
      results.permissions = mkAdminResult(r, d, {
        service_principal: d.value?.[0]?.displayName,
        app_roles_count: d.value?.[0]?.appRoles?.length ?? 0,
      }, "Application.Read.All (Application)", "✅ Permissions vérifiées", "Diagnostic Azure uniquement.");
    } catch (e) {
      results.permissions = { success: false, informational: true, category: "admin_directory", error: String(e), message: `❌ ${String(e)}` };
    }
  }

  // TEST 6 — Delegated user capability check (real product truth)
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ") && adminUrl && serviceRole) {
      const { createClient } = await import("npm:@supabase/supabase-js@2");
      const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const admin = createClient(adminUrl, serviceRole);
      const userClient = createClient(adminUrl, anon, { global: { headers: { Authorization: authHeader } } });
      const { data: u } = await userClient.auth.getUser();
      const uid = u?.user?.id;
      if (uid) {
        const { data: profile } = await admin.from("planipret_profiles").select("ms365_access_token").eq("user_id", uid).maybeSingle();
        const tok = profile?.ms365_access_token;
        if (tok) {
          const call = async (p: string) => {
            const r = await fetch(`https://graph.microsoft.com/v1.0${p}`, { headers: { Authorization: `Bearer ${tok}` } });
            const d = await r.json().catch(() => ({}));
            return { ok: r.ok, status: r.status, msg: r.ok ? "OK" : (d?.error?.message ?? `HTTP ${r.status}`) };
          };
          const [me, mail, cal, chat] = await Promise.all([call("/me?$select=displayName,mail"), call("/me/messages?$top=1&$select=id"), call("/me/events?$top=1&$select=id"), call("/me/chats?$top=1")]);
          const okAll = me.ok && mail.ok && cal.ok && chat.ok;
          results.delegated = {
            success: okAll, informational: false, category: "delegated",
            checks: { profile: me, mail, calendar: cal, teams: chat },
            message: okAll ? "✅ Capacités utilisateur (Mail/Calendar/Teams) opérationnelles" : `⚠️ Certaines capacités utilisateur échouent`,
          };
        } else {
          results.delegated = {
            success: true,
            informational: true,
            category: "delegated",
            degraded: "delegated_not_connected",
            message: "ℹ️ Aucun token utilisateur — mode application Microsoft actif pour l’admin AVA",
          };
        }
      }
    }
  } catch (e) {
    results.delegated = { success: false, category: "delegated", message: `❌ ${String(e)}` };
  }

  const nonInfo = Object.values(results).filter((r: any) => !r.informational);
  const delegatedPresent = !!results.delegated && !results.delegated?.degraded;
  const corePassed = !!results.auth?.success && (AUTH_MODE !== "public" || delegatedPresent);
  const summary = {
    total_tests: Object.keys(results).length,
    passed: Object.values(results).filter((r: any) => r.success).length,
    failed: Object.values(results).filter((r: any) => !r.success && !r.informational).length,
    core_passed: corePassed,
    admin_directory_failed: 0, // no longer surfaced as failures
    admin_directory_informational: Object.values(results).filter((r: any) => r.category === "admin_directory").length,
    delegated_ok: results.delegated?.degraded ? false : !!results.delegated?.success,
    status: corePassed ? (results.delegated?.success && !results.delegated?.degraded ? "fully_connected" : "core_connected") : "not_connected",
    tested_at: new Date().toISOString(),
    elapsed_ms: Date.now() - startedAt,
    tenant_id: TENANT_ID,
    client_id: CLIENT_ID.substring(0, 8) + "...",
    auth_mode: AUTH_MODE === "public" || !CLIENT_SECRET ? "public" : "confidential",
  };

  return new Response(JSON.stringify({ summary, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
