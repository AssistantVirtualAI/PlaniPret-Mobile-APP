// DID Guardian — protection contre la perte d'assignation des numéros (DID).
//
// Règle d'or (apprise de l'incident du 2026-07-30) :
//   Un numéro n'est réellement assigné dans le PBX que si
//   `dial-rule-translation-destination-user` contient l'extension.
//   Écrire seulement `dial-rule-parameter` laisse la destination VIDE
//   => "il n'y a pas d'abonnés à ce numéro de téléphone".
//
// Actions :
//   snapshot : sauvegarde l'état de routage réel du PBX (lecture seule + insert DB)
//   verify   : compare PBX vs planipret_did_assignments et rapporte les dérives
//   repair   : réécrit UNIQUEMENT les numéros dérivés, avec charge utile complète
//              et relecture obligatoire (aucune écriture "aveugle")
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { requirePlanipretAdmin } from "../_shared/ns-broker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function ns(path: string, init: RequestInit = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(`${NS_API_BASE_URL}${path}`, {
      ...init,
      signal: ctl.signal,
      headers: {
        Authorization: `Bearer ${NS_API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        Connection: "close",
        ...(init.headers ?? {}),
      },
    });
    const text = await r.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: String(e) };
  } finally {
    clearTimeout(t);
  }
}

const one = (x: any) => (Array.isArray(x) ? x[0] : x);

/** Destination réellement affichée/utilisée par le PBX. */
function destOf(x: any): string | null {
  const o = one(x);
  const d = String(o?.["dial-rule-translation-destination-user"] ?? "").trim();
  return d && d !== "[*]" ? d : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Le PBX est éventuellement cohérent : on relit jusqu'à 3 fois avant de conclure à une dérive. */
async function readDest(domain: string, pn: string, ext: string, attempts = 3) {
  let last: any = null;
  for (let i = 0; i < attempts; i++) {
    const r = await ns(pnPath(domain, pn));
    last = r;
    if (destOf(r.data) === ext) return { dest: ext, raw: r };
    if (i < attempts - 1) await sleep(600);
  }
  return { dest: destOf(last?.data), raw: last };
}

const pnPath = (domain: string, pn: string) =>
  `/domains/${encodeURIComponent(domain)}/phonenumbers/${encodeURIComponent(pn)}`;

/** Charge utile SÛRE : refuse toute écriture sans destination explicite. */
function safePayload(ext: string, domain: string, current: any) {
  const e = String(ext ?? "").trim();
  if (!/^[0-9]{2,10}$/.test(e)) throw new Error(`extension invalide: "${ext}"`);
  const cur = one(current) ?? {};
  return {
    "dial-rule-application": "to-user-residential",
    "dial-rule-parameter": `user_${e}`,
    "dial-rule-translation-destination-user": e,
    "dial-rule-translation-destination-host": domain,
    "dial-rule-translation-source-name": "[*]",
    // on préserve la description existante
    ...(cur["dial-rule-description"] ? { "dial-rule-description": cur["dial-rule-description"] } : {}),
    enabled: "yes",
  };
}

function digits(x: string) { return String(x ?? "").replace(/\D/g, ""); }
function pbxId(x: string) { const d = digits(x); return d.length === 10 ? `1${d}` : d; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Autorisation : admin Planipret OU appel machine avec la clé de service (cron).
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronHeader = req.headers.get("x-cron-secret") ?? "";
    const CRON_SECRETS = [Deno.env.get("PP_CRON_SECRET"), Deno.env.get("CRON_PBX_SECRET"), Deno.env.get("CRON_SECRET")].filter((v): v is string => !!v);
    const isService = (!!SERVICE_KEY && authHeader === `Bearer ${SERVICE_KEY}`) || (!!cronHeader && CRON_SECRETS.includes(cronHeader));
    if (!isService) {
      const auth = await requirePlanipretAdmin(req);
      if ("error" in auth) return auth.error;
    }
    if (!NS_API_KEY) return json({ success: false, error: "NS_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "verify");
    const domain = String(body?.domain ?? NS_DEFAULT_DOMAIN);
    const offset = Number(body?.offset ?? 0);
    const limit = Math.min(Number(body?.limit ?? 50), 100);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);

    // Source de vérité AVA : table des assignations.
    const { data: rows, error } = await db
      .from("planipret_did_assignments")
      .select("phone_number_digits, phone_number_e164, extension")
      .order("phone_number_digits", { ascending: true });
    if (error) return json({ success: false, error: error.message }, 500);

    const expected = (rows ?? [])
      .map((r: any) => ({
        pn: pbxId(r.phone_number_digits || r.phone_number_e164),
        ext: String(r.extension ?? "").trim(),
      }))
      .filter((r) => r.pn && /^[0-9]{2,10}$/.test(r.ext));

    const slice = expected.slice(offset, offset + limit);

    if (action === "snapshot") {
      const snap: any[] = [];
      for (const { pn } of slice) {
        const r = await ns(pnPath(domain, pn));
        const o = one(r.data) ?? {};
        snap.push({
          domain,
          phone_number: pn,
          destination_user: destOf(r.data),
          dial_rule_application: o["dial-rule-application"] ?? null,
          dial_rule_parameter: o["dial-rule-parameter"] ?? null,
          description: o["dial-rule-description"] ?? null,
          enabled: o["enabled"] ?? null,
          source: isService ? "cron" : "admin",
        });
      }
      if (snap.length) await db.from("planipret_did_routing_snapshots").insert(snap);
      return json({ success: true, action, offset, limit, total: expected.length, saved: snap.length, next_offset: offset + limit < expected.length ? offset + limit : null });
    }

    if (action === "verify" || action === "repair") {
      const drift: any[] = [];
      let ok = 0;
      for (const { pn, ext } of slice) {
        const check = await readDest(domain, pn, ext);
        const cur = check.raw;
        if (check.dest === ext) { ok++; continue; }
        if (action === "verify") {
          drift.push({ phone_number: pn, expected: ext, live: check.dest, status: cur?.status });
          continue;
        }
        let payload: Record<string, unknown>;
        try { payload = safePayload(ext, domain, cur.data); }
        catch (e) { drift.push({ phone_number: pn, expected: ext, error: String(e) }); continue; }

        await ns(pnPath(domain, pn), { method: "PUT", body: JSON.stringify(payload) });
        const back = await readDest(domain, pn, ext); // relecture obligatoire
        if (back.dest === ext) ok++;
        else drift.push({ phone_number: pn, expected: ext, live: back.dest, status: back.raw?.status });
      }
      return json({
        success: true, action, offset, limit, total: expected.length,
        ok, drift_count: drift.length, drift: drift.slice(0, 25),
        next_offset: offset + limit < expected.length ? offset + limit : null,
      });
    }

    return json({ success: false, error: `unknown action ${action}` }, 400);
  } catch (e) {
    return json({ success: false, error: String(e) }, 500);
  }
});
