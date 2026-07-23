// Service-role only audit logger. Frontend cannot reach this directly.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Require service-role bearer to use this endpoint
  const auth = req.headers.get("Authorization") ?? "";
  const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (auth !== expected) return json({ success: false, error: "forbidden" }, 403);

  try {
    const body = await req.json();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = req.headers.get("user-agent") ?? null;
    const { error } = await admin.from("planipret_audit_log").insert({
      user_id: body.user_id ?? null,
      admin_id: body.admin_id ?? null,
      action: body.action,
      resource_type: body.resource_type ?? null,
      resource_id: body.resource_id ?? null,
      ip_address: body.ip_address ?? ip,
      user_agent: body.user_agent ?? ua,
      metadata: body.metadata ?? {},
    });
    if (error) return json({ success: false, error: error.message }, 500);
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
