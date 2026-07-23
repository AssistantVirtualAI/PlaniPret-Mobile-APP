// Manually link a broker to an NS extension (or unlink). Used by admin review queue
// and as a self-service fallback from the mobile app for unlinked accounts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
const PLANIPRET_ORG_ID = "17d6507f-a9ca-409d-8e49-371d50332615";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function nsGetUser(domain: string, ext: string) {
  const res = await fetch(`${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}`, {
    headers: { Authorization: `Bearer ${NS_API_KEY}`, Accept: "application/json" },
  });
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "not_authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: roleRows } = await admin
    .from("user_roles").select("role,organization_id").eq("user_id", user.id);
  const isAdmin = (roleRows ?? []).some((r: any) =>
    r.role === "super_admin" || (r.role === "org_admin" && r.organization_id === PLANIPRET_ORG_ID)
  );

  const body = await req.json().catch(() => ({}));
  const action: string = body?.action || "link";
  const domain: string = body?.domain || NS_DEFAULT_DOMAIN;

  // ---- Self-service: broker links own account ----
  if (action === "self_link") {
    const extension = String(body?.extension ?? "").trim();
    if (!extension) return json({ error: "extension_required" }, 400);
    const nsUser = await nsGetUser(domain, extension);
    if (!nsUser) return json({ error: "extension_not_found" }, 404);

    // Find caller's profile
    const { data: profile } = await admin
      .from("planipret_profiles").select("id,email,ms365_email")
      .eq("user_id", user.id).maybeSingle();
    if (!profile) return json({ error: "no_profile" }, 404);

    const nsEmail = String(nsUser?.email ?? "").toLowerCase();
    const myEmails = [profile.email, profile.ms365_email, user.email].filter(Boolean).map((s: any) => String(s).toLowerCase());
    if (nsEmail && !myEmails.includes(nsEmail)) {
      return json({ error: "email_mismatch", ns_email: nsEmail }, 403);
    }

    await admin.from("planipret_profiles").update({
      ns_extension: extension,
      ns_domain: domain,
      ns_sip_username: String(nsUser["login-username"] ?? extension),
      ns_linked: true,
      ns_linked_at: new Date().toISOString(),
      ns_link_method: "self_service",
    }).eq("id", profile.id);

    await admin.from("planipret_ns_migration_log").insert({
      broker_id: profile.id, ns_extension: extension, ns_email_from_api: nsEmail || null,
      portal_email: profile.email, match_status: "manually_linked", match_confidence: "manual", reviewed: true,
    });
    return json({ ok: true, linked: true, extension });
  }

  // ---- Admin actions below ----
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  if (action === "link" || action === "confirm") {
    const brokerId: string = body?.broker_id;
    const extension: string = String(body?.extension ?? "").trim();
    if (!brokerId || !extension) return json({ error: "broker_id_and_extension_required" }, 400);
    const nsUser = await nsGetUser(domain, extension);
    if (!nsUser) return json({ error: "extension_not_found" }, 404);

    await admin.from("planipret_profiles").update({
      ns_extension: extension,
      ns_domain: domain,
      ns_sip_username: String(nsUser["login-username"] ?? extension),
      ns_linked: true,
      ns_linked_at: new Date().toISOString(),
      ns_link_method: "manual_admin",
    }).eq("id", brokerId);

    if (body?.log_id) {
      await admin.from("planipret_ns_migration_log").update({
        match_status: "manually_linked", match_confidence: "manual", reviewed: true,
      }).eq("id", body.log_id);
    } else {
      await admin.from("planipret_ns_migration_log").insert({
        broker_id: brokerId, ns_extension: extension,
        ns_email_from_api: String(nsUser?.email ?? "").toLowerCase() || null,
        match_status: "manually_linked", match_confidence: "manual", reviewed: true,
      });
    }
    return json({ ok: true, linked: true, broker_id: brokerId, extension });
  }

  if (action === "reject") {
    if (!body?.log_id) return json({ error: "log_id_required" }, 400);
    await admin.from("planipret_ns_migration_log").update({ reviewed: true, notes: "rejected by admin" }).eq("id", body.log_id);
    return json({ ok: true });
  }

  if (action === "unlink") {
    const brokerId: string = body?.broker_id;
    if (!brokerId) return json({ error: "broker_id_required" }, 400);
    await admin.from("planipret_profiles").update({
      ns_linked: false, ns_linked_at: null, ns_link_method: null,
      ns_sip_password_ref: null,
    }).eq("id", brokerId);
    return json({ ok: true, unlinked: true });
  }

  return json({ error: "unknown_action" }, 400);
});
