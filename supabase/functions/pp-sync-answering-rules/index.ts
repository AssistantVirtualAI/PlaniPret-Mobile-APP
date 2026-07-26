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
    const repair_dids: boolean = body?.repair_dids !== false;

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
          // Ring ONLY the mobile device AORs (never <OwnDevices>, which would
          // also fork to {ext}_web and steal the call from the mobile app).
          "ring-all-user-phones": "no",
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
        "simultaneous-ring-all-user-phones": "no",
        "simultaneous-ring-parameters": deviceAors,
        "sim-ring-include-user-extension": "no",
        "sim-ring-all-user-phones": "no",
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

    // Read the broker's real device AORs from NS and keep ONLY the mobile
    // device ({ext}_mobile). Inbound calls must always ring the mobile app —
    // never {ext}_web (desktop/browser), which would answer first and make the
    // mobile app look silent.
    const mobileOnly = (aors: string[], ext: string) =>
      aors.filter((a) => a.toLowerCase().includes(`${String(ext).toLowerCase()}_mobile`));

    const fetchDeviceAors = async (ext: string, domain: string): Promise<{ aors: string[]; source: string; status: number; registered_aors: string[] }> => {
      const fallback = [`sip:${ext}_mobile@${domain}`];
      try {
        const res = await nsFetch(
          `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices`,
          { method: "GET" },
          { functionName: "pp-sync-answering-rules" },
        );
        const data: any = await readBody(res);
        const rows: any[] = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
        const provisioned = mobileOnly(rows.map((r: any) => aorFromRow(r, ext, domain)).filter(Boolean), ext);
        const registered = mobileOnly(rows.filter(isRegisteredDevice).map((r: any) => aorFromRow(r, ext, domain)).filter(Boolean), ext);
        const chosen = registered.length ? registered : provisioned;
        if (chosen.length) {
          return {
            aors: [...new Set(chosen)],
            source: registered.length ? "ns_registered_mobile_device" : "ns_provisioned_mobile_device",
            status: res.status,
            registered_aors: [...new Set(registered)],
          };
        }
        return {
          aors: fallback,
          source: "convention_fallback_mobile",
          status: res.status,
          registered_aors: [],
        };
      } catch {
        return {
          aors: fallback,
          source: "convention_fallback_mobile",
          status: 0,
          registered_aors: [],
        };
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

    const repairDidRoutes = async (ext: string, domain: string) => {
      if (!repair_dids) return { skipped: true, reason: "disabled" };
      const { data: rows, error } = await admin
        .from("planipret_did_assignments")
        .select("phone_number_e164, phone_number_digits, extension, domain")
        .eq("domain", domain)
        .eq("extension", ext);
      if (error) return { success: false, error: error.message, attempted: 0, repaired: 0 };
      const numbers = [...new Set((rows ?? []).map((r: any) => normalizeDigits(r.phone_number_digits ?? r.phone_number_e164)).filter(Boolean))];
      if (!numbers.length) return { success: true, attempted: 0, repaired: 0, source: "no_local_did_assignment" };

      const payload = buildDidPayload(ext, domain);
      let repaired = 0;
      const failures: any[] = [];
      for (const pn of numbers) {
        const endpoints = [
          `/domains/${encodeURIComponent(domain)}/phonenumbers/${encodeURIComponent(pn)}`,
          `/domains/${encodeURIComponent(domain)}/phone-numbers/${encodeURIComponent(pn)}`,
          `/domains/${encodeURIComponent(domain)}/numbers/${encodeURIComponent(pn)}`,
        ];
        let lastStatus = 0;
        let ok = false;
        for (const endpoint of endpoints) {
          const res = await nsFetch(endpoint, { method: "PUT", body: JSON.stringify(payload) }, { functionName: "pp-sync-answering-rules" });
          lastStatus = res.status;
          await res.text().catch(() => {});
          if (res.ok) { ok = true; break; }
        }
        if (ok) repaired += 1;
        else failures.push({ phone_number: pn, status: lastStatus });
      }
      return { success: failures.length === 0, attempted: numbers.length, repaired, failures: failures.slice(0, 10), payload };
    };



    const applyRule = async (broker: any) => {
      const ext = broker.ns_extension ?? broker.extension;
      const domain = broker.ns_domain || NS_DEFAULT_DOMAIN;
      if (!ext) return { broker_id: broker.id ?? broker.user_id, success: false, error: "no_extension" };

      const devices = await fetchDeviceAors(ext, domain);
      const payload = buildRulePayload(ext, domain, devices.aors);
      if (dry_run) {
        const did_repair = { skipped: true, reason: "dry_run" };
        return { broker_id: broker.id ?? broker.user_id, extension: ext, domain, dry_run: true, payload, devices, did_repair, success: true };
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
        const list: any[] = Array.isArray(sim?.destinations) ? sim.destinations
          : (Array.isArray(sim?.list) ? sim.list : (Array.isArray(stored?.["simultaneous-ring-list"]) ? stored["simultaneous-ring-list"] : []));
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

      return {
        broker_id: broker.id ?? broker.user_id,
        broker_name: broker.full_name,
        extension: ext,
        domain,
        success: opRes.ok,
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
        .not("extension", "is", null)
        .order("ns_extension", { ascending: true })
        .range(offset, offset + limit - 1);
      console.log("[pp-sync-answering-rules] bulk brokers found:", (brokers ?? []).length);
      const list = brokers ?? [];
      if (list.length === 0) return json({ success: true, message: "Aucun courtier avec extension NS", total: 0, offset, limit });

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
      return json({
        success: failed === 0,
        offset,
        limit,
        total: all.length,
        processed: all.length,
        succeeded,
        failed,
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
