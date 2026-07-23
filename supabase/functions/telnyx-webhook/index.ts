// Telnyx inbound SMS webhook → persists to pbx_sms_* and broadcasts realtime.
// Verifies the Telnyx-Signature header (Ed25519) when TELNYX_PUBLIC_KEY is set.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode as b64decode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const LEMTEL_ORG_ID = "71755d33-ed64-4ad5-a828-61c9d2029eb7";

async function verifyTelnyxSignature(rawBody: string, signature: string | null, timestamp: string | null): Promise<boolean> {
  const pubKey = Deno.env.get("TELNYX_PUBLIC_KEY");
  if (!pubKey) {
    console.error("TELNYX_PUBLIC_KEY not configured — rejecting webhook");
    return false;
  }
  if (!signature || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      b64decode(pubKey),
      { name: "Ed25519" } as any,
      false,
      ["verify"],
    );
    const message = new TextEncoder().encode(`${timestamp}|${rawBody}`);
    return await crypto.subtle.verify("Ed25519" as any, key, b64decode(signature), message);
  } catch (e) {
    console.warn("Telnyx signature verify failed", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const raw = await req.text();
    const sig = req.headers.get("telnyx-signature-ed25519");
    const ts = req.headers.get("telnyx-timestamp");
    const ok = await verifyTelnyxSignature(raw, sig, ts);
    if (!ok) return new Response("invalid signature", { status: 401, headers: corsHeaders });

    const payload = JSON.parse(raw);
    const event = payload?.data;
    const eventType = event?.event_type;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (eventType !== "message.received") {
      // Persist status updates for outbound messages too
      if (eventType === "message.sent" || eventType === "message.finalized") {
        const id = event.payload?.id;
        if (id) {
          await admin
            .from("pbx_sms_messages")
            .update({ status: event.payload?.to?.[0]?.status || eventType, raw_data: event })
            .eq("provider_message_id", id);
        }
      }
      return new Response("ok", { headers: corsHeaders });
    }

    const from = event.payload.from.phone_number;
    const to = event.payload.to[0].phone_number;
    const text = event.payload.text;
    const media = event.payload.media || [];

    let { data: thread } = await admin
      .from("pbx_sms_threads")
      .select("id, unread_count, assigned_agent_id")
      .eq("organization_id", LEMTEL_ORG_ID)
      .eq("did_number", to)
      .eq("contact_phone", from)
      .maybeSingle();

    if (!thread) {
      const { data: newThread } = await admin
        .from("pbx_sms_threads")
        .insert({
          organization_id: LEMTEL_ORG_ID,
          did_number: to,
          contact_phone: from,
          last_message_at: new Date().toISOString(),
          status: "open",
          unread_count: 1,
        })
        .select("id, unread_count, assigned_agent_id")
        .single();
      thread = newThread!;
    } else {
      await admin
        .from("pbx_sms_threads")
        .update({
          last_message_at: new Date().toISOString(),
          unread_count: (thread.unread_count || 0) + 1,
        })
        .eq("id", thread.id);
    }

    const { data: message } = await admin
      .from("pbx_sms_messages")
      .insert({
        organization_id: LEMTEL_ORG_ID,
        thread_id: thread!.id,
        direction: "inbound",
        from_number: from,
        to_number: to,
        body: text,
        media_urls: media.length ? media : null,
        provider_message_id: event.payload.id,
        status: "received",
        sent_at: new Date().toISOString(),
        raw_data: event,
      })
      .select()
      .single();

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

    return new Response("ok", { headers: corsHeaders });
  } catch (e: any) {
    console.error("telnyx-webhook error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
