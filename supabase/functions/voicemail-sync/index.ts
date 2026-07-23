// voicemail-sync: pulls new voicemail messages from FusionPBX for every
// linked extension, downloads the audio into Storage, inserts a
// pbx_voicemails row, and kicks off transcription via ai-transcribe-call.
//
// Invoked by pg_cron every 2 minutes AND manually from the portal UI
// (button "Sync now"). Safe to call concurrently — diffs by fusionpbx_uuid.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Optional scope: a single extension (when invoked from the UI)
  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty body for cron */ }
  const targetExtension: string | undefined = body.extension;
  const targetOrg: string | undefined = body.organization_id;

  // Build extension worklist from softphone users (real users w/ portals)
  let q = admin
    .from("pbx_softphone_users")
    .select("organization_id, extension, portal_user_id")
    .not("portal_user_id", "is", null);
  if (targetExtension) q = q.eq("extension", targetExtension);
  if (targetOrg) q = q.eq("organization_id", targetOrg);
  const { data: users, error: usersErr } = await q;
  if (usersErr) return json({ error: usersErr.message }, 500);

  const stats = { extensions: 0, new_voicemails: 0, errors: [] as string[] };

  for (const u of users || []) {
    stats.extensions++;
    try {
      // 1. Pull mailbox listing from FusionPBX via the existing proxy
      const listRes = await fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "list-voicemails",
          organization_id: u.organization_id,
        }),
      });
      const listJson = await listRes.json().catch(() => ({}));
      const mailboxes: any[] = listJson?.data || [];

      // FusionPBX returns voicemail boxes. Each box has nested "voicemail_messages".
      // Filter to the mailbox matching this user's extension.
      const box = mailboxes.find((m: any) =>
        String(m.voicemail_id ?? m.extension ?? "") === String(u.extension)
      );
      const messages: any[] = box?.voicemail_messages || box?.messages || [];

      for (const msg of messages) {
        const pbxId = String(
          msg.voicemail_message_uuid || msg.uuid || msg.message_uuid ||
          `${u.extension}-${msg.created_epoch || msg.created || Math.random()}`
        );

        // De-dupe
        const { data: existing } = await admin
          .from("pbx_voicemails")
          .select("id")
          .eq("organization_id", u.organization_id)
          .eq("fusionpbx_uuid", pbxId)
          .maybeSingle();
        if (existing) continue;

        // 2. Download audio (best-effort — falls back to no audio if missing path)
        let storagePath: string | null = null;
        const recordPath = msg.message_path || msg.record_path;
        const recordName = msg.message_name || msg.record_name ||
          (msg.created_epoch ? `msg_${msg.created_epoch}.wav` : null);
        if (recordPath && recordName) {
          try {
            const audioRes = await fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${SERVICE_KEY}`,
                apikey: SERVICE_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                action: "get-recording",
                organization_id: u.organization_id,
                params: { record_path: recordPath, record_name: recordName },
              }),
            });
            if (audioRes.ok) {
              const bytes = new Uint8Array(await audioRes.arrayBuffer());
              const ext = recordName.toLowerCase().endsWith(".mp3") ? "mp3" : "wav";
              const path = `${u.organization_id}/${u.extension}/${pbxId}.${ext}`;
              const up = await admin.storage.from("voicemail-audio").upload(path, bytes, {
                contentType: ext === "mp3" ? "audio/mpeg" : "audio/wav",
                upsert: true,
              });
              if (!up.error) storagePath = path;
            }
          } catch (e: any) {
            stats.errors.push(`audio:${pbxId}:${e?.message || e}`);
          }
        }

        // 3. Insert voicemail row
        const { data: inserted, error: insErr } = await admin
          .from("pbx_voicemails")
          .insert({
            organization_id: u.organization_id,
            extension: u.extension,
            mailbox: u.extension,
            caller_number: msg.caller_id_number || msg.cid_number || null,
            caller_name: msg.caller_id_name || msg.cid_name || null,
            received_at: msg.created_epoch
              ? new Date(Number(msg.created_epoch) * 1000).toISOString()
              : new Date().toISOString(),
            duration_seconds: Number(msg.message_length || msg.duration || 0) || 0,
            audio_storage_path: storagePath,
            folder: "inbox",
            fusionpbx_uuid: pbxId,
          })
          .select("id")
          .single();
        if (insErr) { stats.errors.push(`insert:${pbxId}:${insErr.message}`); continue; }
        stats.new_voicemails++;

        // 4. Kick off transcription if user opted in & we have audio
        if (storagePath) {
          const { data: settings } = await admin
            .from("pbx_voicemail_settings")
            .select("transcription_enabled")
            .eq("user_id", u.portal_user_id)
            .maybeSingle();
          if (settings?.transcription_enabled !== false) {
            // Fire and forget
            fetch(`${SUPABASE_URL}/functions/v1/ai-transcribe-call`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${SERVICE_KEY}`,
                apikey: SERVICE_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                voicemail_id: inserted.id,
                storage_bucket: "voicemail-audio",
                storage_path: storagePath,
              }),
            }).catch(() => { /* noop */ });
          }
        }
      }
    } catch (e: any) {
      stats.errors.push(`ext:${u.extension}:${e?.message || e}`);
    }
  }

  return json({ ok: true, ...stats });
});
