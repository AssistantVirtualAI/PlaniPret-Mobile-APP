// Manage NetSapiens DIDs (phone numbers) for the Planiprêt domain.
// Actions: list, assign, unassign, sync_assignments
import { corsHeaders, jsonResponse, requirePlanipretAdmin, supaAdmin } from "../_shared/ns-broker.ts";

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";

async function nsFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${NS_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${NS_API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function nsFetchFirstOk(paths: string[], init: RequestInit = {}) {
  let last: any = null;
  for (const p of paths) {
    const r = await nsFetch(p, init);
    if (r.ok) return r;
    last = r;
  }
  return last ?? { ok: false, status: 0, data: null };
}

function normalizeE164(raw: any): string {
  const s = String(raw ?? "").replace(/[^\d+]/g, "");
  if (!s) return "";
  if (s.startsWith("+")) return s;
  if (s.length === 10) return `+1${s}`;
  if (s.length === 11 && s.startsWith("1")) return `+${s}`;
  return `+${s}`;
}

function pretty(num: string): string {
  const d = num.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return num;
}

function extractDest(pn: any): { extension: string | null; type: string | null } {
  // NetSapiens phone-number destination fields vary a LOT between versions.
  // Accept every known variant + parse sip:ext@domain strings.
  const app =
    pn?.["dest-application"] ?? pn?.application ?? pn?.["destination-application"] ??
    pn?.["dest_type"] ?? pn?.["destination-type"] ?? pn?.dest_app ??
    pn?.["dial-rule-application"] ?? pn?.["dial_rule_application"] ?? null;

  const candidates: any[] = [
    pn?.["to-user"], pn?.["to_user"], pn?.["dest-user"], pn?.["dest_user"],
    pn?.dest, pn?.destination, pn?.["destination-user"], pn?.["destination_user"],
    pn?.["destination-user-name"], pn?.["destination_user_name"],
    pn?.["dial-rule-translation-destination-user"], pn?.["dial_rule_translation_destination_user"],
    pn?.["dial-rule-translation-destination"], pn?.["dial_rule_translation_destination"],
    pn?.["dial-rule-translation-destination-host"], pn?.["dial_rule_translation_destination_host"],
    pn?.["translation-destination-user"], pn?.["translation_destination_user"],
    pn?.["to-connection"], pn?.["forward-all-destination"], pn?.["dest-extension"],
    pn?.user, pn?.subscriber, pn?.extension, pn?.ext,
  ];

  let ext: string | null = null;
  for (const raw of candidates) {
    if (raw == null || raw === "") continue;
    let s = String(raw).trim();
    // Handle "sip:100@domain" / "100@domain" / bare "100"
    s = s.replace(/^sip:/i, "").split("@")[0].trim();
    if (!s) continue;
    // Accept 3-6 digit extensions (standard NS) or short alphanumerics.
    if (/^\d{2,7}$/.test(s)) { ext = s; break; }
    if (/^[a-z0-9._-]{2,20}$/i.test(s) && !ext) ext = s;
  }
  return { extension: ext, type: app ? String(app) : null };
}

function normalizeNumber(pn: any): {
  raw: string;
  e164: string;
  pretty: string;
  extension: string | null;
  application: string | null;
  active: boolean;
  ns: any;
} {
  const raw = String(
    pn?.phonenumber ?? pn?.["phone-number"] ?? pn?.number ?? pn?.dnis ?? pn?.did ?? "",
  );
  const e164 = normalizeE164(raw);
  const dest = extractDest(pn);
  const active = (pn?.["enable"] ?? pn?.enabled ?? pn?.["enabled"] ?? pn?.status ?? "yes") !== "no";
  return { raw, e164, pretty: pretty(e164 || raw), extension: dest.extension, application: dest.type, active, ns: pn };
}

function normalizeAssignment(input: any, domain: string) {
  const rawPhone = input?.phone_number ?? input?.phoneNumber ?? input?.phone_number_e164 ??
    input?.phone_number_digits ?? input?.phonenumber ?? input?.["phone-number"] ??
    input?.number ?? input?.did ?? input?.dnis ?? input?.raw;
  const digits = String(rawPhone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const phoneDigits = digits.length === 10 ? `1${digits}` : digits;
  const e164 = `+${phoneDigits}`;

  const rawExt = input?.extension ?? input?.ext ?? input?.user ?? input?.["to-user"] ??
    input?.["dest-user"] ?? input?.destination ?? input?.dest ??
    input?.["destination-user"] ?? input?.["dial-rule-translation-destination-user"];
  let ext = String(rawExt ?? "").trim().replace(/^sip:/i, "").split("@")[0].trim();
  ext = ext.replace(/[^a-z0-9._-]/gi, "");
  if (!/^[a-z0-9._-]{2,20}$/i.test(ext)) return null;

  const callerid = input?.callerid_name ?? input?.callerIdName ?? input?.name ??
    input?.description ?? input?.["dial-rule-description"] ?? null;
  return {
    phone_number_e164: e164,
    phone_number_digits: phoneDigits,
    extension: ext,
    callerid_name: callerid ? String(callerid).slice(0, 200) : null,
    domain,
    source: "file_sync",
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await requirePlanipretAdmin(req);
    if ("error" in auth) return auth.error;

    if (!NS_API_KEY) return jsonResponse({ success: false, error: "NS_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const { action, payload } = body ?? {};
    const domain = String(payload?.domain ?? NS_DEFAULT_DOMAIN);

    if (action === "list" || !action) {
      const r = await nsFetchFirstOk([
        `/domains/${encodeURIComponent(domain)}/phonenumbers?limit=1000`,
        `/domains/${encodeURIComponent(domain)}/phone-numbers?limit=1000`,
        `/domains/${encodeURIComponent(domain)}/numbers?limit=1000`,
      ]);
      if (!r.ok) {
        return jsonResponse({
          success: false,
          error: `NS-API list failed (${r.status})`,
          detail: r.data,
        }, 200);
      }
      const raw = Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.items ?? []);
      const numbers = (raw ?? []).map(normalizeNumber).filter((n: any) => n.raw);

      // Overlay local assignments (source of truth = planipret_did_assignments imported from NS export)
      // NS-API v2 sometimes returns the destination as an empty string when the DID is bound to
      // a user through a "to-user" application. We merge our local map so the admin UI can show
      // the extension owner and hide already-assigned numbers from the "libre" dropdown.
      try {
        const db = supaAdmin();
        const { data: assigns } = await db
          .from("planipret_did_assignments")
          .select("phone_number_e164,phone_number_digits,extension,callerid_name")
          .eq("domain", domain);
        const byE164 = new Map<string, any>();
        const byDigits = new Map<string, any>();
        for (const a of (assigns ?? []) as any[]) {
          if (a.phone_number_e164) byE164.set(String(a.phone_number_e164), a);
          if (a.phone_number_digits) byDigits.set(String(a.phone_number_digits), a);
        }
        for (const n of numbers) {
          if (n.extension) continue; // NS already provided a binding — trust it
          const digits = String(n.raw ?? "").replace(/\D/g, "");
          const hit = byE164.get(n.e164) ?? byDigits.get(digits);
          if (hit) {
            n.extension = String(hit.extension);
            n.application = n.application ?? "to-user";
            (n as any).source = "local_assignment";
          }
        }
      } catch (e) {
        console.warn("[pp-admin-phonenumbers] local overlay failed:", e);
      }

      return jsonResponse({ success: true, domain, count: numbers.length, numbers });
    }

    if (action === "assign") {
      const { phone_number, extension } = payload ?? {};
      if (!phone_number || !extension) {
        return jsonResponse({ success: false, error: "phone_number et extension requis" }, 400);
      }
      const pn = String(phone_number).replace(/[^\d]/g, "");
      const ext = String(extension);
      const assignBody = {
        "dest-application": "to-user",
        application: "to-user",
        "to-user": `${ext}@${domain}`,
        "dest-user": ext,
        dest: ext,
        "dest-type": "user",
        enable: "yes",
      };
      const r = await nsFetchFirstOk([
        `/domains/${encodeURIComponent(domain)}/phonenumbers/${encodeURIComponent(pn)}`,
        `/domains/${encodeURIComponent(domain)}/phone-numbers/${encodeURIComponent(pn)}`,
      ], { method: "PUT", body: JSON.stringify(assignBody) });

      // Always persist our local overlay so the admin UI reflects the change even if NS
      // read-back is stale or the API version does not echo the destination field.
      try {
        const e164 = pn.length === 10 ? `+1${pn}` : `+${pn}`;
        await supaAdmin().from("planipret_did_assignments").upsert({
          phone_number_e164: e164,
          phone_number_digits: pn,
          extension: ext,
          domain,
          source: "admin_ui",
          updated_at: new Date().toISOString(),
        }, { onConflict: "phone_number_e164" });
      } catch (e) { console.warn("assign upsert failed:", e); }

      if (!r.ok) {
        return jsonResponse({ success: false, error: `NS assign failed (${r.status})`, detail: r.data }, 200);
      }
      return jsonResponse({ success: true, phone_number: pn, extension: ext });
    }

    if (action === "sync_assignments") {
      const assignments = Array.isArray(payload?.assignments) ? payload.assignments : [];
      const rows = assignments
        .map((a: any) => normalizeAssignment(a, domain))
        .filter(Boolean) as any[];
      const deduped = Array.from(new Map(rows.map((r) => [r.phone_number_e164, r])).values());
      if (deduped.length === 0) {
        return jsonResponse({ success: false, error: "Aucun assignment DID valide trouvé dans le fichier" }, 400);
      }

      const db = supaAdmin();
      const { error: upsertError } = await db
        .from("planipret_did_assignments")
        .upsert(deduped, { onConflict: "phone_number_e164" });
      if (upsertError) return jsonResponse({ success: false, error: upsertError.message }, 200);

      let removed = 0;
      if (payload?.replace === true && deduped.length >= 10) {
        const keep = deduped.map((r) => r.phone_number_e164);
        const { data: existing } = await db
          .from("planipret_did_assignments")
          .select("phone_number_e164")
          .eq("domain", domain);
        const stale = (existing ?? [])
          .map((r: any) => String(r.phone_number_e164))
          .filter((n) => !keep.includes(n));
        if (stale.length > 0) {
          const { error: delError } = await db
            .from("planipret_did_assignments")
            .delete()
            .eq("domain", domain)
            .in("phone_number_e164", stale);
          if (delError) return jsonResponse({ success: false, error: delError.message }, 200);
          removed = stale.length;
        }
      }

      return jsonResponse({ success: true, domain, imported: deduped.length, removed });
    }

    if (action === "unassign") {
      const { phone_number } = payload ?? {};
      if (!phone_number) return jsonResponse({ success: false, error: "phone_number requis" }, 400);
      const pn = String(phone_number).replace(/[^\d]/g, "");
      const clearBody = {
        "dest-application": "to-voicemail",
        application: "to-voicemail",
        "to-user": "",
        "dest-user": "",
        dest: "",
      };
      const r = await nsFetchFirstOk([
        `/domains/${encodeURIComponent(domain)}/phonenumbers/${encodeURIComponent(pn)}`,
        `/domains/${encodeURIComponent(domain)}/phone-numbers/${encodeURIComponent(pn)}`,
      ], { method: "PUT", body: JSON.stringify(clearBody) });

      try {
        const e164 = pn.length === 10 ? `+1${pn}` : `+${pn}`;
        await supaAdmin().from("planipret_did_assignments")
          .delete()
          .or(`phone_number_e164.eq.${e164},phone_number_digits.eq.${pn}`);
      } catch (e) { console.warn("unassign cleanup failed:", e); }

      if (!r.ok) return jsonResponse({ success: false, error: `NS unassign failed (${r.status})`, detail: r.data }, 200);
      return jsonResponse({ success: true, phone_number: pn });
    }

    return jsonResponse({ success: false, error: "Action inconnue" }, 400);
  } catch (e) {
    console.error("pp-admin-phonenumbers", e);
    return jsonResponse({ success: false, error: String(e) }, 200);
  }
});
