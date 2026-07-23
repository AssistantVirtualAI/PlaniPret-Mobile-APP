// pp-ns-users — Lists all NetSapiens subscribers (brokers) for the Planiprêt domain.
// Admin-only. Uses NS_API_KEY (static API key) — same auth path as ns-live-test,
// which is the working method for this NetSapiens deployment.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { nsFetchAll, NS_API_KEY } from "../_shared/ns-pagination.ts";

const AVA_ORG_ID = "17d6507f-a9ca-409d-8e49-371d50332615";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchAllUsers(domain: string): Promise<{ ok: boolean; data: any[]; warning?: string; signal?: string; total?: number | null }> {
  const r = await nsFetchAll<any>(`/domains/${encodeURIComponent(domain)}/users`, {
    pageSize: 200, maxPages: 50,
    keyOf: (u: any) => String(u?.user ?? u?.extension ?? u?.subscriber_login ?? u?.user_id ?? u?.id ?? ""),
  });
  return { ok: r.ok, data: r.items, warning: r.warning, signal: r.paginationSignal, total: r.totalFromHeader };
}

function isPlanipretBrokerCandidate(b: any) {
  const ext = String(b.extension ?? "").trim();
  const email = String(b.email ?? "").trim();
  const status = String(b.status ?? "").toLowerCase();
  const name = String(b.full_name ?? "").trim();
  const scope = String(b.scope ?? "").toLowerCase();
  return !!ext
    && !/@lemtel\.com$/i.test(email)
    && !["disabled", "suspended", "deleted", "inactive"].includes(status)
    && !/^\d{7,}$/.test(ext)
    && !["system", "system user", "anonymous", "conference", "voicemail", "operator"].includes(name.toLowerCase())
    && !scope.includes("domain");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !userId) return json({ error: "Unauthorized" }, 401);
    const { data: isMember } = await admin.rpc("is_planipret_member", { _user_id: userId });
    if (isMember !== true) return json({ error: "Forbidden" }, 403);

    if (!NS_API_KEY) return json({ error: "NS_API_KEY missing in secrets" }, 500);

    const domain = new URL(req.url).searchParams.get("domain") ?? NS_DEFAULT_DOMAIN;
    const fetched = await fetchAllUsers(domain);
    const list = fetched.data;
    const nsWarning = fetched.warning ?? null;

    // Merge with local planipret_profiles for app/agent flags
    const { data: profiles } = await admin
      .from("planipret_profiles")
      .select("user_id, email, full_name, extension, ns_extension, mobile_app_enabled, voice_agent_enabled, ns_domain, elevenlabs_agent_id, dnd_enabled, updated_at, created_at")
      .eq("organization_id", AVA_ORG_ID);
    const byExt = new Map<string, any>();
    const byEmail = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => {
      const k = p.extension ?? p.ns_extension;
      if (k) byExt.set(String(k), p);
      if (p.email) byEmail.set(String(p.email).toLowerCase(), p);
    });

    const sourceList: any[] = list.length > 0
      ? list
      : (profiles ?? []).map((p: any) => ({
          user: p.extension ?? p.ns_extension,
          email: p.email,
          "name-first-name": (p.full_name || "").split(" ")[0] ?? "",
          "name-last-name": (p.full_name || "").split(" ").slice(1).join(" "),
        }));

    const rawBrokers = sourceList.map((u: any) => {
      const ext = String(u.user ?? u.extension ?? u.subscriber_login ?? u.user_id ?? u.id ?? "");
      const email = String(u.email ?? u.email_address ?? u["email-address"] ?? "").toLowerCase();
      const local = byExt.get(ext) ?? (email ? byEmail.get(email) : undefined);
      const first = u["name-first-name"] ?? u.first_name ?? u.firstName ?? "";
      const last = u["name-last-name"] ?? u.last_name ?? u.lastName ?? "";
      const fullName = local?.full_name || `${first} ${last}`.trim() || u.display_name || u.name || ext;
      return {
        user_id: local?.user_id ?? `ns:${domain}:${ext}`,
        ns_only: !local,
        extension: ext,
        full_name: fullName,
        email: local?.email ?? email ?? "",
        ns_domain: domain,
        mobile_app_enabled: local?.mobile_app_enabled ?? false,
        voice_agent_enabled: local?.voice_agent_enabled ?? false,
        dnd_enabled: local?.dnd_enabled ?? !!u.do_not_disturb,
        elevenlabs_agent_id: local?.elevenlabs_agent_id ?? null,
        scope: u.scope ?? u.user_scope ?? null,
        status: u.status ?? u.presence ?? null,
        updated_at: local?.updated_at ?? u.last_modified ?? null,
        created_at: local?.created_at ?? u.creation_date ?? null,
      };
    }).filter(isPlanipretBrokerCandidate);

    const brokerByExt = new Map<string, any>();
    for (const b of rawBrokers) if (!brokerByExt.has(b.extension)) brokerByExt.set(b.extension, b);
    const brokers = Array.from(brokerByExt.values());

    return json({ ok: true, count: brokers.length, raw_count: list.length, domain, brokers, ns_warning: nsWarning, degraded: !!nsWarning, strategy: `nsFetchAll:${fetched.signal ?? "n/a"}`, total_from_header: fetched.total ?? null });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
