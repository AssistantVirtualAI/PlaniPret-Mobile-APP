// Invite a user as org_admin to a tenant org. Lemtel/super admin only.
// Body: { organizationId, email, fullName? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { organizationId, email, fullName, role: roleInput } = await req.json();
    if (!organizationId || !email) {
      return new Response(JSON.stringify({ error: "organizationId and email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const role = roleInput === 'manager' ? 'manager' : 'org_admin';

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // verify caller is super_admin or lemtel_admin
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await caller.auth.getUser();
    const callerId = userData?.user?.id;
    if (!callerId) {
      return new Response(JSON.stringify({ error: "not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: callerId });
    const { data: isLemtel } = await admin.rpc("is_lemtel_admin", { _user_id: callerId });
    if (!isSuper && !isLemtel) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ensure auth user exists; invite if missing
    let targetId: string | null = null;
    let inviteUrl: string | null = null;
    const { data: existing } = await admin.from("profiles").select("id").eq("email", String(email).toLowerCase()).maybeSingle();
    if (existing?.id) {
      targetId = existing.id;
    } else {
      const redirectTo = `${req.headers.get("origin") || ""}/auth`;
      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: fullName ? { full_name: fullName } : undefined,
      });
      if (invErr) {
        return new Response(JSON.stringify({ error: invErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetId = invited?.user?.id ?? null;
      inviteUrl = (invited as any)?.properties?.action_link ?? null;
    }
    if (!targetId) {
      return new Response(JSON.stringify({ error: "could not resolve user" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("organization_members").upsert(
      { user_id: targetId, organization_id: organizationId, accepted_at: new Date().toISOString() },
      { onConflict: "user_id,organization_id" },
    );
    await admin.from("user_roles").upsert(
      { user_id: targetId, organization_id: organizationId, role },
      { onConflict: "user_id,organization_id,role" },
    );

    // ---------- Welcome email via Resend ----------
    let emailSent = false;
    let emailError: string | null = null;
    try {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey) {
        const { data: org } = await admin
          .from("organizations")
          .select("name, slug")
          .eq("id", organizationId)
          .maybeSingle();
        const slug = (org as any)?.slug || organizationId;
        const orgName = (org as any)?.name || "your workspace";
        const firstName = (fullName || String(email).split("@")[0] || "").split(" ")[0];
        const portalUrl = `https://avastatistic.ca/domain/${slug}/admin`;
        const html = `
          <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a">
            <h1 style="color:#0023e6;margin-bottom:8px">Bonjour ${firstName || ""},</h1>
            <p>Votre portail téléphonique <strong>${orgName}</strong> est maintenant activé.</p>
            <p><strong>Accès portail :</strong> <a href="${portalUrl}" style="color:#0023e6">${portalUrl}</a></p>
            <p><strong>Email :</strong> ${email}</p>
            ${inviteUrl ? `<p><strong>Premier accès :</strong> <a href="${inviteUrl}" style="color:#0023e6">Confirmer mon compte et définir mon mot de passe</a></p>` : ""}
            <h3 style="margin-top:24px">Prochaines étapes</h3>
            <ol>
              <li>Connectez-vous au portail</li>
              <li>Ajoutez vos extensions téléphoniques</li>
              <li>Configurez votre IVR (menu téléphonique)</li>
              <li>Téléchargez l'application softphone</li>
            </ol>
            <p style="color:#64748b;font-size:13px;margin-top:24px">
              Support : <a href="mailto:support@ava-telecom.ca" style="color:#0023e6">support@ava-telecom.ca</a>
            </p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
            <p style="color:#94a3b8;font-size:12px">Lemtel Communications — Propulsé par AVA Statistic</p>
          </div>
        `;
        const sendFrom = async (from: string) =>
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from, to: [email],
              subject: "Votre portail téléphonique Lemtel est prêt 🎉",
              html,
            }),
          });
        let r = await sendFrom("Lemtel Communications <noreply@ava-telecom.ca>");
        if (!r.ok && (r.status === 403 || r.status === 422)) {
          // Fallback domain if ava-telecom.ca isn't verified yet
          r = await sendFrom("Lemtel Communications <noreply@assistantvirtualai.com>");
        }
        if (r.ok) {
          emailSent = true;
        } else {
          emailError = `resend_${r.status}:${(await r.text()).slice(0, 200)}`;
        }
      } else {
        emailError = "RESEND_API_KEY not configured";
      }
    } catch (e) {
      emailError = (e as Error).message;
    }

    return new Response(JSON.stringify({
      ok: true, user_id: targetId, role, invite_url: inviteUrl,
      email_sent: emailSent, email_error: emailError,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
