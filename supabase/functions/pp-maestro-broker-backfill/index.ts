// Bulk-resolve `planipret_profiles.maestro_broker_id` for EVERY broker.
//
// Why: per-call resolution probes /users/{id}/sip one broker at a time and is
// rate-limited by a 10-minute cooldown. With 350+ brokers that never converges,
// so most calls silently fell back to the single global broker id — every
// broker's calls landed in the same Maestro account.
//
// This function builds the telecom directory ONCE (id -> sip_username / phone)
// and matches it against all Planiprêt profiles in a single pass.
//
// POST { max_id?: number, concurrency?: number, dry_run?: boolean, only_missing?: boolean }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, getMaestroConfig } from "../_shared/maestro.ts";

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: caller must be a Planiprêt/super admin.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const { data: userRes } = await admin.auth.getUser(token);
  const uid = userRes?.user?.id;
  if (!uid) return json({ error: "Unauthorized" }, 401);
  const [{ data: isPp }, { data: isSa }] = await Promise.all([
    admin.rpc("is_planipret_admin", { _user_id: uid }),
    admin.rpc("is_super_admin", { _user_id: uid }),
  ]);
  if (!isPp && !isSa) return json({ error: "Forbidden" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const maxId = Math.min(Math.max(Number(body.max_id ?? 800), 1), 5000);
  const concurrency = Math.min(Math.max(Number(body.concurrency ?? 20), 1), 40);
  const dryRun = body.dry_run === true;
  const onlyMissing = body.only_missing !== false; // default: only fill blanks

  const cfg = await getMaestroConfig(admin);
  if (!cfg.url || !cfg.key) return json({ error: "maestro_not_configured" }, 400);

  // 1) Load every Planiprêt profile with an extension or phone.
  let q = admin
    .from("planipret_profiles")
    .select("id, user_id, extension, phone, maestro_broker_id");
  if (onlyMissing) q = q.is("maestro_broker_id", null);
  const { data: profiles, error: profErr } = await q;
  if (profErr) return json({ error: profErr.message }, 500);

  const byExt = new Map<string, any>();
  const byPhone = new Map<string, any>();
  for (const p of profiles ?? []) {
    const ext = String(p.extension ?? "").trim();
    if (ext) byExt.set(ext, p);
    const ph = digits(p.phone);
    if (ph.length >= 10) byPhone.set(ph.slice(-10), p);
  }

  // 2) Sweep the telecom directory once.
  const assignments = new Map<string, string>(); // profileId -> brokerId
  const directory: Array<{ id: number; sip: string; phones: string[] }> = [];
  let probed = 0, found = 0;

  const probe = async (id: number) => {
    probed++;
    try {
      const r = await fetch(`${cfg.url}/api/v1/users/${id}/sip?machine=1`, {
        headers: { Authorization: `Bearer ${cfg.key}` },
      });
      if (!r.ok) return;
      const j = await r.json().catch(() => null);
      const sip = j?.sip;
      if (!sip) return;
      found++;
      const sipUser = String(sip.sip_username ?? "").trim();
      const pu = sip.provider_user ?? {};
      const extAlt = String(pu.provider_external_user_id ?? "").trim();
      const phones = [digits(pu.phone_number), digits(pu.sms_number)]
        .filter((n) => n.length >= 10).map((n) => n.slice(-10));
      directory.push({ id, sip: sipUser || extAlt, phones });

      const match =
        (sipUser && byExt.get(sipUser)) ||
        (extAlt && byExt.get(extAlt)) ||
        phones.map((n) => byPhone.get(n)).find(Boolean);
      if (match && !assignments.has(match.id)) assignments.set(match.id, String(id));
    } catch { /* ignore individual probe errors */ }
  };

  for (let start = 1; start <= maxId; start += concurrency) {
    const ids = Array.from(
      { length: Math.min(concurrency, maxId - start + 1) },
      (_, i) => start + i,
    );
    await Promise.all(ids.map(probe));
  }

  // 3) Persist.
  let updated = 0;
  const errors: string[] = [];
  if (!dryRun) {
    for (const [profileId, brokerId] of assignments) {
      const { error } = await admin
        .from("planipret_profiles")
        .update({ maestro_broker_id: brokerId })
        .eq("id", profileId);
      if (error) errors.push(`${profileId}: ${error.message}`);
      else updated++;
    }
  }

  const totalProfiles = (profiles ?? []).length;
  return json({
    ok: true,
    dry_run: dryRun,
    only_missing: onlyMissing,
    profiles_considered: totalProfiles,
    telecom_ids_probed: probed,
    telecom_users_found: found,
    matched: assignments.size,
    updated,
    unmatched: totalProfiles - assignments.size,
    errors: errors.slice(0, 20),
    sample: directory.slice(0, 10),
  });
});
