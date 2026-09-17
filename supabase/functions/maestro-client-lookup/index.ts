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
  normalizePhone,
} from "../_shared/maestro.ts";
import { clientUrl, fetchClientDeals } from "../_shared/maestro-deals.ts";
import { guardPlanipret } from "../_shared/planipret-guard.ts";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ found: false, error: "method_not_allowed" }, 405);
  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({} as any)) : {};
    const phone = normalizePhone(body?.phone ?? url.searchParams.get("phone"));
    const callId = String(body?.call_id ?? url.searchParams.get("call_id") ?? "").trim() || null;
    if (!phone) return json({ found: false, error: "phone_required" }, 400);

    const guard = await guardPlanipret(req);
    if ("error" in guard) return guard.error;

    const admin = adminClient();
    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) return json({ found: false, error: "maestro_not_configured" }, 200);

    const auth = await getBrokerAuth(admin, guard.user.id);
    if (!auth.brokerId || !auth.token) return json({ found: false, error: "maestro_not_connected" }, 200);
    // The former private phone-search route is not part of the published Maestro contract. The
    // app's client list is already hydrated through the documented, per-user
    // directory endpoint; restrict this convenience lookup to that broker's
    // cached result rather than probing a private upstream route.
    const { data: cached, error: cacheError } = await admin
      .from("planipret_maestro_clients")
      .select("*")
      .eq("user_id", guard.user.id)
      .eq("phone_e164", phone)
      .order("cached_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cacheError) {
      await maestroAudit(admin, "client_lookup_cache_failed", { status: "cache_error" });
      return json({ found: false, error: "lookup_unavailable" }, 200);
    }
    if (!cached) return json({ found: false, phone, source: "broker_cache" });

    const client = cached;
    const clientId = client?.id ?? client?.client_id;

    if (callId && clientId) {
      await admin
        .from("planipret_phone_calls")
        .update({ maestro_client_id: String(clientId) })
        .eq("id", callId)
        .eq("user_id", guard.user.id);
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
