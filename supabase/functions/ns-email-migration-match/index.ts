// Auto-match NS-API users to planipret_profiles by email.
// Exact match -> auto link. Fuzzy local-part match -> queued for review.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
const PLANIPRET_ORG_ID = "17d6507f-a9ca-409d-8e49-371d50332615";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normEmail(e: any): string {
  return String(e ?? "").trim().toLowerCase();
}

function localPart(e: string): string {
  const i = e.indexOf("@");
  return i > 0 ? e.slice(0, i) : e;
}

function normLocal(local: string): string {
  return local.replace(/[._\-+]/g, "").toLowerCase();
}

async function nsFetch(path: string) {
  const res = await fetch(`${NS_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${NS_API_KEY}`, Accept: "application/json" },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function fetchAllUsers(domain: string): Promise<any[]> {
  const all: any[] = [];
  const pageSize = 200;
  for (let i = 0; i < 25; i++) {
    const r = await nsFetch(`/domains/${encodeURIComponent(domain)}/users?limit=${pageSize}&start=${i * pageSize + 1}`);
    if (!r.ok) break;
    const arr = Array.isArray(r.data) ? r.data : [];
    all.push(...arr);
    if (arr.length < pageSize) break;
  }
  return all;
}

function isBrokerExtension(user: any): boolean {
  const ext = String(user?.user ?? user?.extension ?? "");
  if (!ext) return false;
  if (ext.length >= 7) return false;
  const name = String(user?.["name-first-name"] ?? "").toLowerCase();
  const sub = String(user?.["subscriber-name"] ?? "").toLowerCase();
  if (/operator|anonymous|system|conference|park/.test(name + " " + sub)) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Auth: must be admin of Planipret or super admin
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "not_authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role,organization_id")
    .eq("user_id", user.id);
  const isAdmin = (roleRows ?? []).some((r: any) =>
    r.role === "super_admin" || (r.role === "org_admin" && r.organization_id === PLANIPRET_ORG_ID)
  );
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const domain: string = body?.domain || NS_DEFAULT_DOMAIN;
  const dryRun: boolean = !!body?.dry_run;

  // Fetch NS users + profiles
  const nsUsers = await fetchAllUsers(domain);
  const { data: profiles } = await admin
    .from("planipret_profiles")
    .select("id,user_id,email,ms365_email,login_email,extension,ns_extension,ns_linked,full_name");

  // Build profile lookup tables
  const byEmail = new Map<string, any>();
  const byExt = new Map<string, any>();
  const byLocalNorm = new Map<string, any[]>();
  for (const p of profiles ?? []) {
    const ext = String(p.extension ?? p.ns_extension ?? "").trim();
    if (ext) byExt.set(ext, p);
    const emails = [p.email, p.ms365_email, p.login_email].filter(Boolean).map(normEmail);
    for (const e of emails) {
      if (!byEmail.has(e)) byEmail.set(e, p);
      const ln = normLocal(localPart(e));
      if (ln) {
        const arr = byLocalNorm.get(ln) ?? [];
        arr.push(p);
        byLocalNorm.set(ln, arr);
      }
    }
  }

  const summary = {
    domain,
    total_ns_extensions: nsUsers.length,
    total_portal_brokers: profiles?.length ?? 0,
    exact_matches_applied: 0,
    fuzzy_matches_pending_review: 0,
    profiles_created: 0,
    no_match_ns_side: 0,
    no_match_portal_side: 0,
    skipped_non_broker: 0,
  };

  const logs: any[] = [];
  const matchedProfileIds = new Set<string>();
  const inserts: any[] = [];
  const patches: Array<{ id: string; patch: any }> = [];

  for (const u of nsUsers) {
    if (!isBrokerExtension(u)) {
      summary.skipped_non_broker++;
      continue;
    }
    const ext = String(u.user ?? u.extension ?? "");
    const nsEmail = normEmail(u.email ?? u["email-address"] ?? u["email_address"]);
    const sipUsername = String(u["login-username"] ?? u.user ?? ext);
    const first = String(u["name-first-name"] ?? u.first_name ?? "").trim();
    const last = String(u["name-last-name"] ?? u.last_name ?? "").trim();
    const fullName = `${first} ${last}`.trim() || nsEmail || ext;

    // Match priority: ext -> exact email -> fuzzy local-part
    let match = byExt.get(ext) ?? (nsEmail ? byEmail.get(nsEmail) : null);
    let confidence: "exact" | "fuzzy" | null = match ? "exact" : null;

    if (!match && nsEmail) {
      const ln = normLocal(localPart(nsEmail));
      const cands = ln ? (byLocalNorm.get(ln) ?? []) : [];
      if (cands.length >= 1) { match = cands[0]; confidence = "fuzzy"; }
    }

    if (match && confidence === "exact" && !matchedProfileIds.has(match.id)) {
      matchedProfileIds.add(match.id);
      if (!dryRun) {
        patches.push({
          id: match.id,
          patch: {
            extension: match.extension ?? ext,
            ns_extension: ext,
            ns_domain: domain,
            ns_sip_username: sipUsername,
            ns_linked: !!match.user_id,
            ns_linked_at: match.user_id ? new Date().toISOString() : null,
            ns_link_method: "auto_email_match",
            login_email: match.login_email || match.email || nsEmail || null,
            email: match.email || nsEmail || null,
            full_name: match.full_name || fullName,
          },
        });
      }
      summary.exact_matches_applied++;
      logs.push({ broker_id: match.id, ns_extension: ext, ns_email_from_api: nsEmail || null, portal_email: match.email || null, match_status: "matched", match_confidence: "exact", reviewed: true });
    } else if (match && confidence === "fuzzy") {
      summary.fuzzy_matches_pending_review++;
      logs.push({ broker_id: match.id, ns_extension: ext, ns_email_from_api: nsEmail || null, portal_email: match.email || null, match_status: "multiple_matches", match_confidence: "fuzzy", reviewed: false });
    } else {
      // No portal profile yet → create one so the broker can log in via email later
      if (!dryRun) {
        inserts.push({
          organization_id: PLANIPRET_ORG_ID,
          user_id: null,
          full_name: fullName,
          email: nsEmail || null,
          login_email: nsEmail || null,
          extension: ext,
          ns_extension: ext,
          ns_domain: domain,
          ns_sip_username: sipUsername,
          ns_linked: false,
          ns_link_method: "auto_email_match_create",
          metadata: { ns_user: u, source: "ns-email-migration-match" },
        });
      }
      summary.profiles_created++;
      logs.push({ broker_id: null, ns_extension: ext, ns_email_from_api: nsEmail || null, portal_email: null, match_status: "created", match_confidence: nsEmail ? "exact" : null, reviewed: !!nsEmail, notes: fullName });
    }
  }

  // Apply patches
  for (let i = 0; i < patches.length; i += 25) {
    const chunk = patches.slice(i, i + 25);
    await Promise.all(chunk.map(({ id, patch }) =>
      admin.from("planipret_profiles").update(patch).eq("id", id)
    ));
  }
  // Insert new broker profiles, dedup by (org, ns_extension)
  for (let i = 0; i < inserts.length; i += 100) {
    const chunk = inserts.slice(i, i + 100);
    const { error } = await admin
      .from("planipret_profiles")
      .upsert(chunk, { onConflict: "organization_id,ns_extension", ignoreDuplicates: false });
    if (error) console.error("[ns-email-migration-match] insert error:", error.message);
  }

  // Portal brokers with no NS extension
  const nsExtSet = new Set((nsUsers ?? []).map((u: any) => String(u.user ?? u.extension ?? "")));
  for (const p of profiles ?? []) {
    if (matchedProfileIds.has(p.id)) continue;
    if (p.ns_linked && p.ns_extension && nsExtSet.has(p.ns_extension)) continue;
    if (!p.email && !p.ms365_email) continue;
    summary.no_match_portal_side++;
    logs.push({ broker_id: p.id, ns_extension: null, ns_email_from_api: null, portal_email: p.email || p.ms365_email || null, match_status: "no_match", match_confidence: null, reviewed: false, notes: `Portal broker ${p.full_name ?? ""}`.trim() });
  }

  if (!dryRun && logs.length) {
    await admin.from("planipret_ns_migration_log").delete().eq("reviewed", false);
    for (let i = 0; i < logs.length; i += 200) {
      await admin.from("planipret_ns_migration_log").insert(logs.slice(i, i + 200));
    }
  }

  return json({ ok: true, summary, dry_run: dryRun });
});

