// POST /functions/v1/maestro-client-create
// Body: { phone?, first_name, last_name?, email?, company?, language?, call_id? }
// Routes exclusively through the documented POST /api/main/clients endpoint.
import {
  adminClient,
  corsHeaders,
  getMaestroConfig,
  json,
  maestroAudit,
  normalizePhone,
} from "../_shared/maestro.ts";
import { guardPlanipret } from "../_shared/planipret-guard.ts";
import { maestroClientHasTelephone } from "../_shared/maestro-client-telephone.ts";
import { createClient_, createTelephone, getClient } from "../_shared/maestro-scribe.ts";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";

function clientName(client: any, fallbackFirst: string, fallbackLast: string): string {
  const values = [
    client?.full_name,
    client?.display_name,
    client?.name,
    [client?.first_name, client?.last_name].filter(Boolean).join(" "),
    [fallbackFirst, fallbackLast].filter(Boolean).join(" "),
  ];
  return values.map((value) => String(value ?? "").trim()).find(Boolean) || "Client Maestro";
}

async function linkCallToClient(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  callId: unknown,
  maestroClientId: string,
  name: string,
) {
  const id = String(callId ?? "").trim();
  if (!id || !maestroClientId) return;
  await admin
    .from("planipret_phone_calls")
    .update({ maestro_client_id: maestroClientId, maestro_client_name: name })
    .eq("id", id)
    .eq("user_id", userId);
}

async function cacheConfirmedClient(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  phone: string | null,
  clientId: string,
  client: any,
  fallbackFirst: string,
  fallbackLast: string,
) {
  if (!phone || !clientId) return;
  const name = clientName(client, fallbackFirst, fallbackLast);
  const [firstName, ...rest] = name.split(/\s+/);
  const row = {
    maestro_client_id: clientId,
    first_name: String(client?.first_name ?? firstName ?? "") || null,
    last_name: String(client?.last_name ?? rest.join(" ") ?? "") || null,
    full_name: name,
    email: client?.email ? String(client.email) : null,
    company: client?.company ? String(client.company) : null,
    cached_at: new Date().toISOString(),
  };
  const update = await admin.from("planipret_maestro_clients")
    .update(row)
    .eq("user_id", userId)
    .eq("phone_e164", phone)
    .select("id");
  if (update.error || (update.data?.length ?? 0) > 0) return;

  // The phone index is unique per broker. A simultaneous tap may win this
  // insert; in that case the next lookup resolves the existing row instead of
  // issuing another Maestro POST.
  await admin.from("planipret_maestro_clients").insert({
    user_id: userId,
    phone_e164: phone,
    ...row,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const guard = await guardPlanipret(req);
  if ("error" in guard) return guard.error;

  try {
    const body = await req.json().catch(() => ({} as any));
    const firstName = String(body?.first_name ?? "").trim();
    const lastName = String(body?.last_name ?? "").trim();
    const phone = normalizePhone(body?.phone ?? body?.mobile_number ?? body?.telephone_number);
    if (!firstName) {
      return json({ success: false, error: "validation_failed", errors: { first_name: ["first_name_required"] } }, 422);
    }

    const admin = adminClient();
    const cfg = await getMaestroConfig(admin);
    const ownToken = await getUserMaestroAccessToken(admin, guard.user.id).catch(() => null);
    if (!ownToken) {
      return json({
        success: false,
        error: "maestro_not_connected",
        message: "Connectez votre propre compte Maestro avant de créer un client.",
        token_source: "none",
      }, 200);
    }
    const token = ownToken;
    const tokenSource = "broker_oauth";

    // A directory cache entry is a broker-scoped, previously verified Maestro
    // identity. Never create a second record for the same broker/phone; link
    // the current call to the existing ID instead.
    if (phone) {
      const { data: cached } = await admin
        .from("planipret_maestro_clients")
        .select("maestro_client_id, full_name, first_name, last_name")
        .eq("user_id", guard.user.id)
        .eq("phone_e164", phone)
        .order("cached_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const cachedId = String(cached?.maestro_client_id ?? "").trim();
      if (cachedId) {
        const name = clientName(cached, firstName, lastName);
        await linkCallToClient(admin, guard.user.id, body?.call_id, cachedId, name);
        await maestroAudit(admin, "client_create_reused", { client_id: cachedId, token_source: tokenSource });
        return json({ success: true, existing: true, client_id: cachedId, client: cached, source: "broker_cache" });
      }
    }

    const payload: Record<string, unknown> = {
      first_name: firstName,
      ...(lastName ? { last_name: lastName } : {}),
      ...(body?.email ? { email: String(body.email).trim() } : {}),
      ...(body?.company ? { company: String(body.company).trim() } : {}),
      ...(body?.language ? { language: String(body.language).trim() } : {}),
      ...(phone ? { mobile_number: phone } : {}),
    };

    const res = await createClient_(cfg, payload, { token });
    if (!res.ok) {
      await maestroAudit(admin, "client_create_failed", {
        status: res.status,
        error: res.error,
        token_source: tokenSource,
        fields: Object.keys(payload),
      });

      if ([404, 405, 501].includes(Number(res.status))) {
        const portal = (Deno.env.get("MAESTRO_PORTAL_URL") ?? "https://courtier.planipret.com").replace(/\/$/, "");
        const q = new URLSearchParams({
          first_name: firstName,
          ...(lastName ? { last_name: lastName } : {}),
          ...(phone ? { phone } : {}),
          ...(body?.email ? { email: String(body.email) } : {}),
        });
        return json({
          success: false,
          error: "maestro_endpoint_unavailable",
          message: "Ouvrez le formulaire Maestro prérempli pour terminer la création.",
          web_url: `${portal}/fr/clients/new?${q.toString()}`,
          status: res.status,
        }, 200);
      }

      return json({
        success: false,
        error: res.error ?? "create_failed",
        errors: res.errors ?? null,
        status: res.status,
      }, res.status >= 400 && res.status < 500 ? res.status : 200);
    }

    const client = res.data as any;
    const clientId = String(client?.id ?? client?.client_id ?? "").trim();
    if (!clientId) {
      await maestroAudit(admin, "client_create_unconfirmed", { token_source: tokenSource, reason: "missing_client_id" });
      return json({ success: false, error: "maestro_readback_unconfirmed", message: "Maestro n’a pas retourné l’identifiant du client créé." }, 200);
    }

    // POST acknowledgement alone is not a creation proof. Re-read the exact
    // documented client resource before linking a call or reporting success.
    const readBack = await getClient(cfg, clientId, { token });
    if (!readBack.ok || !readBack.data) {
      await maestroAudit(admin, "client_create_unconfirmed", {
        client_id: clientId,
        token_source: tokenSource,
        status: readBack.status,
        error: readBack.error,
      });
      return json({ success: false, error: "maestro_readback_unconfirmed", message: "Création envoyée; confirmation Maestro en attente." }, 200);
    }

    let confirmed = readBack.data as any;
    // Maestro stores numbers in the documented telephones sub-resource; the
    // POST /clients body may ignore a flat phone field. Ensure the caller's
    // number is attached so the directory/caller lookup can match it.
    if (phone) {
      if (!maestroClientHasTelephone(confirmed, phone)) {
        const telephoneNumber = phone.replace(/\D/g, "").slice(-10);
        const tel = await createTelephone(cfg, clientId, {
          telephone_type: "mobile",
          telephone_number: telephoneNumber,
          extension: "",
          priority: "principal",
        }, { token });
        await maestroAudit(admin, tel.ok ? "client_telephone_added" : "client_telephone_failed", { client_id: clientId, status: tel.status });
        if (tel.ok) {
          const rb2 = await getClient(cfg, clientId, { token });
          if (rb2.ok && rb2.data) confirmed = rb2.data as any;
        }
      }

      // Never claim a caller is durable when Maestro did not retain its
      // telephone. The next incoming call would otherwise not resolve.
      if (!maestroClientHasTelephone(confirmed, phone)) {
        await maestroAudit(admin, "client_telephone_unconfirmed", {
          client_id: clientId,
          token_source: tokenSource,
        });
        return json({
          success: false,
          error: "maestro_telephone_unconfirmed",
          message: "Client créé, mais son numéro n’a pas été confirmé par Maestro. Réessayez avant de lier l’appel.",
        }, 200);
      }
    }
    const name = clientName(confirmed, firstName, lastName);
    await linkCallToClient(admin, guard.user.id, body?.call_id, clientId, name);
    await cacheConfirmedClient(admin, guard.user.id, phone, clientId, confirmed, firstName, lastName);
    await maestroAudit(admin, "client_created", { client_id: clientId, token_source: tokenSource, read_back: true });
    return json({ success: true, client_id: clientId, client: confirmed, endpoint: res.endpoint, read_back: true }, 201);
  } catch (e: any) {
    console.error("maestro-client-create error", e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
