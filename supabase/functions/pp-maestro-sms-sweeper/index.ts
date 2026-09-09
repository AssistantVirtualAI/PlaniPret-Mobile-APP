// pp-maestro-sms-sweeper — rejoue le backlog des SMS non synchronisés vers Maestro.
// Batch borné, dédoublonnage (user + direction + corps + numéros + minute),
// et marquage idempotent : un SMS déjà synchronisé est ignoré.
//
// POST { limit?: number, max_age_hours?: number, user_id?: string, dry_run?: boolean }
import { createClient } from "npm:@supabase/supabase-js@2";
import { isTestSms, TEST_SMS_ALLOWED_USER_IDS } from "../_shared/pp-test-sms.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pp-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const CRON_SECRET = Deno.env.get("PP_CRON_TOKEN") ?? Deno.env.get("PP_CRON_SECRET") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const isCron = !!CRON_SECRET && req.headers.get("x-pp-cron-secret") === CRON_SECRET;
  const isService = token && token === SERVICE_ROLE;

  if (!isCron && !isService) {
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData?.user) return json({ error: "unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: userData.user.id });
    if (isAdmin !== true) return json({ error: "forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({} as any));
  const limit = Math.min(Math.max(Number(body?.limit) || 25, 1), 100);
  const maxAgeHours = Number(body?.max_age_hours ?? 24 * 30);
  const dryRun = body?.dry_run === true;

  let q = admin
    .from("planipret_phone_messages")
    .select("id, user_id, direction, from_number, to_number, body, sent_at, maestro_synced, status, ns_message_id, metadata")
    .neq("maestro_synced", true)
    .gte("sent_at", new Date(Date.now() - maxAgeHours * 3600_000).toISOString())
    .order("sent_at", { ascending: true })
    .limit(limit * 3);
  if (body?.user_id) q = q.eq("user_id", body.user_id);

  const { data: rows, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const MAX_PUSH_ATTEMPTS = 5;

  // Réconciliation des statuts « stuck » : NetSapiens a bien accepté ces SMS
  // (ns_message_id présent), seul le libellé importé est resté à « sending ».
  const { data: stuck } = await admin
    .from("planipret_phone_messages")
    .update({ status: "sent" })
    .eq("status", "sending")
    .not("ns_message_id", "is", null)
    .lt("sent_at", new Date(Date.now() - 15 * 60_000).toISOString())
    .select("id");
  const stuckFixed = stuck?.length ?? 0;

  // Numéro du contact = l'autre extrémité du texto (jamais l'extension interne).
  // C'est la clé de regroupement : un fil par (courtier, numéro).
  const norm = (v: unknown): string | null => {
    const d = String(v ?? "").replace(/\D/g, "");
    if (!d) return null;
    if (d.length === 10) return `+1${d}`;
    if (d.length === 11 && d.startsWith("1")) return `+${d}`;
    if (d.length >= 11 && d.length <= 15) return `+${d}`;
    return null; // extensions internes (2 à 6 chiffres) exclues
  };
  const contactOf = (r: any): string | null =>
    r.direction === "inbound" ? norm(r.from_number) ?? norm(r.to_number) : norm(r.to_number) ?? norm(r.from_number);

  // Dédoublonnage local : une seule ligne par (user, direction, corps, numéros, minute).
  const seen = new Set<string>();
  const batch: any[] = [];
  const duplicates: string[] = [];
  const testSkipped: string[] = [];
  const noContact: string[] = [];
  for (const r of rows ?? []) {
    // Textos de test : jamais rejoués, pour personne — on les ferme.
    if (isTestSms(r.body)) {
      testSkipped.push(r.id);
      continue;
    }
    const key = [
      r.user_id, r.direction, r.from_number ?? "", r.to_number ?? "",
      (r.body ?? "").trim(), String(r.sent_at ?? "").slice(0, 16),
    ].join("|");
    if (seen.has(key)) { duplicates.push(r.id); continue; }
    seen.add(key);
    const attempts = Number((r.metadata as any)?.maestro_push_attempts ?? 0);
    if (attempts >= MAX_PUSH_ATTEMPTS) continue; // circuit breaker: plus de maestro_500 en boucle
    const contact = contactOf(r);
    if (!contact) { noContact.push(r.id); continue; }
    batch.push({ ...r, __contact: contact });
  }

  // Regroupement par fil (courtier + numéro), chaque fil poussé dans l'ordre
  // chronologique pour que Maestro affiche la conversation dans le bon sens.
  const threads = new Map<string, any[]>();
  for (const r of batch) {
    const key = `${r.user_id}|${r.__contact}`;
    if (!threads.has(key)) threads.set(key, []);
    threads.get(key)!.push(r);
  }
  const ordered: any[] = [];
  for (const [, msgs] of threads) {
    msgs.sort((a, b) => String(a.sent_at ?? "").localeCompare(String(b.sent_at ?? "")));
    for (const m of msgs) if (ordered.length < limit) ordered.push(m);
  }
  batch.length = 0;
  batch.push(...ordered);

  if (dryRun) {
    return json({
      success: true, dry_run: true, candidates: rows?.length ?? 0,
      would_push: batch.length, threads: threads.size,
      duplicates: duplicates.length, no_contact_number: noContact.length,
    });
  }

  // Numéros inexploitables (extension interne, numéro vide) : jamais acceptés
  // par Maestro — on les ferme au lieu de les rejouer sans fin.
  if (noContact.length) {
    await admin.from("planipret_phone_messages").update({ maestro_synced: true }).in("id", noContact);
  }

  // Les doublons sont fermés sans push pour ne pas polluer Maestro.
  if (duplicates.length) {
    await admin.from("planipret_phone_messages").update({ maestro_synced: true }).in("id", duplicates);
  }
  if (testSkipped.length) {
    await admin.from("planipret_phone_messages").update({ maestro_synced: true }).in("id", testSkipped);
  }

  // ARRÊT DÉFINITIF DES RENVOIS (2026-09-08) : le rejeu vers Maestro déclenchait
  // un véritable envoi de SMS au contact. Le backlog est désormais archivé
  // localement, sans aucun appel réseau et sans aucun texto envoyé.
  const results: any[] = [];
  if (batch.length) {
    await admin
      .from("planipret_phone_messages")
      .update({ maestro_synced: true })
      .in("id", batch.map((m) => m.id));
    for (const msg of batch) {
      results.push({ message_id: msg.id, contact_number: msg.__contact, ok: true, closed: "archived_no_resend" });
    }
  }


  return json({
    success: true,
    candidates: rows?.length ?? 0,
    duplicates_closed: duplicates.length,
    threads: threads.size,
    no_contact_number_closed: noContact.length,
    test_messages_skipped: testSkipped.length,
    stuck_status_fixed: stuckFixed,
    processed: results.length,
    pushed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.closed).length,
    results,
  });
});
