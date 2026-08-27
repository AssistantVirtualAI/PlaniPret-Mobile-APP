import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const PORTALS = new Set(["admin", "broker", "unknown"]);
const OUTCOMES = new Set(["success", "failure"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const portal = PORTALS.has(String(body?.portal)) ? String(body.portal) : "unknown";
    const outcome = OUTCOMES.has(String(body?.outcome)) ? String(body.outcome) : "failure";
    const email = typeof body?.email === "string" ? body.email.slice(0, 255).toLowerCase() : null;
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;
    const path = typeof body?.path === "string" ? body.path.slice(0, 300) : null;
    const provider = typeof body?.provider === "string" ? body.provider.slice(0, 50) : "microsoft";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Resolve the user id from the caller's bearer token when present.
    let userId: string | null = null;
    const auth = req.headers.get("Authorization") ?? "";
    if (auth.startsWith("Bearer ")) {
      const { data } = await admin.auth.getUser(auth.slice(7));
      userId = data?.user?.id ?? null;
    }

    const { error } = await admin.from("planipret_portal_login_audit").insert({
      email,
      user_id: userId,
      portal,
      outcome,
      reason,
      provider,
      path,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
      metadata: typeof body?.metadata === "object" && body.metadata ? body.metadata : {},
    });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pp-portal-login-audit failed", e);
    return new Response(JSON.stringify({ success: false, error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
