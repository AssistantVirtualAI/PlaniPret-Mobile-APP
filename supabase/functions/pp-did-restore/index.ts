// One-shot authorized restoration of DID -> user routing on NetSapiens.
// Uses documented NS-API v2 Phonenumber object fields:
//   dial-rule-application = "user", dial-rule-parameter = "user_<ext>"
// Actions: probe (read-only), restore (batched PUT + read-back verify), verify
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { requirePlanipretAdmin } from "../_shared/ns-broker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";

import { DID_MAP } from "./mapping.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function nsFetch(path: string, init: RequestInit = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(`${NS_API_BASE_URL}${path}`, {
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
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: String(e) };
  } finally {
    clearTimeout(t);
  }
}

const pnPath = (domain: string, pn: string) =>
  `/domains/${encodeURIComponent(domain)}/phonenumbers/${encodeURIComponent(pn)}`;

// The PBX portal "Destination" column reads dial-rule-translation-destination-user.
// A phonenumber with an empty destination is treated as "no subscribers".
function destOf(pn: any): string | null {
  const o = Array.isArray(pn) ? pn[0] : pn;
  const d = String(o?.["dial-rule-translation-destination-user"] ?? "").trim();
  if (d && d !== "[*]") return d;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await requirePlanipretAdmin(req);
    if ("error" in auth) return auth.error;
    if (!NS_API_KEY) return json({ success: false, error: "NS_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "probe");
    const domain = String(body?.domain ?? NS_DEFAULT_DOMAIN);

    if (action === "probe") {
      const pn = String(body?.phone_number ?? DID_MAP[3][0]).replace(/\D/g, "");
      const r = await nsFetch(pnPath(domain, pn));
      return json({ success: r.ok, status: r.status, raw: r.data });
    }

    const offset = Number(body?.offset ?? 0);
    const limit = Number(body?.limit ?? 25);
    const slice = DID_MAP.slice(offset, offset + limit);

    if (action === "verify") {
      const results: any[] = [];
      for (const [did, ext] of slice) {
        const r = await nsFetch(pnPath(domain, did));
        const live = r.ok ? destOf(r.data) : null;
        results.push({ did, ext, live, ok: live === ext, status: r.status });
      }
      return json({
        success: true, offset, limit, total: DID_MAP.length,
        ok: results.filter((x) => x.ok).length,
        bad: results.filter((x) => !x.ok),
      });
    }

    if (action === "restore" || action === "sweep") {
      const db = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const results: any[] = [];
      for (const [did, ext] of slice) {
        if (action === "sweep") {
          const cur = await nsFetch(pnPath(domain, did));
          if (cur.ok && destOf(cur.data) === ext) { results.push({ did, ext, ok: true, skipped: true }); continue; }
        }
        const payload = {
          "dial-rule-application": "to-user-residential",
          "dial-rule-parameter": `user_${ext}`,
          "dial-rule-translation-destination-user": ext,
          "dial-rule-translation-destination-host": domain,
          "dial-rule-translation-source-name": "[*]",
          enabled: "yes",
        };
        let r = await nsFetch(pnPath(domain, did), { method: "PUT", body: JSON.stringify(payload) });
        if (!r.ok && r.status === 0) {
          r = await nsFetch(pnPath(domain, did), { method: "PUT", body: JSON.stringify(payload) });
        }
        // read-back verification
        const rb = await nsFetch(pnPath(domain, did));
        const live = rb.ok ? destOf(rb.data) : null;
        results.push({ did, ext, put: r.status, live, ok: live === ext, detail: r.ok ? undefined : r.data });

        if (live === ext) {
          await db.from("planipret_did_assignments").upsert({
            phone_number_e164: did.length === 10 ? `+1${did}` : `+${did}`,
            phone_number_digits: did,
            extension: ext,
            domain,
            source: "portal_csv_restore",
            updated_at: new Date().toISOString(),
          }, { onConflict: "phone_number_e164" });
        }
      }
      return json({
        success: true, offset, limit, total: DID_MAP.length,
        applied: results.filter((x) => x.ok).length,
        failed: results.filter((x) => !x.ok),
        next_offset: offset + limit < DID_MAP.length ? offset + limit : null,
      });
    }

    return json({ success: false, error: `unknown action ${action}` }, 400);
  } catch (e) {
    return json({ success: false, error: String(e) }, 500);
  }
});
