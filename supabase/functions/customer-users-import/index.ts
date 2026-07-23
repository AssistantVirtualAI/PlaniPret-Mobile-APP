// Bulk-create FusionPBX extensions + local softphone rows from a CSV payload.
// Body: {
//   organizationId, domain_uuid, domain_name,
//   send_welcome_email?: boolean,
//   users: [{ extension, name?, email?, password?, voicemail_pin?, outbound_cid?, assign_phone_number? }]
// }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Row = {
  extension: string;
  name?: string;
  email?: string;
  password?: string;
  voicemail_pin?: string;
  outbound_cid?: string;
  assign_phone_number?: string;
};

function genStrongPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const nums = "23456789";
  const sym = "!@#$%^&*";
  const all = upper + lower + nums + sym;
  let out = "";
  out += upper[Math.floor(Math.random() * upper.length)];
  out += lower[Math.floor(Math.random() * lower.length)];
  out += nums[Math.floor(Math.random() * nums.length)];
  out += sym[Math.floor(Math.random() * sym.length)];
  for (let i = 0; i < 12; i++) out += all[Math.floor(Math.random() * all.length)];
  return out.split("").sort(() => Math.random() - 0.5).join("");
}

async function callPbx(action: string, body: Record<string, unknown>, authHeader: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pbx-write`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ action, ...body }),
  });
  const txt = await res.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "invalid body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { organizationId, domain_uuid, domain_name, users, send_welcome_email } = body as {
      organizationId: string; domain_uuid: string; domain_name: string;
      users: Row[]; send_welcome_email?: boolean;
    };
    if (!organizationId || !domain_uuid || !domain_name || !Array.isArray(users)) {
      return new Response(JSON.stringify({ error: "organizationId, domain_uuid, domain_name, users[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const results: Array<{
      extension: string; ok: boolean; error?: string;
      created?: boolean; password?: string; welcomed?: boolean;
    }> = [];

    for (const raw of users) {
      const ext = String(raw.extension || "").trim();
      if (!ext) { results.push({ extension: "", ok: false, error: "missing extension" }); continue; }
      const password = raw.password && raw.password.length >= 8 ? raw.password : genStrongPassword();
      const vmPin = raw.voicemail_pin || ext;
      const cidName = raw.name || ext;
      const outboundCid = raw.outbound_cid || raw.assign_phone_number || ext;

      const pbx = await callPbx("create-extension", {
        organizationId,
        params: {
          domain_uuid,
          extension: ext,
          password,
          voicemail_password: vmPin,
          effective_caller_id_name: cidName,
          effective_caller_id_number: outboundCid,
          enabled: true,
        },
      }, authHeader);

      if (!pbx.ok) {
        results.push({ extension: ext, ok: false, error: pbx.data?.error || `pbx ${pbx.status}` });
        continue;
      }

      let portalUid: string | null = null;
      if (raw.email) {
        const { data: prof } = await supabase
          .from("profiles").select("id").eq("email", raw.email.toLowerCase()).maybeSingle();
        portalUid = prof?.id ?? null;
      }

      await supabase.from("pbx_softphone_users").upsert({
        organization_id: organizationId,
        extension: ext,
        display_name: cidName,
        sip_domain: domain_name,
        sip_password: password,
        portal_user_id: portalUid,
        app_access_enabled: true,
        desktop_access_enabled: true,
        mobile_access_enabled: true,
        status: "offline",
      }, { onConflict: "organization_id,extension" });

      // Best-effort DID assignment
      if (raw.assign_phone_number) {
        await supabase.from("lemtel_dids").update({
          assigned_type: "extension",
          assigned_id: ext,
        }).eq("number", raw.assign_phone_number).then(() => {}, () => {});
      }

      // Welcome email (best-effort)
      let welcomed = false;
      if (send_welcome_email && raw.email) {
        try {
          const portalUrl = `${Deno.env.get("PUBLIC_SITE_URL") || ""}/c/${domain_name}`;
          const inv = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-transactional-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader },
            body: JSON.stringify({
              templateName: "customer-welcome",
              recipientEmail: raw.email,
              idempotencyKey: `welcome-${organizationId}-${ext}`,
              templateData: {
                name: cidName,
                extension: ext,
                sip_domain: domain_name,
                sip_password: password,
                portal_url: portalUrl,
              },
            }),
          });
          welcomed = inv.ok;
        } catch { /* swallow */ }
      }

      results.push({ extension: ext, ok: true, created: true, password, welcomed });
    }

    return new Response(JSON.stringify({
      ok: true,
      total: users.length,
      succeeded: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
