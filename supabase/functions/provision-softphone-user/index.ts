// Provision a new softphone user end-to-end:
// 1) Supabase Auth account
// 2) FusionPBX extension
// 3) pbx_extensions + pbx_softphone_users rows
// 4) Magic link + welcome email (Resend)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const LEMTEL_ORG = "71755d33-ed64-4ad5-a828-61c9d2029eb7";
const SIP_DOMAIN = "lemtel.lemtel.tel";
const WSS_URL = "wss://pbxnode.lemtel.tel:7443";
const DEFAULT_OUTBOUND_CID = "15144942888";

function generatePassword(len = 16) {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

function welcomeHtml(opts: { displayName: string; extension: string; email: string; magicLink: string | null; password?: string | null }) {
  const { displayName, extension, email, magicLink, password } = opts;
  const RELEASE = "https://github.com/AssistantVirtualAI/attach-app-creator/releases/latest/download";
  const downloads = [
    { icon: "📱", title: "iPhone & iPad", note: "Download on the App Store", href: "https://apps.apple.com/" },
    { icon: "🤖", title: "Android", note: "Get it on Google Play", href: "https://play.google.com/" },
    { icon: "🍎", title: "Mac (Apple Silicon)", note: "macOS 11+ · .dmg", href: `${RELEASE}/Lemtel.Telecom-arm64.dmg` },
    { icon: "🍎", title: "Mac (Intel)", note: "macOS 11+ · .dmg", href: `${RELEASE}/Lemtel.Telecom-x64.dmg` },
    { icon: "🪟", title: "Windows", note: "Windows 10+ · 64-bit installer", href: `${RELEASE}/Lemtel.Telecom.Setup.exe` },
    { icon: "🐧", title: "Linux", note: "AppImage — all distributions", href: `${RELEASE}/Lemtel.Telecom.AppImage` },
    { icon: "🌐", title: "All downloads", note: "avastatistic.ca/download", href: "https://avastatistic.ca/download" },
  ];
  return `<!doctype html><html><body style="margin:0;font-family:Inter,Arial,sans-serif;background:#f6f7fb;color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);">
        <tr><td style="background:linear-gradient(135deg,#0023e6,#1d4ed8);padding:28px;color:#fff;text-align:center;">
          <div style="font-size:22px;font-weight:800;letter-spacing:1px;">LEMTEL</div>
          <div style="font-size:11px;letter-spacing:3px;opacity:.8;">COMMUNICATIONS</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:22px;">Welcome to Lemtel Telecom 👋</h1>
          <p style="margin:0 0 20px;color:#475569;">Hi ${displayName}, your AI-powered business phone account is ready. You can now make and receive calls, send SMS, and access AI insights from any device.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px;">
            <tr><td style="padding:6px 0;color:#64748b;">Extension</td><td align="right" style="padding:6px 0;font-weight:600;">${extension}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Email</td><td align="right" style="padding:6px 0;font-weight:600;">${email}</td></tr>
            ${password ? `<tr><td style="padding:6px 0;color:#64748b;">Password</td><td align="right" style="padding:6px 0;font-weight:700;font-family:Fira Code,monospace;background:#fef3c7;border-radius:6px;padding:6px 10px;">${password}</td></tr>` : ""}
            <tr><td style="padding:6px 0;color:#64748b;">SIP Domain</td><td align="right" style="padding:6px 0;font-weight:600;">${SIP_DOMAIN}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Portal</td><td align="right" style="padding:6px 0;font-weight:600;">avastatistic.ca</td></tr>
          </table>
          ${password ? `<p style="margin:14px 0;color:#475569;font-size:13px;">This single password works for the <b>portal</b>, the <b>desktop app</b>, the <b>mobile app</b>, and your <b>desk phone</b>.</p>` : ""}
          ${magicLink ? `<div style="text-align:center;margin:24px 0;">
            <a href="${magicLink}" style="background:#0023e6;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;display:inline-block;">✨ Open Portal →</a>
            <div style="margin-top:8px;color:#94a3b8;font-size:12px;">Link expires in 24 hours</div>
          </div>` : ""}
          <h2 style="font-size:16px;margin:28px 0 12px;">📱 Download Lemtel Telecom</h2>
          ${downloads.map(d => `
            <a href="${d.href}" style="display:block;text-decoration:none;color:inherit;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:8px;">
              <table width="100%"><tr>
                <td width="32" style="font-size:22px;">${d.icon}</td>
                <td><div style="font-weight:600;">${d.title}</div><div style="font-size:12px;color:#64748b;">${d.note}</div></td>
                <td align="right" style="color:#0023e6;font-weight:600;">→</td>
              </tr></table>
            </a>
          `).join("")}
          <h2 style="font-size:16px;margin:28px 0 8px;">✨ How to get started</h2>
          <ol style="color:#475569;padding-left:18px;line-height:1.8;">
            <li>Click <b>Set Your Password</b> above</li>
            <li>Download the app on your device(s)</li>
            <li>Sign in with <b>${email}</b></li>
            <li>Start making calls 📞</li>
          </ol>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f8fafc;color:#94a3b8;font-size:12px;text-align:center;">
          Lemtel Telecom · Powered by AVA AI<br/>
          Need help? <a href="mailto:support@assistantvirtualai.com" style="color:#0023e6;">support@assistantvirtualai.com</a> · (514) 871-2658
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify caller is authenticated and lemtel admin / super admin
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("is_lemtel_admin", { _user_id: caller.id });
    if (!isAdmin) return json({ error: "forbidden", message: "Lemtel admin required" }, 403);

    const body = await req.json().catch(() => ({}));
    const {
      email,
      display_name,
      extension,
      sip_password,
      organization_id = LEMTEL_ORG,
      client_id,
      outbound_caller_id,
      call_group,
      portal_url,
    } = body || {};

    if (!email || !display_name || !extension) {
      return json({ error: "MISSING_FIELDS", required: ["email", "display_name", "extension"] }, 400);
    }
    if (!/^\d{3,11}$/.test(String(extension))) {
      return json({ error: "INVALID_EXTENSION", message: "Extension must be 3–11 digits" }, 400);
    }

    const sipPass = sip_password || generatePassword();

    // STEP 1 — Auth user (create or reuse), and align Supabase Auth password with SIP password
    let authUserId: string;
    let userCreated = false;
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list?.users?.find((u: any) => u.email?.toLowerCase() === String(email).toLowerCase());
    if (existing) {
      authUserId = existing.id;
      // Align portal password to the SIP password (single unified password)
      await admin.auth.admin.updateUserById(authUserId, { password: sipPass });
    } else {
      const { data: created, error: authErr } = await admin.auth.admin.createUser({
        email,
        password: sipPass,
        email_confirm: true,
        user_metadata: { display_name, extension, organization_id, role: "lemtel_user" },
      });
      if (authErr || !created?.user) return json({ error: "AUTH_CREATE_FAILED", details: authErr?.message }, 400);
      authUserId = created.user.id;
      userCreated = true;
    }

    // STEP 2 — FusionPBX extension (best-effort)
    const FUSIONPBX_API_URL = (Deno.env.get("FUSIONPBX_API_URL") || "").replace(/\/+$/, "").replace(/\/app\/api(\/\d+)?$/, "");
    const FUSIONPBX_API_KEY = Deno.env.get("FUSIONPBX_API_KEY");
    const DOMAIN_UUID = Deno.env.get("FUSIONPBX_DOMAIN_UUID");
    let extensionUuid: string | null = null;
    let pbxError: string | null = null;
    if (FUSIONPBX_API_URL && FUSIONPBX_API_KEY && DOMAIN_UUID) {
      try {
        const pbxRes = await fetch(`${FUSIONPBX_API_URL}/app/api/7/extensions`, {
          method: "POST",
          headers: { Authorization: `Basic ${FUSIONPBX_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            extensions: [{
              domain_uuid: DOMAIN_UUID,
              extension: String(extension),
              password: sipPass,
              effective_caller_id_name: display_name,
              effective_caller_id_number: String(extension),
              outbound_caller_id_name: display_name,
              outbound_caller_id_number: outbound_caller_id || DEFAULT_OUTBOUND_CID,
              emergency_caller_id_name: "Lemtel",
              emergency_caller_id_number: "5144942888",
              call_timeout: "30",
              call_group: call_group || "default",
              enabled: "true",
              description: display_name,
              user_context: SIP_DOMAIN,
              accountcode: SIP_DOMAIN,
              limit_max: "5",
              voicemail_enabled: "true",
            }],
          }),
        });
        const text = await pbxRes.text();
        if (pbxRes.ok) {
          try {
            const data = JSON.parse(text);
            extensionUuid = data?.extensions?.[0]?.extension_uuid || data?.data?.extensions?.[0]?.extension_uuid || null;
          } catch { /* ignore parse */ }
        } else {
          pbxError = `${pbxRes.status}: ${text.slice(0, 200)}`;
        }
      } catch (e: any) {
        pbxError = e?.message || String(e);
      }
    }

    // STEP 3 — pbx_extensions
    let extensionRowId: string | null = null;
    {
      const { data: row, error } = await admin
        .from("pbx_extensions")
        .upsert(
          {
            pbx_uuid: extensionUuid,
            organization_id,
            extension: String(extension),
            effective_cid_name: display_name,
            effective_cid_number: String(extension),
            enabled: true,
            description: display_name,
            domain_uuid: DOMAIN_UUID,
            synced_at: new Date().toISOString(),
          },
          { onConflict: extensionUuid ? "organization_id,pbx_uuid" : undefined as any, ignoreDuplicates: false },
        )
        .select("id")
        .single();
      if (!error) extensionRowId = (row as any)?.id ?? null;
    }

    // STEP 4 — pbx_softphone_users
    {
      const { error } = await admin
        .from("pbx_softphone_users")
        .upsert(
          {
            portal_user_id: authUserId,
            organization_id,
            client_id: client_id || null,
            extension_id: extensionRowId,
            extension: String(extension),
            sip_domain: SIP_DOMAIN,
            wss_url: WSS_URL,
            display_name,
            sip_password: sipPass,
            status: "offline",
            device_type: "multi",
            account_status: "active",
          },
          { onConflict: "organization_id,extension" },
        );
      if (error) console.error("softphone upsert failed", error);
    }

    // STEP 5 — Magic link
    let magicLink: string | null = null;
    try {
      const { data: link } = await admin.auth.admin.generateLink({
        type: userCreated ? "invite" : "magiclink",
        email,
        options: { redirectTo: portal_url || "https://avastatistic.ca/reset-password" },
      });
      magicLink = (link as any)?.properties?.action_link || null;
    } catch (e) { console.warn("generateLink failed", e); }

    // STEP 6 — Welcome email (Resend)
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    let emailSent = false; let emailError: string | null = null;
    if (RESEND_API_KEY) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Lemtel Telecom <welcome@lemtel.ca>",
            to: [email],
            subject: `Welcome to Lemtel Telecom — Your extension is ready (Ext. ${extension})`,
            html: welcomeHtml({ displayName: display_name, extension: String(extension), email, magicLink, password: sipPass }),
          }),
        });
        emailSent = res.ok;
        if (!res.ok) emailError = `${res.status}: ${(await res.text()).slice(0, 200)}`;
      } catch (e: any) { emailError = e?.message || String(e); }
    }

    // Audit
    await admin.from("audit_logs").insert({
      organization_id,
      user_id: caller.id,
      action: "softphone_user_provisioned",
      resource_type: "pbx_softphone_users",
      resource_id: String(extension),
      metadata: {
        email, extension: String(extension), display_name,
        auth_user_id: authUserId, extension_uuid: extensionUuid,
        email_sent: emailSent, pbx_error: pbxError, email_error: emailError,
      },
    });

    return json({
      success: true,
      user_id: authUserId,
      extension: String(extension),
      extension_uuid: extensionUuid,
      email_sent: emailSent,
      magic_link: magicLink,
      pbx_error: pbxError,
      email_error: emailError,
      message: `User ${email} provisioned with extension ${extension}`,
    });
  } catch (e: any) {
    console.error("Provision error", e);
    return json({ error: "PROVISION_FAILED", message: e?.message || String(e) }, 500);
  }
});
