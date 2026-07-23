// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const URL_ = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND = Deno.env.get("RESEND_API_KEY");
    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    const admin = createClient(URL_, SERVICE);

    const now = new Date();
    // Look ahead 24h to catch all reminder windows
    const horizon = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    const { data: appts, error } = await admin
      .from("appointments")
      .select("id, organization_id, contact_name, contact_email, contact_phone, scheduled_at, reminder_offsets, status, meeting_url, location_type")
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", horizon.toISOString())
      .neq("status", "cancelled");
    if (error) throw error;

    let sent = 0;
    for (const a of appts ?? []) {
      const offsets: number[] = a.reminder_offsets ?? [1440, 60];
      const at = new Date(a.scheduled_at).getTime();
      for (const off of offsets) {
        const trigger = at - off * 60_000;
        // only fire if we're within ±5min window of the trigger
        if (Math.abs(now.getTime() - trigger) > 5 * 60_000) continue;

        // dedupe
        const { data: dup } = await admin
          .from("appointment_reminders")
          .select("id")
          .eq("appointment_id", a.id)
          .eq("offset_minutes", off)
          .maybeSingle();
        if (dup) continue;

        const subject = `Reminder: appointment in ${off >= 60 ? Math.round(off / 60) + "h" : off + "min"}`;
        const html = `<p>Hi ${a.contact_name ?? ""},</p>
          <p>This is a reminder of your appointment scheduled for <b>${new Date(a.scheduled_at).toLocaleString()}</b>.</p>
          ${a.meeting_url ? `<p>Join here: <a href="${a.meeting_url}">${a.meeting_url}</a></p>` : ""}`;

        let status = "skipped";
        let errMsg: string | null = null;
        if (RESEND && LOVABLE && a.contact_email) {
          try {
            const r = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${LOVABLE}`,
                "X-Connection-Api-Key": RESEND,
              },
              body: JSON.stringify({
                from: "Notifications <onboarding@resend.dev>",
                to: [a.contact_email],
                subject,
                html,
              }),
            });
            status = r.ok ? "sent" : "failed";
            if (!r.ok) errMsg = (await r.text()).slice(0, 500);
          } catch (e: any) {
            status = "failed";
            errMsg = String(e?.message ?? e);
          }
        }

        await admin.from("appointment_reminders").insert({
          appointment_id: a.id,
          organization_id: a.organization_id,
          offset_minutes: off,
          channel: "email",
          status,
          error: errMsg,
        });
        if (status === "sent") sent++;
      }
    }

    return new Response(JSON.stringify({ ok: true, scanned: appts?.length ?? 0, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
