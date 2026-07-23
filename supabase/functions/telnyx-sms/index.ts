// Send SMS / MMS via Telnyx; persists to pbx_sms_threads/messages and
// broadcasts the new message on the org's realtime channel.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEMTEL_ORG_ID = "71755d33-ed64-4ad5-a828-61c9d2029eb7";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify the user belongs to the Lemtel org
    const { data: member } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", LEMTEL_ORG_ID)
      .maybeSingle();
    if (!member) return json({ error: "Forbidden" }, 403);

    const payload = await req.json();
    let { from, to, text, media_urls } = payload;
    const threadId = payload.threadId || payload.thread_id;
    if (!text && payload.body) text = payload.body;

    let sourceThread: any = null;
    if (threadId) {
      const { data: threadRow, error: threadLookupErr } = await admin
        .from("pbx_sms_threads")
        .select("id, organization_id, did_number, contact_phone")
        .eq("id", threadId)
        .eq("organization_id", LEMTEL_ORG_ID)
        .maybeSingle();
      if (threadLookupErr) return json({ error: threadLookupErr.message }, 500);
      if (!threadRow) return json({ error: "Thread not found" }, 404);
      sourceThread = threadRow;
      from = from || threadRow.did_number;
      to = to || threadRow.contact_phone;
    }

    if (!from || !to || !text) return json({ error: "from, to, text required" }, 400);

    // Get Telnyx config from integration row (mock-mode aware)
    const { data: integ } = await admin
      .from("pbx_integrations")
      .select("config")
      .eq("organization_id", LEMTEL_ORG_ID)
      .eq("provider", "telnyx")
      .maybeSingle();
    const cfg = (integ?.config || {}) as Record<string, any>;
    const mock = cfg.mock_mode === true;
    const apiKey = Deno.env.get("TELNYX_API_KEY") || cfg.api_key;
    const profileId = cfg.messaging_profile_id;

    let providerResult: any = { mock: true };
    if (!mock) {
      if (!apiKey) return json({ error: "TELNYX_API_KEY missing" }, 500);
      const res = await fetch("https://api.telnyx.com/v2/messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, text, media_urls, messaging_profile_id: profileId }),
      });
      providerResult = await res.json();
      if (!res.ok) {
        const code = providerResult?.errors?.[0]?.code || res.status;
        const detail = providerResult?.errors?.[0]?.detail || providerResult?.errors?.[0]?.title || "Telnyx error";
        return json({ error: `Telnyx ${code}: ${detail}`, provider: providerResult }, 502);
      }
    }

    // Find or create thread
    let thread: any = sourceThread ? { id: sourceThread.id } : null;
    if (!thread) {
      const lookup = await admin
        .from("pbx_sms_threads")
        .select("id")
        .eq("organization_id", LEMTEL_ORG_ID)
        .eq("did_number", from)
        .eq("contact_phone", to)
        .maybeSingle();
      thread = lookup.data;
    }

    if (!thread) {
      const { data: newThread, error: threadErr } = await admin
        .from("pbx_sms_threads")
        .insert({
          organization_id: LEMTEL_ORG_ID,
          did_number: from,
          contact_phone: to,
          last_message_at: new Date().toISOString(),
          status: "open",
          unread_count: 0,
        })
        .select("id")
        .single();
      if (threadErr) return json({ error: threadErr.message }, 500);
      thread = newThread;
    } else {
      await admin
        .from("pbx_sms_threads")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", thread.id);
    }

    const { data: message, error: msgErr } = await admin
      .from("pbx_sms_messages")
      .insert({
        organization_id: LEMTEL_ORG_ID,
        thread_id: thread!.id,
        direction: "outbound",
        from_number: from,
        to_number: to,
        body: text,
        media_urls: media_urls || null,
        provider_message_id: providerResult?.data?.id || null,
        status: mock ? "mock" : "sent",
        sent_at: new Date().toISOString(),
        raw_data: providerResult,
      })
      .select()
      .single();
    if (msgErr) return json({ error: msgErr.message }, 500);

    // Broadcast on realtime channel
    try {
      const channel = admin.channel(`pbx-sms-${LEMTEL_ORG_ID}`);
      await channel.send({
        type: "broadcast",
        event: "new_message",
        payload: { thread_id: thread!.id, message },
      });
    } catch (e) {
      console.warn("broadcast failed", e);
    }

    // Audit log
    await admin.from("audit_logs").insert({
      organization_id: LEMTEL_ORG_ID,
      user_id: user.id,
      action: "sms_send",
      resource_type: "pbx_sms_messages",
      resource_id: message.id,
      metadata: { from, to, mock, thread_id: thread!.id, source: threadId ? "desktop_thread" : "direct" },
    }).then(() => {}, () => {});

    return json({ ok: true, message, provider: providerResult });
  } catch (e: any) {
    console.error("telnyx-sms error", e);
    return json({ error: e.message || String(e) }, 500);
  }
});
