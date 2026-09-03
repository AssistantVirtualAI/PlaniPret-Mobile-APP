// pp-ns-rebuild-broker — SUPPRESSION COMPLÈTE puis RECRÉATION du profil
// téléphonique d'un courtier dans NetSapiens (utilisateur + devices + DID).
//
// Ordre strict :
//   1. snapshot des DID assignés à l'extension
//   2. DELETE devices (<ext>M, <ext>W, legacy <ext>_mobile/<ext>_web)
//   3. DELETE utilisateur NS
//   4. CREATE utilisateur NS + devices avec de NOUVEAUX mots de passe
//   5. réassignation des DID (destination-user obligatoire — cf. pp-did-routing)
//   6. remise à zéro des champs SIP du profil Supabase
//
// Accès : admin Planiprêt authentifié, ou appel service_role (bearer = clé de service).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mobileDeviceId, webDeviceId, legacyDeviceIds } from "../_shared/pp-device-ids.ts";
import { assignDidToExtension, verifyDidRouting } from "../_shared/pp-did-routing.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
const nsHeaders = {
  Authorization: `Bearer ${NS_API_KEY}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function nsFetch(url: string, init?: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, { ...init, headers: { ...nsHeaders, ...(init?.headers ?? {}), Connection: "close" } });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}
async function nsRead(res: Response) {
  const t = await res.text();
  try { return t ? JSON.parse(t) : null; } catch { return t; }
}
const randomPassword = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `Pp${hex.substring(0, 14)}!`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? SERVICE_ROLE;
  if (!SUPABASE_URL || !SERVICE_ROLE || !NS_API_KEY) return json({ error: "missing_config" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();

  const OPS_KEY = Deno.env.get("PP_OPS_KEY") ?? Deno.env.get("PP_CRON_TOKEN") ?? "";
  let isAdmin = bearer === SERVICE_ROLE
    || (!!OPS_KEY && req.headers.get("x-pp-ops-key") === OPS_KEY);
  if (!isAdmin) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (!caller) return json({ error: "not_authenticated" }, 401);
    const { data: callerProfile } = await admin
      .from("planipret_profiles").select("role").or(`user_id.eq.${caller.id},id.eq.${caller.id}`).maybeSingle();
    isAdmin = ["admin", "super_admin", "owner", "planipret_admin"].includes(String(callerProfile?.role ?? "").toLowerCase());
    if (!isAdmin) { try { const { data } = await admin.rpc("is_planipret_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /* ignore */ } }
    if (!isAdmin) { try { const { data } = await admin.rpc("is_super_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /* ignore */ } }
  }
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const body: any = await req.json().catch(() => ({}));
  const brokerId = String(body?.broker_id ?? "").trim();
  const email = String(body?.email ?? "").trim();
  const wantedExt = String(body?.extension ?? "").trim();

  let q = admin.from("planipret_profiles").select("id,user_id,full_name,email,extension,ns_extension,ns_domain,ns_sip_password_ref_mobile");
  if (brokerId) q = q.or(`id.eq.${brokerId},user_id.eq.${brokerId}`);
  else if (email) q = q.ilike("email", email);
  else if (wantedExt) q = q.eq("extension", wantedExt);
  else return json({ error: "broker_id | email | extension required" }, 400);

  const { data: brokers, error: bErr } = await q;
  if (bErr) return json({ error: "profile_lookup_failed", detail: bErr.message }, 500);
  if (!brokers?.length) return json({ error: "broker_not_found" }, 404);
  if (brokers.length > 1) return json({ error: "ambiguous_broker", matches: brokers.map((b: any) => ({ id: b.id, email: b.email, extension: b.extension })) }, 409);

  const broker: any = brokers[0];
  const ext = String(broker.extension ?? broker.ns_extension ?? wantedExt).trim();
  const domain = broker.ns_domain || NS_DEFAULT_DOMAIN;
  if (!/^[0-9]{2,6}$/.test(ext)) return json({ error: "invalid_extension", ext }, 400);

  const steps: Record<string, unknown> = { broker: { id: broker.id, name: broker.full_name, ext, domain } };

  // 1. DID snapshot
  const { data: dids } = await admin
    .from("planipret_did_assignments")
    .select("phone_number_e164,phone_number_digits,status")
    .eq("extension", ext).eq("domain", domain);
  steps.dids_before = dids ?? [];

  const userUrl = `${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}`;
  const devBase = `${userUrl}/devices`;
  const mobileId = mobileDeviceId(ext);
  const widgetId = webDeviceId(ext);

  // 2. DELETE devices
  const deleted: any[] = [];
  const listRes = await nsFetch(devBase).catch(() => null);
  const existing = listRes?.ok ? await nsRead(listRes) : [];
  const ids = new Set<string>([mobileId, widgetId, ...legacyDeviceIds(ext)]);
  if (Array.isArray(existing)) {
    for (const d of existing) {
      const id = String(d?.device ?? d?.aor ?? "").replace(/^sip:/i, "").split("@")[0].trim();
      if (id) ids.add(id);
    }
  }
  for (const id of ids) {
    const r = await nsFetch(`${devBase}/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    deleted.push({ id, status: r?.status ?? 0, deleted: !!r?.ok });
  }
  steps.devices_deleted = deleted;

  // 3. DELETE utilisateur NS
  const delUser = await nsFetch(userUrl, { method: "DELETE" }).catch(() => null);
  steps.user_deleted = { status: delUser?.status ?? 0, ok: !!delUser?.ok };
  await new Promise((r) => setTimeout(r, 1500));

  // 4. RECREATE utilisateur + devices
  const mobilePassword = randomPassword();
  const widgetPassword = randomPassword();
  const [firstName, ...rest] = String(broker.full_name ?? "").trim().split(/\s+/);
  const createUser = await nsFetch(`${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users`, {
    method: "POST",
    body: JSON.stringify({
      user: ext,
      "name-first-name": firstName || ext,
      "name-last-name": rest.join(" ") || "Courtier",
      "directory-name": String(broker.full_name ?? ext),
      "email-address": String(broker.email ?? ""),
      "user-scope": "Basic User",
      "user-password": mobilePassword,
      password: mobilePassword,
    }),
  });
  steps.user_created = { status: createUser.status, ok: createUser.ok, data: await nsRead(createUser) };

  const createDevice = async (id: string, model: string, isMobile: boolean, password: string, transport: "TLS" | "WSS") => {
    const r = await nsFetch(devBase, {
      method: "POST",
      body: JSON.stringify({
        device: id,
        "device-sip-registration-password": password,
        "device-provisioning-protocol": "sip",
        "device-model": model,
        "core-server": "core1.cluster1.ucstack.io",
        "device-provisioning-registration-core-server": "core1.cluster1.ucstack.io",
        "server-nat": isMobile ? "yes" : "no",
        "device-sip-registration-expiry-seconds": 1800,
        "device-sip-nat-traversal-enabled": "automatic",
        synchronous: "yes",
        transport,
        "device-sip-transport-type": transport,
        "device-provisioning-sip-transport-protocol": transport.toLowerCase(),
        "device-srtp-enabled": "opportunistic",
        "device-sip-allowed-user-agent": "",
        "device-push-enabled": isMobile ? "yes" : "no",
      }),
    });
    return { id, status: r.status, created: r.ok, data: await nsRead(r) };
  };

  // Le mobile natif (PJSIP) enregistre en TLS 5061, le widget web en WSS.
  steps.mobile_device = await createDevice(mobileId, "Mobile Softphone", true, mobilePassword, "TLS");
  steps.widget_device = await createDevice(widgetId, "Web Softphone", false, widgetPassword, "WSS");

  // 5. Réassignation des DID (destination-user obligatoire)
  const didResults: any[] = [];
  for (const d of dids ?? []) {
    const number = String((d as any).phone_number_e164 ?? (d as any).phone_number_digits ?? "");
    if (!number) continue;
    const res = await assignDidToExtension(domain, number, ext).catch((e) => ({ ok: false, error: String(e) }));
    const verify = await verifyDidRouting(domain, number, ext).catch(() => null);
    didResults.push({ number, write: res, verify });
  }
  steps.dids_reassigned = didResults;

  // 5b. Afficheur sortant = premier DID du courtier (le user NS recréé repart à vide)
  const primaryDid = String((dids ?? [])[0]?.phone_number_digits ?? "").replace(/^1/, "");
  if (primaryDid.length === 10) {
    const r = await nsFetch(userUrl, {
      method: "PUT",
      body: JSON.stringify({
        "caller-id-number": primaryDid,
        "caller-id-name": String(broker.full_name ?? ext),
        "caller-id-number-emergency": primaryDid,
      }),
    }).catch(() => null);
    steps.caller_id = { number: primaryDid, ok: !!r?.ok, status: r?.status ?? 0 };
  }

  // 6. Secrets + profil Supabase
  const mobileSecretName = broker.ns_sip_password_ref_mobile || `pp_sip_${broker.id}_mobile`;
  const widgetSecretName = `pp_sip_${broker.id}_widget`;
  try {
    await admin.rpc("create_planipret_sip_secret", { _name: mobileSecretName, _value: mobilePassword, _broker_id: broker.id });
    await admin.rpc("create_planipret_sip_secret", { _name: widgetSecretName, _value: widgetPassword, _broker_id: broker.id });
  } catch (e) { steps.secret_error = String(e); }

  const { error: uErr } = await admin.from("planipret_profiles").update({
    extension: ext,
    ns_extension: ext,
    ns_domain: domain,
    ns_mobile_device_id: mobileId,
    ns_widget_device_id: widgetId,
    ns_sip_password_ref_mobile: mobileSecretName,
    ns_linked: true,
    ns_linked_at: new Date().toISOString(),
  }).eq("id", broker.id);
  steps.profile_updated = !uErr;
  if (uErr) steps.profile_error = uErr.message;

  const ok = !!steps.user_created && (steps.mobile_device as any)?.created && (steps.widget_device as any)?.created;
  return json({ ok, steps });
});
