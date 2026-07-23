import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "missing_auth" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "invalid_auth" }, 401);
    const callerId = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { action, payload } = await req.json().catch(() => ({}));
    if (!action) return json({ error: "missing_action" }, 400);

    // Resolve org & extension for the caller
    const { data: spu } = await admin
      .from("pbx_softphone_users")
      .select("organization_id, extension, sip_domain, display_name")
      .eq("portal_user_id", callerId)
      .maybeSingle();
    const orgId: string | null = spu?.organization_id ?? null;

    const requireOrg = () => {
      if (!orgId) throw new Error("no_extension_assigned");
      return orgId;
    };

    if (action === "get") {
      const [{ data: hours }, { data: handling }] = await Promise.all([
        admin.from("user_working_hours").select("*").eq("user_id", callerId).order("day_of_week"),
        admin.from("user_call_handling").select("*").eq("user_id", callerId).maybeSingle(),
      ]);
      return json({
        extension: spu ?? null,
        working_hours: hours ?? [],
        call_handling: handling ?? null,
      });
    }

    if (action === "save_hours") {
      const oid = requireOrg();
      const days: Array<{
        day_of_week: number;
        is_working_day: boolean;
        start_time: string;
        end_time: string;
        break_start?: string | null;
        break_end?: string | null;
        timezone?: string;
      }> = payload?.days ?? [];
      if (!Array.isArray(days) || days.length === 0) return json({ error: "invalid_payload" }, 400);

      const rows = days.map((d) => ({
        organization_id: oid,
        user_id: callerId,
        day_of_week: d.day_of_week,
        is_working_day: !!d.is_working_day,
        start_time: d.start_time,
        end_time: d.end_time,
        break_start: d.break_start ?? null,
        break_end: d.break_end ?? null,
        timezone: d.timezone ?? "America/Toronto",
      }));

      const { error } = await admin
        .from("user_working_hours")
        .upsert(rows, { onConflict: "user_id,day_of_week" });
      if (error) return json({ error: "save_failed", detail: error.message }, 500);

      await admin.from("audit_logs").insert({
        organization_id: oid,
        user_id: callerId,
        action: "user_telecom_settings.save_hours",
        resource_type: "user_working_hours",
        metadata: { source: "desktop_app", days: rows.length },
      });

      return json({ ok: true, sync_status: "synced", saved: rows.length });
    }

    if (action === "save_handling") {
      const oid = requireOrg();
      const {
        availability = "available",
        after_hours_action = "voicemail",
        forward_target = null,
        timezone = "America/Toronto",
      } = payload ?? {};

      // External forward permission check
      if (after_hours_action === "forward_external") {
        const { data: member } = await admin
          .from("org_members")
          .select("can_manage_users")
          .eq("user_id", callerId)
          .eq("org_id", oid)
          .maybeSingle();
        if (!member?.can_manage_users) {
          return json({ error: "forward_external_not_permitted" }, 403);
        }
      }

      const { data: existing } = await admin
        .from("user_call_handling")
        .select("*")
        .eq("user_id", callerId)
        .maybeSingle();

      const row = {
        organization_id: oid,
        user_id: callerId,
        availability,
        after_hours_action,
        forward_target,
        timezone,
        sync_status: "synced" as const,
        last_synced_at: new Date().toISOString(),
        sync_error: null,
      };

      const { error } = await admin.from("user_call_handling").upsert(row, { onConflict: "user_id" });
      if (error) return json({ error: "save_failed", detail: error.message }, 500);

      await admin.from("audit_logs").insert({
        organization_id: oid,
        user_id: callerId,
        action: "user_telecom_settings.save_handling",
        resource_type: "user_call_handling",
        metadata: {
          source: "desktop_app",
          before: existing ?? null,
          after: row,
        },
      });

      return json({ ok: true, sync_status: "synced" });
    }

    if (action === "reset_to_org_default") {
      const oid = requireOrg();
      const { data: orgHours } = await admin
        .from("org_business_hours")
        .select("*")
        .eq("organization_id", oid);

      const tz = orgHours?.[0]?.timezone ?? "America/Toronto";
      const rows = Array.from({ length: 7 }).map((_, i) => {
        const day = orgHours?.find((h: any) => h.day_of_week === i);
        return {
          organization_id: oid,
          user_id: callerId,
          day_of_week: i,
          is_working_day: day ? !!day.is_open : i >= 1 && i <= 5,
          start_time: day?.open_time ?? "09:00",
          end_time: day?.close_time ?? "17:00",
          break_start: null,
          break_end: null,
          timezone: tz,
        };
      });

      const { error } = await admin
        .from("user_working_hours")
        .upsert(rows, { onConflict: "user_id,day_of_week" });
      if (error) return json({ error: "reset_failed", detail: error.message }, 500);

      return json({ ok: true, reset: rows.length });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "internal", detail: msg }, 500);
  }
});
