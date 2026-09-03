// POST /functions/v1/maestro-backfill-brokers
// Body: { dry_run?: boolean, force?: boolean }
// Links every Planiprêt profile to its Maestro telecom id using the
// broker directory (GET /users/{seed}/brokers) — email, extension, phone, name.
import { adminClient, corsHeaders, json } from "../_shared/maestro.ts";
import { linkBrokerIdByEmail, loadBrokerDirectory } from "../_shared/maestro-broker-directory.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const admin = adminClient();
  if (token !== SERVICE_ROLE) {
    const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: userData, error } = await anon.auth.getUser(token);
    if (error || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: userData.user.id });
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: userData.user.id });
    if (!isAdmin && !isSuper) return json({ error: "Forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = !!body?.dry_run;
  const force = !!body?.force;

  const dir = await loadBrokerDirectory(admin, { force: true });
  if (!dir.entries.length) {
    return json({ success: false, error: dir.error ?? "directory_unavailable" }, 200);
  }

  const { data: profiles } = await admin
    .from("planipret_profiles")
    .select("id, full_name, email, ms365_email, extension, phone, maestro_broker_id");

  const linked: any[] = [];
  const unmatched: any[] = [];
  let already = 0;

  for (const p of (profiles ?? []) as any[]) {
    if (!force && p.maestro_broker_id) { already++; continue; }
    if (dryRun) {
      const r = await linkBrokerIdByEmail(admin, { ...p, id: "00000000-0000-0000-0000-000000000000" }, { force });
      (r.ok ? linked : unmatched).push({ email: p.email, id: r.maestro_broker_id, by: r.matched_by });
      continue;
    }
    const r = await linkBrokerIdByEmail(admin, p, { force });
    if (r.ok && r.maestro_broker_id) linked.push({ email: p.email, maestro_broker_id: r.maestro_broker_id, matched_by: r.matched_by });
    else unmatched.push({ email: p.email, extension: p.extension, error: r.error });
  }

  return json({
    success: true,
    directory_size: dir.entries.length,
    directory_seed: dir.seed,
    profiles: profiles?.length ?? 0,
    already_linked: already,
    linked: linked.length,
    unmatched: unmatched.length,
    dry_run: dryRun,
    linked_sample: linked.slice(0, 20),
    unmatched_sample: unmatched.slice(0, 30),
  });
});
