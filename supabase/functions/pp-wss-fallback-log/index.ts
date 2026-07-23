// Logs WSS fallback events between SIP endpoints into planipret_audit_log.
// Authenticates the caller via their JWT and writes with service-role.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return json({ error: "unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);
    const { data: lemtelOnly } = await userClient.rpc("is_lemtel_only", { _user_id: userRes.user.id });
    if (lemtelOnly === true) return json({ error: "forbidden_wrong_app", app: "lemtel" }, 403);

    const body = await req.json().catch(() => ({}));
    const primary = String(body.primary_url ?? "");
    const fallback = String(body.fallback_url ?? "");
    const primaryReason = body.primary_reason ?? null;
    const results = Array.isArray(body.results) ? body.results : [];

    const admin = createClient(url, svc);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = req.headers.get("user-agent") ?? null;

    const { error } = await admin.from("planipret_audit_log").insert({
      user_id: userRes.user.id,
      admin_id: null,
      action: "WSS_FALLBACK",
      resource_type: "softphone",
      resource_id: null,
      ip_address: ip,
      user_agent: ua,
      metadata: {
        primary_url: primary,
        fallback_url: fallback,
        primary_reason: primaryReason,
        results,
        at: new Date().toISOString(),
        user_email: userRes.user.email ?? null,
      },
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
