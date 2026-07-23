// Universal extension sign-in: any extension that has desktop/mobile app access
// enabled can authenticate using its SIP password. If no Supabase auth user is
// linked yet (portal_user_id IS NULL) we auto-provision one and link it.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: { extension?: string; password?: string; sip_domain?: string; platform?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const extension = String(payload.extension || "").trim();
  const password = String(payload.password || "");
  const sipDomain = String(payload.sip_domain || "").trim().toLowerCase();
  const platform = (payload.platform || "desktop").toLowerCase();

  if (!extension || !password) return json({ error: "extension_and_password_required" }, 400);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Lookup softphone row(s) for this extension.
  let q = admin
    .from("pbx_softphone_users")
    .select("id, organization_id, extension, sip_domain, display_name, wss_url, sip_password, portal_user_id, app_access_enabled, desktop_access_enabled, mobile_access_enabled")
    .eq("extension", extension);
  if (sipDomain) q = q.eq("sip_domain", sipDomain);

  const { data: rows, error: lookupErr } = await q.limit(2);
  if (lookupErr) return json({ error: "lookup_failed", detail: lookupErr.message }, 500);
  if (!rows || rows.length === 0) return json({ error: "extension_not_found" }, 404);
  if (rows.length > 1 && !sipDomain) {
    return json({ error: "ambiguous_extension", hint: "provide sip_domain" }, 409);
  }
  const row = rows[0];

  // 2. Gate on app access.
  if (row.app_access_enabled === false) return json({ error: "app_access_disabled" }, 403);
  if (platform === "desktop" && row.desktop_access_enabled === false) return json({ error: "desktop_access_disabled" }, 403);
  if (platform === "mobile" && row.mobile_access_enabled === false) return json({ error: "mobile_access_disabled" }, 403);

  // 3. Verify password against sip_password.
  if (!row.sip_password) return json({ error: "no_password_set" }, 403);
  if (!constantTimeEqual(password, String(row.sip_password))) return json({ error: "invalid_credentials" }, 401);

  // 4. Auto-provision auth user if needed.
  let userId = row.portal_user_id as string | null;
  const safeDomain = (row.sip_domain || sipDomain || "lemtel.tel").replace(/[^a-z0-9.\-]/gi, "");
  const provisionedEmail = `ext-${extension}@${safeDomain}`.toLowerCase();
  // Generate a deterministic-but-strong password we control so we can mint a session via signInWithPassword.
  // It's never returned to the client and is rotated on every login.
  // Must stay <= 72 chars (Supabase Auth / bcrypt limit)
  const sessionPassword = `lem-${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`.slice(0, 64);

  if (!userId) {
    // Try to find an existing auth user matching the provisioned email first (idempotent).
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", provisionedEmail)
      .maybeSingle();

    if (existingProfile?.id) {
      userId = existingProfile.id;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: provisionedEmail,
        password: sessionPassword,
        email_confirm: true,
        user_metadata: { full_name: row.display_name || `Ext ${extension}`, auto_provisioned: true, extension },
      });
      if (createErr || !created?.user) {
        return json({ error: "provision_failed", detail: createErr?.message }, 500);
      }
      userId = created.user.id;
    }

    // Link softphone row.
    const { error: linkErr } = await admin
      .from("pbx_softphone_users")
      .update({ portal_user_id: userId, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (linkErr) return json({ error: "link_failed", detail: linkErr.message }, 500);

    // Ensure organization membership.
    await admin.from("organization_members").upsert(
      { user_id: userId, organization_id: row.organization_id, accepted_at: new Date().toISOString() },
      { onConflict: "user_id,organization_id" },
    );
  }

  // 5. Rotate this user's password to one we control, then mint a session via password grant.
  const { error: pwErr } = await admin.auth.admin.updateUserById(userId!, { password: sessionPassword });
  if (pwErr) return json({ error: "session_prep_failed", detail: pwErr.message }, 500);

  // Look up the email tied to this auth user (could be the provisioned one or an admin-set one).
  const { data: userInfo } = await admin.auth.admin.getUserById(userId!);
  const loginEmail = userInfo?.user?.email || provisionedEmail;

  const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signin, error: signinErr } = await anonClient.auth.signInWithPassword({
    email: loginEmail,
    password: sessionPassword,
  });
  if (signinErr || !signin?.session) {
    return json({ error: "signin_failed", detail: signinErr?.message }, 500);
  }

  // 6. Audit + return.
  try {
    await admin.from("audit_logs").insert({
      organization_id: row.organization_id,
      user_id: userId,
      action: "extension_signin",
      resource_type: "pbx_softphone_users",
      resource_id: row.id,
      metadata: { extension, platform, sip_domain: row.sip_domain },
    });
  } catch { /* noop */ }

  return json({
    access_token: signin.session.access_token,
    refresh_token: signin.session.refresh_token,
    user_id: userId,
    email: loginEmail,
    extension: row.extension,
    display_name: row.display_name,
    sip_domain: row.sip_domain,
    wss_url: row.wss_url,
    organization_id: row.organization_id,
  });
});
