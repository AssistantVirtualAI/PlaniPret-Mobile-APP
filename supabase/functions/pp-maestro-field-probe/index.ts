// Temp diagnostic: probe which fields Maestro accepts on PUT /calls/{id}
import { adminClient, corsHeaders, getMaestroConfig, json, maestroFetch, telecomAuth } from "../_shared/maestro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { call_id, fields, sync, backfill, visibility_backfill } = await req.json().catch(() => ({} as any));
  const admin = adminClient();
  const runSync = async (id: string) => {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/maestro-sync-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ call_id: id, force: true }),
    });
    return { id, status: r.status, body: await r.json().catch(() => null) };
  };
  if (visibility_backfill) {
    const limit = Math.min(Number(visibility_backfill) || 5, 10);
    const { data: rows } = await admin
      .from("planipret_phone_calls")
      .select("id, metadata")
      .not("maestro_call_id", "is", null)
      .or("transcript.not.is.null,ai_summary.not.is.null,recording_storage_path.not.is.null")
      .is("metadata->>maestro_visibility_fixed_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    const out: unknown[] = [];
    for (const row of rows ?? []) {
      const res = await runSync(String((row as any).id));
      const ok = (res.body as any)?.success === true;
      if (ok) {
        await admin.from("planipret_phone_calls").update({
          metadata: { ...((row as any).metadata ?? {}), maestro_visibility_fixed_at: new Date().toISOString() },
        }).eq("id", (row as any).id);
      }
      out.push({ id: (row as any).id, ok });
    }
    const successful = out.filter((item: any) => item.ok).length;
    if ((rows?.length ?? 0) === limit && successful > 0) {
      EdgeRuntime.waitUntil(fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pp-maestro-field-probe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ visibility_backfill: limit }),
      }).catch(() => undefined));
    }
    return json({ processed: out.length, successful, continuing: (rows?.length ?? 0) === limit && successful > 0, results: out });
  }
  if (backfill) {
    const limit = Number(backfill) || 25;
    const { data: rows } = await admin
      .from("planipret_phone_calls")
      .select("id")
      .not("maestro_call_id", "is", null)
      .is("maestro_media_synced_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    const out: unknown[] = [];
    for (const r of rows ?? []) {
      const res = await runSync(String((r as any).id));
      const steps = (res.body as any)?.steps ?? {};
      const allMediaOk = steps?.recording?.ok === true && steps?.transcript?.ok === true && steps?.ai?.ok === true;
      out.push({ id: res.id, ok: allMediaOk, error: steps?.recording?.error ?? steps?.transcript?.error ?? steps?.ai?.error ?? (res.body as any)?.error ?? null });
      await admin.from("planipret_phone_calls")
        .update({ maestro_media_synced_at: allMediaOk ? new Date().toISOString() : null })
        .eq("id", res.id);
    }
    return json({ processed: out.length, results: out });
  }
  if (sync) {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/maestro-sync-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ call_id, force: true }),
    });
    return json({ sync: await r.json().catch(() => null) });
  }
  const { data: call } = await admin
    .from("planipret_phone_calls")
    .select("id, user_id, maestro_call_id, duration_seconds, started_at, ended_at, transcript, ai_summary, ai_coaching, recording_url")
    .eq("id", call_id)
    .maybeSingle();
  if (!call?.maestro_call_id) return json({ error: "no_maestro_call_id", call });
  const cfg = await getMaestroConfig(admin);
  const auth = await telecomAuth(admin, call.user_id, false);
  const base = `/api/v1/users/${auth.brokerId}/calls/${call.maestro_call_id}`;

  const results: any[] = [];
  const before = await maestroFetch(cfg, { method: "GET", path: base, token: auth.token, machine: auth.machine });
  results.push({ step: "get_before", status: before.status, data: before.data });

  for (const [name, body] of Object.entries(fields ?? {})) {
    const r = await maestroFetch(cfg, { method: "PUT", path: base, token: auth.token, machine: auth.machine, body: body as any });
    results.push({ field: name, status: r.status, ok: r.ok, data: typeof r.data === "string" ? String(r.data).slice(0, 400) : r.data });
  }
  return json({ results });
});
