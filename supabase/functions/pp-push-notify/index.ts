import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import webpush from "npm:web-push@3.6.7";
import { sendNativeAlertPush } from "../_shared/native-push.ts";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cfg } = await admin.from("planipret_integration_secrets").select("config").eq("provider", "webpush").maybeSingle();
    const c = (cfg?.config ?? {}) as any;
    const VAPID_PUBLIC = c.public_key ?? Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE = c.private_key ?? Deno.env.get("VAPID_PRIVATE_KEY");
    const SUBJECT = c.subject ?? Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@avastatistic.ca";
    const vapidReady = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
    if (vapidReady) webpush.setVapidDetails(SUBJECT, VAPID_PUBLIC!, VAPID_PRIVATE!);

    const body = await req.json().catch(() => ({}));
    const { user_id, title, body: text, data, icon, category, deep_link } = body ?? {};
    if (!user_id || !title) return json({ error: "missing_fields" }, 400);

    // ---- Authorization -------------------------------------------------
    // Trusted internal services call with the service-role key; end users may
    // only send notifications to themselves (e.g. the "test notification"
    // button). Anonymous callers are rejected.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "unauthorized" }, 401);
    const isService = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!isService) {
      const { data: userData } = await admin.auth.getUser(token);
      const caller = userData?.user;
      if (!caller) return json({ error: "unauthorized" }, 401);
      if (String(user_id) !== caller.id) {
        const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: caller.id });
        if (isAdmin !== true) return json({ error: "forbidden" }, 403);
      }
    }

    // Basic input validation on attacker-controllable display fields
    const safeTitle = String(title).slice(0, 120);
    const safeText = text == null ? "" : String(text).slice(0, 500);
    const safeDeepLink = typeof deep_link === "string" && /^\/[^\s]*$/.test(deep_link)
      ? deep_link.slice(0, 300)
      : undefined;

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
    const rawFallbackLink = typeof data?.deep_link === "string" && /^\/[^\s]*$/.test(data.deep_link)
      ? data.deep_link.slice(0, 300)
      : null;
    const finalDeepLink = safeDeepLink ?? rawFallbackLink;

    // Always log in-app notification (even if push disabled)
    const { data: notifRow } = await admin.from("planipret_ava_notifications").insert({
      user_id, category: cat, title: safeTitle, body: safeText || null,
      data: { ...(data ?? {}), deep_link: finalDeepLink }, deep_link: finalDeepLink,
      delivered: false,
    }).select("id").maybeSingle();

    if (!allowed) return json({ delivered: 0, blocked_by_preference: true, logged: true });

    // 1) Native devices (iOS APNs / Android FCM) — the installed mobile apps.
    const native = await sendNativeAlertPush(admin, user_id, {
      title: safeTitle,
      body: safeText,
      category: cat,
      data: { ...(data ?? {}), ...(finalDeepLink ? { deep_link: String(finalDeepLink) } : {}) },
    });

    // 2) Browsers (Web Push / VAPID).
    let delivered = native.delivered;
    const expired: string[] = [];
    if (vapidReady) {
      const { data: subs } = await admin.from("planipret_push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", user_id);
      const payload = JSON.stringify({ title: safeTitle, body: safeText, data: { ...(data ?? {}), category: cat, deep_link: finalDeepLink }, icon: icon ?? "/icon-192.png" });
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
          delivered++;
        } catch (err: any) {
          const code = err?.statusCode;
          if (code === 404 || code === 410) expired.push(s.id);
        }
      }
    }
    if (delivered > 0 && notifRow?.id) {
      await admin.from("planipret_ava_notifications")
        .update({ delivered: true }).eq("id", notifRow.id);
    }
    if (expired.length) await admin.from("planipret_push_subscriptions").delete().in("id", expired);
    if (delivered === 0) {
      return json({ delivered: 0, logged: true, reason: native.reason ?? (vapidReady ? "no_subscription" : "vapid_not_configured"), native });
    }
    return json({ delivered, native, expired: expired.length });

  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
