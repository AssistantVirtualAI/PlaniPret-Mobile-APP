// pp-ava-maestro-status — reports the caller's Maestro binding state for both
// the AVA chatbot and the AVA voice bot (ElevenLabs).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return j({ error: "unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return j({ error: "unauthorized" }, 401);

    const { data: prof } = await admin
      .from("planipret_profiles")
      .select("id, user_id, full_name, maestro_broker_id, maestro_connected, maestro_refresh_token, elevenlabs_agent_id, voice_agent_enabled")
      .or(`user_id.eq.${u.user.id},id.eq.${u.user.id}`)
      .limit(1)
      .maybeSingle();

    const brokerId = prof?.maestro_broker_id ? String(prof.maestro_broker_id).trim() : null;
    const linked = !!brokerId && /^\d+$/.test(brokerId);

    // Live probe: one client through the same path the chatbot uses.
    let probeOk = false;
    let probeDetail = "not_run";
    let clientsTotal: number | null = null;
    if (linked) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/maestro-actions`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list_clients", payload: { page_size: 1, offset: 0 } }),
        });
        const d = await r.json().catch(() => ({}));
        probeOk = r.ok && !!d?.success;
        clientsTotal = typeof d?.total === "number" ? d.total : null;
        probeDetail = probeOk ? "ok" : String(d?.error ?? `HTTP ${r.status}`);
      } catch (e) {
        probeDetail = (e as Error).message;
      }
    } else {
      probeDetail = "maestro_user_id_unresolved";
    }

    const chat = {
      ok: linked && probeOk,
      detail: !linked
        ? "Compte non lié à Maestro (maestro_broker_id manquant)"
        : probeOk ? `Outils Maestro opérationnels${clientsTotal !== null ? ` — ${clientsTotal} clients` : ""}` : `Échec de l'appel Maestro: ${probeDetail}`,
    };
    const voice = {
      ok: linked && probeOk && !!prof?.voice_agent_enabled && !!Deno.env.get("ELEVENLABS_API_KEY"),
      detail: !prof?.voice_agent_enabled
        ? "Agent vocal désactivé sur le profil"
        : !Deno.env.get("ELEVENLABS_API_KEY")
          ? "ELEVENLABS_API_KEY manquante"
          : chat.ok ? "Outils Maestro déclarés à l'agent vocal" : chat.detail,
      agent_id: prof?.elevenlabs_agent_id ?? null,
    };

    return j({
      success: true,
      checked_at: new Date().toISOString(),
      linked,
      maestro_broker_id: brokerId,
      oauth_connected: !!prof?.maestro_connected || !!prof?.maestro_refresh_token,
      clients_total: clientsTotal,
      probe: { ok: probeOk, detail: probeDetail },
      chat,
      voice,
      healthy: chat.ok && voice.ok,
    });
  } catch (e) {
    console.error("[pp-ava-maestro-status]", e);
    return j({ error: (e as Error).message }, 500);
  }
});
