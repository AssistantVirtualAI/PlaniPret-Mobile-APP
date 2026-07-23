// maestro-telecom-link — resolve the broker's Maestro Telecom user id and
// persist it on planipret_profiles.maestro_broker_id.
//
// POST body: { action: "link", ms_access_token?: string }
//
// Strategy: call GET /users/me?machine=1 on the Maestro Telecom API with the
// machine API key first, then (if provided) with the Microsoft access token as
// Bearer. If the response contains { id, email } and the email matches the
// authenticated broker's email, the id is stored on the profile.
//
// Never throws — all failures return 200 with { ok:false, error } so the OAuth
// flow can invoke this fire-and-forget without breaking anything if Scott's
// endpoint isn't ready yet (404/500).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  getMaestroTelecomConfig,
  isMaestroTelecomConfigured,
} from "../_shared/maestro-telecom.ts";

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return j({ ok: false, error: "unauthorized" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return j({ ok: false, error: "unauthorized" });

    // Planiprêt scope guard
    const { data: isMember } = await admin.rpc("is_planipret_member", { _user_id: userId });
    if (isMember !== true) return j({ ok: false, error: "forbidden" });

    const body = await req.json().catch(() => ({} as any));
    const msAccessToken: string | null = body?.ms_access_token ?? null;

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select("id, user_id, email, ms365_email, maestro_broker_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return j({ ok: false, error: "profile_not_found" });

    const brokerEmail = String(
      (profile as any).ms365_email ?? (profile as any).email ?? "",
    ).toLowerCase().trim();
    if (!brokerEmail) return j({ ok: false, error: "no_email" });

    const cfg = await getMaestroTelecomConfig(admin);
    if (!isMaestroTelecomConfigured(cfg)) return j({ ok: false, error: "not_configured" });

    const url = `${cfg.url}/users/me?machine=1`;
    const attempts: Array<{ label: string; token: string }> = [
      { label: "machine_key", token: cfg.key },
    ];
    if (msAccessToken) attempts.push({ label: "ms_token", token: msAccessToken });

    let matched: { id: string; email: string } | null = null;
    const trace: any[] = [];
    for (const a of attempts) {
      try {
        const r = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${a.token}`, Accept: "application/json" },
        });
        const status = r.status;
        let data: any = null;
        try { data = await r.json(); } catch { /* ignore */ }
        trace.push({ via: a.label, status });
        if (!r.ok) continue;
        const id = data?.id ?? data?.user?.id ?? data?.user_id ?? null;
        const email = String(data?.email ?? data?.user?.email ?? "").toLowerCase().trim();
        if (id && email && email === brokerEmail) {
          matched = { id: String(id), email };
          break;
        }
      } catch (e) {
        trace.push({ via: a.label, error: (e as Error).message });
      }
    }

    if (!matched) {
      const anyServerError = trace.some((t) => t.status && t.status >= 500);
      const anyNotFound = trace.some((t) => t.status === 404);
      return j({
        ok: false,
        error: anyNotFound || anyServerError ? "endpoint_not_ready" : "no_match",
        trace,
      });
    }

    await admin
      .from("planipret_profiles")
      .update({ maestro_broker_id: matched.id })
      .eq("user_id", userId);

    return j({ ok: true, maestro_id: matched.id });
  } catch (e) {
    console.error("[maestro-telecom-link]", e);
    return j({ ok: false, error: (e as Error).message ?? "error" });
  }
});
