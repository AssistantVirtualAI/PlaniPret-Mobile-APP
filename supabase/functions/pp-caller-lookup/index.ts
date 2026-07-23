import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { normalizePhone, formatDisplay } from "../_shared/phoneNormalize.ts";

interface LookupResult {
  found: boolean;
  source: "device" | "maestro" | "broker" | "microsoft" | null;
  name: string;
  display_number: string;
  raw_number: string;
  phone_normalized: string | null;
  company?: string | null;
  photo_url?: string | null;
  email?: string | null;
  crm_meta?: { stage?: string; score?: number; tags?: any } | null;
  ms_meta?: { mobile?: string; business?: string[]; email?: string } | null;
}

const cache = new Map<string, { at: number; v: LookupResult }>();
const CACHE_MS = 5 * 60 * 1000;

async function getMsToken(admin: any, userId: string): Promise<string | null> {
  const { data: profile } = await admin
    .from("planipret_profiles")
    .select("id, ms365_access_token, ms365_refresh_token, ms365_token_expiry")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.ms365_access_token) return null;
  if (profile.ms365_token_expiry && new Date(profile.ms365_token_expiry).getTime() > Date.now() + 60_000) {
    return profile.ms365_access_token;
  }
  if (!profile.ms365_refresh_token) return profile.ms365_access_token;
  try {
    const { data: secrets } = await admin
      .from("planipret_integration_secrets")
      .select("config")
      .eq("provider", "microsoft")
      .maybeSingle();
    const c = (secrets?.config ?? {}) as Record<string, string>;
    const body = new URLSearchParams({
      client_id: c.client_id ?? Deno.env.get("MICROSOFT_CLIENT_ID") ?? "",
      client_secret: c.client_secret ?? Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? "",
      grant_type: "refresh_token",
      refresh_token: profile.ms365_refresh_token,
      scope: "openid offline_access Contacts.Read User.Read",
    });
    const r = await fetch(
      `https://login.microsoftonline.com/${c.tenant_id ?? Deno.env.get("MICROSOFT_TENANT_ID") ?? "common"}/oauth2/v2.0/token`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
    );
    if (!r.ok) return profile.ms365_access_token;
    const d = await r.json();
    await admin.from("planipret_profiles").update({
      ms365_access_token: d.access_token,
      ms365_refresh_token: d.refresh_token ?? profile.ms365_refresh_token,
      ms365_token_expiry: new Date(Date.now() + (d.expires_in ?? 3600) * 1000).toISOString(),
    }).eq("id", profile.id);
    return d.access_token as string;
  } catch (e) {
    console.warn("[pp-caller-lookup] MS refresh failed", (e as any)?.message);
    return profile.ms365_access_token;
  }
}

async function lookupMicrosoft(token: string, normalized: string): Promise<LookupResult | null> {
  // Match by mobilePhone or businessPhones — Graph doesn't filter on tel arrays
  // easily, so try mobilePhone filter first, then a $search fallback.
  const tail = normalized.replace(/^\+1/, "").slice(-7);
  try {
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/me/contacts?$top=10&$filter=contains(mobilePhone,'${tail}')&$select=displayName,companyName,mobilePhone,businessPhones,emailAddresses`,
      { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } },
    );
    if (!r.ok) return null;
    const d = await r.json();
    const c = (d.value ?? [])[0];
    if (!c) return null;
    return {
      found: true,
      source: "microsoft",
      name: c.displayName ?? "",
      display_number: formatDisplay(normalized),
      raw_number: normalized,
      phone_normalized: normalized,
      company: c.companyName ?? null,
      email: c.emailAddresses?.[0]?.address ?? null,
      photo_url: null,
      ms_meta: {
        mobile: c.mobilePhone,
        business: c.businessPhones ?? [],
        email: c.emailAddresses?.[0]?.address,
      },
    };
  } catch (e) {
    console.warn("[pp-caller-lookup] MS graph fail", (e as any)?.message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const rawPhone = String(body?.phone ?? "").trim();
    const normalized = normalizePhone(rawPhone);

    const empty: LookupResult = {
      found: false,
      source: null,
      name: formatDisplay(normalized) || rawPhone || "Inconnu",
      display_number: formatDisplay(normalized) || rawPhone,
      raw_number: rawPhone,
      phone_normalized: normalized,
    };

    if (!normalized) return json(empty);

    const ckey = `${userId}|${normalized}`;
    const hit = cache.get(ckey);
    if (hit && Date.now() - hit.at < CACHE_MS) return json(hit.v);

    // 1) device contacts (user-scoped)
    {
      const { data } = await admin
        .from("planipret_contacts")
        .select("full_name, company, email, photo_url, source")
        .eq("user_id", userId)
        .eq("phone_normalized", normalized)
        .order("source", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) {
        const v: LookupResult = {
          found: true,
          source: data.source === "microsoft" ? "microsoft" : "device",
          name: data.full_name ?? formatDisplay(normalized),
          display_number: formatDisplay(normalized),
          raw_number: rawPhone,
          phone_normalized: normalized,
          company: data.company,
          email: data.email,
          photo_url: data.photo_url,
        };
        cache.set(ckey, { at: Date.now(), v });
        return json(v);
      }
    }

    // 2) Maestro CRM (user-scoped)
    {
      const { data } = await admin
        .from("planipret_maestro_clients")
        .select("full_name, company, email, mortgage_stage, lead_score_avg, tags")
        .eq("user_id", userId)
        .eq("phone_e164", normalized)
        .limit(1)
        .maybeSingle();
      if (data) {
        const v: LookupResult = {
          found: true,
          source: "maestro",
          name: data.full_name ?? formatDisplay(normalized),
          display_number: formatDisplay(normalized),
          raw_number: rawPhone,
          phone_normalized: normalized,
          company: data.company,
          email: data.email,
          crm_meta: { stage: data.mortgage_stage, score: data.lead_score_avg, tags: data.tags },
        };
        cache.set(ckey, { at: Date.now(), v });
        return json(v);
      }
    }

    // 3) broker profiles (same org)
    {
      const { data: me } = await admin
        .from("planipret_profiles")
        .select("organization_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (me?.organization_id) {
        const { data } = await admin
          .from("planipret_profiles")
          .select("full_name, email, avatar_url, extension")
          .eq("organization_id", me.organization_id)
          .or(`phone.eq.${normalized},extension.eq.${normalized.replace(/^\+1/, "")}`)
          .limit(1)
          .maybeSingle();
        if (data) {
          const v: LookupResult = {
            found: true,
            source: "broker",
            name: data.full_name ?? "Collègue",
            display_number: formatDisplay(normalized),
            raw_number: rawPhone,
            phone_normalized: normalized,
            email: data.email,
            photo_url: data.avatar_url,
          };
          cache.set(ckey, { at: Date.now(), v });
          return json(v);
        }
      }
    }

    // 4) Microsoft contacts
    const token = await getMsToken(admin, userId);
    if (token) {
      const ms = await lookupMicrosoft(token, normalized);
      if (ms) {
        cache.set(ckey, { at: Date.now(), v: ms });
        return json(ms);
      }
    }

    cache.set(ckey, { at: Date.now(), v: empty });
    return json(empty);
  } catch (e: any) {
    console.error("[pp-caller-lookup] fatal", e?.message);
    return json({ found: false, error: e?.message ?? "unknown" }, 500);
  }
});
