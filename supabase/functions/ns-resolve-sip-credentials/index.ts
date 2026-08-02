// Resolve per-broker SIP credentials by querying NS-API for the real device.
// Uses NS_API_KEY server-side; the browser never sees the NS token.
//
// One client = one device. Mobile always gets `<ext>M`, web/widget always get
// `<ext>W`. The Maestro Telecom fast path was removed: it returned the bare
// extension as `sip_username` (e.g. `113` instead of `113M`) with a password
// unrelated to the device, so both stacks ended up on the wrong AOR.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  mobileDeviceId,
  webDeviceId,
} from "../_shared/pp-device-ids.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
const FALLBACK_PROXY = Deno.env.get("NS_SIP_PROXY") ?? "core1.cluster1.ucstack.io";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type ClientType = "mobile" | "web" | "widget";

// Registrations must land on a call-processing core node, not the portal.
const NS_SIP_WSS_URL = Deno.env.get("NS_SIP_WSS_URL") ?? "wss://core1.cluster1.ucstack.io:9002";
// Single pinned core node: never mix core1/core2 for the same AOR.

/**
 * Carrier rule (2026-07): SIP clients must register to core1/core2, never to
 * the portal server (`portal*.ucstack.io`, reached via voice.ava-telecom.ca).
 * A registration held by the portal is not used for inbound call delivery →
 * calls go straight to voicemail.
 */
const isPortalWss = (u: string) => {
  try { return /(^|\.)(portal\d*|voice)[^/]*\.(ucstack\.io|ava-telecom\.ca)$/i.test(new URL(u).hostname); }
  catch { return /portal\d*\.|voice\.ava-telecom\.ca/i.test(u); }
};
const isCoreWss = (u: string) => {
  try { return /(^|\.)core\d+\.[^/]*ucstack\.io$/i.test(new URL(u).hostname); }
  catch { return /core\d+\./i.test(u); }
};
const edgeWssUrls = (candidates: (string | undefined | null)[]): string[] => {
  const kept = Array.from(new Set(candidates
    .map((u) => String(u ?? "").trim())
    .filter((u) => /^wss?:\/\//i.test(u))))
    .filter((u) => !isPortalWss(u))
    .filter(isCoreWss);
  // Pin to a SINGLE core node (no core1/core2 alternation).
  return [kept[0] ?? NS_SIP_WSS_URL];
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function normalizeClientType(v: unknown): ClientType {
  // Keep "widget" distinct from "web": both map to <ext>W but the stored secret
  // name differs, and mixing them up would let the widget take the mobile AOR.
  if (v === "web" || v === "widget") return v;
  return "mobile";
}

// Naming convention: <ext>M (mobile) / <ext>W (web+widget). No underscore —
// Snap Mobile provisioning and the web widget mangle `_` in the AOR user part.
// Tested on "mobile" (not "web") so that "widget" cannot fall through to the
// mobile branch and steal <ext>M.
function deviceNameFor(ext: string, ct: ClientType): string {
  return ct === "mobile" ? mobileDeviceId(ext) : webDeviceId(ext);
}

function deviceIdOf(d: any): string | null {
  const id = d?.device ?? d?.aor ?? d?.["device-aor"] ?? null;
  if (!id) return null;
  return String(id).replace(/^sip:/i, "").split("@")[0] || null;
}

// NetSapiens masks unreadable passwords as `***`; treat those as absent so we
// never register with a literal mask.
function usablePassword(value: unknown): string | null {
  const password = String(value ?? "").trim();
  if (!password || /^\*+$/.test(password)) return null;
  return password;
}

// Deterministic fallback for newly-created devices ONLY. The device id is part
// of the seed so <ext>M and <ext>W never share credentials (the portal shows
// different passwords per device, and rewriting one kicks the other off).
// Must match the generation in ns-provision-broker-devices.
async function derivePassword(userId: string, deviceId: string): Promise<string> {
  const enc = new TextEncoder().encode(`${userId}:${deviceId}:planipret-sip-2026`);
  const h = await crypto.subtle.digest("SHA-256", enc);
  const hex = Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `Pp${hex.substring(0, 12)}!`;
}

// Hard timeout so an unreachable NS host can never hang the function until the
// 150s platform idle timeout (which surfaces as a 504 + blank screen).
const NS_TIMEOUT_MS = 12000;

// voice.ava-telecom.ca intermittently hangs (TLS accepted, no response).
// core1.cluster1.ucstack.io serves the same NS-API and answers in <500ms, so we
// fail over to it instead of surfacing "ns_unreachable" to the app.
const NS_API_BASES: string[] = Array.from(
  new Set(
    [
      NS_API_BASE_URL,
      "https://core1.cluster1.ucstack.io/ns-api/v2",
      "https://voice.ava-telecom.ca/ns-api/v2",
    ]
      .filter(Boolean)
      .map((u) => u.replace(/\/+$/, "")),
  ),
);

async function nsFetchOnce(base: string, path: string, init: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${NS_API_KEY}`, Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(NS_TIMEOUT_MS),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok || res.status === 202, status: res.status, data };
}

async function nsFetch(path: string, init: RequestInit = {}) {
  let lastErr = "";
  for (const base of NS_API_BASES) {
    try {
      return await nsFetchOnce(base, path, init);
    } catch (e) {
      lastErr = (e as Error)?.message ?? "unknown";
      console.warn(`[ns-resolve] nsFetch ${base}${path} failed:`, lastErr);
    }
  }
  return { ok: false, status: 0, data: null, unreachable: true as const };
}


async function nsGet(path: string) {
  const r = await nsFetch(path);
  return { ...r, ok: r.status >= 200 && r.status < 300 };
}

async function nsPut(path: string, payload: Record<string, unknown>) {
  return await nsFetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function nsPost(path: string, payload: Record<string, unknown>) {
  return await nsFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * Ring-rule resync (fire-and-forget).
 *
 * Root cause observed on ext. 113: the corrected sim-ring payload in
 * `pp-sync-answering-rules` had never been applied to that extension, so NS
 * still held the legacy self-referencing rule → instant voicemail.
 * We therefore resync on EVERY credential resolve, throttled per broker, so no
 * extension can stay on a stale rule waiting for an admin to press a button.
 */
const RING_RULE_RESYNC_TTL_MS = 6 * 60 * 60 * 1000; // 6h per broker
const lastRingRuleResync = new Map<string, number>();

function queueRingRuleResync(brokerId: string, reason: string, force = false) {
  if (!brokerId) return;
  const now = Date.now();
  const last = lastRingRuleResync.get(brokerId) ?? 0;
  if (!force && now - last < RING_RULE_RESYNC_TTL_MS) return;
  lastRingRuleResync.set(brokerId, now);
  try {
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!svc) return;
    const p = fetch(`${SUPABASE_URL}/functions/v1/pp-sync-answering-rules`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-call": "1",
        Authorization: `Bearer ${svc}`,
      },
      body: JSON.stringify({ broker_id: brokerId }),
    })
      .then((r) => console.log(`[ns-resolve] ring-rule resync (${reason}) status=${r.status}`))
      .catch((e) => console.error(`[ns-resolve] ring-rule resync (${reason}) failed`, e));
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch { /* ignore */ }
  } catch (e) {
    console.error("[ns-resolve] ring-rule resync error", e);
  }
}


/**
 * Same device payload as ns-provision-broker-devices so EVERY broker ends up
 * with an identical `<ext>M` + `<ext>W` pair (no per-user drift).
 */
function deviceCreatePayload(id: string, isMobile: boolean, password: string, coreServer: string) {
  return {
    device: id,
    "device-sip-registration-password": password,
    "device-provisioning-protocol": "sip",
    "device-model": isMobile ? "Mobile Softphone" : "Web Softphone",
    "core-server": coreServer,
    "device-provisioning-registration-core-server": coreServer,
    "server-nat": isMobile ? "yes" : "no",
    // Documented NS-API v2 device fields. The registration expiry default is 60s,
    // which marks the softphone unregistered between re-REGISTERs (calls -> voicemail).
    "device-sip-registration-expiry-seconds": 1800,
    "device-sip-nat-traversal-enabled": "automatic",
    transport: "WSS",
    "device-sip-transport-type": "WSS",
    "device-srtp-enabled": "opportunistic",
    "device-sip-allowed-user-agent": "",
    "device-push-enabled": isMobile ? "yes" : "no",

  };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty ok */ }
  const clientType = normalizeClientType(body?.client_type);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ ok: false, error: "not_authenticated" }, 401);

  const { data: profile } = await userClient
    .from("planipret_profiles")
    .select("id, user_id, full_name, email, ns_extension, ns_domain, maestro_broker_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.ns_extension) {
    return json({
      ok: false,
      error: "no_extension",
      action: "Contactez votre administrateur pour lier votre extension NetSapiens.",
    }, 200);
  }

  // NOTE: a Maestro Telecom fast path used to run here and return before the
  // NS-API device query below. It resolved `sip_username: d.sip_username ?? ext`,
  // i.e. the bare extension (`113`) when Maestro omitted the field, together
  // with a Maestro-side password unrelated to the <ext>M device. `deviceNameFor()`
  // was therefore never applied, and the mobile app could register on the wrong
  // AOR. Removed on purpose: NS-API is the single source of truth for devices.

  const ext = String(profile.ns_extension);
  const domain = profile.ns_domain || NS_DEFAULT_DOMAIN;
  const deviceName = deviceNameFor(ext, clientType);
  const brokerDisplayName = String((profile as any).full_name || (profile as any).email || ext).trim();

  console.log(`[ns-resolve] client_type=${clientType} ext=${ext} device=${deviceName}`);


  // Try the specific device first.
  let detail = await nsGet(`/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices/${encodeURIComponent(deviceName)}`);
  let device: any = detail.ok ? (Array.isArray(detail.data) ? detail.data[0] : detail.data) : null;
  let availableDevices: string[] = [];

  let unreachable = (detail as any).unreachable === true;
  if (!device) {
    const list = await nsGet(`/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices`);
    unreachable = unreachable && (list as any).unreachable === true;
    const arr: any[] = Array.isArray(list.data) ? list.data : [];
    availableDevices = arr.map(deviceIdOf).filter(Boolean) as string[];
    device = arr.find((d) => {
      const id = (deviceIdOf(d) || "").toLowerCase();
      return id === deviceName.toLowerCase();
    }) ?? null;
  }

  if (!device && unreachable) {
    return json({
      ok: false,
      error: "ns_unreachable",
      extension: ext,
      domain,
      action: "Le serveur téléphonique est temporairement injoignable. Réessayez dans quelques instants.",
    }, 200);
  }



  // Self-heal: brokers provisioned before the `<ext>W` device existed (or whose
  // device was deleted in the portal) get it created on the fly, with exactly
  // the same payload as ns-provision-broker-devices. Applies to every broker,
  // not just the ones an admin re-provisioned manually.
  let createdPassword: string | null = null;
  if (!device) {
    const selfHealPwd = await derivePassword(String(profile.user_id), deviceName);
    createdPassword = selfHealPwd;
    const isMobile = clientType === "mobile";
    const created = await nsPost(
      `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices`,
      deviceCreatePayload(deviceName, isMobile, selfHealPwd, FALLBACK_PROXY),
    );
    console.log(`[ns-resolve] self-heal device ${deviceName} status=${created.status}`);
    if (created.ok || created.status === 409) {
      // A freshly created device is not in the user's answering rule yet →
      // inbound calls would keep going straight to voicemail. Force a resync.
      queueRingRuleResync(String(profile.user_id), "self_heal_device", true);

      const again = await nsGet(
        `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices/${encodeURIComponent(deviceName)}`,
      );
      device = again.ok ? (Array.isArray(again.data) ? again.data[0] : again.data) : null;
      if (!device) device = { device: deviceName, "core-server": FALLBACK_PROXY };
    }
  } else {
    // Device already exists but the answering rule may still be the legacy
    // self-referencing one (never re-synced since the fix). Throttled resync.
    queueRingRuleResync(String(profile.user_id), "periodic");
  }


  if (!device) {
    return json({
      ok: false,
      error: `device_not_found`,
      device_name: deviceName,
      available_devices: availableDevices,
      extension: ext,
      domain,
      action: "Aucun device SIP trouvé. Lancez la provision (ns-provision-broker-devices) ou contactez votre administrateur.",
    }, 200);
  }


  // Hard invariant: mobile ALWAYS registers as <ext>M, web/widget ALWAYS as
  // <ext>W, whatever NS-API echoes back. Without this, a divergent NS response
  // silently moved a client onto another client's device.
  const resolvedRaw = deviceIdOf(device) || deviceName;
  const resolvedId = deviceName;
  if (resolvedRaw.toLowerCase() !== resolvedId.toLowerCase()) {
    console.warn(`[ns-resolve] forced ${clientType} AOR ${resolvedId} (NS returned ${resolvedRaw})`);
  }
  const rawCore = (device["core-server"] ?? device["device-sip-registration-core-server"] ?? device["sip-registration-core-server"] ?? "").toString().trim();
  const coreServer = (rawCore || FALLBACK_PROXY).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const sipUri = device["device-sip-registration-uri"] ?? `sip:${resolvedId}@${domain}`;
  const sipState = device["device-sip-registration-state"] ?? device["registration-state"] ?? null;

  // Provide and enforce SIP credentials so JsSIP (web + iOS + Android) can register the device.
  // device-sip-allowed-user-agent must match the User-Agent sent by JsSIP: "JsSIP/x.x.x".
  // Leaving it empty or using a wildcard lets any softphone register.
  //
  // The password is NEVER rewritten here. Resolving credentials used to PUT a
  // freshly derived password on every call, which (a) was identical for <ext>M
  // and <ext>W because the seed was the user id alone, and (b) invalidated the
  // registration of whichever client was already online — hence "113M only turns
  // green when I open the app". Read order: real device password, then the stored
  // secret, then the per-device derived value for a device we just created.
  const secretName = clientType === "mobile"
    ? `pp_sip_${profile.id}_mobile`
    : `pp_sip_${profile.id}_widget`;
  let storedSecret: string | null = null;
  try {
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await admin.rpc("read_planipret_sip_secret", { _name: secretName });
    storedSecret = typeof data === "string" ? data : null;
  } catch (e) {
    console.warn(`[ns-resolve] secret read failed (${secretName}):`, (e as Error)?.message);
  }
  const sipPassword = usablePassword(device["device-sip-registration-password"])
    ?? usablePassword(storedSecret)
    ?? createdPassword;
  if (!sipPassword) {
    return json({
      ok: false,
      error: "device_credentials_unavailable",
      device_id: resolvedId,
      client_type: clientType,
      action: "Le mot de passe SIP du device est illisible. Relancez la provision (ns-provision-broker-devices) pour le regenerer.",
    }, 409);
  }
  let repairStatus: any = null;
  repairStatus = await nsPut(
    `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices/${encodeURIComponent(resolvedId)}`,
    {
      "core-server": coreServer,
      "device-provisioning-registration-core-server": coreServer,
      "device-srtp-enabled": "opportunistic",
      "device-sip-allowed-user-agent": "",
      // Normalize every broker's device to the same transport/NAT/push profile.
      transport: "WSS",
      // SIP transport at the core level — prevents the 1001 close after 200 OK.
      "device-sip-transport-type": "WSS",
      "server-nat": clientType === "mobile" ? "yes" : "no",
      // Documented NS-API v2 keys — default expiry of 60s was dropping the
      // registration between re-REGISTERs; "automatic" NAT traversal keeps the
      // Contact rewritten for mobile networks.
      "device-sip-registration-expiry-seconds": 1800,
      "device-sip-nat-traversal-enabled": "automatic",
      "device-push-enabled": clientType === "mobile" ? "yes" : "no",
    },
  );



  return json({
    ok: true,
    client_type: clientType,
    device_id: resolvedId,
    sip_username: resolvedId,
    sip_auth_user: resolvedId,
    sip_password: sipPassword,
    sip_extension: ext,
    sip_domain: domain,
    sip_proxy: coreServer,
    sip_core_server: coreServer,
    sip_uri: sipUri,
    // Single pinned core node (no core1/core2 alternation).
    sip_ws_url: edgeWssUrls([NS_SIP_WSS_URL])[0],
    sip_wss_url: edgeWssUrls([NS_SIP_WSS_URL])[0],
    sip_ws_urls: edgeWssUrls([NS_SIP_WSS_URL]),
    sip_wss_urls: edgeWssUrls([NS_SIP_WSS_URL]),
    display_name: brokerDisplayName,
    sip_state: sipState,
    device_registered: sipState === "registered",
    repair_status: repairStatus ? { ok: repairStatus.ok, status: repairStatus.status } : null,
  });
});
