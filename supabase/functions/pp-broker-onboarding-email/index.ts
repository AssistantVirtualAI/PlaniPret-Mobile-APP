// Send bulk onboarding emails to linked Planiprêt brokers explaining the new login flow.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLANIPRET_ORG_ID = "17d6507f-a9ca-409d-8e49-371d50332615";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function buildHtml(opts: { firstName: string; loginEmail: string; extension: string; tempPassword?: string }): string {
  const { firstName, loginEmail, extension, tempPassword } = opts;
  const pwBlock = tempPassword
    ? `<p>Mot de passe temporaire&nbsp;: <strong style="font-family:monospace">${tempPassword}</strong></p>`
    : `<p>Mot de passe&nbsp;: utilisez celui que vous avez déjà configuré, ou cliquez sur «&nbsp;Mot de passe oublié&nbsp;» dans l'app.</p>`;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1A2540">
<h2 style="color:#1A4A8A">Bonjour ${firstName || ""},</h2>
<p>Vous pouvez maintenant vous connecter à l'application mobile Planiprêt directement avec votre courriel professionnel — plus besoin de votre extension&nbsp;!</p>
<h3 style="color:#1A4A8A;margin-top:24px">🔵 Option 1 — Connexion Microsoft (recommandé)</h3>
<p>Connectez-vous avec votre compte Microsoft habituel.</p>
<h3 style="color:#1A4A8A;margin-top:24px">📧 Option 2 — Courriel + mot de passe</h3>
<p>Courriel&nbsp;: <strong>${loginEmail}</strong></p>
${pwBlock}
<p style="margin-top:24px;padding:14px;background:#F1F7FE;border-radius:8px">Votre ligne téléphonique (extension <strong>${extension}</strong>) reste connectée automatiquement — aucune action requise.</p>
<p style="font-size:12px;color:#6B7280;margin-top:32px">— L'équipe Planiprêt</p>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!RESEND_API_KEY) return json({ error: "resend_not_configured" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: ud } = await userClient.auth.getUser();
  const user = ud?.user;
  if (!user) return json({ error: "not_authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: roles } = await admin.from("user_roles").select("role,organization_id").eq("user_id", user.id);
  const isAdmin = (roles ?? []).some((r: any) =>
    r.role === "super_admin" || (r.role === "org_admin" && r.organization_id === PLANIPRET_ORG_ID)
  );
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const onlyIds: string[] | undefined = Array.isArray(body?.broker_ids) ? body.broker_ids : undefined;
  const resend = !!body?.resend;

  let q = admin.from("planipret_profiles")
    .select("id,email,login_email,full_name,ns_extension,ns_linked,onboarding_email_sent_at")
    .eq("ns_linked", true);
  if (onlyIds && onlyIds.length) q = q.in("id", onlyIds);
  const { data: brokers } = await q;

  let sent = 0, skipped = 0, failed = 0;
  for (const b of brokers ?? []) {
    if (!resend && b.onboarding_email_sent_at) { skipped++; continue; }
    const to = b.login_email || b.email;
    if (!to) { skipped++; continue; }
    const firstName = String(b.full_name ?? "").split(" ")[0] ?? "";
    const html = buildHtml({ firstName, loginEmail: to, extension: b.ns_extension });
    const send = async (from: string) => fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: "Nouvelle façon de vous connecter à l'app Planiprêt", html }),
    });
    let r = await send("Planiprêt <noreply@ava-telecom.ca>");
    if (!r.ok && (r.status === 403 || r.status === 422)) {
      r = await send("Planiprêt <noreply@assistantvirtualai.com>");
    }
    if (r.ok) {
      sent++;
      await admin.from("planipret_profiles").update({ onboarding_email_sent_at: new Date().toISOString() }).eq("id", b.id);
    } else {
      failed++;
    }
  }
  return json({ ok: true, sent, skipped, failed, total: brokers?.length ?? 0 });
});
