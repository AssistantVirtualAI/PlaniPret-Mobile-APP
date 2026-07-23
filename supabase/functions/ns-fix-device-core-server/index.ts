// Bulk-fix: set core-server on all _web and _mobile devices that have it empty.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const CORE = "core1.cluster1.ucstack.io";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const NS_API_KEY = Deno.env.get("NS_API_KEY")!;
  const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
  const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";

  // Admin gate.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const caller = userData?.user;
  if (!caller) return json({ error: "not_authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  let isAdmin = false;
  try { const { data } = await admin.rpc("is_planipret_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch {}
  if (!isAdmin) { try { const { data } = await admin.rpc("is_super_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch {} }
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const nsHeaders = { Authorization: `Bearer ${NS_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" };

  const { data: profiles } = await admin
    .from("planipret_profiles")
    .select("ns_extension, ns_domain")
    .not("ns_extension", "is", null);

  const results: any[] = [];
  for (const p of (profiles ?? [])) {
    const ext = String((p as any).ns_extension);
    const domain = (p as any).ns_domain || NS_DEFAULT_DOMAIN;
    for (const suffix of ["_web", "_mobile"]) {
      const deviceName = `${ext}${suffix}`;
      const url = `${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices/${encodeURIComponent(deviceName)}`;
      const getRes = await fetch(url, { headers: nsHeaders });
      if (!getRes.ok) { results.push({ device: deviceName, missing: true, status: getRes.status }); continue; }
      const raw = await getRes.json().catch(() => null);
      const d = Array.isArray(raw) ? raw[0] : raw;
      const cur = (d?.["core-server"] ?? "").toString().trim();
      if (cur === CORE) { results.push({ device: deviceName, already_ok: true }); continue; }
      const putRes = await fetch(url, { method: "PUT", headers: nsHeaders, body: JSON.stringify({ "core-server": CORE }) });
      const putData = await putRes.text();
      results.push({ device: deviceName, fixed: putRes.ok || putRes.status === 202, status: putRes.status, before: cur || "empty", after: CORE, response: putData.slice(0, 200) });
    }
  }

  return json({
    success: true,
    total_profiles: profiles?.length ?? 0,
    fixed: results.filter((r) => r.fixed).length,
    already_ok: results.filter((r) => r.already_ok).length,
    missing: results.filter((r) => r.missing).length,
    results,
  });
});
