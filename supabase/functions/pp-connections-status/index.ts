// pp-connections-status — real-time health of Microsoft 365, Maestro and ElevenLabs
// for the signed-in broker. Optional { reconnect: "ms365" | "maestro" | "all" }
// forces a token refresh before reporting.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Health = {
  service: "ms365" | "maestro" | "elevenlabs";
  state: "ok" | "reconnecting" | "error" | "not_configured";
  detail: string;
  expires_at?: string | null;
  can_reconnect: boolean;
};

const SELECT =
  "id, user_id, ms365_email, ms365_refresh_token, ms365_token_expiry, maestro_refresh_token, maestro_token_expires_at, maestro_broker_id";

async function elevenLabsHealth(): Promise<Health> {
  const key = Deno.env.get("ELEVENLABS_API_KEY");
  if (!key) {
    return { service: "elevenlabs", state: "not_configured", detail: "ELEVENLABS_API_KEY manquante", can_reconnect: false };
  }
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
    if (!res.ok) {
      const body = await res.text();
      return { service: "elevenlabs", state: "error", detail: `HTTP ${res.status} — ${body.slice(0, 160)}`, can_reconnect: false };
    }
    const data = await res.json().catch(() => ({} as any));
    const tier = data?.subscription?.tier ?? "actif";
    return { service: "elevenlabs", state: "ok", detail: `Voix disponible (${tier})`, can_reconnect: false };
  } catch (e) {
    return { service: "elevenlabs", state: "error", detail: (e as Error).message, can_reconnect: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const reconnect = String((body as any)?.reconnect ?? "");

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return j({ error: "unauthorized" }, 401);
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return j({ error: "unauthorized" }, 401);

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select(SELECT)
      .eq("user_id", u.user.id)
      .maybeSingle();
    if (!profile) {
      // Protection: always 200 so the mobile app renders a status card instead of an edge error.
      return j({ success: true, healthy: false, degraded: true, checked_at: new Date().toISOString(), services: [
        { service: "ms365", state: "not_configured", detail: "no_profile", can_reconnect: true },
        { service: "maestro", state: "not_configured", detail: "no_profile", can_reconnect: true },
      ] });
    }

    const p = profile as any;
    const services: Health[] = [];

    // ---- Microsoft 365 -----------------------------------------------------
    if (!p.ms365_refresh_token) {
      services.push({ service: "ms365", state: "not_configured", detail: "Compte Microsoft non lié", can_reconnect: true });
    } else {
      const exp = p.ms365_token_expiry ? Date.parse(p.ms365_token_expiry) : 0;
      const stale = !exp || exp - Date.now() < 10 * 60 * 1000;
      if (stale || reconnect === "ms365" || reconnect === "all") {
        try {
          const t = await refreshMicrosoftAccessToken(admin as any, p, MS365_DELEGATED_SCOPES);
          services.push({
            service: "ms365",
            state: t ? "ok" : "error",
            detail: t ? `Reconnecté — ${p.ms365_email ?? "compte lié"}` : "Échec du rafraîchissement du jeton",
            expires_at: p.ms365_token_expiry,
            can_reconnect: true,
          });
        } catch (e) {
          services.push({ service: "ms365", state: "error", detail: (e as Error).message, can_reconnect: true });
        }
      } else {
        services.push({
          service: "ms365",
          state: "ok",
          detail: p.ms365_email ?? "Compte lié",
          expires_at: p.ms365_token_expiry,
          can_reconnect: true,
        });
      }
    }

    // ---- Maestro -----------------------------------------------------------
    if (!p.maestro_refresh_token) {
      services.push({ service: "maestro", state: "not_configured", detail: "maestro_not_configured", can_reconnect: true });
    } else if (!p.maestro_broker_id) {
      services.push({ service: "maestro", state: "error", detail: "missing_maestro_broker_id — reconnect Maestro so sync can attach calls to the broker account", can_reconnect: true });
    } else {
      try {
        const t = await getUserMaestroAccessToken(admin as any, u.user.id);
        services.push({
          service: "maestro",
          state: t ? "ok" : "error",
          detail: t ? "Jeton valide" : "Jeton expiré — reconnexion requise",
          expires_at: p.maestro_token_expires_at,
          can_reconnect: true,
        });
      } catch (e) {
        services.push({ service: "maestro", state: "error", detail: (e as Error).message, can_reconnect: true });
      }
    }

    // ---- ElevenLabs --------------------------------------------------------
    services.push(await elevenLabsHealth());

    const healthy = services.every((s) => s.state === "ok");
    return j({ success: true, healthy, checked_at: new Date().toISOString(), services });
  } catch (e) {
    console.error("[pp-connections-status]", e);
    return j({ success: true, healthy: false, degraded: true, error: (e as Error).message, checked_at: new Date().toISOString(), services: [] });
  }
});
