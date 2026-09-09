// pp-maestro-audit — audit complet appels / textos / médias / IA par courtier.
// Lecture seule : n'écrit rien, ne pousse rien vers Maestro.
//
// POST { days?: number }  (défaut 90)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pp-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function pageAll(admin: any, table: string, cols: string, since: string, tsCol: string) {
  const out: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await admin
      .from(table)
      .select(cols)
      .gte(tsCol, since)
      .order(tsCol, { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const CRON_SECRET = Deno.env.get("PP_CRON_TOKEN") ?? Deno.env.get("PP_CRON_SECRET") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
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
  const days = Math.min(Math.max(Number(body?.days) || 90, 1), 730);
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  try {
    const { data: profiles } = await admin
      .from("planipret_profiles")
      .select("id, user_id, full_name, first_name, last_name, extension, phone, maestro_broker_id, maestro_telecom_user_id");

    const nameOf = (p: any) =>
      p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.extension || "—";
    const byKey = new Map<string, any>();
    for (const p of profiles ?? []) {
      byKey.set(String(p.id), p);
      if (p.user_id) byKey.set(String(p.user_id), p);
    }

    const calls = await pageAll(
      admin,
      "planipret_phone_calls",
      "id, user_id, created_at, duration_seconds, maestro_call_id, maestro_media_synced_at, maestro_media_sync_error, recording_url, ns_recording_url, recording_storage_path, transcript, ai_summary, ai_coaching",
      since,
      "created_at",
    );
    const msgs = await pageAll(
      admin,
      "planipret_phone_messages",
      "id, user_id, direction, from_number, to_number, sent_at, maestro_synced, metadata",
      since,
      "sent_at",
    );

    const norm = (v: unknown): string | null => {
      const d = String(v ?? "").replace(/\D/g, "");
      if (!d) return null;
      if (d.length === 10) return `+1${d}`;
      if (d.length === 11 && d.startsWith("1")) return `+${d}`;
      if (d.length >= 11 && d.length <= 15) return `+${d}`;
      return null;
    };

    const rows = new Map<string, any>();
    const bucket = (userId: string | null) => {
      const key = String(userId ?? "unassigned");
      const p = byKey.get(key);
      const id = p ? String(p.id) : key;
      if (!rows.has(id)) {
        rows.set(id, {
          broker: p ? nameOf(p) : "Non rattaché",
          extension: p?.extension ?? null,
          maestro_connected: !!(p?.maestro_telecom_user_id || p?.maestro_broker_id),
          calls: 0, calls_in_maestro: 0, with_recording: 0, with_transcript: 0,
          with_ai_summary: 0, with_ai_coaching: 0, media_synced: 0, calls_pending: 0,
          zero_duration: 0, top_error: null as string | null,
          sms: 0, sms_synced: 0, sms_threads: 0,
          _errors: new Map<string, number>(), _threads: new Set<string>(),
        });
      }
      return rows.get(id);
    };

    for (const c of calls) {
      const r = bucket(c.user_id);
      r.calls++;
      if (c.maestro_call_id) r.calls_in_maestro++;
      if (c.recording_url || c.ns_recording_url || c.recording_storage_path) r.with_recording++;
      if (c.transcript && String(c.transcript).trim().length > 20) r.with_transcript++;
      if (c.ai_summary) r.with_ai_summary++;
      if (c.ai_coaching) r.with_ai_coaching++;
      if (c.maestro_media_synced_at) r.media_synced++;
      else r.calls_pending++;
      if (Number(c.duration_seconds ?? 0) <= 1) r.zero_duration++;
      if (c.maestro_media_sync_error) {
        const k = String(c.maestro_media_sync_error);
        r._errors.set(k, (r._errors.get(k) ?? 0) + 1);
      }
    }

    for (const m of msgs) {
      const r = bucket(m.user_id);
      r.sms++;
      if (m.maestro_synced) r.sms_synced++;
      const contact = m.direction === "inbound"
        ? norm(m.from_number) ?? norm(m.to_number)
        : norm(m.to_number) ?? norm(m.from_number);
      if (contact) r._threads.add(contact);
    }

    const brokers = [...rows.values()].map((r) => {
      const errs = [...r._errors.entries()].sort((a, b) => b[1] - a[1]);
      r.top_error = errs.length ? `${errs[0][0]} (${errs[0][1]})` : null;
      r.sms_threads = r._threads.size;
      delete r._errors;
      delete r._threads;
      return r;
    }).sort((a, b) => (b.calls + b.sms) - (a.calls + a.sms));

    const sum = (k: string) => brokers.reduce((n, b) => n + (Number(b[k]) || 0), 0);
    const totals = {
      brokers: brokers.length,
      brokers_connected_to_maestro: brokers.filter((b) => b.maestro_connected).length,
      calls: sum("calls"),
      calls_in_maestro: sum("calls_in_maestro"),
      calls_with_recording: sum("with_recording"),
      calls_with_transcript: sum("with_transcript"),
      calls_with_ai_summary: sum("with_ai_summary"),
      calls_with_ai_coaching: sum("with_ai_coaching"),
      calls_media_synced: sum("media_synced"),
      calls_pending: sum("calls_pending"),
      calls_zero_duration: sum("zero_duration"),
      sms: sum("sms"),
      sms_synced: sum("sms_synced"),
      sms_threads: sum("sms_threads"),
    };

    const { data: threadRows } = await admin
      .from("planipret_maestro_sms_threads")
      .select("status", { count: "exact" });
    const threadRegistry = {
      rows: threadRows?.length ?? 0,
      synced: (threadRows ?? []).filter((t: any) => t.status === "synced").length,
      failed: (threadRows ?? []).filter((t: any) => t.status === "failed").length,
    };

    return json({ success: true, window_days: days, totals, thread_registry: threadRegistry, brokers });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
