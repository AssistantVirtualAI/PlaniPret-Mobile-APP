// Bi-directional Maestro <-> M365 calendar sync. Runs every 5 minutes via cron or on-demand.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function logAudit(supa: any, user_id: string, action: string, metadata: any) {
  await supa.from("planipret_audit_log").insert({ user_id, action, resource_type: "calendar_sync", metadata }).then(() => {}, () => {});
}

async function syncBroker(supa: any, b: any) {
  let synced = 0, conflicts = 0, errors = 0;

  // Direction 1: Maestro -> M365
  try {
    const { data: maestroRes } = await supa.functions.invoke("maestro-actions", {
      body: { action: "list_events", payload: { user_id: b.user_id, since: b.last_sync_at } },
    });
    const events = (maestroRes as any)?.events ?? [];
    for (const ev of events) {
      const { data: existing } = await supa.from("planipret_calendar_sync")
        .select("id, m365_event_id").eq("user_id", b.id).eq("maestro_event_id", ev.id).maybeSingle();
      if (existing?.m365_event_id) continue;

      const r = await supa.functions.invoke("ms365-actions", {
        body: { action: "create_calendar_event", payload: { subject: ev.title, start: ev.start, end: ev.end, body: ev.notes ?? "", attendees: ev.attendees ?? [] } },
        headers: { "X-User-Id": b.user_id },
      });
      const m365Id = (r.data as any)?.event?.id;
      if (m365Id) {
        await supa.from("planipret_calendar_sync").upsert({
          user_id: b.id, maestro_event_id: ev.id, m365_event_id: m365Id,
          sync_direction: "maestro_to_m365", status: "synced", last_sync_at: new Date().toISOString(),
        });
        synced++;
      }
    }
  } catch (e) { console.error("maestro->m365", e); errors++; }

  // Direction 2: M365 -> Maestro
  try {
    const start = new Date(Date.now() - 7 * 86400000).toISOString();
    const end = new Date(Date.now() + 30 * 86400000).toISOString();
    const { data: r } = await supa.functions.invoke("ms365-actions", {
      body: { action: "list_calendar_events", payload: { start, end } },
      headers: { "X-User-Id": b.user_id },
    });
    const events = (r as any)?.events ?? [];
    for (const ev of events) {
      const { data: existing } = await supa.from("planipret_calendar_sync")
        .select("id, maestro_event_id, last_sync_at").eq("user_id", b.id).eq("m365_event_id", ev.id).maybeSingle();
      if (existing?.maestro_event_id) {
        const m365Updated = new Date(ev.lastModifiedDateTime ?? ev.lastModified ?? 0).getTime();
        const lastSync = new Date(existing.last_sync_at).getTime();
        if (m365Updated > lastSync) {
          await supa.functions.invoke("maestro-actions", {
            body: { action: "update_event", payload: { user_id: b.user_id, event_id: existing.maestro_event_id, title: ev.subject, start: ev.start?.dateTime, end: ev.end?.dateTime } },
          });
          await supa.from("planipret_calendar_sync").update({ last_sync_at: new Date().toISOString(), status: "synced" }).eq("id", existing.id);
          synced++;
        }
      } else {
        const m = await supa.functions.invoke("maestro-actions", {
          body: { action: "create_event", payload: { user_id: b.user_id, title: ev.subject, start: ev.start?.dateTime, end: ev.end?.dateTime, notes: ev.bodyPreview } },
        });
        const maestroId = (m.data as any)?.event?.id;
        if (maestroId) {
          await supa.from("planipret_calendar_sync").upsert({
            user_id: b.id, maestro_event_id: maestroId, m365_event_id: ev.id,
            sync_direction: "m365_to_maestro", status: "synced", last_sync_at: new Date().toISOString(),
          });
          synced++;
        }
      }
    }
  } catch (e) { console.error("m365->maestro", e); errors++; }

  await logAudit(supa, b.user_id, "CALENDAR_SYNC", { synced, conflicts, errors });
  return { synced, conflicts, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = admin();
  const body = await req.json().catch(() => ({}));

  if (body.user_id) {
    const { data: b } = await supa.from("planipret_profiles")
      .select("id, user_id, ms365_access_token").eq("user_id", body.user_id).maybeSingle();
    if (!b?.ms365_access_token) return new Response(JSON.stringify({ success: false, error: "M365 non connecté" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const r = await syncBroker(supa, { ...b, last_sync_at: new Date(Date.now() - 86400000).toISOString() });
    return new Response(JSON.stringify({ success: true, ...r }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: brokers } = await supa.from("planipret_profiles")
    .select("id, user_id, ms365_access_token").eq("role", "broker").not("ms365_access_token", "is", null);
  const results: any[] = [];
  for (const b of brokers ?? []) {
    const r = await syncBroker(supa, { ...b, last_sync_at: new Date(Date.now() - 600000).toISOString() });
    results.push({ user: b.user_id, ...r });
  }
  return new Response(JSON.stringify({ success: true, brokers: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
