// mobile-sms:
//   GET  /mobile-sms                 → threads
//   GET  /mobile-sms?threadId=<uuid> → messages in thread
//   POST /mobile-sms { threadId, body } → send (delegates to telnyx-sms)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: __mobileAllowed } = await sb.rpc("my_platform_access_allowed", { _platform: "mobile" });
    if (__mobileAllowed === false) return json({ error: "MOBILE_ACCESS_DISABLED", message: "Mobile access not granted by Lemtel administrators." }, 403);

    const { data: sp } = await sb.from("pbx_softphone_users")
      .select("organization_id").eq("portal_user_id", u.user.id).maybeSingle();
    if (!sp) return json({ threads: [], items: [], noSoftphone: true });
    const orgId = sp.organization_id;
    const url = new URL(req.url);

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const threadId = body.threadId as string;
      const text = (body.body as string || "").trim();
      if (!threadId || !text) return json({ error: "missing_fields" }, 400);

      const { data: th } = await sb.from("pbx_sms_threads")
        .select("id, did_number, contact_phone, organization_id")
        .eq("id", threadId).maybeSingle();
      if (!th || th.organization_id !== orgId) return json({ error: "forbidden" }, 403);

      const { data: msg, error } = await sb.from("pbx_sms_messages").insert({
        thread_id: th.id, organization_id: orgId, direction: "outbound",
        from_number: th.did_number, to_number: th.contact_phone, body: text, status: "queued",
      }).select("id").single();
      if (error) throw error;

      // Best-effort deliver via Telnyx
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/telnyx-sms`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader },
          body: JSON.stringify({ from: th.did_number, to: th.contact_phone, text, threadId: th.id, messageId: msg.id }),
        });
      } catch (_) { /* keep queued */ }

      await sb.from("pbx_sms_threads").update({ last_message_at: new Date().toISOString() }).eq("id", th.id);
      return json({ id: msg.id });
    }

    const threadId = url.searchParams.get("threadId");
    if (threadId) {
      const { data: rows } = await sb.from("pbx_sms_messages")
        .select("id, direction, body, sent_at")
        .eq("thread_id", threadId).eq("organization_id", orgId)
        .order("sent_at", { ascending: true }).limit(200);
      const fmt = (d: string) => new Date(d).toLocaleString();
      return json((rows || []).map((m) => ({
        id: m.id, from: m.direction === "outbound" ? "me" : "them", body: m.body || "", at: fmt(m.sent_at as string),
      })));
    }

    const { data: rows } = await sb.from("pbx_sms_threads")
      .select("id, contact_name, contact_phone, unread_count, last_message_at, assigned_user_id, pbx_sms_messages(body, sent_at)")
      .eq("organization_id", orgId)
      .or(`assigned_user_id.eq.${u.user.id},assigned_user_id.is.null`)
      .order("last_message_at", { ascending: false }).limit(80);
    return json((rows || []).map((t: any) => {
      const msgs = t.pbx_sms_messages || [];
      const last = msgs[msgs.length - 1];
      return {
        id: t.id, contact: t.contact_name || t.contact_phone, number: t.contact_phone,
        lastMessage: last?.body || "", unread: t.unread_count || 0,
        updatedAt: t.last_message_at ? new Date(t.last_message_at).toLocaleString() : "",
      };
    }));
  } catch (e) {
    console.error("[mobile-sms]", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
