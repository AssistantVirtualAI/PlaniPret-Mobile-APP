// Backfills FusionPBX recordings: (1) re-syncs CDR metadata, then (2) fetches
// every recording binary that's not yet mirrored into the lemtel-recordings
// bucket. Idempotent — re-running is safe; already-uploaded files are skipped.
//
// POST body:
//   {
//     organization_id: string (required),
//     sync_metadata?: boolean (default true) — run sync-cdrs first
//     from_beginning?: boolean (default false) — full re-sync of CDR list
//     limit?: number (default 200, max 1000) — how many recordings to pull this run
//     concurrency?: number (default 3, max 6)
//     force?: boolean (default false) — re-upload even if storage_path already set
//   }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const organization_id: string = body?.organization_id;
    if (!organization_id) return json({ error: "organization_id required" }, 400);

    const sync_metadata = body?.sync_metadata !== false;
    const from_beginning = body?.from_beginning === true;
    const limit = Math.max(1, Math.min(1000, Number(body?.limit) || 200));
    const concurrency = Math.max(1, Math.min(6, Number(body?.concurrency) || 3));
    const force = body?.force === true;

    // Membership check (any membership-bearing table)
    const checks = await Promise.all([
      admin.from("organization_members").select("organization_id").eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle(),
      admin.from("org_members").select("org_id").eq("user_id", user.id).eq("org_id", organization_id).maybeSingle(),
      admin.from("user_roles").select("organization_id").eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle(),
    ]);
    if (!checks.some((c) => c.data)) return json({ error: "Forbidden" }, 403);

    const stats: any = { metadata: null, candidates: 0, uploaded: 0, skipped: 0, errors: 0, details: [] };

    // 1) Metadata re-sync via existing proxy action
    if (sync_metadata) {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
        body: JSON.stringify({ action: "sync-cdrs", organization_id, params: from_beginning ? { from_beginning: true } : {} }),
      });
      stats.metadata = { status: r.status, ok: r.ok, body: await r.json().catch(() => null) };
    }

    // 2) Find recordings that need to be mirrored
    const { data: rows, error: qErr } = await admin
      .from("pbx_call_records")
      .select("id, recording_name, recording_path, recording_url, domain_uuid, domain_name, start_at, raw_data")
      .eq("organization_id", organization_id)
      .not("recording_name", "is", null)
      .order("start_at", { ascending: false })
      .limit(limit * 3); // overfetch; we filter below
    if (qErr) return json({ error: qErr.message }, 500);

    const todo = (rows || []).filter((r) => {
      if (force) return true;
      const sp = (r.raw_data as any)?.storage_path;
      return !sp;
    }).slice(0, limit);

    stats.candidates = todo.length;

    const fetchOne = async (rec: any) => {
      try {
        const recName = rec.recording_name && /\.(mp3|wav|ogg|m4a)$/i.test(rec.recording_name)
          ? rec.recording_name : `${rec.recording_name}.mp3`;
        const proxyRes = await fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
          body: JSON.stringify({
            action: "get-recording",
            organization_id,
            params: {
              xml_cdr_uuid: rec.id,
              record_path: rec.recording_path || "",
              record_name: recName,
              domain_uuid: rec.domain_uuid || undefined,
              domain_name: rec.domain_name || undefined,
              recorded_at: rec.start_at || undefined,
              local_recording_url: rec.recording_url || undefined,
            },
          }),
        });
        const ct = proxyRes.headers.get("content-type") || "";
        let bytes: Uint8Array | null = null;
        let mime = "audio/wav";
        if (proxyRes.ok && ct.startsWith("audio/")) {
          bytes = new Uint8Array(await proxyRes.arrayBuffer());
          mime = ct.split(";")[0];
        } else if (proxyRes.ok && ct.includes("json")) {
          const j = await proxyRes.json().catch(() => null);
          const b64 = (j as any)?.audio_base64 || (j as any)?.recording_base64;
          if (b64) {
            const bin = atob(b64);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            mime = recName.endsWith(".mp3") ? "audio/mpeg" : recName.endsWith(".ogg") ? "audio/ogg" : "audio/wav";
          }
        }
        if (!bytes || bytes.length === 0) {
          const detail = ct.includes("json") ? null : (await proxyRes.text().catch(() => "")).slice(0, 200);
          stats.errors++;
          stats.details.push({ id: rec.id, ok: false, status: proxyRes.status, detail });
          return;
        }

        const ext = mime === "audio/mpeg" ? "mp3" : mime === "audio/ogg" ? "ogg" : mime === "audio/mp4" ? "m4a" : "wav";
        const objectPath = `backfill/${organization_id}/${rec.id}.${ext}`;
        const { error: upErr } = await admin.storage
          .from("lemtel-recordings")
          .upload(objectPath, bytes, { contentType: mime, upsert: true });
        if (upErr) {
          stats.errors++;
          stats.details.push({ id: rec.id, ok: false, upload_error: upErr.message });
          return;
        }
        await admin.from("pbx_call_records").update({
          raw_data: { ...((rec.raw_data as any) || {}), storage_path: objectPath, storage_bucket: "lemtel-recordings", storage_synced_at: new Date().toISOString() },
        }).eq("id", rec.id);
        stats.uploaded++;
      } catch (e: any) {
        stats.errors++;
        stats.details.push({ id: rec.id, ok: false, error: String(e?.message || e).slice(0, 200) });
      }
    };

    // Bounded concurrency
    let idx = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (idx < todo.length) {
        const i = idx++;
        await fetchOne(todo[i]);
      }
    });
    await Promise.all(workers);

    stats.skipped = (rows?.length || 0) - todo.length;
    return json({ ok: true, organization_id, ...stats, details: stats.details.slice(0, 50) });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
