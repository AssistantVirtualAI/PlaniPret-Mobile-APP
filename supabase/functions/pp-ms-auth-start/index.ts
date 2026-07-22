// pp-ms-auth-start
// Returns the Microsoft OAuth start configuration used by the Planiprêt
// mobile / web PKCE login flow. Kept as a thin, GitHub-versioned wrapper
// around the shared MS365 config so the auth entrypoint has a stable name.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, readMs365Config } from "../_shared/ms365.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const cfg = await readMs365Config(admin);

    return json({
      configured: Boolean(cfg.clientId),
      client_id: cfg.clientId || null,
      tenant_id: cfg.tenant || "common",
      auth_mode: cfg.authMode,
      scopes: MS365_DELEGATED_SCOPES,
      authorize_endpoint: `https://login.microsoftonline.com/${cfg.tenant || "common"}/oauth2/v2.0/authorize`,
      redirect_uris: {
        web: ["/auth/microsoft/callback", "/auth/ms365/callback"],
        native: ["capacitor://localhost/auth/microsoft/callback"],
      },
    });
  } catch (error) {
    return json(
      { configured: false, error: String((error as Error)?.message ?? error) },
      500,
    );
  }
});
