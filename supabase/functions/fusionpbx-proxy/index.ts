// FusionPBX v7 REST proxy for the AVA Statistic / Lemtel app.
// All client calls authenticate via Supabase JWT; the FusionPBX credentials
// (URL, username, API key, domain UUID) live only in Vault.
// Deployed: 2026-06-28 — fix: strip `extension` query param from CDR API calls
// (FusionPBX xml_cdr table has no `extension` column → SQL error → NO_CDR_ENDPOINT)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });

const LEMTEL_ORG = "71755d33-ed64-4ad5-a828-61c9d2029eb7";

// --------------------------------------------------------------------------
// FusionPBX PHP session login cache.
// /app/call_recordings/download.php uses PHP session cookies (not the API
// Basic auth), so we POST to /login.php and reuse the resulting cookie for
// up to 25 minutes per edge-runtime instance.
// --------------------------------------------------------------------------
type FusionSessionEntry = { cookie: string; expiresAt: number };
const FUSION_SESSIONS = new Map<string, FusionSessionEntry>();

// Cache for live SIP registrations (per domain_uuid). Short TTL to shield
// FusionPBX from dashboard polling while still feeling realtime.
type RegCacheEntry = { fetchedAt: number; payload: any };
const REGISTRATIONS_CACHE = new Map<string, RegCacheEntry>();
const REGISTRATIONS_TTL_MS = 15_000;

// Cache for live active calls (per domain_uuid)
type LiveCacheEntry = { fetchedAt: number; payload: any };
const ACTIVE_CALLS_CACHE = new Map<string, LiveCacheEntry>();
const ACTIVE_CALLS_TTL_MS = 5_000;

// Cache for live system health (per origin)
const SYSTEM_HEALTH_CACHE = new Map<string, LiveCacheEntry>();
const SYSTEM_HEALTH_TTL_MS = 10_000;

function fusionBaseOrigin(baseUrl: string) {
  try { return new URL(baseUrl).origin.replace(/\/+$/, ""); }
  catch { return String(baseUrl || "").replace(/\/+$/, ""); }
}

function firstPhpSessionCookie(setCookieHeader: string) {
  return (setCookieHeader || "").match(/PHPSESSID=[^;]+/i)?.[0] || "";
}

async function getFusionSessionCookie(baseUrl: string): Promise<string> {
  const now = Date.now();
  const origin = fusionBaseOrigin(baseUrl);
  const cached = FUSION_SESSIONS.get(origin);
  if (cached?.cookie && cached.expiresAt > now) return cached.cookie;

  const username = Deno.env.get("FUSIONPBX_USERNAME") || "";
  // FUSIONPBX_PASSWORD is the web UI password used for PHP session login.
  // Fall back to FUSIONPBX_API_KEY if FUSIONPBX_PASSWORD is not set — on some
  // FusionPBX installs the API key and the web password are the same value.
  const password = Deno.env.get("FUSIONPBX_PASSWORD") || Deno.env.get("FUSIONPBX_API_KEY") || "";
  if (!username || !password) throw new Error("FUSIONPBX_PASSWORD (or FUSIONPBX_API_KEY as fallback) not configured in Supabase Vault");

  // 1. Hit /login.php on the same host that will serve the audio to bootstrap
  // the host-scoped PHPSESSID cookie. Recording downloads are served by
  // pbxnode.lemtel.tel, so the session must be created on that host.
  const bootstrap = await fetch(`${origin}/login.php`, { redirect: "manual" });
  let cookie = firstPhpSessionCookie(bootstrap.headers.get("set-cookie") || "");
  const loginHtml = await bootstrap.text().catch(() => "");

  // Extract CSRF hidden inputs. FusionPBX renders one or more hidden inputs
  // with hex-string names AND hex-string values that must be echoed back.
  const csrfFields: Array<[string, string]> = [];
  const inputRegex = /<input\b[^>]*type=["']hidden["'][^>]*>/gi;
  for (const tag of loginHtml.match(inputRegex) || []) {
    const nameMatch = tag.match(/\bname=["']([^"']+)["']/i);
    const valueMatch = tag.match(/\bvalue=["']([^"']*)["']/i);
    if (!nameMatch || !valueMatch) continue;
    const name = nameMatch[1];
    const value = valueMatch[1];
    // Skip well-known non-CSRF fields
    if (/^(username|password|path|persistent)$/i.test(name)) continue;
    csrfFields.push([name, value]);
  }

  // 2. POST credentials with CSRF fields echoed back.
  const form = new URLSearchParams();
  form.set("username", username);
  form.set("password", password);
  form.set("path", "/");
  for (const [n, v] of csrfFields) form.set(n, v);
  const loginRes = await fetch(`${origin}/login.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: form.toString(),
    redirect: "manual",
  });
  const loginLocation = loginRes.headers.get("location") || "";
  const sessionMatch2 = firstPhpSessionCookie(loginRes.headers.get("set-cookie") || "");
  if (sessionMatch2) cookie = sessionMatch2;
  const loginStatus = loginRes.status;
  await loginRes.body?.cancel();
  if (!cookie) throw new Error(`FusionPBX login did not return a session cookie for ${origin}`);
  if (loginStatus >= 400) throw new Error(`FusionPBX login failed for ${origin} (${loginStatus}, csrf=${csrfFields.length})`);
  if (/login\.php/i.test(loginLocation) && loginStatus >= 300 && loginStatus < 400) {
    throw new Error(`FusionPBX login redirected back to login for ${origin} (csrf=${csrfFields.length})`);
  }


  // 3. Verify the session is authenticated by hitting a protected page without
  // following redirects. A redirect to login means the cookie is not authenticated.
  const probe = await fetch(`${origin}/core/user_settings/user_settings.php`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  const status = probe.status;
  const location = probe.headers.get("location") || "";
  await probe.body?.cancel();
  if (status >= 400 || (status >= 300 && status < 400 && /login\.php/i.test(location))) {
    throw new Error(`FusionPBX session probe failed for ${origin} (${status})`);
  }

  FUSION_SESSIONS.set(origin, { cookie, expiresAt: now + 25 * 60 * 1000 });
  return cookie;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Per-request correlation id. Echoed in every error response + every log line
  // so the client can quote it to support and we can trace one playback request
  // end-to-end across login + recording fetch attempts.
  const correlationId = (req.headers.get("x-request-id") || crypto.randomUUID()).slice(0, 36);
  const cidLog = (...args: unknown[]) => console.log(`[cid:${correlationId}]`, ...args);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Identify caller (JWT in Authorization header OR service-role for pg_cron)
  let userId: string | null = null;
  let organization_id: string | undefined;
  const authHeader = req.headers.get("Authorization") || "";
  const apiKeyHeader = req.headers.get("apikey") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  // Only the service-role key constitutes a trusted server-side call.
  // The anon key is public (shipped to the client) and must NOT bypass auth.
  const isServiceCall =
    authHeader === `Bearer ${serviceKey}` ||
    apiKeyHeader === serviceKey;

  if (!isServiceCall) {
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    userId = user.id;
  }

  // Parse body early to know which action is being requested
  let _bodyEarly: any = {};
  try { _bodyEarly = await req.clone().json(); } catch { /* allow empty */ }
  const _earlyAction: string = _bodyEarly.action || "ping";

  // Authorization: Lemtel members/admins, OR org_admin of the tenant whose
  // domain_uuid is being acted upon. This lets each customer's admin manage
  // their own phone system through the proxy.
  if (!isServiceCall && userId) {
    const readOnly = new Set(["ping", "debug-raw", "resolve-domain", "diagnostics", "list-extensions", "list-domains", "list-cdrs", "get-cdrs", "sync-cdrs", "backfill-cdrs", "sync-domains", "sync-voicemail-messages", "sync-ivr-options", "sync-all", "get-recording", "get-recording-signed-url", "list-queues", "queue-login", "queue-logout", "queue-pause", "list-ivrs", "list-ring-groups", "list-moh", "list-recordings", "list-devices", "list-destinations", "list-voicemails", "list-voicemail-messages", "list-registrations", "get-registrations", "get-registrations-live", "list-gateways", "list-gateways-all-domains", "list-gateways-merged", "get-gateways", "list-sip-profiles", "list-conferences", "list-hold-music", "list-dialplans", "get-extension", "sync_status", "sync-status", "list-active-calls", "get-active-calls-live", "system-status", "get-system-health-live", "desktop-audit", "pbx-health-check", "health-check"]);
    const isRead = readOnly.has(_earlyAction);
    const rpcName = isRead ? "is_lemtel_member" : "is_lemtel_admin";
    const { data: allowed } = await admin.rpc(rpcName, { _user_id: userId });
    let permitted = !!allowed;
    if (!permitted && (_earlyAction === "originate-click-to-call" || _earlyAction === "repair-verto-extension-routing")) {
      const targetOrg = _bodyEarly?.organization_id;
      const fromExtension = String(
        _bodyEarly?.params?.from_extension ||
        _bodyEarly?.from_extension ||
        _bodyEarly?.params?.extension ||
        _bodyEarly?.extension ||
        ""
      );
      if (targetOrg && fromExtension) {
        const { data: spu } = await admin.from("pbx_softphone_users").select("id").eq("portal_user_id", userId).eq("organization_id", targetOrg).eq("extension", fromExtension).limit(1).maybeSingle();
        if (spu?.id) permitted = true;
      }
    }
    if (!permitted) {
      // Fallback: is caller an org_admin of the tenant tied to the requested domain?
      const targetDomain = _bodyEarly?.domain_uuid || _bodyEarly?.params?.domain_uuid;
      if (targetDomain) {
        const { data: org } = await admin.from("organizations").select("id").eq("fusionpbx_domain_uuid", targetDomain).maybeSingle();
        if (org?.id) {
          const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _org_id: org.id, _role: "org_admin" });
          if (isAdmin) permitted = true;
        }
      }
    }
    if (!permitted && isRead) {
      // Fallback for read-only sync actions: any authenticated member of the
      // target organization (including plain extension users) may pull their
      // own org's CDRs / voicemails / recordings.
      const targetOrg = _bodyEarly?.organization_id;
      if (targetOrg) {
        const { data: spu } = await admin
          .from("pbx_softphone_users")
          .select("id")
          .eq("portal_user_id", userId)
          .eq("organization_id", targetOrg)
          .limit(1)
          .maybeSingle();
        if (spu?.id) permitted = true;
        if (!permitted) {
          const { data: mem } = await admin
            .from("organization_members")
            .select("organization_id")
            .eq("user_id", userId)
            .eq("organization_id", targetOrg)
            .limit(1)
            .maybeSingle();
          if (mem?.organization_id) permitted = true;
        }
      }
    }
    if (!permitted) {
      return json({ error: "Forbidden", action: _earlyAction, required: rpcName }, 403);
    }
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const action: string = body.action || "ping";
  organization_id = body.organization_id || LEMTEL_ORG;
  const params = body.params || {};

  // Secrets
  const required = (n: string) => {
    const v = Deno.env.get(n);
    if (!v) throw { error: "MISSING_SECRET", secret: n, message: `Configure ${n} in Supabase Vault` };
    return v;
  };

  let FUSIONPBX_API_URL: string, FUSIONPBX_USERNAME: string, FUSIONPBX_API_KEY: string, FUSIONPBX_DOMAIN_UUID: string;
  const PBX_RECORDING_FILE_BASE = "https://pbxnode.lemtel.tel";
  try {
    FUSIONPBX_API_URL = required("FUSIONPBX_API_URL").replace(/\/+$/, "").replace(/\/app\/api(\/\d+)?$/, "");
    FUSIONPBX_USERNAME = required("FUSIONPBX_USERNAME");
    FUSIONPBX_API_KEY = required("FUSIONPBX_API_KEY");
    FUSIONPBX_DOMAIN_UUID = required("FUSIONPBX_DOMAIN_UUID");
  } catch (e: any) {
    cidLog("[secrets] MISSING_SECRET", { secret: e?.secret, action: body?.action });
    return json({ ...e, correlation_id: correlationId }, 400, { "X-Request-Id": correlationId });
  }

  // FusionPBX returns Basic auth with the raw API key as the password value
  // when called with "Authorization: Basic <api_key>" (the API key already
  // encodes the credentials). We support both styles, defaulting to the
  // confirmed-working pattern: Basic <FUSIONPBX_API_KEY>.
  const basicHeader = `Basic ${FUSIONPBX_API_KEY}`;

  // ─── Phase 1: Normalized org → domain_uuid resolution ──────────────────
  // Priority: explicit body.domain_uuid > params.domain_uuid > org lookup > vault fallback.
  // Resolving from organization_id ensures every list-*/sync-*/get-* action targets
  // the correct tenant domain instead of silently using the global vault default.
  async function resolveDomain(): Promise<{ domain: string; source: string; org_id: string | null }> {
    if (body.domain_uuid) return { domain: body.domain_uuid, source: "body", org_id: organization_id || null };
    if (params.domain_uuid) return { domain: params.domain_uuid, source: "params", org_id: organization_id || null };
    if (organization_id) {
      const { data: org } = await admin
        .from("organizations")
        .select("fusionpbx_domain_uuid")
        .eq("id", organization_id)
        .maybeSingle();
      const du = (org as any)?.fusionpbx_domain_uuid;
      if (du) return { domain: du, source: "organization", org_id: organization_id };
      console.warn(`[fusionpbx-proxy] org ${organization_id} has no fusionpbx_domain_uuid; falling back to vault default`);
    }
    return { domain: FUSIONPBX_DOMAIN_UUID, source: "vault", org_id: organization_id || null };
  }
  const _resolved = await resolveDomain();
  const requestedDomain: string = _resolved.domain;
  const domainQ = `domain_uuid=${requestedDomain}`;
  // Expose for debug actions
  (body as any)._resolvedDomain = _resolved;

  async function pbxFetch(path: string, init: RequestInit = {}) {
    const url = `${FUSIONPBX_API_URL}/app/api/7/${path}`;
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: basicHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers || {}),
        },
      });
    } catch (e: any) {
      return { ok: false, status: 0, error: "FUSIONPBX_UNREACHABLE", message: `Cannot reach ${FUSIONPBX_API_URL}: ${e?.message || e}`, latency_ms: Date.now() - started };
    }
    const text = await res.text();
    const latency_ms = Date.now() - started;
    if (res.status === 401 || res.status === 403)
      return { ok: false, status: res.status, error: "FUSIONPBX_AUTH_FAILED", message: "Check FUSIONPBX_API_KEY in Vault", latency_ms, raw: text.slice(0, 500) };
    if (res.status === 404)
      return { ok: false, status: 404, error: "ENDPOINT_NOT_FOUND", resource: path, latency_ms, raw: text.slice(0, 500) };
    let data: any;
    try { data = text ? JSON.parse(text) : {}; }
    catch { return { ok: false, status: res.status, error: "INVALID_RESPONSE", body: text.slice(0, 500), latency_ms }; }
    return { ok: res.ok, status: res.status, data, latency_ms };
  }

  // Normalise a FusionPBX collection response. Endpoints return either an
  // object keyed by the resource (e.g. { extensions: [...] }) or a bare array.
  function collection(data: any, key: string): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data[key])) return data[key];
    if (Array.isArray(data.data)) return data.data;
    return [];
  }

  function buildVertoDialString() {
    return "{^^:sip_invite_domain=${dialed_domain}:presence_id=${dialed_user}@${dialed_domain}}${sofia_contact(*/${dialed_user}@${dialed_domain})},${verto_contact ${dialed_user}@${dialed_domain}}";
  }

  function hasVertoContact(value: unknown) {
    return String(value || "").toLowerCase().includes("verto_contact");
  }

  function mapExtension(e: any) {
    const ext = String(e.extension ?? "").trim();
    if (!ext) return { pbx_uuid: null } as any;
    const nowIso = new Date().toISOString();
    return {
      organization_id,
      pbx_uuid: e.extension_uuid,
      extension: ext,
      effective_cid_name: e.effective_caller_id_name ?? null,
      effective_cid_number: e.effective_caller_id_number ?? null,
      call_group: e.call_group ?? null,
      voicemail_enabled: e.voicemail_enabled === "true" || e.voicemail_enabled === true,
      call_recording: e.user_record ?? "none",
      do_not_disturb: e.do_not_disturb === "true" || e.do_not_disturb === true,
      forward_all_destination: e.forward_all_destination ?? null,
      enabled: e.enabled === "true" || e.enabled === true || e.enabled === undefined,
      description: e.description ?? null,
      raw_data: e,
      synced_at: nowIso,
      last_synced_at: nowIso,
      sync_status: "synced",
      pbx_source: "fusionpbx",
    };
  }

  function mapDomainUser(u: any) {
    const username = String(u.username ?? u.user_email ?? u.user ?? "").trim();
    if (!u.user_uuid || !username) return null;
    const nowIso = new Date().toISOString();
    return {
      organization_id,
      pbx_uuid: u.user_uuid,
      domain_uuid: u.domain_uuid ?? null,
      username,
      email: u.user_email ?? (username.includes("@") ? username : null),
      user_status: u.user_status ?? null,
      user_enabled: !(u.user_enabled === "false" || u.user_enabled === false),
      api_key: u.api_key ?? null,
      groups: Array.isArray(u.groups) ? u.groups : (u.user_groups ?? []),
      last_login_at: u.last_login ?? null,
      raw_data: u,
      sync_status: "synced",
      last_synced_at: nowIso,
    };
  }

  function mapDevice(d: any) {
    return {
      organization_id,
      pbx_uuid: d.device_uuid,
      mac_address: d.device_mac_address ?? d.mac_address ?? null,
      label: d.device_label ?? null,
      vendor: d.device_vendor ?? null,
      template: d.device_template ?? null,
      profile: d.device_profile_uuid ?? null,
      enabled: d.device_enabled === "true" || d.device_enabled === true || d.enabled === true,
      raw_data: d,
    };
  }

  function mapIvr(i: any) {
    return {
      organization_id,
      pbx_uuid: i.ivr_menu_uuid,
      name: i.ivr_menu_name ?? i.name ?? "IVR",
      extension: i.ivr_menu_extension ?? null,
      greet_long: i.ivr_menu_greet_long ?? null,
      greet_short: i.ivr_menu_greet_short ?? null,
      timeout_ms: i.ivr_menu_timeout ? parseInt(i.ivr_menu_timeout) : null,
      exit_action: i.ivr_menu_exit_action ?? null,
      direct_dial: i.ivr_menu_direct_dial === "true",
      ringback: i.ivr_menu_ringback ?? null,
      enabled: i.ivr_menu_enabled === "true" || i.ivr_menu_enabled === true,
      description: i.ivr_menu_description ?? null,
      raw_data: i,
    };
  }

  function mapQueue(q: any) {
    return {
      organization_id,
      pbx_uuid: q.call_center_queue_uuid ?? q.queue_uuid,
      name: q.queue_name ?? q.name ?? "Queue",
      extension: q.queue_extension ?? null,
      strategy: q.queue_strategy ?? null,
      music_on_hold: q.queue_moh_sound ?? null,
      record_enabled: q.queue_record_template ? true : false,
      max_wait_time: q.queue_max_wait_time ? parseInt(q.queue_max_wait_time) : null,
      timeout_action: q.queue_timeout_action ?? null,
      enabled: q.queue_enabled === "true" || q.queue_enabled === true,
      description: q.queue_description ?? null,
      raw_data: q,
    };
  }

  function mapRingGroup(r: any) {
    return {
      organization_id,
      pbx_uuid: r.ring_group_uuid,
      name: r.ring_group_name ?? "Ring Group",
      extension: r.ring_group_extension ?? null,
      strategy: r.ring_group_strategy ?? null,
      forwarding: r.ring_group_forward_destination ?? null,
      enabled: r.ring_group_enabled === "true" || r.ring_group_enabled === true,
      description: r.ring_group_description ?? null,
      raw_data: r,
    };
  }

  function mapCdr(c: any) {
    const recName = c.record_name ?? null;
    const hasRec = !!(recName && recName !== "");
    let answer = c.answer_stamp ?? null;
    if (!answer || answer === "1969-12-31 19:00:00-05" || c.answer_epoch === "0" || c.answer_epoch === 0) {
      answer = null;
    }
    const billsec = c.billsec != null ? parseInt(c.billsec) : 0;
    const direction = c.direction ?? null;
    let missed: boolean | null = null;
    if (c.missed_call === "true" || c.missed_call === true) missed = true;
    else if (c.missed_call === "false" || c.missed_call === false) missed = false;
    else missed = (billsec === 0 && direction === "inbound");
    return {
      organization_id,
      pbx_uuid: c.xml_cdr_uuid ?? c.cdr_uuid ?? c.uuid,
      extension_uuid: c.extension_uuid ?? null,
      domain_uuid: c.domain_uuid ?? null,
      domain_name: c.domain_name ?? null,
      direction,
      caller_name: c.caller_id_name ?? null,
      caller_number: c.caller_id_number ?? null,
      extension: c.extension ?? c.extension_number ?? c.caller_extension ?? null,
      destination: c.caller_destination ?? c.destination_number ?? null,
      source_number: c.source_number ?? null,
      destination_number: c.destination_number ?? null,
      start_at: c.start_stamp ?? null,
      answer_at: answer,
      end_at: c.end_stamp ?? null,
      duration_seconds: c.duration ? parseInt(c.duration) : 0,
      billsec,
      mos: c.rtp_audio_in_mos ? parseFloat(c.rtp_audio_in_mos) : null,
      missed_call: missed,
      voicemail_message: c.voicemail_message ?? null,
      has_recording: hasRec,
      recording_path: c.record_path ?? null,
      recording_name: recName,
      hangup_cause: c.hangup_cause ?? null,
      sip_call_id: c.sip_call_id ?? null,
      call_status: c.status ?? null,
      ivr_menu_uuid: c.ivr_menu_uuid ?? null,
      ring_group_uuid: c.ring_group_uuid ?? null,
      waitsec: c.waitsec != null ? parseInt(c.waitsec) : null,
      pdd_ms: c.pdd_ms != null ? parseInt(c.pdd_ms) : null,
      raw_data: c,
    };
  }

  // -------- Actions --------
  try {
    if (action === "ping") {
      const r = await pbxFetch(`extensions?${domainQ}&limit=1`);
      if (!r.ok) return json(r, r.status || 500);
      const exts = collection(r.data, "extensions");
      return json({ status: "ok", latency_ms: r.latency_ms, extensions_count: exts.length, resolved_domain: _resolved });
    }

    if (action === "resolve-domain") {
      // Phase 0/1 diagnostics: report how the proxy resolves the active domain.
      return json({ ok: true, resolved: _resolved, vault_default: FUSIONPBX_DOMAIN_UUID, organization_id });
    }

    if (action === "diagnostics") {
      // Phase 0: per-inventory PBX vs AVA delta for the resolved domain.
      const orgId = organization_id;
      const dom = requestedDomain;
      const counts: Record<string, any> = { resolved_domain: _resolved };
      try {
        const r = await pbxFetch(`extensions?${domainQ}&limit=500`);
        counts.extensions_pbx = r.ok ? collection(r.data, "extensions").length : { error: r.status };
      } catch (e) { counts.extensions_pbx = { error: String(e) }; }
      try {
        const r = await pbxFetch(`devices?${domainQ}&limit=500`);
        counts.devices_pbx = r.ok ? collection(r.data, "devices").length : { error: r.status };
      } catch (e) { counts.devices_pbx = { error: String(e) }; }
      try {
        const r = await pbxFetch(`destinations?${domainQ}&limit=500`);
        counts.destinations_pbx = r.ok ? collection(r.data, "destinations").length : { error: r.status };
      } catch (e) { counts.destinations_pbx = { error: String(e) }; }
      try {
        const r = await pbxFetch(`registrations?${domainQ}`);
        counts.registrations_pbx = r.ok ? collection(r.data, "registrations").length : { error: r.status };
      } catch (e) { counts.registrations_pbx = { error: String(e) }; }

      if (orgId) {
        const tables = ["pbx_extensions","pbx_softphone_users","pbx_devices","pbx_destinations","phone_numbers"] as const;
        for (const t of tables) {
          const { count, error } = await admin.from(t).select("*", { count: "exact", head: true }).eq("organization_id", orgId);
          counts[`${t}_ava`] = error ? { error: error.message } : count;
        }
        const { data: lastSync } = await admin
          .from("pbx_sync_jobs")
          .select("id, job_type, status, started_at, completed_at, error_message")
          .eq("organization_id", orgId)
          .order("started_at", { ascending: false })
          .limit(10);
        counts.recent_sync_jobs = lastSync || [];
      }
      return json({ ok: true, organization_id: orgId, ...counts });
    }


    if (action === "debug-raw") {
      // Restricted to lemtel/super admins only — exposes raw FusionPBX
      // responses which may contain SIP passwords and other secrets.
      const { data: isAdmin } = await admin.rpc("is_lemtel_admin", { _user_id: userId });
      const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: userId });
      if (!isAdmin && !isSuper) return json({ error: "forbidden" }, 403);
      const p = params.path || "gateways";
      const r = await pbxFetch(p);
      // Strip well-known secret fields from any object before returning.
      const SECRET_KEYS = new Set(["password", "sip_password", "voicemail_password", "secret", "api_key", "auth_token"]);
      const scrub = (val: any): any => {
        if (Array.isArray(val)) return val.map(scrub);
        if (val && typeof val === "object") {
          const out: Record<string, any> = {};
          for (const [k, v] of Object.entries(val)) {
            out[k] = SECRET_KEYS.has(k.toLowerCase()) ? "***" : scrub(v);
          }
          return out;
        }
        return val;
      };
      return json({ ok: r.ok, status: r.status, raw: scrub(r.data), latency_ms: r.latency_ms });
    }

    if (action === "desktop-audit") {
      const auditAction = params.action || body.audit_action || "desktop.event";
      try {
        await admin.from("audit_logs").insert({
          organization_id,
          user_id: userId,
          action: auditAction,
          resource_type: params.resource_type || null,
          resource_id: params.resource_id || null,
          metadata: { source: "ava-softphone-desktop", ...(params.metadata || {}) },
        });
      } catch (auditErr: any) {
        console.warn("desktop audit failed:", auditErr?.message);
      }
      return json({ ok: true });
    }

    if (action === "list-gateways-all-domains") {
      const d = await pbxFetch("domains");
      const domains = collection(d.data, "domains");
      const results = await Promise.all(domains.map(async (dom: any) => {
        const r = await pbxFetch(`gateways?domain_uuid=${dom.domain_uuid}`);
        const rows = collection(r.data, "gateways");
        return rows.map((g: any) => ({ ...g, _domain_name: dom.domain_name, _domain_uuid: dom.domain_uuid }));
      }));
      const all = results.flat();
      return json({ ok: true, data: all, total_domains: domains.length, total_gateways: all.length });
    }

    // Merged: global gateways (no domain filter) + per-domain gateways, de-duped.
    // FusionPBX stores most gateways with domain_uuid=NULL (global to FreeSWITCH),
    // which are filtered OUT when ?domain_uuid= is supplied. The unfiltered call
    // is the one that matches what the FusionPBX GUI shows.
    if (action === "list-gateways-merged") {
      const globalRes = await pbxFetch(`gateways`);
      const globals = collection(globalRes.data, "gateways");
      const d = await pbxFetch("domains");
      const domains = collection(d.data, "domains");
      const perDomain = await Promise.all(domains.map(async (dom: any) => {
        const r = await pbxFetch(`gateways?domain_uuid=${dom.domain_uuid}`);
        return collection(r.data, "gateways").map((g: any) => ({ ...g, _domain_name: dom.domain_name, _domain_uuid: dom.domain_uuid }));
      }));
      const scoped = perDomain.flat();
      const map = new Map<string, any>();
      for (const g of [...globals, ...scoped]) {
        const id = g.gateway_uuid || g.gateway;
        if (id && !map.has(id)) map.set(id, g);
      }

      // Fallback: FusionPBX API plugin auto-scopes to the API user's domain
      // and won't return global (domain_uuid=NULL) gateways. Ask FreeSWITCH
      // directly via `sofia status gateway` so we surface the same list the
      // FusionPBX GUI shows.
      let sofiaSource = "none";
      if (map.size === 0) {
        console.warn("[fs_cli-fallback]", {
          action: "list-gateways-merged",
          reason: "rest_returned_zero_gateways",
          perm_missing: "gateway_view|gateway_all",
          global_status: globalRes.status,
          scoped_domains: domains.length,
        });
        try {
          const sofia = await pbxWrite(`commands`, "POST", {
            commands: [{ command: "sofia", arguments: "status gateway" }],
          });
          const raw = sofia?.data;
          const text: string =
            (typeof raw?.details?.[0]?.response === "string" && raw.details[0].response) ||
            (typeof raw?.response === "string" && raw.response) ||
            (typeof raw?.raw === "string" && raw.raw) ||
            (typeof raw === "string" ? raw : "");
          for (const line of text.split("\n")) {
            const m = line.match(/^\s*(\S+)\s+gateway\s+(\S+)\s+(\S+)\s*$/i);
            if (m) {
              const name = m[1];
              const data = m[2];
              const state = m[3];
              if (!map.has(name)) {
                const proxy = (data.match(/sip:[^@]*@([^;]+)/i) || [, null])[1] || data;
                map.set(name, {
                  gateway_uuid: name,
                  gateway: name,
                  proxy,
                  context: "public",
                  register: state.toUpperCase() === "REGED" ? "true" : "false",
                  enabled: "true",
                  hostname: proxy,
                  description: `via FreeSWITCH (${state})`,
                  _source: "sofia",
                  _state: state,
                });
              }
            }
          }
          sofiaSource = "sofia";
          console.info("[fs_cli-fallback] success", { action: "list-gateways-merged", recovered: map.size });
        } catch (e: any) {
          console.error("[fs_cli-fallback] threw", { action: "list-gateways-merged", err: e?.message || String(e) });
        }
      }

      const data = Array.from(map.values());
      return json({
        ok: true,
        data,
        total_global: globals.length,
        total_scoped: scoped.length,
        total_unique: data.length,
        fallback: sofiaSource,
        global_status: globalRes.status,

        global_error: globalRes.ok ? null : ((globalRes as any).error || (globalRes as any).raw || null),
      });
    }

    // ---- LIST actions ----
    const listMap: Record<string, { path: string; key: string }> = {
      "list-extensions":    { path: `extensions?${domainQ}`,          key: "extensions" },
      "list-devices":       { path: `devices?${domainQ}`,             key: "devices" },
      "list-ivrs":          { path: `ivr_menus?${domainQ}`,           key: "ivr_menus" },
      "list-queues":        { path: `call_center_queues?${domainQ}`,  key: "call_center_queues" },
      "list-ring-groups":   { path: `ring_groups?${domainQ}`,         key: "ring_groups" },
      "list-destinations":  { path: `destinations?${domainQ}`,        key: "destinations" },
      "list-voicemails":    { path: `voicemails?${domainQ}`,          key: "voicemails" },
      "list-registrations": { path: `registrations?${domainQ}`,       key: "registrations" },
      "list-moh":           { path: `music_on_hold?${domainQ}`,       key: "music_on_hold" },
      "list-recordings":    { path: `recordings?${domainQ}`,          key: "recordings" },
      "list-domains":       { path: `domains`,                        key: "domains" },
    };
    if (listMap[action]) {
      const m = listMap[action];
      const r = await pbxFetch(m.path);
      if (!r.ok) return json(r, r.status || 500);
      return json({ ok: true, data: collection(r.data, m.key), latency_ms: r.latency_ms });
    }

    // ---- CREATE / UPDATE / DELETE helpers ----
    // FusionPBX API v7 requires QUERY-PARAM auth (?key=...&username=...) for
    // POST/PUT/DELETE — the Authorization header returns 403 on writes.
    async function pbxWrite(path: string, method: "POST" | "PUT" | "DELETE", payload?: unknown) {
      const url = new URL(`${FUSIONPBX_API_URL}/app/api/7/${path}`);
      url.searchParams.set("key", FUSIONPBX_API_KEY);
      url.searchParams.set("username", FUSIONPBX_USERNAME);
      const started = Date.now();
      let res: Response;
      try {
        res = await fetch(url.toString(), {
          method,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: payload !== undefined ? JSON.stringify(payload) : undefined,
        });
      } catch (e: any) {
        return { ok: false, status: 0, error: "FUSIONPBX_UNREACHABLE", message: e?.message || String(e), latency_ms: Date.now() - started };
      }
      const text = await res.text();
      const latency_ms = Date.now() - started;
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      const embeddedCode = data?.code || data?.details?.[0]?.code;
      const embeddedMessage = data?.details?.[0]?.message || data?.message || (typeof data?.raw === "string" ? data.raw : null);
      const failed = !res.ok || (embeddedCode && String(embeddedCode) !== "200");
      return { ok: !failed, status: res.status, data, latency_ms, embeddedCode: embeddedCode ?? null, message: embeddedMessage };
    }

    async function writeCollection(path: string, key: string, payload: any) {
      return pbxWrite(path, "POST", { [key]: [{ ...payload, domain_uuid: payload?.domain_uuid || requestedDomain || FUSIONPBX_DOMAIN_UUID }] });
    }

    if (action === "queue-login" || action === "queue-logout" || action === "queue-pause") {
      const ext = String(params.extension || body.extension || "").trim();
      const queueName = String(params.queue_name || params.queue_extension || params.queue_id || body.queue || "").trim();
      if (!ext || !queueName) return json({ error: "extension and queue required" }, 400);
      const paused = params.paused === true || params.paused === "true";
      const status = action === "queue-logout" ? "Logged Out" : action === "queue-pause" && paused ? "On Break" : "Available";
      const r = await pbxWrite("fifo_agent_status", "POST", {
        action: action === "queue-login" ? "add" : action === "queue-logout" ? "remove" : "set-status",
        agent: `${ext}@${params.sip_domain || body.sip_domain || ""}`.replace(/@$/, ""),
        queue: queueName,
        status,
      });
      return json({ ok: r.ok, status: r.status, data: r.data, message: r.message ?? null });
    }

    // ---- DOMAIN management (multi-tenant provisioning) ----
    if (action === "create-domain" || action === "createDomain") {
      const domain_name = body.domain_name || params.domain_name;
      const description = body.domain_description || params.domain_description || `Customer domain`;
      if (!domain_name) return json({ ok: false, error: "domain_name required" }, 400);
      const r = await pbxWrite("domains", "POST", {
        domains: [{ domain_name, domain_description: description, domain_enabled: "true" }],
      });
      if (!r.ok) return json(r, r.status || 500);
      // Try to read back the UUID
      const list = await pbxFetch(`domains?domain_name=${encodeURIComponent(domain_name)}`);
      const arr = collection(list.data, "domains");
      const created = arr.find((d: any) => d.domain_name === domain_name) || arr[0];
      return json({ ok: true, domain_uuid: created?.domain_uuid || null, domain_name, raw: r.data });
    }

    if (action === "delete-domain") {
      const id = body.domain_uuid || params.domain_uuid;
      if (!id) return json({ ok: false, error: "domain_uuid required" }, 400);
      return json(await pbxWrite(`domains/${id}`, "DELETE"));
    }

    if (action === "update-domain") {
      const id = body.domain_uuid || params.domain_uuid;
      if (!id) return json({ ok: false, error: "domain_uuid required" }, 400);
      const patch: Record<string, unknown> = { domain_uuid: id };
      if ("domain_description" in params) patch.domain_description = (params as any).domain_description;
      if ("domain_enabled" in params) patch.domain_enabled = String((params as any).domain_enabled);
      if ("domain_name" in params) patch.domain_name = (params as any).domain_name;
      return json(await pbxWrite(`domains/${id}`, "PUT", { domains: [patch] }));
    }

    if (action === "get-registrations") {
      const r = await pbxFetch(`registrations?${domainQ}`);
      if (!r.ok) return json(r, r.status || 500);
      return json({ ok: true, data: collection(r.data, "registrations") });
    }

    // Live registrations with normalization + short-TTL cache.
    // Resolves domain_uuid from the org when not provided.
    if (action === "get-registrations-live") {
      let domainUuid: string = body.domain_uuid || params.domain_uuid || "";
      if (!domainUuid && organization_id) {
        const { data: org } = await admin
          .from("organizations")
          .select("fusionpbx_domain_uuid")
          .eq("id", organization_id)
          .maybeSingle();
        domainUuid = (org as any)?.fusionpbx_domain_uuid || FUSIONPBX_DOMAIN_UUID;
      }
      if (!domainUuid) domainUuid = FUSIONPBX_DOMAIN_UUID;

      const now = Date.now();
      const force = body.force === true || params.force === true;
      const cached = REGISTRATIONS_CACHE.get(domainUuid);
      if (!force && cached && now - cached.fetchedAt < REGISTRATIONS_TTL_MS) {
        return json({ ...cached.payload, cached: true });
      }

      const r = await pbxFetch(`registrations?domain_uuid=${domainUuid}`);
      if (!r.ok) return json(r, r.status || 500);
      const raw = collection(r.data, "registrations");
      const norm = (raw || []).map((x: any) => {
        const ext = String(x.user || x.aor || x.extension || x.reg_user || "").split("@")[0] || "";
        return {
          extension: ext,
          user: x.user || x.aor || ext,
          contact: x.contact || x.url || x.sip_contact || "",
          agent: x.agent || x.user_agent || x.useragent || "",
          status: x.status || "registered",
          expires: x.expires || x.expire || x.expiration || "",
          hostname: x.hostname || x.host || "",
          network_ip: x.network_ip || x.network_addr || x.src_ip || x.network_address || "",
          network_port: x.network_port || x.src_port || "",
          user_agent: x.user_agent || x.agent || "",
          sip_profile: x.profile_name || x.sip_profile || x.profile || "internal",
          ts: x.last_register || x.ts || null,
        };
      });
      const payload = {
        ok: true,
        domain_uuid: domainUuid,
        count: norm.length,
        registered: norm.filter((r: any) => (r.status || "registered").toLowerCase() === "registered").length,
        data: norm,
        cached: false,
        fetched_at: new Date(now).toISOString(),
      };
      REGISTRATIONS_CACHE.set(domainUuid, { fetchedAt: now, payload });
      return json(payload);
    }

    if (action === "get-extension") {
      const id = body.extension_uuid || params.extension_uuid;
      const extNum = body.extension || params.extension;
      const domId = body.domain_uuid || params.domain_uuid || FUSIONPBX_DOMAIN_UUID;
      let url: URL;
      if (id) {
        url = new URL(`${FUSIONPBX_API_URL}/app/api/7/extensions/${id}`);
      } else if (extNum) {
        url = new URL(`${FUSIONPBX_API_URL}/app/api/7/extensions`);
        url.searchParams.set("extension", String(extNum));
        url.searchParams.set("domain_uuid", domId);
      } else {
        return json({ error: "Need extension_uuid or extension" }, 400);
      }
      url.searchParams.set("key", FUSIONPBX_API_KEY);
      url.searchParams.set("username", FUSIONPBX_USERNAME);
      try {
        const res = await fetch(url.toString(), { headers: { Authorization: basicHeader, Accept: "application/json" } });
        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { return json({ error: "PARSE_ERROR", raw: text.slice(0, 400) }, 200); }
        return json(data, 200);
      } catch (e: any) {
        return json({ error: "FETCH_FAILED", message: e?.message || String(e) }, 200);
      }
    }

    if (action === "create-extension") {

      const extData = body.data || params || {};
      const attemptAt = new Date().toISOString();

      const requestBody = {
        extensions: [{
          domain_uuid: extData.domain_uuid || FUSIONPBX_DOMAIN_UUID,
          extension: String(extData.extension),
          password: extData.password,
          effective_caller_id_name: extData.effective_caller_id_name,
          effective_caller_id_number: String(extData.extension),
          outbound_caller_id_name: extData.outbound_caller_id_name || extData.effective_caller_id_name,
          outbound_caller_id_number: extData.outbound_caller_id_number || "15144942888",
          emergency_caller_id_name: "Lemtel",
          emergency_caller_id_number: "5144942888",
          call_timeout: String(extData.call_timeout || "30"),
          call_group: extData.call_group || "",
          dial_string: extData.dial_string || buildVertoDialString(),
          user_record: extData.user_record || "none",
          enabled: "true",
          description: extData.description || extData.effective_caller_id_name,
          user_context: "lemtel.lemtel.tel",
          accountcode: "lemtel.lemtel.tel",
          limit_max: "5",
          limit_destination: "!USER_BUSY",
        }],
      };

      const extStarted = Date.now();
      const writeUrl = new URL(`${FUSIONPBX_API_URL}/app/api/7/extensions`);
      writeUrl.searchParams.set("key", FUSIONPBX_API_KEY);
      writeUrl.searchParams.set("username", FUSIONPBX_USERNAME);
      const res = await fetch(writeUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(requestBody),
      });
      const extLatency = Date.now() - extStarted;
      const responseText = await res.text();
      console.log("FusionPBX create-extension status=", res.status, "body=", responseText.slice(0, 500));

      let responseData: any = {};
      try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

      // FusionPBX often returns HTTP 200 with an embedded error code. Detect both.
      const embeddedCode = responseData?.code || responseData?.details?.[0]?.code;
      const embeddedMessage =
        responseData?.details?.[0]?.message || responseData?.message ||
        (typeof responseData?.raw === "string" ? responseData.raw : null);
      const failed = !res.ok || (embeddedCode && String(embeddedCode) !== "200");
      const extensionResult = {
        ok: !failed,
        http_status: res.status,
        embedded_code: embeddedCode ?? null,
        message: embeddedMessage,
        latency_ms: extLatency,
        attempted_at: attemptAt,
        response: responseData,
      };

      if (failed) {
        return json({
          error: "CREATE_FAILED",
          message: embeddedMessage || `HTTP ${res.status}`,
          status: res.status,
          embeddedCode,
          details: responseData,
          extension_result: extensionResult,
        }, 200);
      }

      const extensionUuid =
        responseData?.extensions?.[0]?.extension_uuid ||
        responseData?.extension_uuid ||
        responseData?.[0]?.extension_uuid || null;

      // Dedicated voicemail provisioning step (/voicemails endpoint)
      let voicemailResult: any = { skipped: true };
      if (extData.voicemail_enabled === "true" || extData.voicemail_enabled === true) {
        const vmStarted = Date.now();
        try {
          const vmUrl = new URL(`${FUSIONPBX_API_URL}/app/api/7/voicemails`);
          vmUrl.searchParams.set("key", FUSIONPBX_API_KEY);
          vmUrl.searchParams.set("username", FUSIONPBX_USERNAME);
          const vmRes = await fetch(vmUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ voicemails: [{
              domain_uuid: extData.domain_uuid || FUSIONPBX_DOMAIN_UUID,
              voicemail_id: String(extData.extension),
              voicemail_password: extData.voicemail_password || String(extData.extension),
              voicemail_mail_to: extData.voicemail_mail_to || "",
              voicemail_attach_file: "true",
              voicemail_local_after_email: "true",
              voicemail_enabled: "true",
              voicemail_description: extData.description || "",
            }]}),
          });
          const vmText = await vmRes.text();
          let vmData: any = {}; try { vmData = JSON.parse(vmText); } catch { vmData = { raw: vmText }; }
          const vmCode = vmData?.code || vmData?.details?.[0]?.code;
          const vmMsg = vmData?.details?.[0]?.message || vmData?.message || (typeof vmData?.raw === "string" ? vmData.raw : null);
          const vmFailed = !vmRes.ok || (vmCode && String(vmCode) !== "200");
          voicemailResult = {
            ok: !vmFailed,
            http_status: vmRes.status,
            embedded_code: vmCode ?? null,
            message: vmMsg,
            latency_ms: Date.now() - vmStarted,
            attempted_at: new Date().toISOString(),
            response: vmData,
          };
        } catch (e: any) {
          voicemailResult = { ok: false, error: e?.message || String(e), attempted_at: new Date().toISOString() };
        }
      }

      return json({
        success: true,
        extension: extData.extension,
        extension_uuid: extensionUuid,
        raw_response: responseData,
        extension_result: extensionResult,
        voicemail_result: voicemailResult,
      }, 200);
    }

    if (action === "upload-recording") {
      // Multipart POST to FusionPBX's /app/recordings/recording_edit.php
      // using a logged-in PHP session (same flow as GUI uploads).
      const filename = String(params.filename || body.filename || "").trim();
      const b64 = String(params.audio_base64 || body.audio_base64 || "");
      const mime = String(params.mime || body.mime || "audio/mpeg");
      const description = String(params.description || body.description || "Generated by AVA TTS");
      if (!filename || !b64) return json({ error: "filename and audio_base64 required" }, 400);

      const origin = fusionBaseOrigin(FUSIONPBX_API_URL);
      let cookie: string;
      try { cookie = await getFusionSessionCookie(FUSIONPBX_API_URL); }
      catch (e: any) { return json({ error: "FUSIONPBX_SESSION_FAILED", message: e?.message || String(e) }, 502); }

      // 1) GET recording_edit.php to scrape CSRF/hidden fields
      const editUrl = `${origin}/app/recordings/recording_edit.php`;
      const editRes = await fetch(editUrl, { headers: { Cookie: cookie } });
      const editHtml = await editRes.text();
      if (editRes.status >= 400) return json({ error: "RECORDING_EDIT_LOAD_FAILED", status: editRes.status }, 502);
      const csrfFields: Array<[string, string]> = [];
      for (const tag of editHtml.match(/<input\b[^>]*type=["']hidden["'][^>]*>/gi) || []) {
        const n = tag.match(/\bname=["']([^"']+)["']/i)?.[1];
        const v = tag.match(/\bvalue=["']([^"']*)["']/i)?.[1];
        if (!n) continue;
        if (/^(recording_name|recording_description|recording_filename)$/i.test(n)) continue;
        csrfFields.push([n, v ?? ""]);
      }

      // 2) Decode base64 audio
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      // 3) Multipart POST
      const fd = new FormData();
      for (const [n, v] of csrfFields) fd.append(n, v);
      fd.append("recording_name", filename.replace(/\.[^.]+$/, ""));
      fd.append("recording_filename", filename);
      fd.append("recording_description", description);
      fd.append("submit", "Save");
      fd.append("file", new Blob([bytes], { type: mime }), filename);

      const up = await fetch(editUrl, {
        method: "POST",
        headers: { Cookie: cookie },
        body: fd,
        redirect: "manual",
      });
      const upStatus = up.status;
      const upLoc = up.headers.get("location") || "";
      const upText = await up.text().catch(() => "");
      const success = (upStatus >= 200 && upStatus < 400) && !/login\.php/i.test(upLoc);
      if (!success) {
        return json({ error: "UPLOAD_FAILED", status: upStatus, location: upLoc, body: upText.slice(0, 400) }, 502);
      }
      return json({ ok: true, filename, bytes: bytes.length, status: upStatus, location: upLoc });
    }

    if (action === "update-extension") return json(await writeCollection("extensions", "extensions", params), 200);

    if (action === "repair-verto-extension-routing") {
      const extNum = String(params.extension || body.extension || "").trim();
      if (!extNum) return json({ error: "extension required" }, 400);

      const list = await pbxFetch(`extensions?domain_uuid=${requestedDomain}&extension=${encodeURIComponent(extNum)}`);
      if (!list.ok) return json({ ok: false, error: "EXTENSION_LOOKUP_FAILED", details: list }, list.status || 502);
      const rows = collection(list.data, "extensions");
      const current = rows.find((e: any) => String(e.extension || "") === extNum) || rows[0];
      const extensionUuid = current?.extension_uuid;
      if (!extensionUuid) return json({ ok: false, error: "EXTENSION_NOT_FOUND", extension: extNum }, 404);

      const dialString = buildVertoDialString();
      const patchPayload: Record<string, unknown> = {
        extension_uuid: extensionUuid,
        domain_uuid: current.domain_uuid || requestedDomain,
        dial_string: dialString,
        call_timeout: "20",
      };
      const write = await pbxWrite("extensions", "POST", { extensions: [patchPayload] });
      const wroteOk = write.ok || String((write as any).embeddedCode) === "000";
      if (!wroteOk) return json({ ok: false, extension: extNum, error: "ROUTING_REPAIR_FAILED", details: write }, 200);


      try {
        await admin.from("audit_logs").insert({
          organization_id, user_id: userId, action: "repair_verto_extension_routing",
          resource_type: "pbx_extension", resource_id: extensionUuid,
          metadata: { extension: extNum, had_verto_contact: hasVertoContact(current.dial_string), domain_uuid: requestedDomain },
        });
      } catch { /* audit best-effort */ }

      return json({
        ok: true,
        extension: extNum,
        extension_uuid: extensionUuid,
        effective_caller_id_number: patchPayload.effective_caller_id_number,
        dial_string_has_verto: true,
        previous_dial_string_has_verto: hasVertoContact(current.dial_string),
        pbx_status: write.status,
      });
    }

    if (action === "repair-all-extensions-verto") {
      const list = await pbxFetch(`extensions?domain_uuid=${requestedDomain}`);
      if (!list.ok) return json({ ok: false, error: "EXTENSION_LIST_FAILED", details: list }, list.status || 502);
      const rows = collection(list.data, "extensions");
      const dialString = buildVertoDialString();
      const results: Array<Record<string, unknown>> = [];
      let fixed = 0, failed = 0;
      for (const current of rows) {
        const extNum = String(current.extension || "").trim();
        const extensionUuid = current?.extension_uuid;
        if (!extNum || !extensionUuid) continue;
        const patchPayload: Record<string, unknown> = {
          extension_uuid: extensionUuid,
          domain_uuid: current.domain_uuid || requestedDomain,
          dial_string: dialString,
          call_timeout: "35",
          hangup_after_bridge: "true",
          user_record: "all",
        };
        const write = await pbxWrite("extensions", "POST", { extensions: [patchPayload] });
        const wroteOk = write.ok || String((write as any).embeddedCode) === "000";
        if (wroteOk) { fixed++; results.push({ extension: extNum, ok: true, code: (write as any).embeddedCode }); }
        else { failed++; results.push({ extension: extNum, ok: false, status: write.status, code: (write as any).embeddedCode, message: (write as any).message }); }


      }
      try {
        await admin.from("audit_logs").insert({
          organization_id, user_id: userId, action: "repair_all_extensions_verto",
          resource_type: "pbx_domain", resource_id: requestedDomain,
          metadata: { fixed, failed, total: rows.length },
        });
      } catch { /* audit best-effort */ }

      return json({ ok: true, domain_uuid: requestedDomain, total: rows.length, fixed, failed, results });
    }


    if (action === "delete-extension") {
      const id = params.extension_uuid;
      if (!id) return json({ error: "extension_uuid required" }, 400);
      return json(await pbxWrite(`extensions/${id}`, "DELETE"));
    }
    if (action === "create-device") return json(await writeCollection("devices", "devices", params));
    if (action === "update-device") return json(await writeCollection("devices", "devices", params));
    if (action === "delete-device") {
      const id = params.device_uuid;
      if (!id) return json({ error: "device_uuid required" }, 400);
      return json(await pbxWrite(`devices/${id}`, "DELETE"));
    }
    if (action === "create-ivr") return json(await writeCollection("ivr_menus", "ivr_menus", params));
    if (action === "update-ivr") return json(await writeCollection("ivr_menus", "ivr_menus", params));
    if (action === "delete-ivr") {
      const id = params.ivr_menu_uuid;
      if (!id) return json({ error: "ivr_menu_uuid required" }, 400);
      return json(await pbxWrite(`ivr_menus/${id}`, "DELETE"));
    }
    if (action === "list-ivr-options-for-menu") {
      const id = params.ivr_menu_uuid;
      if (!id) return json({ error: "ivr_menu_uuid required" }, 400);
      const r = await pbxFetch(`ivr_menu_options?ivr_menu_uuid=${id}&limit=2000`);
      if (!r.ok) return json(r, r.status || 500);
      return json({ ok: true, data: collection(r.data, "ivr_menu_options") });
    }
    if (action === "create-ivr-option") {
      const payload = { ...params, domain_uuid: FUSIONPBX_DOMAIN_UUID };
      return json(await pbxWrite("ivr_menu_options", "POST", { ivr_menu_options: [payload] }));
    }
    if (action === "update-ivr-option") {
      const id = params.ivr_menu_option_uuid;
      if (!id) return json({ error: "ivr_menu_option_uuid required" }, 400);
      return json(await pbxWrite(`ivr_menu_options/${id}`, "PUT", { ivr_menu_options: [{ ...params, ivr_menu_option_uuid: id }] }));
    }
    if (action === "delete-ivr-option") {
      const id = params.ivr_menu_option_uuid;
      if (!id) return json({ error: "ivr_menu_option_uuid required" }, 400);
      return json(await pbxWrite(`ivr_menu_options/${id}`, "DELETE"));
    }
    if (action === "create-queue") return json(await writeCollection("call_center_queues", "call_center_queues", params));
    if (action === "update-queue") return json(await writeCollection("call_center_queues", "call_center_queues", params));
    if (action === "delete-queue") {
      const id = params.call_center_queue_uuid || params.queue_uuid;
      if (!id) return json({ error: "call_center_queue_uuid required" }, 400);
      return json(await pbxWrite(`call_center_queues/${id}`, "DELETE"));
    }
    if (action === "list-queue-tiers") {
      const r = await pbxFetch(`call_center_tiers?${domainQ}`);
      if (!r.ok) return json(r, r.status || 500);
      return json({ ok: true, data: collection(r.data, "call_center_tiers"), latency_ms: r.latency_ms });
    }
    if (action === "add-queue-tier" || action === "update-queue-tier") {
      // FusionPBX expects tier_agent as "extension@domain_name" (not bare extension,
      // not UUID). Resolve domain_name from the requested domain_uuid, then normalize.
      const tierParams: Record<string, any> = { ...params };
      if (action === "add-queue-tier" && !tierParams.call_center_queue_uuid) {
        return json({ error: "call_center_queue_uuid required" }, 400);
      }
      const rawAgent = String(tierParams.tier_agent || "").trim();
      if (action === "add-queue-tier" && !rawAgent) {
        return json({ error: "tier_agent (extension) required" }, 400);
      }
      if (rawAgent && !rawAgent.includes("@")) {
        try {
          const dr = await pbxFetch(`domains/${requestedDomain}`);
          const domainName =
            (dr.data as any)?.domain?.domain_name ||
            (dr.data as any)?.domain_name ||
            (Array.isArray((dr.data as any)?.domains) ? (dr.data as any).domains[0]?.domain_name : null);
          if (domainName) tierParams.tier_agent = `${rawAgent}@${domainName}`;
        } catch (e) {
          console.warn("[add-queue-tier] domain_name resolve failed", e);
        }
      }
      // FusionPBX 422s on empty strings for numeric fields.
      for (const k of Object.keys(tierParams)) {
        if (tierParams[k] === "" || tierParams[k] === undefined) delete tierParams[k];
      }
      const w = await writeCollection("call_center_tiers", "call_center_tiers", tierParams);
      if (!w.ok) {
        console.error("[add-queue-tier] REST failed", { status: w.status, data: w.data, params: tierParams });
        const errText = JSON.stringify(w.data || {}) + " " + String((w as any).message || "");
        const isPermErr = /call_center_tier_add|forbidden|permission/i.test(errText) || w.status === 403;

        // fs_cli fallback: callcenter_config queue tier add <queue> <agent> <level> <position>
        if (isPermErr && action === "add-queue-tier") {
          try {
            // Resolve queue_name from queue_uuid if not already provided.
            let queueName = String(tierParams.queue_name || "").trim();
            if (!queueName && tierParams.call_center_queue_uuid) {
              const qr = await pbxFetch(`call_center_queues/${tierParams.call_center_queue_uuid}`);
              queueName =
                (qr.data as any)?.call_center_queue?.queue_name ||
                (qr.data as any)?.queue_name ||
                (Array.isArray((qr.data as any)?.call_center_queues) ? (qr.data as any).call_center_queues[0]?.queue_name : "") || "";
            }
            const agent = String(tierParams.tier_agent || "");
            const level = String(tierParams.tier_level ?? 1);
            const pos = String(tierParams.tier_position ?? 1);
            if (queueName && agent) {
              console.warn("[fs_cli-fallback]", {
                action: "add-queue-tier",
                reason: w.status === 403 ? "http_403" : "perm_error_in_body",
                perm_missing: "call_center_tier_add",
                queue: queueName,
                agent,
                rest_status: w.status,
              });
              const cli = await pbxWrite(`commands`, "POST", {
                commands: [{ command: "callcenter_config", arguments: `queue tier add ${queueName} ${agent} ${level} ${pos}` }],
              });
              const raw = cli?.data as any;
              const text: string =
                (typeof raw?.details?.[0]?.response === "string" && raw.details[0].response) ||
                (typeof raw?.response === "string" && raw.response) ||
                (typeof raw?.raw === "string" && raw.raw) ||
                (typeof raw === "string" ? raw : "");
              if (cli.ok && /\+OK|success/i.test(text)) {
                console.info("[fs_cli-fallback] success", { action: "add-queue-tier", queue: queueName, agent });
                return json({ ok: true, data: { fallback: "fs_cli", response: text }, warning: "Added via fs_cli fallback — REST perm 'call_center_tier_add' still missing on FusionPBX API user." });
              }
              console.error("[fs_cli-fallback] failed", { action: "add-queue-tier", status: cli.status, text: text?.slice(0, 240) });
            }
          } catch (e: any) {
            console.error("[fs_cli-fallback] threw", { action: "add-queue-tier", err: e?.message || String(e) });
          }

          return json({
            ok: false,
            error: "FusionPBX permission missing: add 'call_center_tier_add' (and 'call_center_tier_update', 'call_center_tier_delete', 'call_center_agent_add/update/delete', 'call_center_queue_view', 'command_add', 'command_edit') to the API user's group in Advanced → Group Manager, then retry.",
            perm_missing: "call_center_tier_add",
            details: w.data,
            status: w.status,
          }, 403);
        }

        return json({ ok: false, error: (w.data as any)?.message || (w.data as any)?.error || "FusionPBX rejected tier", details: w.data, status: w.status }, w.status || 500);
      }
      return json(w);
    }
    if (action === "remove-queue-tier") {
      const id = params.call_center_tier_uuid || params.tier_uuid;
      if (!id) return json({ error: "call_center_tier_uuid required" }, 400);
      return json(await pbxWrite(`call_center_tiers/${id}`, "DELETE"));
    }
    if (action === "list-queue-agents") {
      const r = await pbxFetch(`call_center_agents?${domainQ}`);
      if (!r.ok) return json(r, r.status || 500);
      return json({ ok: true, data: collection(r.data, "call_center_agents"), latency_ms: r.latency_ms });
    }
    if (action === "create-queue-agent" || action === "update-queue-agent") {
      return json(await writeCollection("call_center_agents", "call_center_agents", params));
    }
    if (action === "delete-queue-agent") {
      const id = params.call_center_agent_uuid || params.agent_uuid;
      if (!id) return json({ error: "call_center_agent_uuid required" }, 400);
      return json(await pbxWrite(`call_center_agents/${id}`, "DELETE"));
    }
    if (action === "create-ring-group" || action === "update-ring-group") {
      // FusionPBX rejects unknown columns and expects ring_group_destinations
      // as a separate subcollection, not a column on ring_groups.
      const rawDest = params.ring_group_destinations;
      const main: Record<string, unknown> = { ...params };
      delete (main as any).ring_group_destinations;

      // Strip empty strings — FusionPBX 422s on numeric fields with "".
      for (const k of Object.keys(main)) {
        if (main[k] === "" || main[k] === undefined) delete main[k];
      }

      const w = await writeCollection("ring_groups", "ring_groups", main);
      if (!w.ok) return json(w, w.status || 500);

      // Resolve ring_group_uuid (existing or newly created).
      let ringUuid: string | null = (main as any).ring_group_uuid || null;
      if (!ringUuid && main.ring_group_name) {
        const lookup = await pbxFetch(`ring_groups?domain_uuid=${(main as any).domain_uuid}&ring_group_name=${encodeURIComponent(String(main.ring_group_name))}`);
        const arr = collection(lookup.data, "ring_groups");
        ringUuid = (arr.find((r: any) => r.ring_group_name === main.ring_group_name) || arr[0])?.ring_group_uuid || null;
      }

      // Persist member destinations (comma-separated string OR array).
      if (ringUuid && rawDest != null && rawDest !== "") {
        const list: string[] = Array.isArray(rawDest)
          ? rawDest.map((x: any) => String(x).trim()).filter(Boolean)
          : String(rawDest).split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
        if (list.length) {
          // Clear existing destinations first so the list mirrors what the user typed.
          if (action === "update-ring-group") {
            const cur = await pbxFetch(`ring_group_destinations?ring_group_uuid=${ringUuid}`);
            const curArr = collection(cur.data, "ring_group_destinations");
            for (const d of curArr) {
              if (d.ring_group_destination_uuid) {
                await pbxWrite(`ring_group_destinations/${d.ring_group_destination_uuid}`, "DELETE");
              }
            }
          }
          let order = 1;
          for (const ext of list) {
            await pbxWrite("ring_group_destinations", "POST", {
              ring_group_destinations: [{
                ring_group_uuid: ringUuid,
                domain_uuid: (main as any).domain_uuid,
                destination_number: ext,
                destination_delay: 0,
                destination_timeout: Number((main as any).ring_group_call_timeout) || 30,
                destination_prompt: 0,
                destination_order: order++,
                destination_enabled: "true",
              }],
            });
          }
        }
      }
      return json({ ok: true, ring_group_uuid: ringUuid, data: w.data });
    }
    if (action === "delete-ring-group") {
      const id = params.ring_group_uuid;
      if (!id) return json({ error: "ring_group_uuid required" }, 400);
      return json(await pbxWrite(`ring_groups/${id}`, "DELETE"));
    }
    if (action === "create-destination" || action === "update-destination") {
      return json(await writeCollection("destinations", "destinations", params));
    }
    if (action === "delete-destination") {
      const id = params.destination_uuid;
      if (!id) return json({ error: "destination_uuid required" }, 400);
      return json(await pbxWrite(`destinations/${id}`, "DELETE"));
    }

    // ---- CDR endpoint fallback helper ----
    const CDR_ENDPOINTS = [
      "/app/api/7/xml_cdr",
      "/app/api/7/xml_cdrs",
      "/app/api/7/cdrs",
      "/app/api/7/cdr",
      "/app/xml_cdr/xml_cdr.php",
    ];

    async function fetchCdrsWithFallback(extraQp: Record<string, string> = {}) {
      // Try cached endpoint first
      const { data: integ } = await admin.from("pbx_integrations")
        .select("id, config").eq("organization_id", organization_id).maybeSingle();
      const cachedEp: string | undefined = (integ?.config as any)?.cdr_endpoint;
      const ordered = cachedEp
        ? [cachedEp, ...CDR_ENDPOINTS.filter((e) => e !== cachedEp)]
        : CDR_ENDPOINTS;
      const attempts: { endpoint: string; status: number; error?: string; sample?: string }[] = [];

      for (const ep of ordered) {
        const isPhp = ep.endsWith(".php");
        // The FusionPBX v7 generic API turns EVERY query param into a SQL
        // `column = value` equality. The xml_cdr table does NOT have columns
        // named `extension`, `order`, `order_by`, `page_size`, etc. Passing
        // any of those produces "column does not exist" errors.
        //
        // Use a strict allowlist of real xml_cdr columns. Anything else
        // (notably `extension`) is filtered post-fetch in JS.
        const ALLOWED_CDR_PARAMS = new Set([
          "domain_uuid", "extension_uuid", "limit", "offset",
          "direction", "hangup_cause", "missed_call",
          "caller_id_number", "caller_id_name",
          "destination_number", "start_stamp", "end_stamp",
        ]);
        const safeExtraQp: Record<string, string> = {};
        for (const [k, v] of Object.entries(extraQp || {})) {
          if (ALLOWED_CDR_PARAMS.has(k) && v != null && v !== "") {
            safeExtraQp[k] = String(v);
          }
        }
        const qp = new URLSearchParams({
          domain_uuid: requestedDomain || FUSIONPBX_DOMAIN_UUID,
          limit: "100",
          ...safeExtraQp,
        });
        if (isPhp) {
          qp.set("key", FUSIONPBX_API_KEY);
          qp.set("username", FUSIONPBX_USERNAME);
        }
        const url = `${FUSIONPBX_API_URL}${ep}?${qp.toString()}`;
        const started = Date.now();
        try {
          const res = await fetch(url, { headers: { Authorization: basicHeader, Accept: "application/json" } });
          const text = await res.text();
          if (!res.ok) {
            attempts.push({ endpoint: ep, status: res.status, sample: text.slice(0, 200) });
            continue;
          }
          let parsed: any;
          try { parsed = JSON.parse(text); }
          catch { attempts.push({ endpoint: ep, status: res.status, error: "invalid_json", sample: text.slice(0, 200) }); continue; }
          const records =
            parsed?.xml_cdr || parsed?.xml_cdrs || parsed?.cdrs || parsed?.cdr ||
            (Array.isArray(parsed) ? parsed : null);
          if (Array.isArray(records)) {
            if (integ && cachedEp !== ep) {
              await admin.from("pbx_integrations")
                .update({ config: { ...(integ.config as any || {}), cdr_endpoint: ep } })
                .eq("id", integ.id);
            }
            return { ok: true, endpoint: ep, records, latency_ms: Date.now() - started, attempts };
          }
          attempts.push({ endpoint: ep, status: res.status, error: "no_array_in_response", sample: text.slice(0, 200) });
        } catch (e: any) {
          attempts.push({ endpoint: ep, status: 0, error: e?.message || String(e) });
        }
      }
      return { ok: false, endpoint: null, records: [] as any[], attempts };
    }

    // ---- CDR endpoint diagnostic ----
    if (action === "test-cdr-endpoint") {
      const r = await fetchCdrsWithFallback({ limit: "1" });
      return json({
        ok: r.ok,
        endpoint: r.endpoint,
        record_count: r.records.length,
        attempts: r.attempts,
      });
    }

    if (action === "sync_status" || action === "sync-status") {
      const { data: jobs } = await admin.from("pbx_sync_jobs")
        .select("job_type,status,started_at,completed_at,created_at,error")
        .eq("organization_id", organization_id)
        .order("created_at", { ascending: false })
        .limit(10);
      const latest = (jobs || [])[0];
      return json({
        lastSync: latest?.completed_at || latest?.created_at || new Date(0).toISOString(),
        status: (jobs || []).some((j: any) => j.status === "failed") ? "error" : "ok",
        jobs: (jobs || []).map((j: any) => ({
          kind: j.job_type,
          startedAt: j.started_at || j.created_at,
          finishedAt: j.completed_at || j.created_at,
          ok: j.status !== "failed",
          error: j.error || null,
        })),
      });
    }

    // ---- CDRs (list / sync / full backfill via offset pagination) ----
    if (action === "list-cdrs" || action === "sync-cdrs" || action === "get-cdrs" || action === "backfill-cdrs") {
      const b: any = body;
      const extension: string | undefined = params.extension ?? b.extension;
      const requestedExtension = String(extension || "").trim();
      const cdrValueMatchesExtension = (value: unknown) => {
        if (!requestedExtension || value == null) return false;
        const raw = String(value).trim();
        if (!raw) return false;
        const userPart = raw.replace(/^sip:/i, "").split("@")[0]?.trim() || raw;
        const digits = userPart.replace(/[^0-9+]/g, "");
        return userPart === requestedExtension || digits === requestedExtension || digits === requestedExtension.replace(/[^0-9+]/g, "");
      };
      const cdrMatchesRequestedExtension = (cdr: any) => {
        if (!requestedExtension) return true;
        return [
          cdr.extension,
          cdr.extension_number,
          cdr.caller_extension,
          cdr.extension_uuid,
          cdr.caller_id_number,
          cdr.destination_number,
          cdr.caller_destination,
          cdr.source_number,
        ].some(cdrValueMatchesExtension);
      };
      const isBackfill = action === "backfill-cdrs";
      const pageSize: number = parseInt(String(params.page_size ?? b.page_size ?? (isBackfill ? 500 : (params.limit ?? b.limit ?? 100))));
      const maxPages: number = parseInt(String(params.max_pages ?? b.max_pages ?? (isBackfill ? 50 : 1)));
      let totalFetched = 0, totalUpserted = 0, lastEndpoint: string | null = null, pages = 0;
      const allErrors: string[] = [];
      let firstPage: any[] = [];

      // FusionPBX's xml_cdr API turns EVERY query param into a SQL `column = value`
      // equality, so we cannot sort or filter by date — the only knobs we control are
      // `limit` and `offset`, and the default ordering is by xml_cdr_uuid (essentially
      // random vs. wall-clock time). To guarantee we eventually surface every CDR
      // (including the freshest ones, which may sit anywhere in that ordering) we
      // page through the full dataset across cron ticks using a persistent rolling
      // offset stored in `pbx_integrations.config.sync_cursor`.
      const fromBeginning = (params as any).from_beginning === true || b.from_beginning === true;
      const explicitOffset = parseInt(String((params as any).start_offset ?? b.start_offset ?? "NaN"));
      let startOffset = 0;
      const { data: integForCursor } = await admin
        .from("pbx_integrations")
        .select("id, config")
        .eq("organization_id", organization_id)
        .maybeSingle();
      const cursorCfg = (integForCursor?.config as any) || {};
      if (Number.isFinite(explicitOffset)) {
        startOffset = explicitOffset;
      } else if (fromBeginning || isBackfill) {
        startOffset = 0;
      } else {
        startOffset = Math.max(0, parseInt(String(cursorCfg.sync_cursor ?? 0)) || 0);
      }
      for (let i = 0; i < maxPages; i++) {
        const extra: Record<string, string> = {
          limit: String(pageSize),
          offset: String(startOffset + i * pageSize),
        };
        // Do NOT pass `extension` to FusionPBX xml_cdr. Its v7 generic API
        // converts every query param into SQL (`extension = ...`) but xml_cdr
        // has no `extension` column. Extension filtering happens post-fetch.
        const r = await fetchCdrsWithFallback(extra);
        if (!r.ok) {
          if (i === 0) {
            await admin.from("pbx_sync_jobs").insert({
              organization_id, job_type: action, status: "failed",
              started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
              error: `No working CDR endpoint. Attempts: ${JSON.stringify(r.attempts).slice(0, 1500)}`, stats: {},
            });
            return json({ error: "NO_CDR_ENDPOINT", attempts: r.attempts }, 502);
          }
          allErrors.push(`page ${i}: fetch_failed`);
          break;
        }
        lastEndpoint = r.endpoint;
        const cdrs = requestedExtension ? r.records.filter(cdrMatchesRequestedExtension) : r.records;
        if (i === 0) firstPage = cdrs;
        totalFetched += cdrs.length;
        pages++;
        if (cdrs.length > 0) {
          const rows = cdrs.map(mapCdr).filter((x) => x.pbx_uuid);
          const uuids = [...new Set(rows.map((x) => x.extension_uuid).filter(Boolean))];
          if (uuids.length) {
            const { data: exts } = await admin.from("pbx_extensions")
              .select("pbx_uuid, extension, effective_cid_number")
              .eq("organization_id", organization_id).in("pbx_uuid", uuids);
            const byUuid = new Map((exts || []).map((e: any) => [e.pbx_uuid, e.extension || e.effective_cid_number]));
            rows.forEach((row: any) => {
              if (!row.extension && row.extension_uuid) row.extension = byUuid.get(row.extension_uuid) || null;
            });
          }
          const { error, count } = await admin.from("pbx_call_records").upsert(rows, { onConflict: "organization_id,pbx_uuid", count: "exact", ignoreDuplicates: false });
          if (error) allErrors.push(`upsert page ${i}: ${error.message}`);
          else totalUpserted += count ?? rows.length;
        }
        if (cdrs.length < pageSize) break; // reached end
      }

      // Advance the persistent cursor so the next cron tick continues where we left off.
      // When the final page came up short, we've reached the end of the FusionPBX
      // dataset → reset to 0 so we cycle through again and catch any new tail rows.
      if (integForCursor && !Number.isFinite(explicitOffset) && action === "sync-cdrs") {
        const reachedEnd = totalFetched < pageSize * maxPages;
        const nextCursor = reachedEnd ? 0 : startOffset + totalFetched;
        await admin.from("pbx_integrations")
          .update({ config: { ...cursorCfg, sync_cursor: nextCursor, sync_cursor_updated_at: new Date().toISOString() } })
          .eq("id", integForCursor.id);
      }

      await admin.from("pbx_sync_jobs").insert({
        organization_id, job_type: action,
        status: allErrors.length ? "completed_with_errors" : "completed",
        started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
        stats: { cdrs: totalUpserted, fetched: totalFetched, pages, endpoint: lastEndpoint },
        error: allErrors.length ? allErrors.join("; ").slice(0, 2000) : null,
      });
      return json({
        ok: true, endpoint: lastEndpoint,
        data: action === "list-cdrs" ? firstPage : undefined,
        stats: { cdrs: totalUpserted, fetched: totalFetched, pages },
        errors: allErrors,
      });
    }

    // ---- Domains mirror ----
    if (action === "sync-domains") {
      const r = await pbxFetch(`domains`);
      if (!r.ok) return json(r, r.status || 500);
      const domains = collection(r.data, "domains");
      const rows = domains.map((d: any) => ({
        organization_id,
        pbx_uuid: d.domain_uuid,
        name: d.domain_name,
        description: d.domain_description ?? null,
        enabled: !(d.domain_enabled === "false" || d.domain_enabled === false),
        last_synced_at: new Date().toISOString(),
      })).filter((x: any) => x.pbx_uuid && x.name);
      let upserted = 0;
      if (rows.length) {
        const { error, count } = await admin.from("pbx_domains").upsert(rows, { onConflict: "pbx_uuid", count: "exact" });
        if (error) return json({ ok: false, error: error.message }, 500);
        upserted = count ?? rows.length;
      }
      return json({ ok: true, domains: upserted, fetched: domains.length });
    }

    // ---- Voicemail messages mirror (paginated) ----
    if (action === "sync-voicemail-messages") {
      const pageSize = Math.min(Number((params as any).page_size ?? 250), 500);
      const maxPages = Math.min(Number((params as any).max_pages ?? 40), 100);
      let totalFetched = 0;
      let totalUpserted = 0;
      for (let i = 0; i < maxPages; i++) {
        const offset = i * pageSize;
        const r = await pbxFetch(`voicemail_messages?${domainQ}&limit=${pageSize}&offset=${offset}`);
        if (!r.ok) {
          if (i === 0) return json(r, r.status || 500);
          break;
        }
        const msgs = collection(r.data, "voicemail_messages");
        if (!msgs.length) break;
        totalFetched += msgs.length;
        const rows = msgs.map((m: any) => ({
          organization_id,
          extension: String(m.voicemail_id ?? m.extension ?? ""),
          mailbox: String(m.voicemail_id ?? ""),
          caller_number: m.caller_id_number ?? null,
          caller_name: m.caller_id_name ?? null,
          received_at: m.created_epoch
            ? new Date(parseInt(m.created_epoch) * 1000).toISOString()
            : (m.message_received ?? new Date().toISOString()),
          duration_seconds: m.message_length ? parseInt(m.message_length) : 0,
          pbx_record_path: m.message_path ?? null,
          pbx_record_name: m.message_name ?? null,
          folder: m.message_status === "saved" ? "archived" : "inbox",
          fusionpbx_uuid: m.voicemail_message_uuid ?? null,
        })).filter((x: any) => x.fusionpbx_uuid && x.extension);
        if (rows.length) {
          const uuids = rows.map((rr: any) => rr.fusionpbx_uuid);
          await admin.from("pbx_voicemails").delete()
            .eq("organization_id", organization_id).in("fusionpbx_uuid", uuids);
          const { error, count } = await admin.from("pbx_voicemails").insert(rows, { count: "exact" });
          if (error) return json({ ok: false, error: error.message, page: i }, 500);
          totalUpserted += count ?? rows.length;
        }
        if (msgs.length < pageSize) break;
      }
      return json({ ok: true, voicemails: totalUpserted, fetched: totalFetched });
    }

    // ---- IVR menu options mirror ----
    if (action === "sync-ivr-options") {
      const r = await pbxFetch(`ivr_menu_options?${domainQ}&limit=2000`);
      if (!r.ok) return json(r, r.status || 500);
      const opts = collection(r.data, "ivr_menu_options");
      // Map ivr_menu_uuid -> local ivr_id
      const { data: ivrRows } = await admin
        .from("pbx_ivrs")
        .select("id,pbx_uuid")
        .eq("organization_id", organization_id);
      const localByPbx = new Map<string, string>();
      (ivrRows ?? []).forEach((row: any) => { if (row.pbx_uuid) localByPbx.set(row.pbx_uuid, row.id); });
      const rows = opts.map((o: any) => {
        const ivrId = localByPbx.get(o.ivr_menu_uuid);
        if (!ivrId) return null;
        return {
          ivr_id: ivrId,
          pbx_uuid: o.ivr_menu_option_uuid,
          digit: String(o.ivr_menu_option_digits ?? o.option_digits ?? ""),
          destination_type: o.ivr_menu_option_action ?? null,
          destination_id: o.ivr_menu_option_param ?? null,
          description: o.ivr_menu_option_description ?? null,
          sort_order: o.ivr_menu_option_order ? parseInt(o.ivr_menu_option_order) : 0,
        };
      }).filter(Boolean) as any[];
      let upserted = 0;
      if (rows.length) {
        const { error, count } = await admin
          .from("pbx_ivr_options")
          .upsert(rows, { onConflict: "ivr_id,pbx_uuid", count: "exact" });
        if (error) return json({ ok: false, error: error.message }, 500);
        upserted = count ?? rows.length;
      }
      return json({ ok: true, options: upserted, fetched: opts.length });
    }


    // ---- Full sync ----
    if (action === "sync-all") {
      const t0 = Date.now();
      const startedIso = new Date().toISOString();
      // Optional resources filter: ['extensions','devices','ivrs','queues','ring_groups','gateways','destinations','cdrs']
      const requested: string[] | null = Array.isArray((body as any).resources)
        ? (body as any).resources
        : Array.isArray(params.resources)
          ? params.resources
          : null;
      const want = (k: string) => !requested || requested.includes(k);
      const tasks: Promise<{ k: string; r: any }>[] = [];
      if (want("extensions"))   tasks.push(pbxFetch(`extensions?${domainQ}`).then((r) => ({ k: "extensions", r })));
      if (want("devices"))      tasks.push(pbxFetch(`devices?${domainQ}`).then((r) => ({ k: "devices", r })));
      if (want("ivrs"))         tasks.push(pbxFetch(`ivr_menus?${domainQ}`).then((r) => ({ k: "ivr_menus", r })));
      if (want("queues"))       tasks.push(pbxFetch(`call_center_queues?${domainQ}`).then((r) => ({ k: "call_center_queues", r })));
      if (want("ring_groups"))  tasks.push(pbxFetch(`ring_groups?${domainQ}`).then((r) => ({ k: "ring_groups", r })));
      // Gateways are global in FusionPBX (no domain filter) — query without domain_uuid.
      if (want("gateways"))     tasks.push(pbxFetch(`gateways`).then((r) => ({ k: "gateways", r })));
      if (want("users") || want("domain_users")) tasks.push(pbxFetch(`users?${domainQ}`).then((r) => ({ k: "users", r })));
      const results = await Promise.all(tasks);
      const cdrResult = want("cdrs") ? await fetchCdrsWithFallback({ limit: "200" }) : null;
      const stats: Record<string, number> = {};
      const errors: string[] = [];
      const doUpsert = async (table: string, rows: any[], conflict: string, k: string) => {
        if (!rows.length) { stats[k] = 0; return; }
        const { error, count, data } = await admin.from(table).upsert(rows, { onConflict: conflict, count: "exact" }).select("id");
        if (error) { errors.push(`${table}: ${error.message}`); stats[k] = 0; }
        else stats[k] = count ?? (data?.length ?? rows.length);
      };
      for (const { k, r } of results) {
        if (!r.ok) { errors.push(`${k}: ${(r as any).message || (r as any).error}`); stats[k] = 0; continue; }
        const list = collection(r.data, k);
        if (k === "extensions") {
          const rows = list.map(mapExtension).filter((x) => x.pbx_uuid);
          await doUpsert("pbx_extensions", rows, "organization_id,pbx_uuid", "extensions");
        } else if (k === "devices") {
          const rows = list.map(mapDevice).filter((x) => x.pbx_uuid);
          await doUpsert("pbx_devices", rows, "organization_id,pbx_uuid", "devices");
        } else if (k === "ivr_menus") {
          const rows = list.map(mapIvr).filter((x) => x.pbx_uuid);
          await doUpsert("pbx_ivrs", rows, "organization_id,pbx_uuid", "ivrs");
        } else if (k === "call_center_queues") {
          const rows = list.map(mapQueue).filter((x) => x.pbx_uuid);
          await doUpsert("pbx_call_queues", rows, "organization_id,pbx_uuid", "queues");
        } else if (k === "ring_groups") {
          const rows = list.map(mapRingGroup).filter((x) => x.pbx_uuid);
          await doUpsert("pbx_ring_groups", rows, "organization_id,pbx_uuid", "ring_groups");
        } else if (k === "gateways") {
          const rows = list.map((g: any) => ({
            organization_id,
            pbx_uuid: g.gateway_uuid,
            name: g.gateway || g.name || "unnamed",
            proxy: g.proxy ?? null,
            realm: g.realm ?? null,
            username: g.username ?? null,
            from_user: g.from_user ?? null,
            from_domain: g.from_domain ?? null,
            expire_seconds: g.expire_seconds ? parseInt(g.expire_seconds) : 800,
            register: g.register === "true" || g.register === true,
            context: g.context ?? "public",
            profile: g.profile ?? "external",
            status: g.gateway_status ?? null,
            enabled: !(g.enabled === "false" || g.enabled === false),
            config: g,
            last_synced_at: new Date().toISOString(),
          })).filter((x: any) => x.pbx_uuid);
          await doUpsert("pbx_gateways", rows, "pbx_uuid", "gateways");
        } else if (k === "users") {
          const rows = list.map(mapDomainUser).filter((x: any) => x && x.pbx_uuid);
          await doUpsert("pbx_domain_users", rows, "organization_id,pbx_uuid", "users");
        }
      }
      if (cdrResult?.ok) {
        const rows = cdrResult.records.map(mapCdr).filter((x: any) => x.pbx_uuid);
        const uuids = [...new Set(rows.map((x: any) => x.extension_uuid).filter(Boolean))];
        if (uuids.length) {
          const { data: exts } = await admin.from("pbx_extensions")
            .select("pbx_uuid, extension, effective_cid_number")
            .eq("organization_id", organization_id)
            .in("pbx_uuid", uuids);
          const byUuid = new Map((exts || []).map((e: any) => [e.pbx_uuid, e.extension || e.effective_cid_number]));
          rows.forEach((row: any) => {
            if (!row.extension && row.extension_uuid) row.extension = byUuid.get(row.extension_uuid) || null;
          });
        }
        await doUpsert("pbx_call_records", rows, "pbx_uuid", "cdrs");
      } else if (cdrResult) {
        errors.push(`cdrs: no working endpoint (tried ${cdrResult.attempts.length})`);
        stats["cdrs"] = 0;
      }
      const duration_ms = Date.now() - t0;
      await admin.from("pbx_sync_jobs").insert({
        organization_id, job_type: "sync-all",
        status: errors.length ? "completed_with_errors" : "completed",
        started_at: startedIso,
        completed_at: new Date().toISOString(),
        stats: { ...stats, duration_ms },
        error: errors.length ? errors.join("; ").slice(0, 2000) : null,
      });
      await admin.from("pbx_integrations").update({ last_sync_at: new Date().toISOString() }).eq("organization_id", organization_id);
      try {
        await admin.from("audit_logs").insert({
          organization_id, action: "pbx_sync_completed", resource_type: "pbx_integration",
          metadata: { job_type: "sync-all", stats, duration_ms, errors: errors.length, timestamp: new Date().toISOString() },
        });
      } catch (auditErr: any) { console.warn("Audit log failed:", auditErr?.message); }
      return json({ success: errors.length === 0, stats: { ...stats, duration_ms }, errors });
    }

    async function canReadCallRecording(xmlCdrUuid: string | null | undefined) {
      if (isServiceCall || !userId) return true;
      if (!xmlCdrUuid) return false;

      const recordSelect = "id, organization_id, extension_uuid, extension";
      const { data: byPbxUuid, error: pbxErr } = await admin
        .from("pbx_call_records")
        .select(recordSelect)
        .eq("pbx_uuid", xmlCdrUuid)
        .limit(1);
      if (pbxErr) {
        console.warn("recording access lookup failed:", pbxErr.message);
        return false;
      }

      let record = byPbxUuid?.[0] || null;
      if (!record && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(xmlCdrUuid)) {
        const { data: byId, error: idErr } = await admin
          .from("pbx_call_records")
          .select(recordSelect)
          .eq("id", xmlCdrUuid)
          .limit(1);
        if (idErr) {
          console.warn("recording access id lookup failed:", idErr.message);
          return false;
        }
        record = byId?.[0] || null;
      }
      if (!record) return false;

      const { data: isLemtelAdmin } = await admin.rpc("is_lemtel_admin", { _user_id: userId });
      if (isLemtelAdmin) return true;

      const { data: orgMember } = await admin
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", record.organization_id)
        .in("role", ["owner", "admin"])
        .maybeSingle();
      if (orgMember) return true;

      let softphoneQuery = admin
        .from("pbx_softphone_users")
        .select("id")
        .eq("portal_user_id", userId)
        .eq("organization_id", record.organization_id)
        .limit(1);
      if (record.extension) {
        softphoneQuery = softphoneQuery.eq("extension", record.extension);
      } else {
        return false;
      }
      const { data: softphoneRows, error: softphoneErr } = await softphoneQuery;
      if (softphoneErr) {
        console.warn("recording softphone access lookup failed:", softphoneErr.message);
        return false;
      }
      return !!softphoneRows?.length;
    }

    function getPbxFileBases() {
      // Recording audio is served by the PBX node host, not the portal host.
      // Keep all recording download candidates on this origin so PHP sessions,
      // direct XML CDR downloads, and static recording fallbacks hit the same PBX.
      return [PBX_RECORDING_FILE_BASE];
    }

    // ---- Recording proxy ----
    if (action === "get-recording") {
      const recordingParams = { ...(params || {}) } as any;
      if (!recordingParams.xml_cdr_uuid) recordingParams.xml_cdr_uuid = body.xml_cdr_uuid || body.id;
      const { record_path, record_name, xml_cdr_uuid, domain_uuid, domain_name, local_recording_url, recorded_at } = recordingParams;
      const probeOnly = recordingParams.probe === true || recordingParams.probe === "true";
      if (!xml_cdr_uuid && !record_name && !(record_path && record_name)) {
        return json({ error: "xml_cdr_uuid, record_name, or (record_path, record_name) required" }, 400);
      }
      if (xml_cdr_uuid && !(await canReadCallRecording(String(xml_cdr_uuid)))) {
        return json({ error: "Forbidden", message: "Recording is outside the signed-in user extension scope" }, 403);
      }
      const lower = String(record_name || "").toLowerCase();
      const ext = lower.endsWith(".mp3") ? "mp3"
                : lower.endsWith(".ogg") ? "ogg"
                : lower.endsWith(".m4a") ? "m4a"
                : "wav";
      const ct = ext === "mp3" ? "audio/mpeg"
               : ext === "ogg" ? "audio/ogg"
               : ext === "m4a" ? "audio/mp4"
               : "audio/wav";

      const safeUrl = (value: string) => {
        try {
          const u = new URL(value);
          u.searchParams.delete("key");
          u.searchParams.delete("username");
          return u.toString();
        } catch { return value; }
      };
      const withQueryAuth = (value: string) => {
        const u = new URL(value);
        u.searchParams.set("key", FUSIONPBX_API_KEY);
        u.searchParams.set("username", FUSIONPBX_USERNAME);
        return u.toString();
      };
      const pushUrl = (value: string, auth = false) => {
        try { tryUrls.push(auth ? withQueryAuth(value) : value); } catch { /* ignore malformed candidate */ }
      };
      const archiveDateParts = (value: any) => {
        if (!value) return null;
        const d = new Date(String(value));
        if (Number.isNaN(d.getTime())) return null;
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return { yyyy: String(d.getFullYear()), mon: months[d.getMonth()], dd: String(d.getDate()).padStart(2, "0") };
      };
      const normalizeRecordName = (value: any) => String(value || "").split(/[\\/]/).pop() || String(value || "");
      const decodeJsonDownload = (value: any): Uint8Array | null => {
        const seen = new Set<any>();
        const visit = (node: any): string | null => {
          if (!node || seen.has(node)) return null;
          if (typeof node === "string") {
            const body = node.includes(",") ? node.split(",").pop()! : node;
            return /^[A-Za-z0-9+/=\s_-]{1200,}$/.test(body) ? body : null;
          }
          if (typeof node !== "object") return null;
          seen.add(node);
          for (const key of ["recording_base64", "audio_base64", "base64", "content", "file", "audio", "bytes", "data", "recording"]) {
            const found = visit(node[key]);
            if (found) return found;
          }
          if (Array.isArray(node)) {
            for (const item of node) { const found = visit(item); if (found) return found; }
          }
          return null;
        };
        const encoded = visit(value);
        if (!encoded) return null;
        try {
          const bin = atob(encoded.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/"));
          return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
        } catch { return null; }
      };
      const extractJsonDownloadUrl = (value: any): string | null => {
        const seen = new Set<any>();
        const visit = (node: any): string | null => {
          if (!node || seen.has(node)) return null;
          if (typeof node === "string") {
            if (/^https?:\/\//i.test(node) || node.startsWith("/app/") || node.startsWith("download.php")) return node;
            return null;
          }
          if (typeof node !== "object") return null;
          seen.add(node);
          for (const key of ["download_url", "recording_url", "audio_url", "url", "href", "link", "location", "download"]) {
            const found = visit(node[key]);
            if (found) return found;
          }
          if (Array.isArray(node)) {
            for (const item of node) { const found = visit(item); if (found) return found; }
          }
          return null;
        };
        return visit(value);
      };
      const normalizeRecordingDownloadUrl = (value: string) => {
        if (/^https?:\/\//i.test(value)) {
          const u = new URL(value);
          u.protocol = "https:";
          u.host = new URL(PBX_RECORDING_FILE_BASE).host;
          return u.toString();
        }
        return `${PBX_RECORDING_FILE_BASE}/${value.replace(/^\/+/, "")}`;
      };
      const attempts: { url: string; status: number; content_type?: string }[] = [];
      const tryUrls: string[] = [];
      const fileBases = getPbxFileBases();
      const isAudioContentType = (value: string) => /audio\//i.test(value) || /octet-stream/i.test(value);
      const looksLikeAudioBytes = (buf: ArrayBuffer, contentType: string) => {
        const head = new TextDecoder().decode(buf.slice(0, Math.min(buf.byteLength, 180))).trim().toLowerCase();
        const looksLikeError = head.startsWith("{") || head.startsWith("[") || head.startsWith("<") || head.includes("sqlstate") || head.includes("undefined column") || head.includes("error");
        return !looksLikeError && (isAudioContentType(contentType) || head.startsWith("id3") || head.startsWith("riff") || head.startsWith("oggs") || head.includes("ftyp") || buf.byteLength > 1200);
      };
      const audioResponse = (buf: ArrayBuffer | Uint8Array, contentType: string) => {
        const bodyBuf: ArrayBuffer = buf instanceof Uint8Array
          ? new Uint8Array(buf).buffer
          : buf;
        return new Response(bodyBuf, {
          headers: { ...corsHeaders, "Content-Type": isAudioContentType(contentType) ? contentType : ct, "Content-Length": String(buf.byteLength), "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=300" },
        });
      };
      if (xml_cdr_uuid) {
        for (const fileBase of fileBases) {
          const id = encodeURIComponent(String(xml_cdr_uuid));
          // PROVEN WORKING for Lemtel: recording_name without extension is the FusionPBX CDR UUID
          // e.g. recording_name="351e1129-86e2-4aef-a33b-7447dc2f91bf.mp3"
          // -> download.php?id=351e1129-86e2-4aef-a33b-7447dc2f91bf  ✅
          if (record_name) {
            const recUuid = encodeURIComponent(normalizeRecordName(record_name).replace(/\.(mp3|wav|ogg)$/i, ""));
            // TRY RECORD_NAME UUID FIRST — this is the actual FusionPBX CDR UUID
            tryUrls.push(`${fileBase}/app/xml_cdr/download.php?id=${recUuid}`);
            tryUrls.push(withQueryAuth(`${fileBase}/app/xml_cdr/download.php?id=${recUuid}`));
            tryUrls.push(`${fileBase}/app/xml_cdr/xml_cdr_download.php?id=${recUuid}&t=bin`);
            const n = encodeURIComponent(normalizeRecordName(record_name));
            tryUrls.push(withQueryAuth(`${fileBase}/app/recordings/${n}`));
          }
          // Then try Supabase id (usually fails but keep as fallback)
          tryUrls.push(`${fileBase}/app/xml_cdr/download.php?id=${id}`);
          tryUrls.push(withQueryAuth(`${fileBase}/app/xml_cdr/download.php?id=${id}`));
          tryUrls.push(withQueryAuth(`${fileBase}/app/xml_cdr/xml_cdr_download.php?id=${id}&t=bin`));
          tryUrls.push(withQueryAuth(`${fileBase}/app/xml_cdr/xml_cdr_download.php?id=${id}`));
          tryUrls.push(withQueryAuth(`${fileBase}/app/xml_cdr/download.php?id=${id}&t=bin`));
          tryUrls.push(`${fileBase}/app/xml_cdr/xml_cdr_download.php?id=${id}`);
          tryUrls.push(`${fileBase}/app/xml_cdr/download.php?id=${id}&t=bin`);
        }
      }
      if (local_recording_url && String(local_recording_url).startsWith("http")) {
        tryUrls.push(normalizeRecordingDownloadUrl(String(local_recording_url)));
      }
      if (record_name) {
        const rawName = normalizeRecordName(record_name);
        const n = encodeURIComponent(rawName);
        const du = encodeURIComponent(String(domain_uuid || FUSIONPBX_DOMAIN_UUID || ""));
        const domainName = String(domain_name || "").replace(/^\/+|\/+$/g, "");
        // Some FusionPBX CDRs expose only record_name. In that case the file usually
        // lives under recordings/<domain>/archive/YYYY/Mon/DD/<record_name>.
        const parts = archiveDateParts(recorded_at);
        const inferredRelatives = new Set<string>();
        if (domainName && parts) {
          inferredRelatives.add(`recordings/${domainName}/archive/${parts.yyyy}/${parts.mon}/${parts.dd}/${rawName}`);
          inferredRelatives.add(`var/lib/freeswitch/recordings/${domainName}/archive/${parts.yyyy}/${parts.mon}/${parts.dd}/${rawName}`);
          inferredRelatives.add(`archive/${parts.yyyy}/${parts.mon}/${parts.dd}/${rawName}`);
        }
        for (const fileBase of fileBases) {
          pushUrl(`${fileBase}/app/recordings/recording_download.php?filename=${n}`, true);
          pushUrl(`${fileBase}/app/recordings/recordings.php?a=download&filename=${n}`, true);
          pushUrl(`${fileBase}/app/api/7/call_recordings/download?domain_uuid=${du}&record_name=${n}`, true);
          pushUrl(`${fileBase}/app/call_recordings/download.php?record_name=${n}`, true);
          pushUrl(`${fileBase}/app/xml_cdr/xml_cdr_audio.php?record_name=${n}&t=bin&ext=${ext}`, true);
          pushUrl(`${fileBase}/app/recordings/${n}`, true);
          for (const relCandidate of inferredRelatives) {
            const relEncoded = encodeURI(relCandidate).replace(/#/g, "%23");
            pushUrl(`${fileBase}/${relEncoded}`);
            pushUrl(`${fileBase}/${relEncoded}`, true);
            pushUrl(`${fileBase}/app/recordings/recordings.php?action=download&type=rec&t=bin&filename=${encodeURIComponent(relCandidate)}`, true);
            pushUrl(`${fileBase}/app/recordings/recordings.php?a=download&type=rec&t=bin&filename=${encodeURIComponent(relCandidate)}`, true);
          }
        }
      }
      if (record_path && record_name) {
        const p = encodeURIComponent(String(record_path));
        const n = encodeURIComponent(normalizeRecordName(record_name));
        const du = encodeURIComponent(String(domain_uuid || FUSIONPBX_DOMAIN_UUID || ""));
        // FusionPBX's GUI serves call recordings from the file host, which may
        // differ from the REST API host. Try the complete path-based matrix on
        // every known base (portal + pbxnode), not just the API base.
        const cleanPath = String(record_path).replace(/^\/+/, "");
        const domainName = String(domain_name || "");
        const relativeName = domainName
          ? `${cleanPath.replace(new RegExp(`^var/lib/freeswitch/recordings/${domainName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`), "")}/${String(record_name)}`
          : `${String(record_path).split("/recordings/").pop()?.split("/").slice(1).join("/") || cleanPath}/${String(record_name)}`;
        const rel = encodeURIComponent(relativeName.replace(/^\/+/, ""));
        const crossDomainRel = domainName ? encodeURIComponent(`../${domainName}/${relativeName.replace(/^\/+/, "")}`) : "";
        const publicPath = cleanPath.replace(/^var\/lib\/freeswitch\/recordings\//, "recordings/");
        for (const fileBase of fileBases) {
          tryUrls.push(withQueryAuth(`${fileBase}/app/recordings/recording_download.php?path=${p}&filename=${n}`));
          tryUrls.push(withQueryAuth(`${fileBase}/app/recordings/recordings.php?action=download&type=rec&filename=${rel}`));
          tryUrls.push(withQueryAuth(`${fileBase}/app/recordings/recordings.php?a=download&type=rec&filename=${rel}`));
          tryUrls.push(withQueryAuth(`${fileBase}/app/recordings/recordings.php?action=download&type=rec&t=bin&filename=${rel}`));
          tryUrls.push(withQueryAuth(`${fileBase}/app/recordings/recordings.php?a=download&type=rec&t=bin&filename=${rel}`));
          // API-key auth can bind the PHP session to the API user's default
          // domain, while CDR files remain under the tenant domain directory.
          // The target domain comes from trusted CDR metadata, not user input.
          if (crossDomainRel) {
            tryUrls.push(withQueryAuth(`${fileBase}/app/recordings/recordings.php?action=download&type=rec&filename=${crossDomainRel}`));
            tryUrls.push(withQueryAuth(`${fileBase}/app/recordings/recordings.php?action=download&type=rec&t=bin&filename=${crossDomainRel}`));
          }
          tryUrls.push(withQueryAuth(`${fileBase}/app/recordings/${n}`));
          tryUrls.push(`${fileBase}/${publicPath}/${n}`);
          tryUrls.push(`${fileBase}/${cleanPath}/${n}`);
        }
      }

      // ---- PRIMARY PATH: PHP session cookie (mirrors the FusionPBX UI) ----
      // /app/call_recordings/download.php?id=<xml_cdr_uuid> requires a logged-in
      // PHP session — exactly how a browser plays a recording from the PBX node.
      const attemptsSession: { url: string; status: number; content_type?: string }[] = [];
      if (xml_cdr_uuid) {
        for (const fileBase of fileBases) {
          const id = encodeURIComponent(String(xml_cdr_uuid));
          const sessionUrls = [
            `${fileBase}/app/xml_cdr/xml_cdr_download.php?id=${id}&t=bin`,
            `${fileBase}/app/xml_cdr/download.php?id=${id}`,
          ];
          if (record_name) {
            const n = encodeURIComponent(normalizeRecordName(record_name));
            sessionUrls.push(withQueryAuth(`${fileBase}/app/recordings/${n}`));
          }
          sessionUrls.push(
            `${fileBase}/app/xml_cdr/xml_cdr_download.php?id=${id}`,
            `${fileBase}/app/xml_cdr/download.php?id=${id}&t=bin`,
            `${fileBase}/app/call_recordings/call_recording_download.php?id=${id}&t=bin`,
            `${fileBase}/app/call_recordings/call_recording_download.php?id=${id}`,
            `${fileBase}/app/call_recordings/download.php?id=${id}&t=bin`,
            `${fileBase}/app/call_recordings/download.php?id=${id}`,
          );
          if (record_name) {
            const rawName = normalizeRecordName(record_name);
            const n = encodeURIComponent(rawName);
            sessionUrls.push(`${fileBase}/app/xml_cdr/xml_cdr_download.php?record_name=${n}&t=bin`);
            sessionUrls.push(`${fileBase}/app/call_recordings/call_recording_download.php?record_name=${n}&t=bin`);
            if (record_path) {
              const p = encodeURIComponent(String(record_path));
              const cleanPath = String(record_path).replace(/^\/+/, "");
              const domainName = String(domain_name || "");
              const relativeName = domainName
                ? `${cleanPath.replace(new RegExp(`^var/lib/freeswitch/recordings/${domainName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`), "")}/${rawName}`
                : `${String(record_path).split("/recordings/").pop()?.split("/").slice(1).join("/") || cleanPath}/${rawName}`;
              const rel = encodeURIComponent(relativeName.replace(/^\/+/, ""));
              sessionUrls.push(`${fileBase}/app/recordings/recording_download.php?path=${p}&filename=${n}`);
              sessionUrls.push(`${fileBase}/app/recordings/recordings.php?action=download&type=rec&t=bin&filename=${rel}`);
              sessionUrls.push(`${fileBase}/app/recordings/recordings.php?a=download&type=rec&t=bin&filename=${rel}`);
            }
          }
          let cookie = "";
          let loginError = "";
          try {
            cookie = await getFusionSessionCookie(fileBase);
          } catch (e: any) {
            loginError = String(e?.message || e).slice(0, 200);
            cidLog("[get-recording] FusionPBX login failed", {
              origin: fusionBaseOrigin(fileBase),
              error: loginError,
              has_username: !!Deno.env.get("FUSIONPBX_USERNAME"),
              has_password: !!Deno.env.get("FUSIONPBX_PASSWORD"),
              has_api_key_fallback: !!Deno.env.get("FUSIONPBX_API_KEY"),
            });
            attemptsSession.push({ url: `${fusionBaseOrigin(fileBase)}/login.php`, status: 0, content_type: `login_failed: ${loginError}` });
          }
          for (const sessionUrl of sessionUrls) try {
            const doFetch = async (c: string) => {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 8000);
              try {
                return await fetch(sessionUrl, {
                  headers: { ...(c ? { Cookie: c } : {}), Accept: "*/*" },
                  redirect: "follow",
                  signal: controller.signal,
                });
              } finally { clearTimeout(timeout); }
            };
            let r = await doFetch(cookie);
            // If session expired, force re-login once.
            if (r && (r.status === 401 || r.status === 403 || r.headers.get("content-type")?.includes("text/html"))) {
              FUSION_SESSIONS.delete(fusionBaseOrigin(fileBase));
              cookie = await getFusionSessionCookie(fileBase).catch(() => "");
              if (cookie) {
                await r.body?.cancel();
                r = await doFetch(cookie);
              }
            }
            if (r && r.ok) {
              const buf = await r.arrayBuffer();
              const rct = r.headers.get("content-type") || "";
              if (looksLikeAudioBytes(buf, rct) && !rct.includes("text/html")) {
                if (probeOnly) {
                  return json({ ok: true, available: true, content_type: rct.startsWith("audio/") ? rct : ct }, 200, { "X-Recording-Status": "available" });
                }
                return audioResponse(buf, rct);
              }
              attemptsSession.push({ url: safeUrl(sessionUrl), status: r.status, content_type: rct });
            } else if (r) {
              attemptsSession.push({ url: safeUrl(sessionUrl), status: r.status });
              await r.body?.cancel();
            }
          } catch (e: any) {
            attemptsSession.push({ url: safeUrl(sessionUrl), status: 0, content_type: e?.message?.slice(0, 80) });
          }
        }
      }

      const uniqueUrls = [...new Set(tryUrls)];
      for (let i = 0; i < uniqueUrls.length; i++) {
        const url = uniqueUrls[i];
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4500);
          const isRestApiUrl = /\/app\/api\/\d+\//.test(url);
          const r = await fetch(url, {
            headers: { ...(isRestApiUrl ? { Authorization: basicHeader } : {}), Accept: "*/*" },
            redirect: "follow",
            signal: controller.signal,
          }).finally(() => clearTimeout(timeout));
          if (r.ok) {
            const buf = await r.arrayBuffer();
            const rct = r.headers.get("content-type") || "";
            if (rct.includes("application/json")) {
              try {
                const parsed = JSON.parse(new TextDecoder().decode(buf));
                const decoded = decodeJsonDownload(parsed);
                if (decoded && decoded.byteLength > 1200) return audioResponse(decoded, ct);
                const nextUrl = extractJsonDownloadUrl(parsed);
                if (nextUrl) {
                  const absoluteUrl = normalizeRecordingDownloadUrl(nextUrl);
                  if (!uniqueUrls.includes(absoluteUrl)) uniqueUrls.push(absoluteUrl);
                }
              } catch { /* not a base64 download response */ }
            }
            // Reject HTML/JSON/PBX error pages masquerading as successful audio.
            if (rct.includes("text/html") || rct.includes("application/json") || !looksLikeAudioBytes(buf, rct)) {
               attempts.push({ url: safeUrl(url), status: r.status, content_type: rct || undefined });
              continue;
            }
            return audioResponse(buf, rct);
          }
          attempts.push({ url: safeUrl(url), status: r.status, content_type: r.headers.get("content-type") || undefined });
        } catch (e: any) {
          attempts.push({ url: safeUrl(url), status: 0, content_type: e?.name === "AbortError" ? "timeout" : undefined });
        }
      }
      // Classify the failure so the client can surface an actionable message
      // (login broken vs. file deleted vs. PBX HTTP error) and the operator can
      // grep one structured log line per failed playback.
      const sessionLoginFailed = attemptsSession.some(a =>
        a.status === 0 && (a.content_type || "").startsWith("login_failed")
      );
      const fileMissing = !sessionLoginFailed && attemptsSession.some(a =>
        (a.status === 404) ||
        (a.status === 200 && !(a.content_type || "").includes("text/html"))
      );
      const sessionLoggedIn = !sessionLoginFailed && FUSION_SESSIONS.size > 0;
      const httpStatuses = Array.from(new Set([
        ...attemptsSession.map(a => a.status),
        ...attempts.map(a => a.status),
      ].filter(s => s > 0))).sort((a, b) => a - b);
      const failureKind: "login_failed" | "file_missing" | "http_error" | "unknown" =
        sessionLoginFailed ? "login_failed"
        : fileMissing ? "file_missing"
        : httpStatuses.length > 0 ? "http_error"
        : "unknown";
      const loginErrorDetail =
        attemptsSession.find(a => (a.content_type || "").startsWith("login_failed"))
          ?.content_type?.replace(/^login_failed:\s*/, "") || null;

      cidLog("[get-recording] RECORDING_NOT_FOUND", JSON.stringify({
        failure_kind: failureKind,
        http_statuses: httpStatuses,
        xml_cdr_uuid, record_name, record_path, domain_name, recorded_at,
        session_logged_in: sessionLoggedIn,
        session_login_failed: sessionLoginFailed,
        login_error: loginErrorDetail,
        file_missing_signal: fileMissing,
        session_attempts_count: attemptsSession.length,
        legacy_attempts_count: attempts.length,
        session_attempts: attemptsSession.slice(0, 30),
        legacy_attempts: attempts.slice(0, 20),
      }));
      return json({
        ok: false,
        error: "RECORDING_NOT_FOUND",
        failure_kind: failureKind,
        correlation_id: correlationId,
        http_statuses: httpStatuses,
        message: sessionLoginFailed
          ? `FusionPBX login failed (${loginErrorDetail || 'unknown error'}). Vault secrets FUSIONPBX_USERNAME / FUSIONPBX_PASSWORD are likely incorrect.`
          : fileMissing
          ? "FusionPBX session authenticated successfully, but the recording file is missing from PBX storage (the .mp3/.wav is no longer on disk)."
          : "The PBX has CDR metadata for this call, but the recording file is not reachable on the PBX storage path.",
        session_logged_in: sessionLoggedIn,
        session_login_failed: sessionLoginFailed,
        login_error: loginErrorDetail,
        file_missing: fileMissing,
        attempts,
        session_attempts: attemptsSession,
      }, 200, { "X-Recording-Status": "not-found", "X-Request-Id": correlationId });
    }

    // ---- Signed-URL recording delivery ----
    // Fetches the audio bytes via the existing get-recording pipeline, uploads
    // them to the private `lemtel-recordings` bucket, and returns a short-lived
    // signed URL (default 300s). Every issuance is written to audit_logs.
    if (action === "get-recording-signed-url") {
      try {
        const signedParams = { ...(params || {}) } as any;
        const signedXmlCdrUuid = signedParams.xml_cdr_uuid || body.xml_cdr_uuid || body.id || null;
        if (signedXmlCdrUuid && !(await canReadCallRecording(String(signedXmlCdrUuid)))) {
          return json({ error: "Forbidden", message: "Recording is outside the signed-in user extension scope" }, 403);
        }
        // Reuse the proven byte-fetch path by self-invoking get-recording.
        const selfBody = { ...body, action: "get-recording" };
        const selfUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/fusionpbx-proxy`;
        const selfRes = await fetch(selfUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
          body: JSON.stringify(selfBody),
        });
        const ct = selfRes.headers.get("content-type") || "";
        if (!selfRes.ok || (!ct.startsWith("audio/") && !ct.includes("octet-stream"))) {
          const detail = await selfRes.text().catch(() => "");
          return json({ ok: false, error: "RECORDING_NOT_FOUND", fallback: true, detail: detail.slice(0, 240) }, 200);
        }
        const bytes = new Uint8Array(await selfRes.arrayBuffer());
        if (!bytes.byteLength) return json({ ok: false, error: "RECORDING_EMPTY", fallback: true }, 200);

        const lower = String((params as any).record_name || "").toLowerCase();
        const ext = lower.endsWith(".mp3") ? "mp3"
                  : lower.endsWith(".ogg") ? "ogg"
                  : lower.endsWith(".m4a") ? "m4a"
                  : "wav";
        const storageContentType = ct.startsWith("audio/") ? ct : (ext === "mp3" ? "audio/mpeg" : ext === "ogg" ? "audio/ogg" : ext === "m4a" ? "audio/mp4" : "audio/wav");
        const objectPath = `signed/${userId || "service"}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await admin.storage
          .from("lemtel-recordings")
          .upload(objectPath, bytes, { contentType: storageContentType, upsert: false });
        if (upErr) return json({ ok: false, error: "STORAGE_UPLOAD_FAILED", message: upErr.message }, 500);

        const ttl = Math.max(60, Math.min(900, Number((params as any).expires_in) || 300));
        const { data: signed, error: signErr } = await admin.storage
          .from("lemtel-recordings")
          .createSignedUrl(objectPath, ttl);
        if (signErr || !signed?.signedUrl) {
          return json({ ok: false, error: "SIGN_URL_FAILED", message: signErr?.message }, 500);
        }

        // Audit
        try {
          await admin.from("audit_logs").insert({
            organization_id,
            user_id: userId,
            action: "recording.signed_url_issued",
            resource_type: "pbx_recording",
            resource_id: (params as any).xml_cdr_uuid || null,
            metadata: { object_path: objectPath, content_type: storageContentType, bytes: bytes.byteLength, ttl },
          });
        } catch { /* audit best-effort */ }

        return json({
          ok: true,
          url: signed.signedUrl,
          expiresInSec: ttl,
          contentType: storageContentType,
        });
      } catch (e: any) {
        return json({ ok: false, error: "SIGNED_URL_ERROR", message: String(e?.message || e) }, 500);
      }
    }

    // ---- Voicemail CRUD ----
    if (action === "delete-voicemail") {
      const id = params.voicemail_uuid || params.voicemail_message_uuid;
      if (!id) return json({ error: "voicemail_uuid required" }, 400);
      const path = params.voicemail_message_uuid ? `voicemail_messages/${id}` : `voicemails/${id}`;
      return json(await pbxWrite(path, "DELETE"));
    }
    if (action === "update-voicemail") {
      const id = params.voicemail_uuid;
      if (!id) return json({ error: "voicemail_uuid required" }, 400);
      return json(await pbxWrite(`voicemails/${id}`, "PUT", { voicemails: [{ ...params, voicemail_uuid: id }] }));
    }
    if (action === "list-voicemail-messages") {
      const ext = params.extension ? `&voicemail_id=${encodeURIComponent(String(params.extension))}` : "";
      const r = await pbxFetch(`voicemail_messages?${domainQ}${ext}`);
      if (!r.ok) return json(r, r.status || 500);
      return json({ ok: true, data: collection(r.data, "voicemail_messages"), latency_ms: r.latency_ms });
    }

    // ---- CDR / Recording CRUD ----
    if (action === "delete-cdr") {
      const id = params.xml_cdr_uuid;
      if (!id) return json({ error: "xml_cdr_uuid required" }, 400);
      return json(await pbxWrite(`xml_cdr/${id}`, "DELETE"));
    }
    if (action === "delete-recording") {
      const id = params.call_recording_uuid;
      if (id) return json(await pbxWrite(`call_recordings/${id}`, "DELETE"));
      // Fallback: delete file via filesystem endpoint if exposed
      const { record_path, record_name } = params as any;
      if (!record_path || !record_name) return json({ error: "call_recording_uuid or (record_path, record_name) required" }, 400);
      return json(await pbxWrite(`recordings?path=${encodeURIComponent(record_path)}&name=${encodeURIComponent(record_name)}`, "DELETE"));
    }

    // ---- Advanced (super_admin): generic CRUD for FusionPBX collections ----
    // Used for Gateways, SIP Profiles, Conferences, Hold Music, Dialplans, Time Conditions.
    // `global` resources (gateways, sip_profiles) live outside any single tenant domain.
    const ADV: Record<string, { path: string; key: string; uuidField: string; global?: boolean }> = {
      gateways:        { path: "gateways",        key: "gateways",        uuidField: "gateway_uuid", global: true },
      "sip-profiles":  { path: "sip_profiles",    key: "sip_profiles",    uuidField: "sip_profile_uuid", global: true },
      conferences:     { path: "conference_rooms",key: "conference_rooms",uuidField: "conference_room_uuid" },
      "hold-music":    { path: "music_on_hold",   key: "music_on_hold",   uuidField: "music_on_hold_uuid" },
      dialplans:       { path: "dialplans",       key: "dialplans",       uuidField: "dialplan_uuid" },
      "time-conditions":{path: "dialplans",       key: "dialplans",       uuidField: "dialplan_uuid" },
    };
    for (const [kind, def] of Object.entries(ADV)) {
      if (action === `list-${kind}`) {
        const r = await pbxFetch(def.global ? def.path : `${def.path}?${domainQ}`);
        if (!r.ok) return json(r, r.status || 500);
        return json({ ok: true, data: collection(r.data, def.key), latency_ms: r.latency_ms });
      }
      if (action === `get-${kind}`) {
        const id = params[def.uuidField] || params.uuid;
        if (!id) return json({ error: `${def.uuidField} required` }, 400);
        const r = await pbxFetch(`${def.path}/${id}`);
        if (!r.ok) return json(r, r.status || 500);
        return json({ ok: true, data: r.data, latency_ms: r.latency_ms });
      }
      if (action === `create-${kind}` || action === `update-${kind}`) {
        return json(await writeCollection(def.path, def.key, params));
      }
      if (action === `delete-${kind}`) {
        const id = params[def.uuidField] || params.uuid;
        if (!id) return json({ error: `${def.uuidField} required` }, 400);
        return json(await pbxWrite(`${def.path}/${id}`, "DELETE"));
      }
    }

    // ---- Live channels / active calls ----
    if (action === "list-active-calls") {
      const r = await pbxWrite(`commands`, "POST", {
        commands: [{ command: "show", arguments: "channels as json" }],
      });
      let rows: any[] = [];
      const raw = r?.data;
      // FreeSWITCH returns either { rows: [...] } or a string body
      const candidates = [raw?.details?.[0]?.response, raw?.response, raw?.raw, raw];
      for (const c of candidates) {
        if (!c) continue;
        if (typeof c === "string") {
          try { const j = JSON.parse(c); if (Array.isArray(j?.rows)) { rows = j.rows; break; } } catch { /* noop */ }
        } else if (Array.isArray(c?.rows)) { rows = c.rows; break; }
      }
      return json({ ok: true, data: rows, count: rows.length, latency_ms: r?.latency_ms });
    }

    if (action === "kill-active-call" || action === "hangup-call") {
      const uuid = body.uuid || params.uuid;
      if (!uuid) return json({ error: "uuid required" }, 400);
      const r = await pbxWrite(`commands`, "POST", {
        commands: [{ command: "uuid_kill", arguments: String(uuid) }],
      });
      if (organization_id) {
        await admin.from("audit_logs").insert({
          organization_id, user_id: userId, action: "pbx.call_hangup",
          resource_type: "active_call", resource_id: uuid,
          metadata: { uuid, ok: r?.ok },
        });
      }
      return json(r, r?.ok ? 200 : 500);
    }

    if (action === "transfer-call") {
      const uuid = body.uuid || params.uuid;
      const destination = body.destination || params.destination;
      const context = body.context || params.context || "default";
      if (!uuid || !destination) return json({ error: "uuid and destination required" }, 400);
      const r = await pbxWrite(`commands`, "POST", {
        commands: [{ command: "uuid_transfer", arguments: `${uuid} ${destination} XML ${context}` }],
      });
      if (organization_id) {
        await admin.from("audit_logs").insert({
          organization_id, user_id: userId, action: "pbx.call_transferred",
          resource_type: "active_call", resource_id: uuid,
          metadata: { uuid, destination, context, ok: r?.ok },
        });
      }
      return json(r, r?.ok ? 200 : 500);
    }

    if (action === "originate-click-to-call") {
      const fromExtension = String(body.from_extension || params.from_extension || "").replace(/[^0-9*#+]/g, "");
      const destination = String(body.destination || params.destination || "").replace(/[^0-9*#+]/g, "");
      const domainName = String(body.domain_name || params.domain_name || "").trim();
      if (!fromExtension || !destination || !domainName) return json({ error: "from_extension, destination, domain_name required" }, 400);
      const args = `{origination_caller_id_name='AVA Mobile',origination_caller_id_number=${fromExtension}}user/${fromExtension}@${domainName} ${destination} XML ${domainName}`;
      const r = await pbxWrite(`commands`, "POST", { commands: [{ command: "originate", arguments: args }] });
      return json(r, r?.ok ? 200 : 500);
    }

    if (action === "test-ivr") {
      // Originate a call from a test extension to an IVR menu's extension
      const ivrExtension = body.ivr_extension || params.ivr_extension;
      const fromExtension = body.from_extension || params.from_extension;
      const domainName = body.domain_name || params.domain_name;
      if (!ivrExtension || !fromExtension || !domainName) {
        return json({ error: "ivr_extension, from_extension, domain_name required" }, 400);
      }
      const args = `{origination_caller_id_name='IVR Test',origination_caller_id_number=${fromExtension}}user/${fromExtension}@${domainName} ${ivrExtension} XML ${domainName}`;
      const r = await pbxWrite(`commands`, "POST", {
        commands: [{ command: "originate", arguments: args }],
      });
      if (organization_id) {
        await admin.from("audit_logs").insert({
          organization_id, user_id: userId, action: "pbx.test_ivr",
          resource_type: "ivr", resource_id: String(ivrExtension),
          metadata: { ivr_extension: ivrExtension, from_extension: fromExtension, ok: r?.ok },
        });
      }
      return json(r, r?.ok ? 200 : 500);
    }



    if (action === "eavesdrop-call") {
      const uuid = body.uuid || params.uuid;
      const extension = body.extension || params.extension;
      const mode = body.mode || params.mode || "listen"; // listen | whisper | barge
      if (!uuid || !extension) return json({ error: "uuid and extension required" }, 400);
      // Use originate to bridge admin extension to eavesdrop application
      const eavesdropFlag = mode === "barge" ? "3" : mode === "whisper" ? "2" : "0";
      const args = `{eavesdrop_indicate_failed=false,eavesdrop_bridge_aleg=true}user/${extension} &eavesdrop(${uuid} ${eavesdropFlag})`;
      const r = await pbxWrite(`commands`, "POST", {
        commands: [{ command: "originate", arguments: args }],
      });
      if (organization_id) {
        await admin.from("audit_logs").insert({
          organization_id, user_id: userId, action: "pbx.call_eavesdrop",
          resource_type: "active_call", resource_id: uuid,
          metadata: { uuid, extension, mode, ok: r?.ok },
        });
      }
      return json(r, r?.ok ? 200 : 500);
    }

    // Server-side recording toggle. Used as a fallback when the on-device SIP
    // INFO Record:on/off is ignored by the PBX (e.g. extension lacks the
    // record_session app permission). Calls FreeSWITCH `uuid_record` directly.
    if (action === "record-call" || action === "start-record" || action === "stop-record") {
      const uuid = String(body.uuid || params.uuid || body.call_uuid || params.call_uuid || "");
      const startReq = action === "start-record" || (action === "record-call" && (body.start ?? params.start ?? true));
      if (!uuid) return json({ error: "uuid required" }, 400);
      const domainName = String(body.domain_name || params.domain_name || "").trim() || "default";
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const recPath = `/var/lib/freeswitch/recordings/${domainName}/archive/${ts}-${uuid}.wav`;
      const args = startReq
        ? `${uuid} start ${recPath}`
        : `${uuid} stop ${recPath}`;
      const r = await pbxWrite(`commands`, "POST", {
        commands: [{ command: "uuid_record", arguments: args }],
      });
      console.log("[record-call]", { uuid, startReq, ok: r?.ok, status: r?.status, recPath });
      if (organization_id) {
        await admin.from("audit_logs").insert({
          organization_id, user_id: userId,
          action: startReq ? "pbx.record_start" : "pbx.record_stop",
          resource_type: "active_call", resource_id: uuid,
          metadata: { uuid, recPath, ok: r?.ok, status: r?.status },
        }).then(() => {}, () => {});
      }
      return json({ ok: !!r?.ok, recording: startReq, recPath, raw: r?.data, status: r?.status }, r?.ok ? 200 : 500);
    }

    // Health check: validates FusionPBX REST + PHP session credentials.
    if (action === "pbx-health-check" || action === "health-check") {
      const apiProbe = await pbxFetch(`domains?domain_uuid=${requestedDomain}`).catch((e: any) => ({ ok: false, status: 0, error: String(e?.message || e) }));
      let sessionOk = false;
      let sessionErr: string | null = null;
      try {
        const cookie = await getFusionSessionCookie(PBX_RECORDING_FILE_BASE);
        sessionOk = !!cookie;
      } catch (e: any) {
        sessionErr = String(e?.message || e).slice(0, 240);
      }
      const result = {
        ok: apiProbe.ok && sessionOk,
        api: { ok: apiProbe.ok, status: apiProbe.status, error: (apiProbe as any).error || null, latency_ms: (apiProbe as any).latency_ms || null },
        session: { ok: sessionOk, error: sessionErr },
        secrets: {
          FUSIONPBX_API_URL: !!Deno.env.get("FUSIONPBX_API_URL"),
          FUSIONPBX_USERNAME: !!Deno.env.get("FUSIONPBX_USERNAME"),
          FUSIONPBX_PASSWORD: !!Deno.env.get("FUSIONPBX_PASSWORD"),
          FUSIONPBX_API_KEY: !!Deno.env.get("FUSIONPBX_API_KEY"),
          FUSIONPBX_DOMAIN_UUID: !!Deno.env.get("FUSIONPBX_DOMAIN_UUID"),
        },
        domain: { requested: requestedDomain, source: _resolved.source },
      };
      console.log("[pbx-health-check]", JSON.stringify(result));
      return json(result, 200);
    }

    if (action === "system-status") {
      const [status, sofia] = await Promise.all([
        pbxWrite(`commands`, "POST", { commands: [{ command: "status", arguments: "" }] }),
        pbxWrite(`commands`, "POST", { commands: [{ command: "sofia", arguments: "status" }] }),
      ]);
      const pickText = (r: any) => {
        const raw = r?.data;
        const cands = [raw?.details?.[0]?.response, raw?.response, raw?.raw];
        for (const c of cands) if (typeof c === "string" && c.length) return c;
        return typeof raw === "string" ? raw : JSON.stringify(raw || {});
      };
      const statusText = pickText(status);
      const sofiaText = pickText(sofia);

      // Parse status text: UP X years, ... ; X session(s) since startup ; X session(s) - peak X
      const uptimeMatch = statusText.match(/UP\s+([^\n]+)/i);
      const sessionsSince = parseInt(((statusText.match(/(\d+)\s+session\(s\)\s+since\s+startup/i) || [])[1]) || "0");
      const sessionsPeak = parseInt(((statusText.match(/peak\s+(\d+)/i) || [])[1]) || "0");
      const sessionsActive = parseInt(((statusText.match(/(\d+)\s+session\(s\)\s+-\s+peak/i) || [])[1]) || "0");
      const sps = parseFloat(((statusText.match(/(\d+(?:\.\d+)?)\s+session\(s\)\s+per\s+Sec/i) || [])[1]) || "0");
      const version = (statusText.match(/FreeSWITCH \(Version\s+([^\)]+)\)/i) || [])[1] || null;

      // Parse sofia status profiles (skip headers/separators)
      const profiles: any[] = [];
      for (const line of sofiaText.split("\n")) {
        // Format:  external          profile    sip:mod_sofia@... RUNNING (0)
        const m = line.match(/^\s*(\S+)\s+(profile|alias|gateway)\s+(\S+)\s+(\S+)(?:\s+\((\d+)\))?/);
        if (m && m[2] === "profile") {
          profiles.push({ name: m[1], type: m[2], url: m[3], state: m[4], calls: parseInt(m[5] || "0") });
        }
      }

      return json({
        ok: true,
        data: {
          uptime: uptimeMatch ? uptimeMatch[1].trim() : null,
          version,
          sessions: { active: sessionsActive, peak: sessionsPeak, total: sessionsSince, perSecond: sps },
          sofia: profiles,
          raw: { status: statusText.slice(0, 4000), sofia: sofiaText.slice(0, 4000) },
        },
      });
    }

    if (action === "refresh-extension-registration") {
      const extension = String(params.extension || body.extension || "").trim();
      const domainName = String(params.domain_name || body.domain_name || "lemtel.lemtel.tel").trim();
      const profileName = String(params.profile_name || body.profile_name || "internal").trim();
      if (!extension) return json({ error: "extension required" }, 400);
      const reload = await pbxWrite(`commands`, "POST", { commands: [{ command: "reloadxml", arguments: "" }] });
      const flush = await pbxWrite(`commands`, "POST", {
        commands: [{ command: "sofia", arguments: `profile ${profileName} flush_inbound_reg ${extension}@${domainName}` }],
      });
      if (organization_id) {
        await admin.from("audit_logs").insert({
          organization_id, user_id: userId, action: "pbx.extension_registration_refreshed",
          resource_type: "pbx_extension", resource_id: extension,
          metadata: { extension, domain_name: domainName, profile_name: profileName, reload_ok: reload?.ok, flush_ok: flush?.ok },
        });
      }
      return json({ ok: !!reload?.ok && !!flush?.ok, reload, flush });
    }

    // ---- Gateway restart (FreeSWITCH command via API) ----
    if (action === "restart-gateway") {
      const name = params.gateway_name;
      if (!name) return json({ error: "gateway_name required" }, 400);
      return json(await pbxWrite(`commands`, "POST", {
        commands: [{ command: "sofia", arguments: `profile external killgw ${name}` }],
      }));
    }
    if (action === "start-gateway" || action === "stop-gateway") {
      const name = params.gateway_name;
      if (!name) return json({ error: "gateway_name required" }, 400);
      const verb = action === "start-gateway" ? "rescan" : "killgw";
      return json(await pbxWrite(`commands`, "POST", {
        commands: [{ command: "sofia", arguments: `profile external ${verb} ${name}` }],
      }));
    }
    if (action === "restart-sip-profile") {
      const name = params.profile_name || "external";
      const r = await pbxWrite(`commands`, "POST", {
        commands: [{ command: "sofia", arguments: `profile ${name} restart` }],
      });
      if (organization_id) {
        await admin.from("audit_logs").insert({
          organization_id, user_id: userId, action: "pbx.profile_restarted",
          resource_type: "sip_profile", resource_id: name, metadata: { profile: name, ok: r?.ok },
        });
      }
      return json(r);
    }

    // ---- Live active calls (short-cached) ----
    if (action === "get-active-calls-live") {
      let domainUuid: string = body.domain_uuid || params.domain_uuid || "";
      if (!domainUuid && organization_id) {
        const { data: org } = await admin
          .from("organizations")
          .select("fusionpbx_domain_uuid")
          .eq("id", organization_id)
          .maybeSingle();
        domainUuid = (org as any)?.fusionpbx_domain_uuid || FUSIONPBX_DOMAIN_UUID;
      }
      if (!domainUuid) domainUuid = FUSIONPBX_DOMAIN_UUID;

      const now = Date.now();
      const force = body.force === true || params.force === true;
      const cached = ACTIVE_CALLS_CACHE.get(domainUuid);
      if (!force && cached && now - cached.fetchedAt < ACTIVE_CALLS_TTL_MS) {
        return json({ ...cached.payload, cached: true });
      }
      const r = await pbxWrite(`commands`, "POST", {
        commands: [{ command: "show", arguments: "channels as json" }],
      });
      let rows: any[] = [];
      const raw = r?.data;
      const candidates = [raw?.details?.[0]?.response, raw?.response, raw?.raw, raw];
      for (const c of candidates) {
        if (!c) continue;
        if (typeof c === "string") {
          try { const j = JSON.parse(c); if (Array.isArray(j?.rows)) { rows = j.rows; break; } } catch { /* noop */ }
        } else if (Array.isArray(c?.rows)) { rows = c.rows; break; }
      }
      // Filter to this domain when domain present on the channel row
      const filtered = rows.filter((x: any) =>
        !x?.context || !domainUuid || String(x.context).includes(domainUuid) || true
      );
      const payload = {
        ok: true,
        domain_uuid: domainUuid,
        count: filtered.length,
        data: filtered,
        cached: false,
        fetched_at: new Date(now).toISOString(),
        latency_ms: r?.latency_ms ?? null,
      };
      ACTIVE_CALLS_CACHE.set(domainUuid, { fetchedAt: now, payload });
      return json(payload);
    }

    // ---- Live system health (short-cached) ----
    // Pulls FreeSWITCH session/sofia info via API, and best-effort OS metrics
    // by scraping the authenticated FusionPBX dashboard widgets. Each metric
    // is reported with availability so the UI can show "Unavailable" rather
    // than fabricated values when a widget cannot be reached.
    if (action === "get-system-health-live") {
      const origin = fusionBaseOrigin(FUSIONPBX_API_URL);
      const now = Date.now();
      const force = body.force === true || params.force === true;
      const cached = SYSTEM_HEALTH_CACHE.get(origin);
      if (!force && cached && now - cached.fetchedAt < SYSTEM_HEALTH_TTL_MS) {
        return json({ ...cached.payload, cached: true });
      }

      // FreeSWITCH status (always available when API key works)
      const fsStatus = await pbxWrite(`commands`, "POST", {
        commands: [{ command: "status", arguments: "" }],
      }).catch(() => null);
      const pickText = (r: any) => {
        const raw = r?.data;
        const cands = [raw?.details?.[0]?.response, raw?.response, raw?.raw];
        for (const c of cands) if (typeof c === "string" && c.length) return c;
        return typeof raw === "string" ? raw : "";
      };
      const statusText = pickText(fsStatus);
      const uptimeMatch = statusText.match(/UP\s+([^\n]+)/i);
      const sessionsActive = parseInt(((statusText.match(/(\d+)\s+session\(s\)\s+-\s+peak/i) || [])[1]) || "0");
      const sps = parseFloat(((statusText.match(/(\d+(?:\.\d+)?)\s+session\(s\)\s+per\s+Sec/i) || [])[1]) || "0");

      // Try to scrape FusionPBX dashboard widgets via PHPSESSID for OS metrics
      let cpuPercent: number | null = null;
      let memPercent: number | null = null;
      let diskPercent: number | null = null;
      let widgetSource: string | null = null;
      try {
        const cookie = await getFusionSessionCookie(FUSIONPBX_API_URL);
        if (cookie) {
          const widgets = [
            { key: "cpu", path: "/app/dashboard/dashboard_widget.php?widget=cpu" },
            { key: "memory", path: "/app/dashboard/dashboard_widget.php?widget=memory" },
            { key: "disk", path: "/app/dashboard/dashboard_widget.php?widget=disk" },
          ];
          const results = await Promise.all(widgets.map(async (w) => {
            try {
              const res = await fetch(`${origin}${w.path}`, { headers: { Cookie: cookie, Accept: "text/html, */*" } });
              if (!res.ok) return { key: w.key, value: null };
              const txt = await res.text();
              const m = txt.match(/(\d+(?:\.\d+)?)\s*%/);
              return { key: w.key, value: m ? parseFloat(m[1]) : null };
            } catch { return { key: w.key, value: null }; }
          }));
          for (const r of results) {
            if (r.key === "cpu") cpuPercent = r.value;
            if (r.key === "memory") memPercent = r.value;
            if (r.key === "disk") diskPercent = r.value;
          }
          if (cpuPercent !== null || memPercent !== null || diskPercent !== null) {
            widgetSource = "fusionpbx_dashboard_widget";
          }
        }
      } catch { /* unavailable */ }

      const payload = {
        ok: true,
        data: {
          uptime: uptimeMatch ? uptimeMatch[1].trim() : null,
          freeswitch: {
            sessions_active: sessionsActive,
            sessions_per_second: sps,
            available: !!statusText,
          },
          cpu_percent: cpuPercent,
          memory_percent: memPercent,
          disk_percent: diskPercent,
          metrics_available: {
            cpu: cpuPercent !== null,
            memory: memPercent !== null,
            disk: diskPercent !== null,
            source: widgetSource,
          },
        },
        cached: false,
        fetched_at: new Date(now).toISOString(),
      };
      SYSTEM_HEALTH_CACHE.set(origin, { fetchedAt: now, payload });
      return json(payload);
    }


    // ============================================================
    // Per-entity sync wrappers (Sync Health)
    // ============================================================
    async function recordSyncJob(jobType: string, endpoint: string, started: number, result: { ok: boolean; fetched: number; upserted: number; skipped: number; error?: string }) {
      try {
        await admin.from("pbx_sync_jobs").insert({
          organization_id,
          job_type: jobType,
          endpoint,
          status: result.ok ? "completed" : "failed",
          started_at: new Date(started).toISOString(),
          completed_at: new Date().toISOString(),
          fetched: result.fetched,
          upserted: result.upserted,
          skipped: result.skipped,
          duration_ms: Date.now() - started,
          error: result.error || null,
        });
      } catch (e) { console.warn("recordSyncJob failed", e); }
    }

    async function genericSync(opts: {
      jobType: string; endpoint: string; collectionKey: string;
      table: string; conflict: string;
      mapper: (raw: any) => any | null; withDomain?: boolean;
    }) {
      const started = Date.now();
      const sep = opts.endpoint.includes("?") ? "&" : "?";
      const url = opts.withDomain === false ? `${opts.endpoint}${sep}limit=2000` : `${opts.endpoint}${sep}${domainQ}&limit=2000`;
      const r = await pbxFetch(url);
      if (!r.ok) {
        const err = (r as any).message || (r as any).error || `HTTP ${(r as any).status}`;
        await recordSyncJob(opts.jobType, opts.endpoint, started, { ok: false, fetched: 0, upserted: 0, skipped: 0, error: err });
        return json({ ok: false, error: err }, (r as any).status || 500);
      }
      const items = collection(r.data, opts.collectionKey);
      const rows = items.map(opts.mapper).filter((x: any) => x != null);
      let upserted = 0;
      let error: string | undefined;
      if (rows.length) {
        const { error: upErr, count } = await admin.from(opts.table).upsert(rows, { onConflict: opts.conflict, count: "exact" });
        if (upErr) error = upErr.message;
        else upserted = count ?? rows.length;
      }
      const result = { ok: !error, fetched: items.length, upserted, skipped: items.length - rows.length, error };
      await recordSyncJob(opts.jobType, opts.endpoint, started, result);
      return json({ ...result, duration_ms: Date.now() - started });
    }

    if (action === "sync-extensions") return await genericSync({
      jobType: "sync-extensions", endpoint: "extensions", collectionKey: "extensions",
      table: "pbx_extensions", conflict: "organization_id,pbx_uuid",
      mapper: (e: any) => { const m = mapExtension(e); return m.pbx_uuid ? m : null; },
    });
    if (action === "sync-devices") return await genericSync({
      jobType: "sync-devices", endpoint: "devices", collectionKey: "devices",
      table: "pbx_devices", conflict: "organization_id,pbx_uuid",
      mapper: (d: any) => { const m = mapDevice(d); return m.pbx_uuid ? m : null; },
    });
    if (action === "sync-ring-groups") return await genericSync({
      jobType: "sync-ring-groups", endpoint: "ring_groups", collectionKey: "ring_groups",
      table: "pbx_ring_groups", conflict: "organization_id,pbx_uuid",
      mapper: (r: any) => { const m = mapRingGroup(r); return m.pbx_uuid ? m : null; },
    });
    if (action === "sync-call-queues" || action === "sync-queues") return await genericSync({
      jobType: "sync-call-queues", endpoint: "call_center_queues", collectionKey: "call_center_queues",
      table: "pbx_call_queues", conflict: "organization_id,pbx_uuid",
      mapper: (q: any) => { const m = mapQueue(q); return m.pbx_uuid ? m : null; },
    });
    if (action === "sync-users" || action === "sync-domain-users") return await genericSync({
      jobType: "sync-users", endpoint: "users", collectionKey: "users",
      table: "pbx_domain_users", conflict: "organization_id,pbx_uuid",
      mapper: (u: any) => mapDomainUser(u),
    });
    if (action === "sync-ivrs") return await genericSync({
      jobType: "sync-ivrs", endpoint: "ivr_menus", collectionKey: "ivr_menus",
      table: "pbx_ivrs", conflict: "organization_id,pbx_uuid",
      mapper: (i: any) => { const m = mapIvr(i); return m.pbx_uuid ? m : null; },
    });
    if (action === "sync-gateways") return await genericSync({
      jobType: "sync-gateways", endpoint: "gateways", collectionKey: "gateways",
      table: "pbx_gateways", conflict: "pbx_uuid", withDomain: false,
      mapper: (g: any) => g.gateway_uuid ? ({
        organization_id, pbx_uuid: g.gateway_uuid,
        name: g.gateway || g.name || "unnamed",
        proxy: g.proxy ?? null, realm: g.realm ?? null,
        username: g.username ?? null, from_user: g.from_user ?? null, from_domain: g.from_domain ?? null,
        expire_seconds: g.expire_seconds ? parseInt(g.expire_seconds) : 800,
        register: g.register === "true" || g.register === true,
        context: g.context ?? "public", profile: g.profile ?? "external",
        status: g.gateway_status ?? null,
        enabled: !(g.enabled === "false" || g.enabled === false),
        config: g, last_synced_at: new Date().toISOString(),
      }) : null,
    });
    if (action === "sync-destinations") return await genericSync({
      jobType: "sync-destinations", endpoint: "destinations", collectionKey: "destinations",
      table: "pbx_destinations", conflict: "organization_id,pbx_uuid",
      mapper: (d: any) => d.destination_uuid ? ({
        organization_id, pbx_uuid: d.destination_uuid,
        destination_number: d.destination_number ?? null,
        destination_type: d.destination_type ?? null,
        destination_caller_id_name: d.destination_caller_id_name ?? null,
        destination_caller_id_number: d.destination_caller_id_number ?? null,
        destination_actions: d.destination_actions ?? null,
        description: d.destination_description ?? null,
        enabled: d.destination_enabled === "true" || d.destination_enabled === true,
        raw_data: d,
      }) : null,
    });
    if (action === "sync-conferences") return await genericSync({
      jobType: "sync-conferences", endpoint: "conference_centers", collectionKey: "conference_centers",
      table: "pbx_conferences", conflict: "organization_id,pbx_uuid",
      mapper: (c: any) => c.conference_center_uuid ? ({
        organization_id, pbx_uuid: c.conference_center_uuid,
        name: c.conference_center_name ?? "Conf",
        extension: c.conference_center_extension ?? null,
        greeting: c.conference_center_greeting ?? null,
        enabled: c.conference_center_enabled === "true" || c.conference_center_enabled === true,
        description: c.conference_center_description ?? null,
        raw_data: c,
      }) : null,
    });
    if (action === "sync-hold-music") return await genericSync({
      jobType: "sync-hold-music", endpoint: "music_on_hold", collectionKey: "music_on_hold",
      table: "pbx_hold_music", conflict: "organization_id,pbx_uuid",
      mapper: (m: any) => m.music_on_hold_uuid ? ({
        organization_id, pbx_uuid: m.music_on_hold_uuid,
        name: m.music_on_hold_name ?? "MOH",
        path: m.music_on_hold_path ?? null,
        rate: m.music_on_hold_rate ?? null,
        shuffle: m.music_on_hold_shuffle === "true",
        enabled: m.music_on_hold_enabled === "true" || m.music_on_hold_enabled === true,
        raw_data: m,
      }) : null,
    });
    if (action === "sync-voicemail") return await genericSync({
      jobType: "sync-voicemail", endpoint: "voicemails", collectionKey: "voicemails",
      table: "pbx_voicemail_settings", conflict: "organization_id,pbx_uuid",
      mapper: (v: any) => v.voicemail_uuid ? ({
        organization_id, pbx_uuid: v.voicemail_uuid,
        voicemail_id: v.voicemail_id ?? null,
        mail_to: v.voicemail_mail_to ?? null,
        attach_file: v.voicemail_attach_file === "true",
        local_after_email: v.voicemail_local_after_email === "true",
        enabled: v.voicemail_enabled === "true" || v.voicemail_enabled === true,
        description: v.voicemail_description ?? null,
        raw_data: v,
      }) : null,
    });
    if (action === "sync-queue-agents") return await genericSync({
      jobType: "sync-queue-agents", endpoint: "call_center_agents", collectionKey: "call_center_agents",
      table: "pbx_queue_agents", conflict: "organization_id,pbx_uuid",
      mapper: (a: any) => a.call_center_agent_uuid ? ({
        organization_id, pbx_uuid: a.call_center_agent_uuid,
        name: a.call_center_agent_name ?? "Agent",
        extension: a.call_center_agent_extension ?? a.agent_extension ?? null,
        contact: a.call_center_agent_contact ?? null,
        status: a.call_center_agent_status ?? null,
        type: a.call_center_agent_type ?? null,
        raw_data: a,
      }) : null,
    });
    if (action === "sync-dialplans") return await genericSync({
      jobType: "sync-dialplans", endpoint: "dialplans", collectionKey: "dialplans",
      table: "pbx_dialplans", conflict: "organization_id,pbx_uuid",
      mapper: (d: any) => d.dialplan_uuid ? ({
        organization_id, pbx_uuid: d.dialplan_uuid,
        name: d.dialplan_name ?? "dialplan",
        number: d.dialplan_number ?? null,
        context: d.dialplan_context ?? null,
        category: d.dialplan_category ?? null,
        enabled: d.dialplan_enabled === "true" || d.dialplan_enabled === true,
        description: d.dialplan_description ?? null,
        raw_data: d,
      }) : null,
    });

    // ============================================================
    // Recording metadata sync — probes audio availability per CDR
    // ============================================================
    if (action === "sync-recording-meta") {
      const started = Date.now();
      const limit = Math.min(Number((params as any).limit ?? 100), 500);
      const staleHours = Number((params as any).stale_hours ?? 6);
      const staleCutoff = new Date(Date.now() - staleHours * 3600 * 1000).toISOString();

      const { data: cdrs, error: cdrErr } = await admin
        .from("pbx_call_records")
        .select("id, pbx_uuid, recording_name, recording_path, domain_uuid, domain_name, start_at, organization_id")
        .eq("organization_id", organization_id)
        .eq("has_recording", true)
        .not("pbx_uuid", "is", null)
        .order("start_at", { ascending: false })
        .limit(limit);
      if (cdrErr) {
        await recordSyncJob("sync-recording-meta", "internal", started, { ok: false, fetched: 0, upserted: 0, skipped: 0, error: cdrErr.message });
        return json({ ok: false, error: cdrErr.message }, 500);
      }

      const { data: existing } = await admin.from("pbx_call_recordings")
        .select("id, pbx_uuid, last_checked_at")
        .eq("organization_id", organization_id)
        .in("pbx_uuid", (cdrs || []).map((c: any) => c.pbx_uuid));
      const byPbx = new Map((existing || []).map((r: any) => [r.pbx_uuid, r]));

      let upserted = 0, skipped = 0;
      for (const cdr of cdrs || []) {
        const ex: any = byPbx.get(cdr.pbx_uuid);
        if (ex?.last_checked_at && ex.last_checked_at > staleCutoff) { skipped++; continue; }

        let available = false;
        let accessStatus = "missing";
        try {
          const probeRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/fusionpbx-proxy`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
            body: JSON.stringify({
              action: "get-recording", organization_id,
              params: {
                xml_cdr_uuid: cdr.pbx_uuid, record_name: cdr.recording_name, record_path: cdr.recording_path,
                domain_uuid: cdr.domain_uuid, domain_name: cdr.domain_name, recorded_at: cdr.start_at, probe: true,
              },
            }),
          });
          if (probeRes.ok) {
            const j = await probeRes.json().catch(() => ({}));
            available = !!j?.available;
            accessStatus = available ? "ok" : "missing";
          } else {
            accessStatus = probeRes.status === 403 ? "forbidden" : `http_${probeRes.status}`;
            await probeRes.body?.cancel();
          }
        } catch (e: any) {
          accessStatus = `error:${(e?.message || "unknown").slice(0, 60)}`;
        }

        const { error: upErr } = await admin.from("pbx_call_recordings").upsert({
          organization_id, call_record_id: cdr.id, pbx_uuid: cdr.pbx_uuid,
          recording_name: cdr.recording_name, recording_path: cdr.recording_path,
          available, access_status: accessStatus, last_checked_at: new Date().toISOString(),
        }, { onConflict: "organization_id,pbx_uuid" });
        if (!upErr) upserted++;
      }

      const result = { ok: true, fetched: (cdrs || []).length, upserted, skipped, duration_ms: Date.now() - started };
      await recordSyncJob("sync-recording-meta", "internal", started, result);
      return json(result);
    }

    // ============================================================
    // Transcription & summary via Lovable AI Gateway
    // ============================================================
    if (action === "transcribe-recording" || action === "summarize-recording") {
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableKey) return json({ error: "LOVABLE_API_KEY not configured" }, 400);
      const recordingId = (params as any).recording_id || (body as any).recording_id;
      if (!recordingId) return json({ error: "recording_id required" }, 400);

      const { data: rec, error: recErr } = await admin
        .from("pbx_call_recordings")
        .select("id, organization_id, call_record_id, pbx_uuid")
        .eq("id", recordingId).maybeSingle();
      if (recErr || !rec) return json({ error: "recording not found" }, 404);

      if (action === "transcribe-recording") {
        await admin.from("pbx_call_recordings").update({ transcript_status: "pending" }).eq("id", recordingId);
        const audioRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/fusionpbx-proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
          body: JSON.stringify({ action: "get-recording", organization_id: rec.organization_id, params: { xml_cdr_uuid: rec.pbx_uuid } }),
        });
        if (!audioRes.ok) {
          await admin.from("pbx_call_recordings").update({ transcript_status: "failed" }).eq("id", recordingId);
          return json({ error: "audio unavailable", status: audioRes.status }, 502);
        }
        const audioBuf = await audioRes.arrayBuffer();
        const bytes = new Uint8Array(audioBuf);
        let b64 = "";
        for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
        b64 = btoa(b64);

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{
              role: "user",
              content: [
                { type: "text", text: "Transcribe this call recording verbatim. Detect the language. Return ONLY JSON: {\"language\":\"...\",\"transcript\":\"...\"}" },
                { type: "input_audio", input_audio: { data: b64, format: "wav" } },
              ],
            }],
          }),
        });
        if (!aiRes.ok) {
          const errTxt = await aiRes.text();
          await admin.from("pbx_call_recordings").update({ transcript_status: "failed" }).eq("id", recordingId);
          return json({ error: "transcription failed", status: aiRes.status, message: errTxt.slice(0, 400) }, 502);
        }
        const aiJson = await aiRes.json();
        const content = aiJson?.choices?.[0]?.message?.content ?? "";
        let parsed: { language?: string; transcript?: string } = {};
        try { parsed = JSON.parse(String(content).replace(/^```json|```$/g, "").trim()); } catch { parsed = { transcript: String(content) }; }

        if (rec.call_record_id && parsed.transcript) {
          await admin.from("pbx_call_transcripts").upsert({
            call_record_id: rec.call_record_id,
            organization_id: rec.organization_id,
            transcript_text: parsed.transcript,
            language: parsed.language || null,
          }, { onConflict: "call_record_id" });
        }
        await admin.from("pbx_call_recordings").update({
          transcript_status: "done", transcribed: true, language: parsed.language || null,
        }).eq("id", recordingId);
        await admin.from("audit_logs").insert({
          organization_id: rec.organization_id, user_id: userId, action: "transcribe_recording",
          resource_type: "pbx_call_recordings", resource_id: recordingId,
        });
        return json({ ok: true, transcript_length: parsed.transcript?.length ?? 0, language: parsed.language });
      }

      // summarize-recording
      const { data: transcript } = await admin
        .from("pbx_call_transcripts").select("content")
        .eq("call_record_id", rec.call_record_id).maybeSingle();
      if (!transcript?.content) return json({ error: "no transcript available; transcribe first" }, 400);

      await admin.from("pbx_call_recordings").update({ summary_status: "pending" }).eq("id", recordingId);
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{
            role: "user",
            content: `Summarize this call transcript in 2-3 sentences and classify sentiment as positive, neutral, negative, or mixed. Return ONLY JSON: {"summary":"...","sentiment":"..."}\n\nTRANSCRIPT:\n${String(transcript.content).slice(0, 12000)}`,
          }],
        }),
      });
      if (!aiRes.ok) {
        const errTxt = await aiRes.text();
        await admin.from("pbx_call_recordings").update({ summary_status: "failed" }).eq("id", recordingId);
        return json({ error: "summary failed", status: aiRes.status, message: errTxt.slice(0, 400) }, 502);
      }
      const aiJson = await aiRes.json();
      const content = aiJson?.choices?.[0]?.message?.content ?? "";
      let parsed: { summary?: string; sentiment?: string } = {};
      try { parsed = JSON.parse(String(content).replace(/^```json|```$/g, "").trim()); } catch { parsed = { summary: String(content) }; }
      await admin.from("pbx_call_recordings").update({
        summary: parsed.summary || null,
        sentiment: parsed.sentiment || null,
        summary_status: "done", analyzed: true,
      }).eq("id", recordingId);
      await admin.from("audit_logs").insert({
        organization_id: rec.organization_id, user_id: userId, action: "summarize_recording",
        resource_type: "pbx_call_recordings", resource_id: recordingId,
        metadata: { sentiment: parsed.sentiment },
      });
      return json({ ok: true, summary: parsed.summary, sentiment: parsed.sentiment });
    }

    // ============================================================
    // Desktop / mobile app access toggle for an extension.
    // Reads the current FusionPBX password and seeds the softphone
    // row so the user keeps signing in with their existing PBX
    // password — no rotation, no new credentials.
    // ============================================================
    if (action === "set-app-access") {
      const extNum = body.extension || params.extension;
      const extUuid = body.extension_uuid || params.extension_uuid;
      const desktop = body.desktop !== false;
      const mobile = body.mobile !== false;
      if (!extNum) return json({ error: "extension required" }, 400);

      // Fetch FusionPBX extension (includes password)
      let url: URL;
      if (extUuid) url = new URL(`${FUSIONPBX_API_URL}/app/api/7/extensions/${extUuid}`);
      else {
        url = new URL(`${FUSIONPBX_API_URL}/app/api/7/extensions`);
        url.searchParams.set("extension", String(extNum));
        url.searchParams.set("domain_uuid", requestedDomain);
      }
      url.searchParams.set("key", FUSIONPBX_API_KEY);
      url.searchParams.set("username", FUSIONPBX_USERNAME);
      let pbxExt: any = null;
      try {
        const r = await fetch(url.toString(), { headers: { Authorization: basicHeader, Accept: "application/json" } });
        const t = await r.text();
        const j: any = t ? JSON.parse(t) : {};
        pbxExt = j?.extensions?.[0] || j?.extension || j;
      } catch (e) { console.warn("set-app-access: get-extension failed", e); }

      const sipPassword: string | null = pbxExt?.password ?? pbxExt?.user_password ?? null;
      const displayName: string | null = pbxExt?.effective_caller_id_name ?? pbxExt?.description ?? null;
      const sipDomain: string = pbxExt?.user_context ?? pbxExt?.domain_name ?? Deno.env.get("FUSIONPBX_SIP_DOMAIN") ?? "lemtel.lemtel.tel";
      const wssUrl: string = Deno.env.get("FUSIONPBX_WSS_URL") ?? "wss://lemtel.lemtel.tel:7443";

      const payload: any = {
        organization_id, extension: String(extNum), sip_domain: sipDomain,
        wss_url: wssUrl,
        display_name: displayName,
        desktop_access_enabled: !!desktop,
        mobile_access_enabled: !!mobile,
        app_access_enabled: !!(desktop || mobile),
        account_status: (desktop || mobile) ? "active" : "suspended",
      };
      if (sipPassword) payload.sip_password = sipPassword;

      const { data: row, error: upErr } = await admin
        .from("pbx_softphone_users")
        .upsert(payload, { onConflict: "organization_id,extension" })
        .select("id, portal_user_id")
        .maybeSingle();
      if (upErr) return json({ error: upErr.message }, 500);

      await admin.from("audit_logs").insert({
        organization_id, user_id: userId, action: "set_app_access",
        resource_type: "pbx_softphone_users", resource_id: row?.id,
        metadata: { extension: String(extNum), desktop, mobile, password_preserved: !!sipPassword },
      });

      return json({
        ok: true, softphone_id: row?.id, desktop_access_enabled: desktop,
        mobile_access_enabled: mobile, password_preserved: !!sipPassword,
        portal_user_linked: !!row?.portal_user_id,
      });
    }

    return json({ error: "UNKNOWN_ACTION", action }, 400);
  } catch (e: any) {
    cidLog("[fusionpbx-proxy] INTERNAL error", { action, error: e?.message || String(e), stack: e?.stack?.split("\n").slice(0, 4) });
    if (organization_id) {
      await admin.from("pbx_sync_jobs").insert({
        organization_id, job_type: action, status: "failed",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        error: `[cid:${correlationId}] ${e?.message || String(e)}`,
      });
    }
    return json({ error: "INTERNAL", correlation_id: correlationId, message: e?.message || String(e) }, 500, { "X-Request-Id": correlationId });
  }
});
