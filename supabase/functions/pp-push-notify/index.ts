import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cfg } = await admin.from("planipret_integration_secrets").select("config").eq("provider", "webpush").maybeSingle();
    const c = (cfg?.config ?? {}) as any;
    const VAPID_PUBLIC = c.public_key ?? Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE = c.private_key ?? Deno.env.get("VAPID_PRIVATE_KEY");
    const SUBJECT = c.subject ?? Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@avastatistic.ca";
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: "vapid_not_configured" }, 503);
    webpush.setVapidDetails(SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const body = await req.json().catch(() => ({}));
    const { user_id, title, body: text, data, icon, category, deep_link } = body ?? {};
    if (!user_id || !title) return json({ error: "missing_fields" }, 400);

    // Preference gating by category
    const cat = String(category ?? "info");
    const prefMap: Record<string, string> = {
      hot_lead: "notif_hot_leads",
      missed_call: "notif_missed_call",
      appointment: "notif_appointment_reminder",
      morning_brief: "notif_morning_brief",
      eod_summary: "notif_eod_summary",
      ai: "notif_ai",
      sms: "notif_sms",
      call: "notif_calls",
      voicemail: "notif_voicemails",
      reminder: "notif_reminders",
    };
    const prefCol = prefMap[cat];
    let allowed = true;
    if (prefCol) {
      const { data: prof } = await admin.from("planipret_profiles")
        .select(prefCol).eq("user_id", user_id).maybeSingle();
      if (prof && (prof as any)[prefCol] === false) allowed = false;
    }
    const finalDeepLink = deep_link ?? data?.deep_link ?? null;

    // Always log in-app notification (even if push disabled)
    const { data: notifRow } = await admin.from("planipret_ava_notifications").insert({
      user_id, category: cat, title, body: text ?? null,
      data: { ...(data ?? {}), deep_link: finalDeepLink }, deep_link: finalDeepLink,
      delivered: false,
    }).select("id").maybeSingle();

    if (!allowed) return json({ delivered: 0, blocked_by_preference: true });

    const { data: subs } = await admin.from("planipret_push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", user_id);
    if (!subs?.length) return json({ delivered: 0 });

    const payload = JSON.stringify({ title, body: text ?? "", data: { ...(data ?? {}), category: cat, deep_link: finalDeepLink }, icon: icon ?? "/icon-192.png" });
    let delivered = 0;
    const expired: string[] = [];
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        delivered++;
      } catch (err: any) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) expired.push(s.id);
      }
    }
    if (delivered > 0 && notifRow?.id) {
      await admin.from("planipret_ava_notifications")
        .update({ delivered: true }).eq("id", notifRow.id);
    }
    if (expired.length) await admin.from("planipret_push_subscriptions").delete().in("id", expired);
    return json({ delivered, expired: expired.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
