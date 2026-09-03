// pp-contact-search — unified contact search for AVA (chat + ElevenLabs voice)
// and the mobile global search. Fans out in parallel to:
//   1. planipret_contacts   → device contacts (once authorized) + Microsoft sync
//   2. pp-ns-contacts       → company directory (extensions, shared, personal)
//   3. maestro-actions      → the broker's own Maestro clients
//   4. ms365-actions        → Outlook / people search
// Results are merged, deduplicated and ranked with accent-insensitive,
// token-based matching (see _shared/contactMatch.ts).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { rankContacts, tokenize, normalizeText, digitsOnly, type UnifiedContact } from "../_shared/contactMatch.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; v: UnifiedContact[] }>();

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function pick(o: any, keys: string[]): string {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && str(v)) return str(v);
  }
  return "";
}

function nameOf(o: any): string {
  const first = pick(o, ["first_name", "firstname", "given_name", "givenName", "name-first-name"]);
  const last = pick(o, ["last_name", "lastname", "family_name", "surname", "name-last-name"]);
  const composed = `${first} ${last}`.trim();
  return composed || pick(o, ["display_name", "displayName", "full_name", "fullName", "name", "caller_id_name"]);
}

function phoneOf(o: any): string {
  return pick(o, [
    "phone", "mobile", "cell_phone", "cell", "mobile_phone", "phone_number",
    "work_phone", "office_phone", "business_phone", "home_phone", "contact-phone", "number",
  ]);
}

async function callFn(name: string, body: Record<string, unknown>, authHeader?: string) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: authHeader ?? `Bearer ${SERVICE_KEY}`,
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return await r.json().catch(() => ({}));
}

async function fromLocalTable(admin: any, userId: string, query: string): Promise<UnifiedContact[]> {
  const toks = tokenize(query);
  let q = admin.from("planipret_contacts")
    .select("full_name, phone, phone_display, email, company, source, external_id")
    .eq("user_id", userId)
    .limit(400);
  // Narrow server-side with the longest token; final ranking happens in memory.
  const longest = toks.slice().sort((a, b) => b.length - a.length)[0];
  if (longest && longest.length >= 2) {
    q = q.or(`full_name.ilike.%${longest}%,email.ilike.%${longest}%,company.ilike.%${longest}%,phone.ilike.%${longest}%`);
  }
  const { data } = await q;
  return (data ?? []).map((c: any) => ({
    name: c.full_name ?? "",
    phone: c.phone_display || c.phone,
    email: c.email,
    company: c.company,
    external_id: c.external_id,
    source: c.source === "microsoft" ? "microsoft" : "device",
  }));
}

async function fromNsDirectory(userId: string): Promise<UnifiedContact[]> {
  const out: UnifiedContact[] = [];
  const results = await Promise.allSettled([
    callFn("pp-ns-contacts", { action: "directory", limit: 500, _user_id: userId }),
    callFn("pp-ns-contacts", { action: "shared", limit: 500, _user_id: userId }),
    callFn("pp-ns-contacts", { action: "list", limit: 500, _user_id: userId }),
  ]);
  const sources = ["directory", "shared", "ns_contacts"];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const payload: any = r.value ?? {};
    const rows: any[] = payload.directory ?? payload.contacts ?? payload.users ?? [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const ext = pick(row, ["extension", "user", "user_id", "ext"]);
      out.push({
        name: nameOf(row) || ext,
        phone: phoneOf(row) || null,
        extension: ext || null,
        email: pick(row, ["email", "email_address", "contact-email"]) || null,
        company: pick(row, ["company", "organization", "department"]) || null,
        source: sources[i],
      });
    }
  });
  return out.filter((c) => c.name || c.phone || c.extension);
}

async function fromMaestro(userId: string, query: string): Promise<UnifiedContact[]> {
  const payload: any = await callFn("maestro-actions", {
    action: "list_clients",
    payload: { limit: 200, search: query || undefined, _user_id: userId },
    _user_id: userId,
  });
  const rows: any[] = Array.isArray(payload?.clients) ? payload.clients : [];
  return rows.map((c: any) => ({
    name: nameOf(c),
    phone: phoneOf(c) || null,
    email: pick(c, ["email"]) || null,
    company: pick(c, ["company", "employer"]) || null,
    external_id: str(c.id ?? c.client_id) || null,
    source: "maestro",
  }));
}

async function fromMicrosoft(userId: string, query: string): Promise<UnifiedContact[]> {
  if (!query) return [];
  const payload: any = await callFn("ms365-actions", {
    action: "search_contact",
    payload: { query },
    _user_id: userId,
  });
  const rows: any[] = Array.isArray(payload?.results) ? payload.results : [];
  return rows.map((r: any) => ({
    name: str(r.name),
    phone: r.phone ?? null,
    email: r.email ?? null,
    company: r.company ?? null,
    source: "microsoft",
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return j({ success: false, error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));

    let userId: string | null = null;
    if (token === SERVICE_KEY) {
      userId = str(body?._user_id ?? body?.user_id) || null;
    } else {
      const { data } = await admin.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }
    if (!userId) return j({ success: false, error: "unauthorized" }, 401);

    const action = str(body?.action || "search");

    // ---- Audit history: consult / purge -------------------------------
    if (action === "audit_list") {
      const { data, error } = await admin
        .from("planipret_ava_directory_audit")
        .select("id, caller, query, filters, sources_queried, results_count, top_result, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(Math.min(Number(body?.limit ?? 100) || 100, 500));
      if (error) return j({ success: false, error: error.message, entries: [] }, 200);
      return j({ success: true, entries: data ?? [] });
    }
    if (action === "audit_purge") {
      const { error, count } = await admin
        .from("planipret_ava_directory_audit")
        .delete({ count: "exact" })
        .eq("user_id", userId);
      if (error) return j({ success: false, error: error.message }, 200);
      return j({ success: true, purged: count ?? 0 });
    }

    const query = str(body?.query ?? body?.name ?? body?.q);
    const limit = Math.min(Number(body?.limit ?? 10) || 10, 50);
    const sourcesReq: string[] | null = Array.isArray(body?.sources) && body.sources.length ? body.sources : null;
    const want = (s: string) => !sourcesReq || sourcesReq.includes(s);
    const companyFilter = normalizeText(str(body?.company));
    const phoneFilter = digitsOnly(body?.phone);
    const caller = str(body?._caller || body?.caller) || "app";

    const cacheKey = `${userId}`;
    const hit = cache.get(cacheKey);
    let pool: UnifiedContact[] | null = hit && Date.now() - hit.at < CACHE_MS ? hit.v : null;

    if (!pool) {
      const [local, ns, maestro] = await Promise.allSettled([
        fromLocalTable(admin, userId, ""),
        fromNsDirectory(userId),
        fromMaestro(userId, ""),
      ]);
      pool = [
        ...(local.status === "fulfilled" ? local.value : []),
        ...(ns.status === "fulfilled" ? ns.value : []),
        ...(maestro.status === "fulfilled" ? maestro.value : []),
      ];
      cache.set(cacheKey, { at: Date.now(), v: pool });
    }

    // ---- Filters ------------------------------------------------------
    let scope = pool.filter((c) => want(c.source));
    if (companyFilter) scope = scope.filter((c) => normalizeText(c.company).includes(companyFilter));
    if (phoneFilter) {
      scope = scope.filter((c) =>
        (digitsOnly(c.phone) + digitsOnly(c.extension)).includes(phoneFilter));
    }

    const logAudit = async (count: number, top?: string) => {
      try {
        await admin.from("planipret_ava_directory_audit").insert({
          user_id: userId,
          caller,
          query,
          filters: {
            sources: sourcesReq ?? "all",
            company: str(body?.company) || null,
            phone: str(body?.phone) || null,
          },
          sources_queried: Array.from(new Set(scope.map((c) => c.source))),
          results_count: count,
          top_result: top ?? null,
        });
      } catch (_) { /* auditing must never break search */ }
    };

    if (!query) {
      const list = scope.slice(0, limit);
      await logAudit(list.length, list[0]?.name);
      return j({
        success: true,
        query: "",
        count: list.length,
        total_indexed: scope.length,
        contacts: list,
      });
    }

    let ranked = rankContacts(scope, query, limit);

    // Outlook / people search only when the local pool is thin — it is a live
    // Graph call and the pool already contains synced Microsoft contacts.
    if (ranked.length < 3 && want("microsoft")) {
      const ms = await fromMicrosoft(userId, query).catch(() => []);
      if (ms.length) ranked = rankContacts([...scope, ...ms], query, limit);
    }

    await logAudit(ranked.length, ranked[0]?.name);

    return j({
      success: true,
      query,
      count: ranked.length,
      total_indexed: scope.length,
      contacts: ranked,
      sources_indexed: Array.from(new Set(scope.map((c) => c.source))),
    });
  } catch (e) {
    console.error("[pp-contact-search] fatal", (e as any)?.message);
    return j({ success: false, error: (e as any)?.message ?? "unknown", contacts: [] }, 200);
  }
});
