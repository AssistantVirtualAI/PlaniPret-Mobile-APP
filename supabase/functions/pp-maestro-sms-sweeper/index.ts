// pp-maestro-sms-sweeper — rejoue le backlog des SMS non synchronisés vers Maestro.
// Batch borné, dédoublonnage (user + direction + corps + numéros + minute),
// et marquage idempotent : un SMS déjà synchronisé est ignoré.
//
// POST { limit?: number, max_age_hours?: number, user_id?: string, dry_run?: boolean }
import { createClient } from "npm:@supabase/supabase-js@2";

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

  // Dédoublonnage local : une seule ligne par (user, direction, corps, numéros, minute).
  const seen = new Set<string>();
  const batch: any[] = [];
  const duplicates: string[] = [];
  for (const r of rows ?? []) {
    const key = [
      r.user_id, r.direction, r.from_number ?? "", r.to_number ?? "",
      (r.body ?? "").trim(), String(r.sent_at ?? "").slice(0, 16),
    ].join("|");
    if (seen.has(key)) { duplicates.push(r.id); continue; }
    seen.add(key);
    const attempts = Number((r.metadata as any)?.maestro_push_attempts ?? 0);
    if (attempts >= MAX_PUSH_ATTEMPTS) continue; // circuit breaker: plus de maestro_500 en boucle
    if (batch.length < limit) batch.push(r);
  }

  if (dryRun) {
    return json({ success: true, dry_run: true, candidates: rows?.length ?? 0, would_push: batch.length, duplicates: duplicates.length });
  }

  // Les doublons sont fermés sans push pour ne pas polluer Maestro.
  if (duplicates.length) {
    await admin.from("planipret_phone_messages").update({ maestro_synced: true }).in("id", duplicates);
  }

  const results: any[] = [];
  for (const msg of batch) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/maestro-sync-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ message_id: msg.id }),
      });
      const data = await res.json().catch(() => ({} as any));
      const ok = res.ok && data?.success !== false;
      // Un SMS avec des numéros invalides ne sera jamais accepté : on le ferme.
      const terminal = !ok && (data?.error === "invalid_numbers" || data?.error === "message_not_found");
      if (terminal) {
        await admin.from("planipret_phone_messages").update({ maestro_synced: true }).eq("id", msg.id);
      } else if (!ok) {
        const attempts = Number((msg.metadata as any)?.maestro_push_attempts ?? 0) + 1;
        await admin.from("planipret_phone_messages").update({
          metadata: {
            ...((msg.metadata as any) ?? {}),
            maestro_push_attempts: attempts,
            maestro_push_last_error: data?.error ?? `http_${res.status}`,
            maestro_push_last_at: new Date().toISOString(),
            maestro_push_state: attempts >= MAX_PUSH_ATTEMPTS ? "failed" : "retrying",
          },
        }).eq("id", msg.id);
      }
      results.push({ message_id: msg.id, ok, closed: terminal ? data?.error : undefined, error: ok ? null : (data?.error ?? `http_${res.status}`) });
    } catch (e) {
      results.push({ message_id: msg.id, ok: false, error: (e as Error).message });
    }
  }

  return json({
    success: true,
    candidates: rows?.length ?? 0,
    duplicates_closed: duplicates.length,
    stuck_status_fixed: stuckFixed,
    processed: results.length,
    pushed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.closed).length,
    results,
  });
});
