// Bulk-set the Planiprêt app sign-in password for every broker.
//
// - Username = the broker's @planipret.com email (from planipret_profiles.email)
// - Password = secret PLANIPRET_APP_PASSWORD
// - Protected accounts (kept unchanged): the caller + PROTECTED_EMAILS
// - Creates the auth user when the profile has no user_id yet, then links
//   planipret_profiles.user_id
// - Links maestro_broker_id from the Maestro broker directory by email
//
// POST { dry_run?: boolean, only_missing?: boolean, limit?: number }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/maestro.ts";
import { loadBrokerDirectory } from "../_shared/maestro-broker-directory.ts";

const PROTECTED_EMAILS = new Set([
  "gbouillon@planipret.com",
  "mmaglieri@planipret.com",
  "mhassoun@assistantvirtualai.com",
  "demo@avastatistic.ca",
]);

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const adminSecret = Deno.env.get("PP_BULK_ADMIN_SECRET") || "";
  const providedSecret = req.headers.get("x-admin-secret") || "";
  const internal = !!adminSecret && providedSecret === adminSecret;
  if (!token && !internal) return json({ error: "Unauthorized" }, 401);

  let callerId: string | null = null;
  if (internal || token === SERVICE_KEY) {
    callerId = null; // internal invocation
  } else {
    const { data: userRes } = await admin.auth.getUser(token);
    callerId = userRes?.user?.id ?? null;
    if (!callerId) return json({ error: "Unauthorized" }, 401);
    const [{ data: isPp }, { data: isSa }] = await Promise.all([
      admin.rpc("is_planipret_admin", { _user_id: callerId }),
      admin.rpc("is_super_admin", { _user_id: callerId }),
    ]);
    if (!isPp && !isSa) return json({ error: "Forbidden" }, 403);
  }

  const password = Deno.env.get("PLANIPRET_APP_PASSWORD") || "";
  if (password.length < 8) return json({ error: "password_secret_missing" }, 400);

  let body: any = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const dryRun = body.dry_run === true;
  const onlyMissing = body.only_missing === true; // default: set for everyone
  const limit = Math.min(Math.max(Number(body.limit ?? 1000), 1), 2000);
  const offset = Math.max(Number(body.offset ?? 0), 0);
  const skipDirectory = body.skip_directory === true;

  // Protected: explicit list + the caller's own account
  const protectedEmails = new Set(PROTECTED_EMAILS);
  if (callerId) {
    const { data: me } = await admin.auth.admin.getUserById(callerId);
    if (me?.user?.email) protectedEmails.add(norm(me.user.email));
  }

  const { data: profiles, error: pErr } = await admin
    .from("planipret_profiles")
    .select("id, user_id, email, full_name, extension, phone, maestro_broker_id")
    .not("email", "is", null)
    .order("email", { ascending: true })
    .range(offset, offset + limit - 1);
  if (pErr) return json({ error: pErr.message }, 500);

  // Existing auth users, by email
  const authByEmail = new Map<string, string>();
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    for (const u of users) if (u.email) authByEmail.set(norm(u.email), u.id);
    if (users.length < 1000) break;
  }

  // Maestro broker directory (best-effort)
  let directory: any[] = [];
  if (!skipDirectory) { try { directory = (await loadBrokerDirectory(admin))?.entries ?? []; } catch { /* optional */ } }
  const dirByEmail = new Map<string, any>();
  const dirByExt = new Map<string, any>();
  const dirByPhone = new Map<string, any>();
  for (const e of directory) {
    if (e.email) dirByEmail.set(norm(e.email), e);
    if (e.extension) dirByExt.set(String(e.extension).trim(), e);
    for (const p of e.phones ?? []) dirByPhone.set(p, e);
  }

  const results = { total: 0, updated: 0, created: 0, skipped_protected: 0, skipped: 0, linked_maestro: 0, errors: [] as any[] };

  for (const p of profiles ?? []) {
    const email = norm(p.email);
    if (!email || !email.includes("@")) { results.skipped++; continue; }
    results.total++;
    if (protectedEmails.has(email)) { results.skipped_protected++; continue; }

    let userId: string | null = p.user_id ?? authByEmail.get(email) ?? null;

    if (onlyMissing && userId) { results.skipped++; continue; }

    if (!dryRun) {
      try {
        if (userId) {
          const { error } = await admin.auth.admin.updateUserById(userId, {
            password,
            email,
            email_confirm: true,
          });
          if (error) throw error;
          results.updated++;
        } else {
          const { data, error } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: p.full_name ?? null, source: "planipret_bulk" },
          });
          if (error) throw error;
          userId = data.user?.id ?? null;
          results.created++;
        }
      } catch (e: any) {
        results.errors.push({ email, error: String(e?.message ?? e) });
        continue;
      }
    }

    // Link the auth user + maestro broker id back onto the profile
    const patch: Record<string, unknown> = {};
    if (userId && userId !== p.user_id) patch.user_id = userId;
    if (!p.maestro_broker_id) {
      const hit = dirByEmail.get(email)
        ?? (p.extension ? dirByExt.get(String(p.extension).trim()) : null)
        ?? (digits(p.phone).length >= 10 ? dirByPhone.get(digits(p.phone).slice(-10)) : null);
      if (hit) { patch.maestro_broker_id = hit.id; results.linked_maestro++; }
    }
    if (!dryRun && Object.keys(patch).length) {
      const { error } = await admin.from("planipret_profiles").update(patch).eq("id", p.id);
      if (error) results.errors.push({ email, error: error.message });
    }
  }

  return json({ ok: true, dry_run: dryRun, offset, limit, batch_size: (profiles ?? []).length, protected: [...protectedEmails], ...results });
});
