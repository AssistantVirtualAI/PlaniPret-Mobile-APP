// Annonce d'enregistrement — routage DID / dial-rule (entrants seulement).
//
// Pourquoi : `music-on-ring-enabled` au niveau DOMAINE joue l'avis aussi sur
// les jambes SORTANTES des courtiers, et NetSapiens NE PERSISTE PAS ce champ
// sur l'objet user. La seule voie propre est le ROUTAGE ENTRANT : le DID du
// courtier pointe vers une file d'attente personnelle (1 agent = le courtier)
// dont le média d'attente est l'avis. Les appels sortants ne traversent jamais
// cette file → aucun avis côté courtier.
//
// INVARIANT DID (incident 2026-07-30) : toute écriture sur un phonenumber DOIT
// inclure `dial-rule-translation-destination-user` non vide, sinon le numéro
// devient orphelin ("il n'y a pas d'abonnés à ce numéro").
//
// Actions : status | enable | disable

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

const MOH_NAME = "ava-recording-notice";
/** Préfixe d'extension des files personnelles (8 + extension courtier). */
const QUEUE_PREFIX = "8";

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
const digits = (x: string) => String(x ?? "").replace(/\D/g, "");
const pbxId = (x: string) => { const d = digits(x); return d.length === 10 ? `1${d}` : d; };
const pnPath = (domain: string, pn: string) =>
  `/domains/${encodeURIComponent(domain)}/phonenumbers/${encodeURIComponent(pn)}`;
const queueExt = (ext: string) => `${QUEUE_PREFIX}${ext}`;

function destOf(x: any): string | null {
  const o = one(x);
  const d = String(o?.["dial-rule-translation-destination-user"] ?? "").trim();
  return d && d !== "[*]" ? d : null;
}

/** File personnelle : 1 agent (le courtier), avis en média d'attente. */
async function ensureQueue(domain: string, ext: string) {
  const q = queueExt(ext);
  const base = `/domains/${encodeURIComponent(domain)}/callqueues`;
  const read = await ns(`${base}/${encodeURIComponent(q)}`);
  const payload: Record<string, unknown> = {
    synchronous: "yes",
    "call-queue": q,
    name: `Avis ${ext}`,
    description: `Annonce d'enregistrement — entrants du courtier ${ext}`,
    "queue-type": "Ring All",
    "music-on-hold-enabled": "yes",
    "music-on-hold-name": MOH_NAME,
    "queue-intro-message-enabled": "yes",
    "queue-intro-message-name": MOH_NAME,
    "queue-max-wait-seconds": 45,
    "queue-forward-timeout-destination": `vmail_${ext}`,
    enabled: "yes",
  };
  const write = read.ok
    ? await ns(`${base}/${encodeURIComponent(q)}`, { method: "PUT", body: JSON.stringify(payload) })
    : await ns(base, { method: "POST", body: JSON.stringify({ ...payload, "call-queue": q }) });

  // Agent unique = le courtier (ses propres devices sonnent).
  const agents = await ns(`${base}/${encodeURIComponent(q)}/agents`);
  const list = Array.isArray(agents.data) ? agents.data : [];
  const present = list.some((a: any) => String(a?.user ?? a?.agent ?? "") === ext);
  let agentWrite: any = null;
  if (!present) {
    agentWrite = await ns(`${base}/${encodeURIComponent(q)}/agents`, {
      method: "POST",
      body: JSON.stringify({ synchronous: "yes", user: ext, "device-id": ext, enabled: "yes" }),
    });
  }
  return { queue: q, created: !read.ok, write: { status: write.status, ok: write.ok }, agent: agentWrite ? { status: agentWrite.status, ok: agentWrite.ok } : { skipped: true } };
}

/** DID → file d'attente (avis) ; l'invariant destination-user reste rempli. */
function queuePayload(q: string, domain: string, current: any) {
  const cur = one(current) ?? {};
  return {
    "dial-rule-application": "to-queue",
    "dial-rule-parameter": `queue_${q}`,
    "dial-rule-translation-destination-user": q,
    "dial-rule-translation-destination-host": domain,
    "dial-rule-translation-source-name": "[*]",
    ...(cur["dial-rule-description"] ? { "dial-rule-description": cur["dial-rule-description"] } : {}),
    enabled: "yes",
  };
}

/** Retour au routage direct vers le courtier. */
function userPayload(ext: string, domain: string, current: any) {
  const cur = one(current) ?? {};
  return {
    "dial-rule-application": "to-user-residential",
    "dial-rule-parameter": `user_${ext}`,
    "dial-rule-translation-destination-user": ext,
    "dial-rule-translation-destination-host": domain,
    "dial-rule-translation-source-name": "[*]",
    ...(cur["dial-rule-description"] ? { "dial-rule-description": cur["dial-rule-description"] } : {}),
    enabled: "yes",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronHeader = req.headers.get("x-cron-secret") ?? "";
    const CRON_SECRETS = [Deno.env.get("PP_CRON_SECRET"), Deno.env.get("CRON_PBX_SECRET"), Deno.env.get("CRON_SECRET")]
      .filter((v): v is string => !!v);
    const isService = (!!SERVICE_KEY && authHeader === `Bearer ${SERVICE_KEY}`) ||
      (!!cronHeader && CRON_SECRETS.includes(cronHeader));
    if (!isService) {
      const auth = await requirePlanipretAdmin(req);
      if ("error" in auth) return auth.error;
    }
    if (!NS_API_KEY) return json({ success: false, error: "NS_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "status");
    const domain = String(body?.domain ?? NS_DEFAULT_DOMAIN);
    const onlyExt = body?.extension ? String(body.extension).trim() : null;

    const db = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);
    const { data: rows, error } = await db
      .from("planipret_did_assignments")
      .select("phone_number_digits, phone_number_e164, extension")
      .order("phone_number_digits", { ascending: true });
    if (error) return json({ success: false, error: error.message }, 500);

    const targets = (rows ?? [])
      .map((r: any) => ({
        pn: pbxId(r.phone_number_digits || r.phone_number_e164),
        ext: String(r.extension ?? "").trim(),
      }))
      .filter((r) => r.pn && /^[0-9]{2,10}$/.test(r.ext))
      .filter((r) => !onlyExt || r.ext === onlyExt);

    if (action === "status") {
      const items = [];
      for (const { pn, ext } of targets) {
        const cur = await ns(pnPath(domain, pn));
        const o = one(cur.data) ?? {};
        const dest = destOf(cur.data);
        items.push({
          phone_number: pn,
          extension: ext,
          queue: queueExt(ext),
          destination_user: dest,
          dial_rule_application: o["dial-rule-application"] ?? null,
          announcement: dest === queueExt(ext) ? "on" : "off",
        });
      }
      return json({
        success: true,
        domain,
        moh: MOH_NAME,
        total: items.length,
        announcement_on: items.filter((i) => i.announcement === "on").length,
        items,
      });
    }

    if (action === "enable" || action === "disable") {
      const results = [];
      for (const { pn, ext } of targets) {
        const q = queueExt(ext);
        let queueInfo: unknown = null;
        if (action === "enable") queueInfo = await ensureQueue(domain, ext);

        const cur = await ns(pnPath(domain, pn));
        const payload = action === "enable"
          ? queuePayload(q, domain, cur.data)
          : userPayload(ext, domain, cur.data);
        const put = await ns(pnPath(domain, pn), { method: "PUT", body: JSON.stringify(payload) });

        // Relecture obligatoire : jamais d'écriture aveugle sur un DID.
        await new Promise((r) => setTimeout(r, 500));
        const back = await ns(pnPath(domain, pn));
        const dest = destOf(back.data);
        const expected = action === "enable" ? q : ext;
        results.push({
          phone_number: pn,
          extension: ext,
          queue: q,
          queue_setup: queueInfo,
          put_status: put.status,
          destination_user: dest,
          ok: dest === expected,
        });
      }
      return json({
        success: results.every((r) => r.ok),
        action,
        domain,
        note: action === "enable"
          ? "DID → file personnelle (avis en média d'attente). Les appels sortants ne traversent pas la file."
          : "DID → utilisateur direct (aucun avis).",
        results,
      });
    }

    return json({ success: false, error: `unknown action ${action}`, hint: "status | enable | disable" }, 400);
  } catch (e) {
    return json({ success: false, error: String(e) }, 500);
  }
});
