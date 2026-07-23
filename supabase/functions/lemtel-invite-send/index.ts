// Send a branded Lemtel softphone invitation email with a secure setup link.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://avastatistic.ca";

function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let s = btoa(String.fromCharCode(...arr));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function inviteHtml(opts: { displayName: string; extension: string; email: string; setupUrl: string }) {
  const { displayName, extension, email, setupUrl } = opts;
  return `<!doctype html><html><body style="margin:0;font-family:-apple-system,Inter,Segoe UI,Arial,sans-serif;background:#f4f6fb;color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 12px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 32px rgba(15,23,42,.08);">
        <tr><td style="padding:36px 32px 20px;text-align:center;border-bottom:1px solid #eef1f7;">
          <img src="${APP_ORIGIN}/lemtel-logo.png" alt="Lemtel" width="120" style="display:block;margin:0 auto 6px;" />
          <div style="font-size:11px;letter-spacing:3px;color:#64748b;font-weight:600;">UNIFIED COMMUNICATIONS</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:-0.02em;">Welcome to Lemtel, ${displayName} 👋</h1>
          <p style="margin:0 0 24px;color:#475569;line-height:1.55;font-size:15px;">Your softphone account is ready. Click below to view your login credentials, scan the setup QR code, and download the Lemtel app on any device.</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;padding:18px;margin:0 0 24px;">
            <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Extension</td><td align="right" style="padding:6px 0;font-weight:700;font-family:ui-monospace,SF Mono,monospace;">${extension}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Email</td><td align="right" style="padding:6px 0;font-weight:600;">${email}</td></tr>
          </table>

          <div style="text-align:center;margin:24px 0 12px;">
            <a href="${setupUrl}" style="background:linear-gradient(135deg,#0023e6,#1d4ed8);color:#fff;text-decoration:none;padding:16px 32px;border-radius:12px;font-weight:600;display:inline-block;font-size:15px;box-shadow:0 6px 16px rgba(0,35,230,.25);">View my login credentials →</a>
            <div style="margin-top:10px;color:#94a3b8;font-size:12px;">Secure link · expires in 7 days</div>
          </div>

          <h2 style="font-size:14px;margin:32px 0 12px;color:#0f172a;font-weight:600;text-transform:uppercase;letter-spacing:1px;">📱 Download the app</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="50%" style="padding:4px;"><a href="https://apps.apple.com/" style="display:block;background:#0f172a;color:#fff;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:600;font-size:13px;">  iOS App Store</a></td>
              <td width="50%" style="padding:4px;"><a href="https://play.google.com/" style="display:block;background:#0f172a;color:#fff;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:600;font-size:13px;">▶ Google Play</a></td>
            </tr>
            <tr>
              <td style="padding:4px;"><a href="${APP_ORIGIN}/download" style="display:block;background:#ffffff;color:#0f172a;text-decoration:none;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center;font-weight:600;font-size:13px;">🖥 Mac OS</a></td>
              <td style="padding:4px;"><a href="${APP_ORIGIN}/download" style="display:block;background:#ffffff;color:#0f172a;text-decoration:none;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center;font-weight:600;font-size:13px;">🪟 Windows</a></td>
            </tr>
          </table>

          <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;text-align:center;">Need help? <a href="mailto:support@assistantvirtualai.com" style="color:#0023e6;text-decoration:none;">support@assistantvirtualai.com</a></p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f8fafc;color:#94a3b8;font-size:11px;text-align:center;border-top:1px solid #eef1f7;">
          © Lemtel Communications · Powered by AVA AI
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Authn
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "UNAUTHENTICATED" }, 401);

    const { data: canGrant } = await admin.rpc("lemtel_can_grant_app_access", { _uid: user.id });
    if (!canGrant) return json({ error: "FORBIDDEN" }, 403);

    const body = await req.json().catch(() => ({}));
    const { softphone_user_id, ttl_hours } = body || {};
    if (!softphone_user_id) return json({ error: "MISSING_SOFTPHONE_ID" }, 400);
    const ttl = Math.max(1, Math.min(Number(ttl_hours) || 168, 720)); // 1h..30d, default 7d

    // Load softphone user + email
    const { data: spu, error: spuErr } = await admin
      .from("pbx_softphone_users")
      .select("id, organization_id, extension, display_name, portal_user_id")
      .eq("id", softphone_user_id)
      .maybeSingle();
    if (spuErr || !spu) return json({ error: "SOFTPHONE_NOT_FOUND" }, 404);

    let email = "";
    if (spu.portal_user_id) {
      const { data: prof } = await admin.from("profiles").select("email").eq("id", spu.portal_user_id).maybeSingle();
      email = prof?.email || "";
    }
    if (!email && spu.display_name?.includes("@")) {
      const m = spu.display_name.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      if (m) email = m[0];
    }
    if (!email) return json({ error: "NO_EMAIL_FOR_USER" }, 400);

    // Revoke any previous active invite for this user (one-active rule)
    await admin.from("lemtel_softphone_invites")
      .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
      .eq("softphone_user_id", spu.id)
      .is("revoked_at", null)
      .is("consumed_at", null);

    // Create invite token
    const token = randomToken(32);
    const expires_at = new Date(Date.now() + ttl * 3600_000).toISOString();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = req.headers.get("user-agent") || null;

    const { data: invite, error: invErr } = await admin
      .from("lemtel_softphone_invites")
      .insert({
        token,
        softphone_user_id: spu.id,
        organization_id: spu.organization_id,
        email,
        created_by: user.id,
        expires_at,
        ip_address: ip,
        user_agent: ua,
      })
      .select("id, token, expires_at")
      .single();
    if (invErr) return json({ error: "INVITE_CREATE_FAILED", detail: invErr.message }, 500);

    const setupUrl = `${APP_ORIGIN}/lemtel/redeem/${token}`;

    // Send via Resend
    let emailSent = false; let emailError: string | null = null;
    if (RESEND_API_KEY) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Lemtel <noreply@avastatistic.ca>",
            to: [email],
            subject: `Welcome to Lemtel — your softphone is ready`,
            html: inviteHtml({ displayName: spu.display_name || "there", extension: spu.extension, email, setupUrl }),
          }),
        });
        emailSent = res.ok;
        if (!res.ok) emailError = (await res.text()).slice(0, 500);
      } catch (e: any) { emailError = (e?.message || String(e)).slice(0, 500); }
    } else {
      emailError = "RESEND_API_KEY missing — invite link created but no email sent";
    }

    // Persist delivery audit
    await admin.from("lemtel_softphone_invites")
      .update({ email_sent: emailSent, email_error: emailError })
      .eq("id", invite.id);

    return json({
      ok: true,
      invite_id: invite.id,
      invite_url: setupUrl,
      expires_at: invite.expires_at,
      email,
      email_sent: emailSent,
      email_error: emailError,
    });
  } catch (e: any) {
    return json({ error: "INTERNAL", detail: e?.message || String(e) }, 500);
  }
});
