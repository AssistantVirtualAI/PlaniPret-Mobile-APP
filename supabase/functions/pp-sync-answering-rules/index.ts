// pp-sync-answering-rules — Apply the standard Planiprêt answering rule
// (simultaneously ring {ext}_mobile, 25s timeout, then voicemail) to
// brokers in NetSapiens.
//
// Modes:
//   POST { "broker_id": "<uuid>" }           → single broker
//   POST { "bulk": true, "batch_size": 10 }  → all brokers with ns_extension
//   POST { "dry_run": true, ... }            → do not call NS, return payloads

import { createClient } from "npm:@supabase/supabase-js@2";
import { nsFetch } from "../_shared/planipret-ns.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function readBody(res: Response) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

// NS-API v2 sub-resource for answering rules — probed once per invocation
// because NetSapiens deployments differ ("answerrules" vs "answeringrules"
// vs "answering-rules"). The first path that returns HTTP 200 on GET wins.
const RULE_PATH_CANDIDATES = ["answerrules", "answeringrules", "answering-rules"];
const cachedRulePathByDomain = new Map<string, string>();

async function resolveRulePath(domain: string, ext: string, fn: string): Promise<string | null> {
  const cached = cachedRulePathByDomain.get(domain);
  if (cached) return cached;
  for (const p of RULE_PATH_CANDIDATES) {
    const res = await nsFetch(
      `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/${p}`,
      { method: "GET" },
      { functionName: fn },
    );
    if (res.status >= 200 && res.status < 300) {
      cachedRulePathByDomain.set(domain, p);
      return p;
    }
    // consume body to avoid leak
    await res.text().catch(() => {});
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "missing_config", detail: "SUPABASE_SERVICE_ROLE_KEY required" }, 500);
  }

  try {
    const body: any = await req.json().catch(() => ({}));
    const broker_id: string | null = body?.broker_id ?? null;
    const bulk: boolean = !!body?.bulk;
    const dry_run: boolean = !!body?.dry_run;
    const batch_size: number = Math.max(1, Math.min(20, Number(body?.batch_size ?? 10)));
    const ring_timeout: number = Math.max(20, Math.min(120, Number(body?.ring_timeout ?? 35)));
    // DID routing must be verified/repaired on real syncs; otherwise a DID can
    // still point to voicemail/SpeakAccount before the user's ring rule runs.
    const repair_dids: boolean = !dry_run && body?.repair_dids !== false;

    // Auth: admin only
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY ?? SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (!caller) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    let isAdmin = false;
    try { const { data } = await admin.rpc("is_planipret_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /* ignore */ }
    if (!isAdmin) { try { const { data } = await admin.rpc("is_super_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /* ignore */ } }
    if (!isAdmin) return json({ error: "forbidden", detail: "admin role required" }, 403);

    // NS-API v2 answering-rule schema. We include BOTH the nested-object
    // form (documented on docs.ns-api.com) AND the flat-key aliases used
    // by some NS deployments, so the rule is honored regardless of which
    // NetSapiens build the domain runs on.
    // `time-frame: "*"` is the built-in system default (always-on) —
    // using the literal string "Default" only works if a timeframe with
    // that exact name exists on the account, otherwise NS silently
    // creates an inert rule that never matches inbound calls.
    // IMPORTANT (root cause of "straight to voicemail"):
    // The previous payload put the user's OWN AOR (sip:{ext}@{domain}) in the
    // sim-ring destination list. That is a self-reference: on NS builds that do
    // not honor `ring-all-user-phones`, the fork cannot be routed, NS answers
    // instantly with a terminating application (VMail / SpeakAccount) and no
    // device ever rings (observed CDR: answer == start, 2 SIP participants).
    // The rule now rings the user's REAL device AORs, read from NS
    // (/users/{ext}/devices), and keeps the ring-all flags as a hint only.
    const buildRulePayload = (ext: string, domain: string, deviceAors: string[]) => {
      const destinations = deviceAors.map((aor) => ({ destination: aor, timeout: ring_timeout }));
      return {
        "time-frame": "*",
        "enabled": "yes",                    // voicemail fallback ON after no-answer
        "do-not-disturb": "no",
        "do-not-disturb-enabled": "no",
        "call-screening": "no",
        "call-screening-enabled": "no",
        "phone-numbers-to-allow-enabled": "no",
        "phone-numbers-to-reject-enabled": "no",
        "reject-anonymous-calls-enabled": "no",
        "anonymous-call-rejection-enabled": "no",
        "anonymous-call-rejection": "no",
        "forward-always-enabled": "no",
        "forward-on-active-enabled": "no",
        "forward-on-busy-enabled": "no",
        "forward-on-dnd-enabled": "no",
        "forward-when-unregistered-enabled": "no",
        // --- nested v2 form ---
        "forward-always": { "enabled": "no" },
        "forward-on-active": { "enabled": "no" },
        "forward-on-busy": { "enabled": "no" },
        "forward-on-dnd": { "enabled": "no" },
        "forward-when-unregistered": { "enabled": "no" },
        "simultaneous-ring": {
          "enabled": "yes",
          "confirm": "no",
          "timeout": ring_timeout,
          // Do NOT include the base extension (sip:{ext}@domain). On this NS
          // tenant it can resolve to a terminating application (SpeakAccount /
          // voicemail) before the registered devices are forked.
          "include-user-extension": "no",
          // Fork to every registered device as well: if the mobile contact has
          // expired (app backgrounded / OS suspended the WebView), the call must
          // still reach any other registered terminal instead of dropping to
          // voicemail after a 0s leg.
          "ring-all-user-phones": "yes",
          "parameters": deviceAors,
          "destinations": destinations,
          "list": deviceAors,
        },
        "forward-no-answer": {
          "enabled": "yes",
          "destination": `vmail:${ext}`,
          "target": `vmail:${ext}`,
          "timeout": ring_timeout,
        },
        // --- flat-key aliases (legacy NS builds) ---
        "simultaneous-ring-enabled": "yes",
        "simultaneous-ring-confirm": "no",
        "simultaneous-ring-include-user-extension": "no",
        "simultaneous-ring-all-user-phones": "yes",
        "simultaneous-ring-parameters": deviceAors,
        "sim-ring-include-user-extension": "no",
        "sim-ring-all-user-phones": "yes",
        "sim-ring-parameters": deviceAors,
        "simultaneous-ring-list": deviceAors,

        "sim-ring-destinations": destinations,
        "ring-timeout": ring_timeout,
        "timeout": ring_timeout,
        "forward-no-answer-enabled": "yes",
        "forward-no-answer-target": `vmail:${ext}`,
        "forward-no-answer-destination": `vmail:${ext}`,
      };
    };

    const isRegisteredDevice = (row: any) => {
      const exp = Number(row?.expires ?? row?.["registration-expires"] ?? row?.["expires-seconds"] ?? 0);
      const status = String(
        row?.["registration-status"] ?? row?.["device-registration-status"] ?? row?.["device-sip-registration-state"] ?? row?.status ?? "",
      ).toLowerCase();
      return exp > 0 || status.includes("register") || status.includes("online") || status === "active" ||
        !!(row?.contact ?? row?.["registration-contact"] ?? row?.["contact-uri"] ?? row?.["device-sip-registration-uri"] ?? row?.["registration-ip"] ?? row?.["user-agent"]);
    };

    const aorFromRow = (row: any, ext: string, domain: string) => {
      const id = String(row?.device ?? row?.aor ?? row?.name ?? row?.["aor-user"] ?? row?.user ?? "")
        .replace(/^sip:/i, "")
        .split("@")[0]
        .trim();
      if (!id || !id.startsWith(ext) || id === ext) return "";
      return `sip:${id}@${domain}`;
    };

    // Read the broker's real device AORs from NS. The mobile app must be first,
    // but it must NOT be the only target: when iOS/Android suspends the mobile
    // SIP contact, a mobile-only sim-ring is answered immediately by voicemail.
    // Keep every provisioned device as fallback so NS actually rings instead of
    // terminating at SpeakAccount/VMail after a 0-second leg.
    const mobileOnly = (aors: string[], ext: string) =>
      aors.filter((a) => a.toLowerCase().includes(`${String(ext).toLowerCase()}_mobile`));

    const mobileFirst = (aors: string[], ext: string) => {
      const mobile = mobileOnly(aors, ext);
      const rest = aors.filter((a) => !mobile.includes(a));
      return [...new Set([...mobile, ...rest])];
    };

    const fetchDeviceAors = async (ext: string, domain: string): Promise<{ aors: string[]; source: string; status: number; registered_aors: string[]; all_aors: string[] }> => {
      // Last-resort fallback: never leave the rule pointing at a single dead
      // convention AOR — `<OwnDevices>` makes NS fork to whatever the user has
      // actually registered instead of answering instantly with voicemail.
      const fallback = [`sip:${ext}_mobile@${domain}`, "<OwnDevices>"];
      try {
        const res = await nsFetch(
          `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices`,
          { method: "GET" },
          { functionName: "pp-sync-answering-rules" },
        );
        const data: any = await readBody(res);
        const rows: any[] = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
        const allAors = [...new Set(rows.map((r: any) => aorFromRow(r, ext, domain)).filter(Boolean))];
        const provisioned = mobileOnly(allAors, ext);
        const registeredAll = [...new Set(rows.filter(isRegisteredDevice).map((r: any) => aorFromRow(r, ext, domain)).filter(Boolean))];
        const registered = mobileOnly(registeredAll, ext);

        // Preference order:
        //  1. registered devices, mobile first (best: rings live contacts)
        //  2. provisioned devices, mobile first (still gives NS real AORs)
        //  3. convention fallback if NS does not list devices
        let chosen: string[] = [];
        let source = "";
        if (registeredAll.length) { chosen = mobileFirst(registeredAll, ext); source = "ns_registered_devices_mobile_first"; }
        else if (allAors.length) { chosen = mobileFirst(allAors, ext); source = "ns_provisioned_devices_mobile_first"; }

        if (chosen.length) {
          return {
            aors: [...new Set(chosen)],
            source,
            status: res.status,
            registered_aors: registered.length ? registered : registeredAll,
            all_aors: allAors,
          };
        }
        return { aors: fallback, source: "convention_fallback_mobile_plus_owndevices", status: res.status, registered_aors: [], all_aors: [] };
      } catch {
        return { aors: fallback, source: "convention_fallback_mobile_plus_owndevices", status: 0, registered_aors: [], all_aors: [] };
      }
    };



    const normalizeDigits = (value: unknown) => {
      const digits = String(value ?? "").replace(/\D/g, "");
      if (!digits) return "";
      return digits.length === 10 ? `1${digits}` : digits;
    };

    const buildDidPayload = (ext: string, domain: string) => ({
      "dest-application": "to-user",
      "destination-application": "to-user",
      "dial-rule-application": "to-user",
      "dialrule-application": "to-user",
      application: "to-user",
      "to-user": `${ext}@${domain}`,
      "dest-user": ext,
      "destination-user": ext,
      "dial-rule-destination": ext,
      "dialrule-destination": ext,
      "dial-rule-translation-destination": `sip:${ext}@${domain}`,
      "dialrule-translation-destination": `sip:${ext}@${domain}`,
      destination: ext,
      dest: ext,
      user: ext,
      enable: "yes",
      enabled: "yes",
    });

    // Read a DID back from NS and decide whether it really routes to the user.
    const DID_DEST_FIELDS = [
      "destination", "dest", "user", "to-user", "dest-user", "destination-user",
      "dial-rule-destination", "dialrule-destination",
      "dial-rule-translation-destination", "dialrule-translation-destination",
    ];
    const DID_APP_FIELDS = [
      "dest-application", "destination-application",
      "dial-rule-application", "dialrule-application", "application",
    ];

    const readDidRoute = async (pn: string, domain: string) => {
      const endpoints = [
        `/domains/${encodeURIComponent(domain)}/phonenumbers/${encodeURIComponent(pn)}`,
        `/domains/${encodeURIComponent(domain)}/phone-numbers/${encodeURIComponent(pn)}`,
        `/domains/${encodeURIComponent(domain)}/numbers/${encodeURIComponent(pn)}`,
      ];
      for (const endpoint of endpoints) {
        const res = await nsFetch(endpoint, { method: "GET" }, { functionName: "pp-sync-answering-rules" });
        const data: any = await readBody(res);
        if (!res.ok) continue;
        const row = Array.isArray(data) ? data[0] : (data?.data?.[0] ?? data?.items?.[0] ?? data);
        if (row && typeof row === "object") return { endpoint, status: res.status, row };
      }
      return { endpoint: null as string | null, status: 0, row: null as any };
    };

    const didRoutesToUser = (row: any, ext: string, domain: string) => {
      if (!row) return false;
      const app = DID_APP_FIELDS.map((f) => String(row?.[f] ?? "").toLowerCase()).find(Boolean) ?? "";
      const dest = DID_DEST_FIELDS.map((f) => String(row?.[f] ?? "")).filter(Boolean).join(" ").toLowerCase();
      const badApp = /vmail|voicemail|speakaccount|speakeraccount|auto-?attendant|conference|queue/.test(`${app} ${dest}`);
      if (badApp) return false;
      const appOk = !app || ["to-user", "user", "sip", "to_user"].includes(app);
      const extRe = new RegExp(`(^|[^0-9])${ext}([^0-9]|$)`);
      const destOk = extRe.test(dest) || dest.includes(`${ext.toLowerCase()}@${domain.toLowerCase()}`);
      return appOk && destOk;
    };

    const repairDidRoutes = async (ext: string, domain: string) => {
      if (!repair_dids) return { skipped: true, reason: "disabled" };
      const { data: rows, error } = await admin
        .from("planipret_did_assignments")
        .select("phone_number_e164, phone_number_digits, extension, domain")
        .eq("domain", domain)
        .eq("extension", ext);
      if (error) return { success: false, error: error.message, attempted: 0, repaired: 0 };
      const numbers = [...new Set((rows ?? []).map((r: any) => normalizeDigits(r.phone_number_digits ?? r.phone_number_e164)).filter(Boolean))];
      if (!numbers.length) return { success: true, attempted: 0, repaired: 0, verified: 0, source: "no_local_did_assignment" };

      const payload = buildDidPayload(ext, domain);
      let repaired = 0;
      let verified = 0;
      const failures: any[] = [];
      const details: any[] = [];

      for (const pn of numbers) {
        // 1) Read current state — skip the write when NS already routes correctly.
        const before = await readDidRoute(pn, domain);
        if (before.row && didRoutesToUser(before.row, ext, domain)) {
          verified += 1;
          repaired += 1;
          details.push({ phone_number: pn, state: "already_correct", endpoint: before.endpoint });
          continue;
        }
        if (!before.row) {
          failures.push({ phone_number: pn, reason: "not_found_on_pbx", status: before.status });
          details.push({ phone_number: pn, state: "not_found_on_pbx" });
          continue;
        }

        // 2) Write.
        const endpoints = [
          before.endpoint,
          `/domains/${encodeURIComponent(domain)}/phonenumbers/${encodeURIComponent(pn)}`,
          `/domains/${encodeURIComponent(domain)}/phone-numbers/${encodeURIComponent(pn)}`,
          `/domains/${encodeURIComponent(domain)}/numbers/${encodeURIComponent(pn)}`,
        ].filter(Boolean) as string[];
        let lastStatus = 0;
        let ok = false;
        for (const endpoint of [...new Set(endpoints)]) {
          const res = await nsFetch(endpoint, { method: "PUT", body: JSON.stringify(payload) }, { functionName: "pp-sync-answering-rules" });
          lastStatus = res.status;
          await res.text().catch(() => {});
          if (res.ok) { ok = true; break; }
        }
        if (!ok) {
          failures.push({ phone_number: pn, reason: "write_rejected", status: lastStatus });
          details.push({ phone_number: pn, state: "write_rejected", status: lastStatus });
          continue;
        }
        repaired += 1;

        // 3) Read-after-write — a 200 from NS does NOT mean the route changed.
        const after = await readDidRoute(pn, domain);
        if (after.row && didRoutesToUser(after.row, ext, domain)) {
          verified += 1;
          details.push({ phone_number: pn, state: "repaired_and_verified" });
        } else {
          const app = DID_APP_FIELDS.map((f) => after.row?.[f]).find(Boolean) ?? null;
          const dest = DID_DEST_FIELDS.map((f) => after.row?.[f]).find(Boolean) ?? null;
          failures.push({ phone_number: pn, reason: "write_not_honored", stored_application: app, stored_destination: dest });
          details.push({ phone_number: pn, state: "write_not_honored", stored_application: app, stored_destination: dest });
          console.error("[didRepair] NS ignored DID route write", JSON.stringify({ extension: ext, domain, phone_number: pn, stored_application: app, stored_destination: dest }));
        }
      }

      return {
        success: failures.length === 0,
        attempted: numbers.length,
        repaired,
        verified,
        failures: failures.slice(0, 10),
        details: details.slice(0, 20),
        payload,
      };
    };




    // Local DID inventory for one extension (used for diagnostics + dry-run).
    const localDids = async (ext: string, domain: string) => {
      const { data } = await admin
        .from("planipret_did_assignments")
        .select("phone_number_e164, phone_number_digits")
        .eq("domain", domain)
        .eq("extension", ext);
      return (data ?? []).map((r: any) => r.phone_number_e164 ?? r.phone_number_digits).filter(Boolean);
    };

    const applyRule = async (broker: any) => {
      const ext = broker.ns_extension ?? broker.extension;
      const domain = broker.ns_domain || NS_DEFAULT_DOMAIN;
      const brokerLabel = { broker_id: broker.id ?? broker.user_id, broker_name: broker.full_name, email: broker.email };
      if (!ext) {
        return {
          ...brokerLabel, extension: null, domain, success: false,
          routing_ok: false, error: "no_extension", routing_blockers: ["no_extension"],
          dids: [], raw_pbx: [],
        };
      }

      const dids = await localDids(ext, domain);
      const devices = await fetchDeviceAors(ext, domain);
      const payload = buildRulePayload(ext, domain, devices.aors);
      if (dry_run) {
        const did_repair = { skipped: true, reason: "dry_run" };
        const blockers = [
          ...(dids.length ? [] : ["no_did"]),
          ...(devices.registered_aors?.length ? [] : ["no_registered_device"]),
        ];
        return {
          ...brokerLabel, extension: ext, domain, dry_run: true,
          action: blockers.includes("no_did") ? "would_skip" : "would_configure",
          reason: blockers.join(",") || null,
          routing_blockers: blockers,
          dids, payload, devices, did_repair, success: true,
        };
      }



      // Clear any user-level DND / forward that overrides answering rules and
      // sends inbound calls straight to voicemail.
      let userReset: number | null = null;
      try {
        const uRes = await nsFetch(
          `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}`,
          {
            method: "PUT",
            body: JSON.stringify({
              "do-not-disturb": "no",
              "do-not-disturb-enabled": "no",
              "call-screening-enabled": "no",
              "phone-numbers-to-allow-enabled": "no",
              "phone-numbers-to-reject-enabled": "no",
              "reject-anonymous-calls-enabled": "no",
              "anonymous-call-rejection-enabled": "no",
              "anonymous-call-rejection": "no",
              "forward-always-enabled": "no",
              "forward-on-busy-enabled": "no",
              "forward-when-unregistered-enabled": "no",
              "call-forward-always": "",
              "call-forward-busy": "",
              "call-forward-no-answer": "",
            }),
          },
          { functionName: "pp-sync-answering-rules" },
        );
        userReset = uRes.status;
        await uRes.text().catch(() => {});
      } catch { /* best-effort */ }

      const rulePath = await resolveRulePath(domain, ext, "pp-sync-answering-rules");
      if (!rulePath) {
        return {
          broker_id: broker.id ?? broker.user_id, broker_name: broker.full_name,
          extension: ext, domain, success: false,
          error: "no_ns_answering_rules_endpoint",
          tried: RULE_PATH_CANDIDATES,
        };
      }
      const base = `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/${rulePath}`;

      // Make every DID locally assigned to this broker point to the user route,
      // not to SpeakAccount/AI/voicemail. Answering rules then fork only to the
      // registered/provisioned device AORs above.
      const did_repair = await repairDidRoutes(ext, domain);

      // 1) List existing rules
      const listRes = await nsFetch(base, { method: "GET" }, { functionName: "pp-sync-answering-rules" });
      const existing: any = listRes.ok ? await readBody(listRes) : null;
      const arr: any[] = Array.isArray(existing) ? existing : (existing?.data ?? existing?.items ?? []);
      const defaultRule = arr.find((r: any) => {
        const tf = String(r?.["time-frame"] ?? r?.timeframe ?? r?.time_frame ?? "").toLowerCase();
        return tf === "default" || tf === "*" || tf === "always";
      });

      // 2) Upsert
      let opRes: Response;
      let mode: "created" | "updated";
      if (defaultRule) {
        const ruleId = encodeURIComponent(String(defaultRule?.id ?? defaultRule?.["time-frame"] ?? "Default"));
        opRes = await nsFetch(`${base}/${ruleId}`, { method: "PUT", body: JSON.stringify(payload) }, { functionName: "pp-sync-answering-rules" });
        mode = "updated";
      } else {
        opRes = await nsFetch(base, { method: "POST", body: JSON.stringify(payload) }, { functionName: "pp-sync-answering-rules" });
        mode = "created";
      }
      const opBody = await readBody(opRes);
      const bodySnippet = typeof opBody === "string" ? opBody.slice(0, 200) : JSON.stringify(opBody ?? null).slice(0, 200);
      const returnedHtml = typeof opBody === "string" && /^\s*<(?:!doctype|html)/i.test(opBody);
      const authFailed = opRes.status === 401 || opRes.status === 403 || listRes.status === 401 || listRes.status === 403;
      const raw_pbx = [
        { extension: ext, step: "list_rules", route: `GET ${base}`, http_status: listRes.status, status: listRes.status },
        {
          extension: ext,
          step: `${mode}_rule`,
          route: `${mode === "updated" ? "PUT" : "POST"} ${base}`,
          http_status: opRes.status,
          status: opRes.status,
          body: bodySnippet,
        },
      ];



      if (!opRes.ok) {
        console.error("[syncBroker] FAILED", JSON.stringify({
          extension: ext,
          domain,
          rule_path: rulePath,
          mode,
          status: opRes.status,
          list_status: listRes.status,
        user_reset_status: userReset,
          response: typeof opBody === "string" ? opBody.substring(0, 300) : opBody,
          payload,
        }));
      }

      // 3) Read-after-write: confirm NS actually stored sim-ring + our targets.
      let verify: any = null;
      try {
        const vRes = await nsFetch(base, { method: "GET" }, { functionName: "pp-sync-answering-rules" });
        const vBody: any = await readBody(vRes);
        const vArr: any[] = Array.isArray(vBody) ? vBody : (vBody?.data ?? vBody?.items ?? []);
        const stored = vArr.find((r: any) => {
          const tf = String(r?.["time-frame"] ?? r?.timeframe ?? r?.time_frame ?? "").toLowerCase();
          return tf === "default" || tf === "*" || tf === "always";
        }) ?? vArr[0] ?? null;
        const sim = stored?.["simultaneous-ring"] ?? null;
        // NS v2 returns the fork targets under `parameters` (array of AOR
        // strings). Older/other builds use `destinations` / `list`.
        const list: any[] = Array.isArray(sim?.parameters) ? sim.parameters
          : (Array.isArray(sim?.destinations) ? sim.destinations
          : (Array.isArray(sim?.list) ? sim.list
          : (Array.isArray(stored?.["simultaneous-ring-list"]) ? stored["simultaneous-ring-list"] : [])));
        const targets = list.map((x: any) => String(x?.destination ?? x ?? "").toLowerCase()).filter(Boolean);
        const simOn = ["yes", "true", "1"].includes(String(sim?.enabled ?? stored?.["simultaneous-ring-enabled"] ?? "").toLowerCase());
        verify = {
          status: vRes.status,
          sim_ring_enabled: simOn,
          stored_targets: targets,
          covers_mobile: targets.some((t) => t.includes(`${String(ext).toLowerCase()}_mobile`)),
          ring_timeout: Number(sim?.timeout ?? stored?.["ring-timeout"] ?? stored?.timeout ?? 0) || null,
          include_user_extension: String(sim?.["include-user-extension"] ?? stored?.["simultaneous-ring-include-user-extension"] ?? "").toLowerCase(),
          honored: simOn && targets.length > 0 && !targets.some((t) => t === `sip:${String(ext).toLowerCase()}@${String(domain).toLowerCase()}` || t === `${String(ext).toLowerCase()}@${String(domain).toLowerCase()}`),
        };
        if (!verify.honored) {
          console.error("[syncBroker] NS ignored sim-ring keys", JSON.stringify({ extension: ext, domain, verify, sent: devices.aors }));
        }
      } catch (e) {
        verify = { error: (e as Error).message };
      }

      // A 200 on the rule write is not enough: the call only rings if the DID
      // reaches the user AND the stored rule forks to a real device.
      const didAttempted = Number((did_repair as any)?.attempted ?? 0);
      const didVerified = Number((did_repair as any)?.verified ?? 0);
      const didOk = dids.length > 0 && didAttempted > 0 && didVerified >= didAttempted;
      const routing_ok = !!opRes.ok && !!verify?.honored && didOk;

      return {
        broker_id: broker.id ?? broker.user_id,
        broker_name: broker.full_name,
        email: broker.email,
        extension: ext,
        domain,
        success: opRes.ok,
        routing_ok,
        dids,
        routing_blockers: [
          ...(authFailed ? ["pbx_auth_failed"] : []),
          ...(returnedHtml ? ["pbx_returned_html"] : []),
          ...(opRes.ok ? [] : ["rule_write_failed"]),
          ...(verify?.honored ? [] : ["sim_ring_not_honored"]),
          ...(didOk ? [] : ["did_route_not_verified"]),
          ...(dids.length ? [] : ["no_did"]),
          ...(devices.registered_aors?.length ? [] : ["no_registered_device"]),
        ],
        raw_pbx,
        pbx_returned_html: returnedHtml ? bodySnippet : undefined,
        mode,
        status: opRes.status,
        rule_path: rulePath,
        payload,
        devices,
        did_repair,
        verify,
        response: opBody,
        list_status: listRes.status,
        user_reset_status: userReset,
      };


    };


    // ---- DID inventory refresh (source of truth = PBX, not the CSV import) ----
    // The original `file_sync` import left mangled rows (a whole CSV line stored
    // in callerid_name), so the local number→extension map could not be trusted.
    if (body?.refresh_dids === true) {
      const domain = String(body?.domain ?? NS_DEFAULT_DOMAIN);
      const res = await nsFetch(
        `/domains/${encodeURIComponent(domain)}/phonenumbers`,
        { method: "GET" },
        { functionName: "pp-sync-answering-rules" },
      );
      const data: any = await readBody(res);
      if (!res.ok) return json({ error: "ns_phonenumbers_unreadable", status: res.status, detail: data }, 502);
      const rowsRaw: any[] = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);

      const numOf = (n: any) => String(n?.phonenumber ?? n?.["phone-number"] ?? n?.number ?? n?.did ?? "").trim();
      const destOf = (n: any) =>
        DID_DEST_FIELDS.map((f) => String(n?.[f] ?? "")).filter(Boolean).join(" ");
      const extOf = (n: any) => {
        const m = destOf(n).match(/(?:^|[^0-9])(\d{3,6})(?:@|[^0-9]|$)/);
        return m ? m[1] : "";
      };

      const upserts: any[] = [];
      const unrouted: any[] = [];
      for (const n of rowsRaw) {
        const digits = normalizeDigits(numOf(n));
        if (!digits) continue;
        const ext = extOf(n);
        const app = DID_APP_FIELDS.map((f) => String(n?.[f] ?? "").toLowerCase()).find(Boolean) ?? "";
        if (!ext) { unrouted.push({ phone_number: digits, application: app, destination: destOf(n) }); continue; }
        upserts.push({
          phone_number_e164: `+${digits}`,
          phone_number_digits: digits,
          extension: ext,
          domain,
          callerid_name: String(n?.["callerid-name"] ?? n?.["caller-id-name"] ?? n?.["dial-rule-description"] ?? "").slice(0, 120) || null,
          source: "ns_live",
          updated_at: new Date().toISOString(),
        });
      }

      let written = 0;
      let writeError: string | null = null;
      if (!dry_run && upserts.length) {
        for (let i = 0; i < upserts.length; i += 200) {
          const chunk = upserts.slice(i, i + 200);
          const { error } = await admin
            .from("planipret_did_assignments")
            .upsert(chunk, { onConflict: "phone_number_e164" });
          if (error) { writeError = error.message; break; }
          written += chunk.length;
        }
      }

      return json({
        success: !writeError,
        mode: "refresh_dids",
        domain,
        dry_run,
        pbx_numbers: rowsRaw.length,
        mapped: upserts.length,
        written,
        unrouted_count: unrouted.length,
        unrouted: unrouted.slice(0, 25),
        error: writeError,
      });
    }


    // Single
    if (broker_id && !bulk) {
      const { data: broker } = await admin.from("planipret_profiles")
        .select("id, user_id, full_name, email, extension, ns_extension, ns_domain")
        .or(`user_id.eq.${broker_id},id.eq.${broker_id}`).maybeSingle();
      if (!broker) return json({ error: "broker_not_found", broker_id }, 404);
      const result = await applyRule(broker);
      return json({ success: result.success, result });
    }

    // Bulk (supports offset/limit chunking so the caller can page through 352 brokers)
    if (bulk) {
      const offset: number = Math.max(0, Number(body?.offset ?? 0));
      const limit: number = Math.max(1, Math.min(500, Number(body?.limit ?? 100)));

      const { data: brokers } = await admin.from("planipret_profiles")
        .select("id, user_id, full_name, email, extension, ns_extension, ns_domain")
        .order("ns_extension", { ascending: true })
        .range(offset, offset + limit - 1);
      console.log("[pp-sync-answering-rules] bulk brokers found:", (brokers ?? []).length);
      const list = brokers ?? [];
      if (list.length === 0) return json({ success: true, message: "Aucun courtier trouvé", total: 0, brokers_found: 0, offset, limit });


      const all: any[] = [];
      let succeeded = 0, failed = 0;
      for (let i = 0; i < list.length; i += batch_size) {
        const batch = list.slice(i, i + batch_size);
        const res = await Promise.all(batch.map((b) => applyRule(b).catch((e) => ({
          broker_id: b.id ?? b.user_id, success: false, error: e?.message ?? String(e),
        }))));
        all.push(...res);
        succeeded += res.filter((r: any) => r.success).length;
        failed += res.filter((r: any) => !r.success).length;
        if (i + batch_size < list.length) await new Promise((r) => setTimeout(r, 200));
      }
      const include_results = body?.include_results !== false;

      // ── Diagnostics summary ────────────────────────────────────────────
      const blockerBuckets: Record<string, string[]> = {
        no_extension: [], no_did: [], pbx_auth_failed: [], pbx_returned_html: [],
        rule_write_failed: [], did_route_not_verified: [], sim_ring_not_honored: [],
        no_registered_device: [],
      };
      for (const r of all as any[]) {
        for (const b of (r.routing_blockers ?? [])) {
          (blockerBuckets[b] ??= []).push(String(r.extension ?? r.email ?? r.broker_id));
        }
      }
      const raw_pbx_responses = (all as any[]).flatMap((r) => r.raw_pbx ?? []).slice(0, 50);

      // Surface why the DID repair step failed (was hidden inside per-broker results).
      const did_failures = (all as any[])
        .filter((r) => (r.did_repair?.failures?.length ?? 0) > 0)
        .slice(0, 25)
        .map((r) => ({
          extension: r.extension,
          email: r.email,
          attempted: r.did_repair?.attempted ?? 0,
          verified: r.did_repair?.verified ?? 0,
          failures: (r.did_repair?.failures ?? []).slice(0, 5),
        }));
      const did_failure_reasons: Record<string, number> = {};
      for (const b of did_failures) {
        for (const f of b.failures) {
          const key = String(f?.reason ?? "unknown");
          did_failure_reasons[key] = (did_failure_reasons[key] ?? 0) + 1;
        }
      }

      return json({
        success: failed === 0,
        offset,
        limit,
        total: all.length,
        processed: all.length,
        succeeded,
        failed,
        brokers_found: all.length,
        brokers_with_extension: (all as any[]).filter((r) => !!r.extension).length,
        brokers_with_did: (all as any[]).filter((r) => (r.dids?.length ?? 0) > 0).length,
        routing_ok: (all as any[]).filter((r) => r.routing_ok).length,
        routing_blockers: Object.fromEntries(
          Object.entries(blockerBuckets).map(([k, v]) => [k, v.slice(0, 25)]),
        ),
        routing_blocker_counts: Object.fromEntries(
          Object.entries(blockerBuckets).map(([k, v]) => [k, v.length]),
        ),
        raw_pbx_responses,
        did_failures,
        did_failure_reasons,
        dry_run_report: dry_run
          ? (all as any[]).map((r) => ({
              extension: r.extension, email: r.email,
              action: r.action ?? (r.extension ? "would_configure" : "would_skip"),
              reason: r.reason ?? r.error ?? null,
              dids: r.dids ?? [],
            })).slice(0, 200)
          : undefined,
        routing_ok_count: all.filter((r: any) => r.routing_ok).length,

        routing_ko: all.filter((r: any) => r.success && !r.routing_ok).slice(0, 50).map((r: any) => ({
          extension: r.extension,
          blockers: r.routing_blockers,
          did: r.did_repair ? { attempted: r.did_repair.attempted, verified: r.did_repair.verified, failures: r.did_repair.failures } : null,
          targets: r.verify?.stored_targets,
        })),
        dry_run,
        repair_dids,
        ring_timeout,
        rule_paths: Object.fromEntries(cachedRulePathByDomain.entries()),
        next_offset: list.length === limit ? offset + limit : null,
        results: include_results
          ? all.map((r: any) => ({ ...r, payload: undefined, response: undefined }))
          : undefined,
        errors: all.filter((r: any) => !r.success).slice(0, 20).map((r: any) => ({
          extension: r.extension, status: r.status, error: r.error,
        })),

      });
    }


    return json({ error: "provide broker_id or bulk:true" }, 400);
  } catch (e: any) {
    console.error("pp-sync-answering-rules RUNTIME", e?.message, e?.stack);
    return json({ error: e?.message ?? String(e), stack: e?.stack }, 500);
  }
});
