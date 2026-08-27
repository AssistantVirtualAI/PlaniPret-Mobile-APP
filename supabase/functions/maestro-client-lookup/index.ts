// GET /functions/v1/maestro-client-lookup?phone={e164}&call_id={uuid?}
// Looks up a Maestro client by phone, resolves their most recent dossier when
// Maestro exposes one, and caches the result on planipret_phone_calls.
//
// The response is designed so the caller never faces an empty screen:
//   - found + latest_deal -> open the dossier
//   - found, no dossier   -> open_action "contact" with contact_url
//   - not found / error   -> found:false, the UI keeps the local contact card
import {
  adminClient,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  json,
  maestroAudit,
  maestroFetch,
  normalizePhone,
} from "../_shared/maestro.ts";
import { clientUrl, fetchClientDeals } from "../_shared/maestro-deals.ts";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const phone = normalizePhone(url.searchParams.get("phone"));
    const callId = url.searchParams.get("call_id");
    const userIdHeader = req.headers.get("x-user-id");
    if (!phone) return json({ found: false, error: "phone_required" }, 400);

    const admin = adminClient();
    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) return json({ found: false, error: "maestro_not_configured" }, 200);

    const auth = await getBrokerAuth(admin, userIdHeader);
    const res = await maestroFetch(cfg, {
      method: "POST",
      path: `/api/v1/users/${encodeURIComponent(String(auth.brokerId ?? ""))}/lookup-by-phone`,
      token: auth.token,
      body: { phone },
    });

    if (res.status === 404 || (res.ok && !res.data)) {
      return json({ found: false, phone });
    }
    if (!res.ok) {
      await maestroAudit(admin, "client_lookup_failed", { phone, status: res.status });
      return json({ found: false, error: "lookup_failed", status: res.status }, 200);
    }

    const client = res.data?.client ?? res.data;
    const clientId = client?.id ?? client?.client_id;

    if (callId && clientId) {
      await admin
        .from("planipret_phone_calls")
        .update({ maestro_client_id: String(clientId) })
        .eq("id", callId);
    }

    // Best-effort dossier resolution. When Maestro exposes no dossier for this
    // client we still return an actionable target (the contact record) so the
    // caller can offer "Ouvrir la fiche contact" instead of an empty screen.
    const { deals, source } = clientId
      ? await fetchClientDeals(cfg, {
        token: auth.token,
        brokerId: auth.brokerId ? String(auth.brokerId) : null,
        clientId: String(clientId),
        inline: client,
      })
      : { deals: [], source: "none" };

    const latestDeal = deals[0] ?? null;
    const contactUrl = clientId ? clientUrl(String(clientId)) : null;

    return json({
      found: true,
      client_id: clientId,
      name: client?.name ?? `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim(),
      company: client?.company ?? null,
      mortgage_stage: client?.mortgage_stage ?? null,
      tags: client?.tags ?? [],
      contact_url: contactUrl,
      latest_deal: latestDeal,
      deals_count: deals.length,
      deals_source: source,
      // What the UI should do when the broker taps the banner.
      open_action: latestDeal ? "deal" : contactUrl ? "contact" : "none",
      open_url: latestDeal?.url ?? contactUrl,
      raw: client,
    });

  } catch (e: any) {
    console.error("maestro-client-lookup error", e);
    return json({ found: false, error: e?.message ?? "server_error" }, 500);
  }
});
