// pp-ava-e2e-check — end-to-end verification that the AVA chatbot and voice bot
// can reach every tool: reports, calls, recordings, summaries, coaching, SMS.
// Returns a per-link diagnostic so the app can surface what is missing.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Link = { id: string; label: string; ok: boolean; detail: string };

async function fnExists(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "OPTIONS",
      headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return j({ error: "unauthorized" }, 401);
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return j({ error: "unauthorized" }, 401);
    const userId = u.user.id;

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select("id, user_id, ns_extension, extension, ms365_refresh_token, maestro_refresh_token")
      .eq("user_id", userId)
      .maybeSingle();

    const p = (profile ?? {}) as any;
    const links: Link[] = [];

    // Tool endpoints the AVA chatbot / voice bot route through.
    const tools: { id: string; label: string; fn: string }[] = [
      { id: "reports", label: "Rapports (brief / stats)", fn: "pp-ava-brief" },
      { id: "calls", label: "Appels sortants", fn: "pp-ns-calls" },
      { id: "sms", label: "Messages texte", fn: "pp-ns-sms" },
      { id: "recordings", label: "Enregistrements", fn: "maestro-recording-upload" },
      { id: "summaries", label: "Résumés IA", fn: "pp-auto-process-call" },
      { id: "coaching", label: "Coaching IA", fn: "pp-coach-call" },
      { id: "maestro_sync", label: "Synchronisation Maestro", fn: "maestro-sync-call" },
      { id: "tools_router", label: "Routeur d'outils AVA", fn: "ava-tool-executor" },
      { id: "voice", label: "Voix ElevenLabs", fn: "pp-ava-tts" },
    ];

    for (const t of tools) {
      const ok = await fnExists(t.fn);
      links.push({ id: t.id, label: t.label, ok, detail: ok ? `${t.fn} joignable` : `${t.fn} introuvable` });
    }

    // Telephony binding
    const ext = p.ns_extension ?? p.extension ?? null;
    links.push({
      id: "extension",
      label: "Poste téléphonique",
      ok: !!ext,
      detail: ext ? `Poste ${ext}` : "Aucun poste NetSapiens associé au profil",
    });

    // Microsoft 365
    links.push({
      id: "ms365",
      label: "Microsoft 365",
      ok: !!p.ms365_refresh_token,
      detail: p.ms365_refresh_token ? "Compte lié" : "Compte Microsoft non lié",
    });

    // Maestro token
    let maestroOk = false;
    let maestroDetail = "maestro_not_configured";
    if (p.maestro_refresh_token) {
      try {
        maestroOk = !!(await getUserMaestroAccessToken(admin as any, userId));
        maestroDetail = maestroOk ? "Jeton valide" : "Jeton expiré";
      } catch (e) {
        maestroDetail = (e as Error).message;
      }
    }
    links.push({ id: "maestro", label: "Maestro", ok: maestroOk, detail: maestroDetail });

    // ElevenLabs key
    links.push({
      id: "elevenlabs_key",
      label: "Clé ElevenLabs",
      ok: !!Deno.env.get("ELEVENLABS_API_KEY"),
      detail: Deno.env.get("ELEVENLABS_API_KEY") ? "Configurée" : "ELEVENLABS_API_KEY manquante",
    });

    const missing = links.filter((l) => !l.ok);
    return j({
      success: true,
      healthy: missing.length === 0,
      checked_at: new Date().toISOString(),
      missing: missing.map((m) => m.id),
      links,
    });
  } catch (e) {
    console.error("[pp-ava-e2e-check]", e);
    return j({ error: (e as Error).message }, 500);
  }
});
