// ns-sync-user — bidirectional Planiprêt broker sync with NS-API. Admin-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const pick = (u: any) => String(u?.user ?? u?.extension ?? u?.subscriber_login ?? u?.user_id ?? u?.id ?? "").trim();
const emailOf = (u: any) => String(u?.["email-address"] ?? u?.email_address ?? u?.email ?? "").trim().toLowerCase();
const fullNameOf = (u: any) => {
  const first = String(u?.["name-first-name"] ?? u?.first_name ?? u?.firstName ?? "").trim();
  const last = String(u?.["name-last-name"] ?? u?.last_name ?? u?.lastName ?? "").trim();
  return String(u?.directory_name ?? u?.["directory-name"] ?? u?.display_name ?? `${first} ${last}`.trim()).trim();
};

async function readNs(res: Response) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
  const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
  const NS_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";

  try {
    // Auth: admin only
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (!caller) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    let isAdmin = false;
    try { const { data } = await admin.rpc("is_planipret_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /**/ }
    if (!isAdmin) {
      try { const { data } = await admin.rpc("is_super_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /**/ }
    }
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body: any = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "sync_from_ns");

    if (!NS_API_KEY) return json({ error: "ns_api_key_missing" }, 500);

    const nsHeaders = { Authorization: `Bearer ${NS_API_KEY}`, Accept: "application/json", "Content-Type": "application/json" };
    const listNsUsers = async () => {
      let allNs: any[] = [];
      let offset = 0;
      const limit = 200;
      for (let page = 0; page < 50; page++) {
        const r = await fetch(`${NS_API_BASE_URL}/domains/${encodeURIComponent(NS_DOMAIN)}/users?limit=${limit}&offset=${offset}`, { headers: nsHeaders });
        if (!r.ok) { console.error("ns list failed", r.status, await r.text().catch(() => "")); break; }
        const pageData = await r.json().catch(() => []);
        const arr = Array.isArray(pageData) ? pageData : (pageData?.users ?? []);
        if (!arr.length) break;
        allNs = allNs.concat(arr);
        if (arr.length < limit) break;
        offset += limit;
      }
      return allNs;
    };

    const makePayload = (p: any) => {
      const ext = String(p.ns_extension ?? p.extension ?? "").trim();
      const [first, ...rest] = String(p.full_name ?? ext).trim().split(/\s+/);
      const last = rest.join(" ") || "Courtier";
      return {
        user: ext,
        "name-first-name": first || ext,
        "name-last-name": last,
        "directory-name": String(p.full_name ?? ext),
        "email-address": String(p.email ?? ""),
        "user-scope": "Basic User",
        "time-zone": "America/Montreal",
        "language-token": "fr_CA",
        "voicemail-enabled": "yes",
        "recording-configuration": p.voice_agent_enabled
          ? "yes-with-transcription-and-sentiment"
          : "yes",
        "dial-policy": "US and Canada",
        "voicemail-transcription-enabled": "Deepgram",
        "email-send-alert-new-voicemail-enabled": "yes",
        "email-send-alert-new-missed-call-enabled": "yes",
        "ring-no-answer-timeout-seconds": 25,
      };
    };

    const upsertNsUser = async (p: any) => {
      const ext = String(p.ns_extension ?? p.extension ?? "").trim();
      if (!ext) return { ok: false, error: "missing_extension" };
      const domain = String(p.ns_domain ?? NS_DOMAIN);
      const url = `${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}`;
      const payload = makePayload(p);
      const put = await fetch(url, { method: "PUT", headers: nsHeaders, body: JSON.stringify(payload) });
      const putData = await readNs(put);
      if (put.ok) return { ok: true, updated: true, status: put.status, data: putData };
      if (put.status !== 404) return { ok: false, status: put.status, data: putData };
      const create = await fetch(`${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users`, {
        method: "POST", headers: nsHeaders, body: JSON.stringify({ ...payload, "user-password": `Pp${ext}Sync2026!`, password: `Pp${ext}Sync2026!` }),
      });
      const createData = await readNs(create);
      return { ok: create.ok || create.status === 409, created: create.ok, status: create.status, data: createData };
    };

    const { data: profiles } = await admin
      .from("planipret_profiles")
      .select("id, user_id, email, full_name, extension, ns_extension, ns_domain, mobile_app_enabled, voice_agent_enabled, status");

    if (action === "sync_to_ns" || action === "sync_one") {
      const brokerId = String(body?.broker_id ?? body?.user_id ?? "");
      const selected = action === "sync_one"
        ? (profiles ?? []).filter((p: any) => p.id === brokerId || p.user_id === brokerId)
        : (profiles ?? []).filter((p: any) => String(p.ns_extension ?? p.extension ?? "").trim());
      let created = 0, updated = 0, failed = 0;
      const results: any[] = [];
      for (const p of selected) {
        const r = await upsertNsUser(p);
        results.push({ broker_id: p.id, extension: p.ns_extension ?? p.extension, ...r });
        if (r.ok && r.created) created++;
        else if (r.ok) updated++;
        else failed++;
        if (r.ok) {
          await admin.from("planipret_profiles").update({
            ns_extension: p.ns_extension ?? p.extension,
            ns_domain: p.ns_domain ?? NS_DOMAIN,
            ns_linked: true,
            ns_linked_at: new Date().toISOString(),
          }).eq("id", p.id);
        }
      }
      return json({ success: failed === 0, action, total: selected.length, created, updated, failed, results: results.slice(0, 50) });
    }

    if (action !== "sync_from_ns") return json({ error: "unsupported_action" }, 400);

    const allNs = await listNsUsers();

    let matched = 0, updated = 0, unmatched = 0;
    const unmatchedList: Array<{ ext: string; email: string }> = [];

    for (const nsUser of allNs) {
      const ext = pick(nsUser);
      const email = emailOf(nsUser);
      if (!ext) continue;

      const profile = (profiles ?? []).find((p) =>
        (p.email?.toLowerCase() === email && email) ||
        (p.ns_extension && String(p.ns_extension) === ext)
      );

      if (!profile) {
        unmatched++;
        unmatchedList.push({ ext, email });
        continue;
      }
      matched++;
      const patch: Record<string, unknown> = {
        ns_extension: ext,
        extension: profile.extension ?? ext,
        ns_domain: NS_DOMAIN,
        ns_sip_username: ext,
        ns_linked: true,
        ns_linked_at: new Date().toISOString(),
        ns_link_method: "auto_email_match",
      };
      const nsName = fullNameOf(nsUser);
      if (nsName && !profile.full_name) patch.full_name = nsName;
      const { error } = await admin.from("planipret_profiles").update(patch).eq("id", profile.id);
      if (!error) updated++;
    }

    return json({
      success: true,
      total_ns_users: allNs.length,
      matched,
      updated,
      unmatched,
      unmatched_sample: unmatchedList.slice(0, 20),
    });
  } catch (e: any) {
    console.error("ns-sync-user error", e?.message, e?.stack);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
