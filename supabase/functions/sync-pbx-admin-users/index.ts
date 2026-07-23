// Sync FusionPBX backoffice (admin) users for the resolved org domain.
// Reads /users from FusionPBX API and upserts into public.pbx_admin_users.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const organization_id: string | undefined = body.organization_id;
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve domain_uuid for this org
    let domain_uuid: string | null = body.domain_uuid || null;
    if (!domain_uuid) {
      const { data: org } = await admin.from("organizations")
        .select("fusionpbx_domain_uuid").eq("id", organization_id).maybeSingle();
      domain_uuid = (org as any)?.fusionpbx_domain_uuid || Deno.env.get("FUSIONPBX_DOMAIN_UUID") || null;
    }
    if (!domain_uuid) {
      return new Response(JSON.stringify({ error: "no fusionpbx_domain_uuid for org" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base = (Deno.env.get("FUSIONPBX_API_URL") || "").replace(/\/+$/, "").replace(/\/app\/api(\/\d+)?$/, "");
    const apiKey = Deno.env.get("FUSIONPBX_API_KEY")!;
    const url = `${base}/app/api/7/users?domain_uuid=${domain_uuid}&limit=2000`;

    const started = Date.now();
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "fusionpbx_failed", status: res.status, body: text.slice(0, 400) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let data: any;
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    const list: any[] = Array.isArray(data) ? data : (data.users || data.data || []);

    const now = new Date().toISOString();
    const rows = list.map((u: any) => ({
      organization_id,
      pbx_uuid: u.user_uuid || u.uuid || u.id,
      domain_uuid: u.domain_uuid || domain_uuid,
      username: u.username || u.user_name || u.user || "unknown",
      email: u.user_email || u.email || null,
      first_name: u.contact_name_given ?? u.first_name ?? null,
      last_name: u.contact_name_family ?? u.last_name ?? null,
      groups: Array.isArray(u.groups) ? u.groups : (u.group_name ? [u.group_name] : []),
      enabled: !(u.user_enabled === "false" || u.user_enabled === false),
      api_key_present: !!(u.api_key || u.user_api_key),
      source: "fusionpbx",
      sync_status: "synced",
      last_pbx_seen_at: now,
      raw_data: u,
    })).filter((r: any) => r.pbx_uuid);

    let upserted = 0;
    if (rows.length) {
      const { error: upErr, count } = await admin.from("pbx_admin_users")
        .upsert(rows, { onConflict: "organization_id,pbx_uuid", count: "exact" });
      if (upErr) {
        return new Response(JSON.stringify({ error: upErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      upserted = count ?? rows.length;
    }

    // Mark missing rows as orphan
    const seenIds = rows.map((r: any) => r.pbx_uuid);
    if (seenIds.length) {
      await admin.from("pbx_admin_users")
        .update({ sync_status: "orphan" })
        .eq("organization_id", organization_id)
        .not("pbx_uuid", "in", `(${seenIds.map((id) => `"${id}"`).join(",")})`);
    }

    await admin.from("pbx_sync_jobs").insert({
      organization_id, job_type: "sync-pbx-admin-users", endpoint: "users",
      status: "completed", started_at: new Date(started).toISOString(),
      completed_at: new Date().toISOString(),
      stats: { fetched: list.length, upserted },
    });

    return new Response(JSON.stringify({
      ok: true, fetched: list.length, upserted, domain_uuid,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
