import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const OWNER_UUID = "e5d025c9-eef2-4422-b97d-3190388b7376";
const ALLOWED = new Set(["microsoft", "maestro", "maestro_telecom", "elevenlabs", "anthropic", "nsapi", "webpush"]);

function mask(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  if (v.length <= 6) return "•".repeat(v.length);
  return v.slice(0, 2) + "•".repeat(Math.max(4, v.length - 6)) + v.slice(-4);
}

function normalizeProvider(provider: string): string {
  return provider === "ms365" ? "microsoft" : provider;
}

function compactPublicConfig(config: Record<string, any>, provider: string) {
  const publicConfig: Record<string, any> = {};
  if (provider === "microsoft") {
    publicConfig.tenant_id = config?.tenant_id ?? null;
    publicConfig.client_id = config?.client_id ?? config?.client_secret_id ?? null;
    publicConfig.redirect_uri = config?.redirect_uri ?? null;
    publicConfig.auth_mode = config?.auth_mode ?? config?.client_type ?? (config?.public_client === "true" ? "public" : null);
  } else if (provider === "nsapi") {
    publicConfig.base_url = config?.base_url ?? null;
    publicConfig.domain = config?.domain ?? config?.default_domain ?? null;
  } else {
    for (const [key, value] of Object.entries(config ?? {})) {
      if (!/secret|token|key|password/i.test(key)) publicConfig[key] = value;
    }
  }
  return publicConfig;
}

function mergeItem(
  map: Map<string, any>,
  providerRaw: string,
  config: Record<string, any>,
  updatedAt: string | null,
) {
  const provider = normalizeProvider(providerRaw);
  const existing = map.get(provider) ?? {
    provider,
    updated_at: updatedAt,
    public_config: {},
    config_masked: {},
    has_keys: [],
  };

  const publicConfig = compactPublicConfig(config, provider);
  existing.public_config = { ...existing.public_config, ...publicConfig };
  existing.config_masked = {
    ...existing.config_masked,
    ...Object.fromEntries(Object.entries(config ?? {}).map(([k, v]) => [k, mask(v)])),
  };
  existing.has_keys = Array.from(new Set([...(existing.has_keys ?? []), ...Object.keys(config ?? {})]));
  existing.updated_at = existing.updated_at ?? updatedAt;
  map.set(provider, existing);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supaUser = createClient(supaUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await supaUser.auth.getUser();
  const user = userRes?.user;
  const { data: isPlanipretAdmin } = user
    ? await supaUser.rpc("is_planipret_admin", { _user_id: user.id })
    : { data: false } as any;
  const { data: isPlanipretMember } = user
    ? await supaUser.rpc("is_planipret_member", { _user_id: user.id })
    : { data: false } as any;
  if (!user || (user.id !== OWNER_UUID && isPlanipretAdmin !== true && isPlanipretMember !== true)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const canManageSecrets = user.id === OWNER_UUID || isPlanipretAdmin === true;

  const { data: lemtelOnly } = await supaUser.rpc("is_lemtel_only", { _user_id: user.id });
  if (lemtelOnly === true) {
    return new Response(JSON.stringify({ error: "forbidden_wrong_app", app: "lemtel" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supaUrl, service);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "get";

  if (req.method === "GET" || action === "get") {
    const [{ data, error }, { data: cfgRows }] = await Promise.all([
      admin.from("planipret_integration_secrets").select("provider, config, updated_at"),
      admin.from("planipret_integration_config").select("integration_key, config_data, updated_at").in("integration_key", ["ms365", "ns_api"]),
    ]);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Merge config + secure secret rows so callers never pick an incomplete
    // duplicate Microsoft row and fall back to asking brokers for tenant/client IDs.
    const merged = new Map<string, any>();
    for (const row of cfgRows ?? []) {
      mergeItem(
        merged,
        row.integration_key === "ms365" ? "microsoft" : "nsapi",
        row.config_data ?? {},
        row.updated_at ?? null,
      );
    }
    for (const row of data ?? []) {
      mergeItem(merged, row.provider, row.config ?? {}, row.updated_at ?? null);
    }

    return new Response(JSON.stringify({ items: Array.from(merged.values()) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST") {
    if (!canManageSecrets) {
      return new Response(JSON.stringify({ error: "forbidden_admin_required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json().catch(() => null);
    if (!body?.provider || !ALLOWED.has(body.provider) || typeof body.config !== "object") {
      return new Response(JSON.stringify({ error: "invalid_body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Merge with existing so blank fields don't wipe stored values.
    const { data: existing } = await admin
      .from("planipret_integration_secrets")
      .select("config")
      .eq("provider", body.provider)
      .maybeSingle();

    const merged: Record<string, string> = { ...(existing?.config ?? {}) };
    for (const [k, v] of Object.entries(body.config as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim() !== "") merged[k] = v.trim();
    }

    const { error } = await admin
      .from("planipret_integration_secrets")
      .upsert(
        { provider: body.provider, config: merged, updated_by: user.id },
        { onConflict: "provider" }
      );
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
