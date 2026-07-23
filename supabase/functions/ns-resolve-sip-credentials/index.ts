// Resolve per-broker SIP credentials by querying NS-API for the real device.
// Uses NS_API_KEY server-side; the browser never sees the NS token.
//
// If the broker is linked to Maestro (`planipret_profiles.maestro_broker_id`)
// and the Maestro Telecom REST API returns valid SIP credentials, those are
// used first. Otherwise the existing NS-API flow runs unchanged.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getMaestroTelecomConfig,
  isMaestroTelecomConfigured,
  maestroTelecomFetch,
} from "../_shared/maestro-telecom.ts";


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

// Point WSS at the same core cluster the widget uses as its Outbound Proxy.
const NS_SIP_WSS_URL = Deno.env.get("NS_SIP_WSS_URL") ?? "wss://voice.ava-telecom.ca:9002";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function normalizeClientType(v: unknown): ClientType {
  if (v === "web" || v === "widget") return "web";
  return "mobile";
}

function deviceNameFor(ext: string, ct: ClientType): string {
  if (ct === "web" || ct === "widget") return `${ext}_web`;
  return `${ext}_${ct}`;
}

function deviceIdOf(d: any): string | null {
  const id = d?.device ?? d?.aor ?? d?.["device-aor"] ?? null;
  if (!id) return null;
  return String(id).replace(/^sip:/i, "").split("@")[0] || null;
}

// Must match the deterministic password generation in ns-provision-broker-devices.
async function derivePassword(userId: string): Promise<string> {
  const enc = new TextEncoder().encode(userId + "planipret-sip-2026");
  const h = await crypto.subtle.digest("SHA-256", enc);
  const hex = Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `Pp${hex.substring(0, 12)}!`;
}

async function nsGet(path: string) {
  const res = await fetch(`${NS_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${NS_API_KEY}`, Accept: "application/json" },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function nsPut(path: string, payload: Record<string, unknown>) {
  const res = await fetch(`${NS_API_BASE_URL}${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${NS_API_KEY}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok || res.status === 202, status: res.status, data };
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
    .select("id, user_id, ns_extension, ns_domain, maestro_broker_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.ns_extension) {
    return json({
      ok: false,
      error: "no_extension",
      action: "Contactez votre administrateur pour lier votre extension NetSapiens.",
    }, 200);
  }

  // Fast path: Maestro Telecom returns SIP credentials directly for the broker.
  // Only take that path when it returns a complete credential set; otherwise
  // fall through to the NS-API device query below (never break the flow).
  const maestroBrokerId = (profile as any).maestro_broker_id as string | null;
  if (maestroBrokerId) {
    try {
      const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const cfg = await getMaestroTelecomConfig(admin);
      if (isMaestroTelecomConfigured(cfg)) {
        const r = await maestroTelecomFetch<any>(cfg, `/users/${encodeURIComponent(maestroBrokerId)}/sip`);
        const d = r.data ?? {};
        const ext = d.sip_extension ?? d.extension;
        const dom = d.sip_domain ?? d.domain;
        const pwd = d.sip_password ?? d.password;
        if (r.ok && ext && dom && pwd) {
          const wss = d.sip_wss_url ?? d.wss_url ?? NS_SIP_WSS_URL;
          const wssUrls = Array.from(new Set([wss, NS_SIP_WSS_URL, "wss://core1.cluster1.ucstack.io:9002"].filter(Boolean)));
          return json({
            ok: true,
            source: "maestro_telecom",
            client_type: clientType,
            device_id: d.device_id ?? `${ext}_${clientType}`,
            sip_username: d.sip_username ?? ext,
            sip_auth_user: d.sip_auth_user ?? d.sip_username ?? ext,
            sip_password: pwd,
            sip_extension: ext,
            sip_domain: dom,
            sip_proxy: d.sip_proxy ?? FALLBACK_PROXY,
            sip_core_server: d.sip_core_server ?? d.sip_proxy ?? FALLBACK_PROXY,
            sip_uri: d.sip_uri ?? `sip:${ext}@${dom}`,
            sip_ws_url: wss,
            sip_wss_url: wss,
            sip_ws_urls: wssUrls,
            sip_wss_urls: wssUrls,
            display_name: d.display_name ?? String(ext),
            sip_state: d.sip_state ?? null,
            device_registered: d.device_registered ?? true,
          });
        }
      }
    } catch (e) {
      console.warn("[ns-resolve] maestro_telecom fallback failed:", (e as Error)?.message);
    }
  }

  const ext = String(profile.ns_extension);
  const domain = profile.ns_domain || NS_DEFAULT_DOMAIN;
  const deviceName = deviceNameFor(ext, clientType);

  console.log(`[ns-resolve] client_type=${clientType} ext=${ext} device=${deviceName}`);


  // Try the specific device first.
  let detail = await nsGet(`/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices/${encodeURIComponent(deviceName)}`);
  let device: any = detail.ok ? (Array.isArray(detail.data) ? detail.data[0] : detail.data) : null;
  let availableDevices: string[] = [];

  if (!device) {
    const list = await nsGet(`/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices`);
    const arr: any[] = Array.isArray(list.data) ? list.data : [];
    availableDevices = arr.map(deviceIdOf).filter(Boolean) as string[];
    device = arr.find((d) => {
      const id = (deviceIdOf(d) || "").toLowerCase();
      return id === deviceName.toLowerCase();
    }) ?? null;
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

  const resolvedId = deviceIdOf(device) || deviceName;
  const rawCore = (device["core-server"] ?? device["device-sip-registration-core-server"] ?? device["sip-registration-core-server"] ?? "").toString().trim();
  const coreServer = (rawCore || FALLBACK_PROXY).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const sipUri = device["device-sip-registration-uri"] ?? `sip:${resolvedId}@${domain}`;
  const sipState = device["device-sip-registration-state"] ?? device["registration-state"] ?? null;

  // Provide and enforce SIP credentials so JsSIP (web + iOS + Android) can register the device.
  // device-sip-allowed-user-agent must match the User-Agent sent by JsSIP: "JsSIP/x.x.x".
  // Leaving it empty or using a wildcard lets any softphone register.
  const sipPassword = await derivePassword(String(profile.user_id));
  let repairStatus: any = null;
  repairStatus = await nsPut(
    `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices/${encodeURIComponent(resolvedId)}`,
    {
      "device-sip-registration-password": sipPassword,
      "device-provisioning-registration-core-server": coreServer,
      "device-srtp-enabled": "opportunistic",
      "device-sip-allowed-user-agent": "",
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
    sip_ws_url: NS_SIP_WSS_URL,
    sip_wss_url: NS_SIP_WSS_URL,
    sip_ws_urls: Array.from(new Set([NS_SIP_WSS_URL, `wss://${coreServer}:9002`, "wss://core1.cluster1.ucstack.io:9002"])),
    sip_wss_urls: Array.from(new Set([NS_SIP_WSS_URL, `wss://${coreServer}:9002`, "wss://core1.cluster1.ucstack.io:9002"])),
    display_name: device["display-name"] ?? device.display_name ?? device.name ?? ext,
    sip_state: sipState,
    device_registered: sipState === "registered",
    repair_status: repairStatus ? { ok: repairStatus.ok, status: repairStatus.status } : null,
  });
});
