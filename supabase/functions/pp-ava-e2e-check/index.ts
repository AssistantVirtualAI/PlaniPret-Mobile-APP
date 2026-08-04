// pp-ava-e2e-check — end-to-end verification that the AVA chatbot and voice bot
// can reach every tool: reports, calls, recordings, summaries, coaching, SMS.
// Returns a per-link diagnostic so the app can surface what is missing.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";
import { linkBrokerIdByEmail } from "../_shared/maestro-broker-directory.ts";

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

    // --- End-to-end Maestro tool checks (chatbot + voice bot) ---
    const authHeader = req.headers.get("Authorization") ?? "";

    // 0) Broker ↔ Maestro id link (Microsoft email → GET /users/{id}/brokers)
    let maestroId: string | null = null;
    let linkMatchedBy: string | null = null;
    try {
      const { data: prof } = await admin
        .from("planipret_profiles")
        .select("id, email, ms365_email, extension, phone, maestro_broker_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (prof) {
        const linked = await linkBrokerIdByEmail(admin as any, prof as any);
        maestroId = linked.maestro_broker_id;
        linkMatchedBy = linked.matched_by;
        if (!linked.ok) linkMatchedBy = linked.error ?? null;
      }
    } catch (e) {
      linkMatchedBy = (e as Error).message;
    }
    links.push({
      id: "maestro_broker_link",
      label: "Identifiant Maestro du courtier",
      ok: !!maestroId,
      detail: maestroId
        ? `Maestro ID ${maestroId} (${linkMatchedBy ?? "lié"})`
        : `Non lié — ${linkMatchedBy ?? "aucune correspondance dans l'annuaire Maestro"}`,
    });

    // 0b) The four new mobile endpoints, called live.
    const endpointChecks: Array<{ id: string; label: string; action: string; payload: Record<string, unknown> }> = [
      { id: "maestro_ep_clients", label: "GET /users/{id}/clients", action: "list_clients", payload: { page_size: 1, offset: 0 } },
      { id: "maestro_ep_brokers", label: "GET /users/{id}/brokers", action: "list_brokers", payload: { page_size: 1, offset: 0 } },
    ];
    let firstClientId: string | null = null;
    let firstBrokerId: string | null = null;
    for (const c of endpointChecks) {
      let ok = false;
      let detail = "not_run";
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/maestro-actions`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ action: c.action, payload: c.payload }),
        });
        const d = await r.json().catch(() => ({}));
        ok = r.ok && d?.success === true;
        const list = d?.clients ?? d?.brokers ?? [];
        if (ok && c.action === "list_clients") firstClientId = list?.[0]?.id ? String(list[0].id) : null;
        if (ok && c.action === "list_brokers") firstBrokerId = list?.[0]?.id ? String(list[0].id) : null;
        detail = ok ? `${d?.total ?? list.length} résultat(s)` : String(d?.error ?? `HTTP ${r.status}`).slice(0, 160);
      } catch (e) {
        detail = (e as Error).message;
      }
      links.push({ id: c.id, label: c.label, ok, detail });
    }

    for (const c of [
      { id: "maestro_ep_client_profile", label: "GET /users/{id}/clients/{id}/profile", action: "client_profile", key: "client_id", value: firstClientId },
      { id: "maestro_ep_broker_profile", label: "GET /users/{id}/brokers/{id}/profile", action: "broker_profile", key: "broker_id", value: firstBrokerId },
    ]) {
      if (!c.value) {
        links.push({ id: c.id, label: c.label, ok: false, detail: "Aucun identifiant disponible pour tester" });
        continue;
      }
      let ok = false;
      let detail = "not_run";
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/maestro-actions`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ action: c.action, payload: { [c.key]: c.value } }),
        });
        const d = await r.json().catch(() => ({}));
        ok = r.ok && d?.success === true && !!d?.profile;
        detail = ok ? `Profil ${d?.profile?.name ?? c.value} récupéré` : String(d?.error ?? `HTTP ${r.status}`).slice(0, 160);
      } catch (e) {
        detail = (e as Error).message;
      }
      links.push({ id: c.id, label: c.label, ok, detail });
    }


    // 1) Chatbot: execute the real `maestro_action` tool path.
    let chatOk = false;
    let chatDetail = "not_run";
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/pp-ava-chat`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          approved: true,
          language: "fr",
          confirm_action: {
            id: "e2e-maestro",
            label: "E2E list clients",
            kind: "maestro_action",
            payload: { action: "list_clients", page_size: 1, offset: 0 },
          },
        }),
      });
      const d = await r.json().catch(() => ({}));
      chatOk = r.ok && !!d?.result?.success;
      chatDetail = chatOk
        ? `Outil exécuté (${d?.result?.total ?? d?.result?.count ?? 0} clients)`
        : String(d?.reply ?? d?.error ?? `HTTP ${r.status}`).slice(0, 200);
    } catch (e) {
      chatDetail = (e as Error).message;
    }
    links.push({ id: "maestro_chat_tool", label: "AVA chatbot → outils Maestro", ok: chatOk, detail: chatDetail });

    // 2) Voice bot: the agent config must expose the Maestro tools.
    let voiceOk = false;
    let voiceDetail = "not_run";
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/ava-agent-config`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json().catch(() => ({}));
      const names: string[] = (d?.tools ?? d?.tool_names ?? []).map((t: any) => (typeof t === "string" ? t : t?.name)).filter(Boolean);
      const required = ["list_my_clients", "get_maestro_client_profile", "list_my_brokers", "get_maestro_broker_profile"];
      const missingTools = required.filter((n) => !names.includes(n));
      voiceOk = r.ok && missingTools.length === 0;
      voiceDetail = voiceOk
        ? `${required.length} outils Maestro déclarés à l'agent vocal`
        : names.length
          ? `Outils manquants: ${missingTools.join(", ")}`
          : `Config agent indisponible (HTTP ${r.status})`;
    } catch (e) {
      voiceDetail = (e as Error).message;
    }
    links.push({ id: "maestro_voice_tool", label: "AVA voice bot → outils Maestro", ok: voiceOk, detail: voiceDetail });


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

// redeploy: blob refresh 2026-08-01
