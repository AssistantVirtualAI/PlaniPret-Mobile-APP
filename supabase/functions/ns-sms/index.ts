import { authBroker, corsHeaders, jsonResponse, logAudit, nsBrokerFetch } from "../_shared/ns-broker.ts";

const DOMAIN = "planipret.ca";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authBroker(req);
    if ("error" in auth) return auth.error;
    const { admin, userId, profile } = auth;

    const body = await req.json().catch(() => ({}));
    const { to, message, type = "sms" } = body ?? {};
    if (!to || !message) return jsonResponse({ success: false, error: "to et message requis", code: 400 }, 400);

    const res = await nsBrokerFetch(
      admin, profile,
      `/domains/${DOMAIN}/users/${encodeURIComponent(profile.extension)}/messagesessions/messages`,
      { method: "POST", body: JSON.stringify({ type, destination: to, message }) },
    );
    if (res.status === 403) return jsonResponse({ success: false, error: "Accès non autorisé", code: 403 }, 200);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return jsonResponse({ success: false, error: txt || "NS-API error", code: res.status }, 200);
    }
    await res.text();

    await admin.from("planipret_phone_messages").insert({
      user_id: userId,
      direction: "outbound",
      to_number: to,
      from_number: profile.extension,
      body: message,
      type,
    });
    await logAudit(admin, req, {
      user_id: profile.id, action: "SMS_SEND",
      resource_type: "message",
      metadata: { to, length: message.length, type },
    });
    return jsonResponse({ success: true });
  } catch (e) {
    console.error("ns-sms error", e);
    return jsonResponse({ success: false, error: "Connexion perdue", code: 0 }, 200);
  }
});
