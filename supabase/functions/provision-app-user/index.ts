// Provisions Supabase Auth accounts for PBX softphone users.
// - Idempotent: existing auth user is re-linked; password updates flow through.
// - Lemtel-only by JWT; service-role processor via x-provision-secret header.
// - Never grants app access; access stays default-denied until a Lemtel admin
//   calls set_softphone_app_access / set_softphone_platform_access.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const SHARED_SECRET = Deno.env.get("PBX_PROVISION_SECRET") || "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface QueueRow {
  id: string;
  softphone_id: string;
  organization_id: string;
  extension: string;
  sip_domain: string | null;
  sip_password: string | null;
  display_name: string | null;
}

function extractEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

async function resolveEmail(row: QueueRow): Promise<string> {
  // 1) Email embedded in display_name
  const fromName = extractEmail(row.display_name);
  if (fromName) return fromName;

  // 2) Pull voicemail_mail_to / user_email from pbx_extensions (FusionPBX-synced)
  try {
    const { data: ext } = await admin
      .from("pbx_extensions")
      .select("voicemail_mail_to, user_email, effective_caller_id_name")
      .eq("organization_id", row.organization_id)
      .eq("extension", row.extension)
      .maybeSingle();
    const fromVm = extractEmail(ext?.voicemail_mail_to)
      ?? extractEmail(ext?.user_email)
      ?? extractEmail(ext?.effective_caller_id_name);
    if (fromVm) return fromVm;
  } catch { /* ignore */ }

  // 3) Fallback synthetic
  const dom = (row.sip_domain || "pbx.local").toLowerCase();
  return `${row.extension}@${dom}`;
}

function randomPassword(): string {
  return crypto.randomUUID().replace(/-/g, "") + "Aa!1";
}

async function processOne(row: QueueRow) {
  const email = await resolveEmail(row);
  const password = row.sip_password || randomPassword();


  // Find existing auth user by email (paginated).
  let userId: string | null = null;
  let match: any = null;
  for (let page = 1; page <= 20; page++) {
    const { data: existing } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const users = existing?.users ?? [];
    match = users.find((u: any) => (u.email || "").toLowerCase() === email);
    if (match || users.length < 200) break;
  }


  if (match) {
    userId = match.id;
    // Keep password in sync if SIP password supplied
    if (row.sip_password) {
      await admin.auth.admin.updateUserById(userId, { password });
    }
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        source: "pbx",
        extension: row.extension,
        organization_id: row.organization_id,
        sip_domain: row.sip_domain,
      },
    });
    if (error || !created.user) {
      throw new Error(`createUser failed: ${error?.message || "unknown"}`);
    }
    userId = created.user.id;
    // Ensure profile row exists
    await admin.from("profiles").upsert({
      id: userId, email,
      full_name: row.display_name || row.extension,
    });
  }

  // Link softphone → auth user (do NOT grant access)
  await admin.from("pbx_softphone_users")
    .update({ portal_user_id: userId, updated_at: new Date().toISOString() })
    .eq("id", row.softphone_id);

  await admin.from("pbx_app_provision_queue")
    .update({ status: "done", processed_at: new Date().toISOString(), error: null })
    .eq("id", row.id);

  return { id: row.id, softphone_id: row.softphone_id, user_id: userId, email };
}

async function isLemtelAdmin(token: string): Promise<boolean> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: ok } = await admin.rpc("lemtel_can_grant_app_access", {
    _uid: data.user.id,
  });
  return ok === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: shared PBX secret (preferred for sync jobs, no JWT) OR Lemtel JWT
  let authorized = false;
  const hdrSecret = req.headers.get("x-provision-secret") || "";
  if (SHARED_SECRET && hdrSecret && timingSafeEqual(hdrSecret, SHARED_SECRET)) {
    authorized = true;
  } else {
    const auth = req.headers.get("Authorization") || "";
    if (auth.startsWith("Bearer ")) {
      authorized = await isLemtelAdmin(auth.slice(7));
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  // Pull queue rows: a specific softphone_id, or up to `limit` pending rows.
  let q = admin.from("pbx_app_provision_queue").select("*").eq("status", "pending");
  if (body.softphone_id) q = q.eq("softphone_id", body.softphone_id);
  const limit = Math.min(Number(body.limit) || 25, 100);
  const { data: rows, error } = await q.limit(limit);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const row of rows ?? []) {
    try {
      results.push(await processOne(row as QueueRow));
    } catch (e) {
      await admin.from("pbx_app_provision_queue")
        .update({ status: "error", error: String((e as Error).message), processed_at: new Date().toISOString() })
        .eq("id", (row as any).id);
      results.push({ id: (row as any).id, error: String((e as Error).message) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
