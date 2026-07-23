// supabase/functions/ns-live-test/index.ts
// Live NS-API v2 integration — exercises endpoints, paginates fully,
// syncs extensions + CDRs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL =
  Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
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

async function nsFetch(path: string) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${NS_API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${NS_API_KEY}`,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return {
      status: res.status,
      success: res.ok,
      latency_ms: Math.round(performance.now() - t0),
      data,
    };
  } catch (e) {
    return {
      status: 0,
      success: false,
      latency_ms: Math.round(performance.now() - t0),
      error: (e as Error).message,
    };
  }
}

/** Try first path; if it fails, fall back to alternates. Returns first success or last failure. */
async function nsFetchWithFallback(paths: string[]) {
  let last: any = null;
  for (const p of paths) {
    const r = await nsFetch(p);
    if (r.success) return { ...r, _path: p };
    last = { ...r, _path: p };
  }
  return last;
}

/** Paginate by NetSapiens START/LIMIT until result < limit. Returns flat array + meta. */
async function nsFetchAllPaginated(
  basePath: string,
  pageSize = 200,
  maxPages = 25,
): Promise<{ success: boolean; status: number; data: any[]; pages: number; latency_ms: number; error?: string }> {
  const t0 = performance.now();
  const all: any[] = [];
  let pages = 0;
  let lastStatus = 0;
  for (let i = 0; i < maxPages; i++) {
    const sep = basePath.includes("?") ? "&" : "?";
    const r = await nsFetch(`${basePath}${sep}limit=${pageSize}&start=${i * pageSize + 1}`);
    lastStatus = r.status;
    if (!r.success) {
      return {
        success: all.length > 0,
        status: lastStatus,
        data: all,
        pages,
        latency_ms: Math.round(performance.now() - t0),
        error: r.error ?? `HTTP ${r.status}`,
      };
    }
    pages++;
    const arr = Array.isArray(r.data) ? r.data : [];
    all.push(...arr);
    if (arr.length < pageSize) break;
  }
  return { success: true, status: lastStatus || 200, data: all, pages, latency_ms: Math.round(performance.now() - t0) };
}

function pickDirection(c: any): "inbound" | "outbound" | "missed" {
  const d = String(c?.direction ?? c?.["call-direction"] ?? "").toLowerCase();
  if (d.includes("out")) return "outbound";
  const disp = String(c?.["release-text"] ?? c?.disposition ?? "").toLowerCase();
  const answered = c?.["time-answer"] ?? c?.answered_at ?? c?.["answered-at"];
  if (!answered && disp.includes("miss")) return "missed";
  return "inbound";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supa.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    if (!NS_API_KEY) return json({ error: "NS_API_KEY missing in secrets" }, 500);

    let body: any = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }
    const action = body?.action ?? "test";
    const domain = (body?.domain ?? NS_DEFAULT_DOMAIN).trim();
    const D = encodeURIComponent(domain);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── ACTION: sync (users → planipret_profiles) ─────────────────
    if (action === "sync" || action === "sync_all") {
      const usersRes = await nsFetchAllPaginated(`/domains/${D}/users`);
      if (!usersRes.success) return json({ error: "Cannot fetch users from NS-API", ns: usersRes }, 502);

      // Bulk-fetch all profiles once (avoid N round-trips)
      const { data: allProfs } = await admin
        .from("planipret_profiles")
        .select("id,email");
      const emailToProfId = new Map<string, string>();
      for (const p of (allProfs ?? []) as any[]) {
        if (p.email) emailToProfId.set(String(p.email).toLowerCase().trim(), p.id);
      }

      const matched: any[] = [];
      const unmatched: any[] = [];
      const updates: { id: string; ns_extension: string; ns_domain: string; ns_sip_username: string; ns_linked: boolean; ns_linked_at: string; email?: string }[] = [];
      const nowIso = new Date().toISOString();

      for (const u of usersRes.data) {
        const email = (u.email ?? "").toLowerCase().trim();
        const ext = String(u.user ?? "").trim();
        if (!ext) continue;
        const display = `${u["name-first-name"] ?? ""} ${u["name-last-name"] ?? ""}`.trim();
        if (!email) { unmatched.push({ extension: ext, name: display, reason: "no_email" }); continue; }
        const profId = emailToProfId.get(email);
        if (!profId) { unmatched.push({ extension: ext, name: display, email, reason: "no_profile" }); continue; }
        updates.push({
          id: profId,
          ns_extension: ext,
          ns_domain: domain,
          ns_sip_username: u["login-username"] ?? ext,
          ns_linked: true,
          ns_linked_at: nowIso,
          email,
        });
        matched.push({ extension: ext, email, profile_id: profId });
      }

      // Run updates in parallel batches of 25
      for (let i = 0; i < updates.length; i += 25) {
        const chunk = updates.slice(i, i + 25);
        await Promise.all(chunk.map(({ id, email: _e, ...patch }) =>
          admin.from("planipret_profiles").update(patch).eq("id", id)
        ));
      }

      // ─── sync_all: kick off CDR backfill in background, respond immediately ───
      if (action === "sync_all") {
        const bg = (async () => {
          try {
            const end = new Date().toISOString();
            const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
            const qs = `start-time=${encodeURIComponent(start)}&end-time=${encodeURIComponent(end)}`;
            // Try canonical /cdrs?domain= first, then /domains/{D}/cdrs
            let cdrsRes = await nsFetchAllPaginated(`/cdrs?domain=${D}&${qs}`, 200, 50);
            if (!cdrsRes.data?.length) {
              cdrsRes = await nsFetchAllPaginated(`/domains/${D}/cdrs?${qs}`, 200, 50);
            }
            const { data: profs } = await admin
              .from("planipret_profiles").select("id,ns_extension,extension").eq("organization_id", PLANIPRET_ORG_ID);
            const extToUser = new Map<string, string>();
            for (const p of (profs ?? []) as any[]) {
              const ext = String(p.ns_extension ?? p.extension ?? "").trim();
              if (ext) extToUser.set(ext, p.id);
            }
            const rows: any[] = [];
            for (const c of cdrsRes.data) {
              const ns_call_id = String(c?.id ?? c?.["call-id"] ?? c?.cdr_id ?? c?.["orig-callid"] ?? "").trim();
              if (!ns_call_id) continue;
              const ext = String(c?.user ?? c?.["orig-user"] ?? c?.["term-user"] ?? c?.extension ?? "").trim();
              const started = c?.["time-start"] ?? c?.["start-time"] ?? c?.started_at ?? null;
              const answered = c?.["time-answer"] ?? c?.["answer-time"] ?? null;
              const ended = c?.["time-release"] ?? c?.["end-time"] ?? null;
              const dur = Number(c?.duration ?? c?.["time-talking"] ?? 0) || 0;
              rows.push({
                user_id: extToUser.get(ext) ?? null,
                organization_id: PLANIPRET_ORG_ID,
                ns_call_id, ns_domain: domain, extension: ext || null,
                direction: pickDirection(c),
                status: String(c?.["release-text"] ?? c?.disposition ?? "completed").toLowerCase(),
                from_number: c?.["orig-from-uri"] ?? c?.from ?? c?.["from-user"] ?? null,
                from_name: c?.["orig-from-name"] ?? c?.from_name ?? null,
                to_number: c?.["term-to-uri"] ?? c?.to ?? c?.["to-user"] ?? null,
                to_name: c?.["term-to-name"] ?? c?.to_name ?? null,
                started_at: started ? new Date(started).toISOString() : null,
                answered_at: answered ? new Date(answered).toISOString() : null,
                ended_at: ended ? new Date(ended).toISOString() : null,
                duration_seconds: dur, metadata: c,
              });
            }
            let upserted = 0;
            const errs: string[] = [];
            for (let i = 0; i < rows.length; i += 200) {
              const chunk = rows.slice(i, i + 200);
              const { error } = await admin.from("planipret_phone_calls").upsert(chunk, { onConflict: "ns_call_id", ignoreDuplicates: false });
              if (error) errs.push(error.message);
              else upserted += chunk.length;
            }
            console.log(`[ns-live-test] CDR backfill done: fetched=${cdrsRes.data.length} rows=${rows.length} upserted=${upserted} errors=${JSON.stringify(errs)}`);
          } catch (e) {
            console.error(`[ns-live-test] CDR backfill error:`, (e as Error).message);

          }
        })();
        // @ts-ignore EdgeRuntime is a Deno Deploy global
        if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
          // @ts-ignore
          (EdgeRuntime as any).waitUntil(bg);
        }
      }

      return json({
        ok: true,
        matched_count: matched.length,
        unmatched_count: unmatched.length,
        users_total: usersRes.data.length,
        users_pages: usersRes.pages,
        matched, unmatched,
        cdr: action === "sync_all" ? { status: "queued_in_background" } : undefined,
      });
    }

    // ─── ACTION: link ──────────────────────────────────────────────
    if (action === "link") {
      const { profile_id, extension, sip_username } = body ?? {};
      if (!profile_id || !extension) return json({ error: "profile_id and extension required" }, 400);
      const { error: upErr } = await admin
        .from("planipret_profiles")
        .update({
          ns_extension: String(extension),
          ns_domain: domain,
          ns_sip_username: sip_username ?? String(extension),
          ns_linked: true,
          ns_linked_at: new Date().toISOString(),
        })
        .eq("id", profile_id);
      if (upErr) return json({ error: upErr.message }, 500);
      return json({ ok: true });
    }

    // ─── ACTION: recordings_transcriptions_probe ───────────────────
    if (action === "recordings_transcriptions_probe") {
      const [cdrSample, recA, recB, recC, txA, txB] = await Promise.all([
        nsFetch(`/domains/${D}/cdrs?limit=5`),
        nsFetch(`/domains/${D}/recordings?limit=5`),
        nsFetch(`/domains/${D}/cdrs?type=recording&limit=5`),
        nsFetch(`/recordings?domain=${D}&limit=5`),
        nsFetch(`/domains/${D}/transcriptions?limit=5`),
        nsFetch(`/domains/${D}/cdrs?transcription=true&limit=5`),
      ]);
      const firstCdr = Array.isArray(cdrSample.data) ? cdrSample.data[0] : null;
      return json({
        domain,
        cdr_sample: {
          status: cdrSample.status,
          keys: firstCdr ? Object.keys(firstCdr) : [],
          first: firstCdr,
        },
        recordings: {
          "domains/{d}/recordings": { status: recA.status, first: Array.isArray(recA.data) ? recA.data[0] : recA.data },
          "domains/{d}/cdrs?type=recording": { status: recB.status, first: Array.isArray(recB.data) ? recB.data[0] : recB.data },
          "recordings?domain={d}": { status: recC.status, first: Array.isArray(recC.data) ? recC.data[0] : recC.data },
        },
        transcriptions: {
          "domains/{d}/transcriptions": { status: txA.status, first: Array.isArray(txA.data) ? txA.data[0] : txA.data },
          "domains/{d}/cdrs?transcription=true": { status: txB.status, first: Array.isArray(txB.data) ? txB.data[0] : txB.data },
        },
      });
    }

    // ─── ACTION: test ──────────────────────────────────────────────
    const tStart = performance.now();
    const [version, dom, usersAll, active_calls, cdrsAll, devicesAll, phone_numbers, registrationsAll, call_queues] =
      await Promise.all([
        nsFetch(`/version`),
        nsFetch(`/domains/${D}`),
        nsFetchAllPaginated(`/domains/${D}/users`),
        nsFetch(`/domains/${D}/calls`),
        nsFetchAllPaginated(`/domains/${D}/cdrs`, 200, 5), // sample up to 1000 for test
        nsFetchAllPaginated(`/domains/${D}/devices`),
        nsFetchWithFallback([
          `/domains/${D}/phonenumbers?limit=500`,
          `/domains/${D}/phone-numbers?limit=500`,
          `/domains/${D}/numbers?limit=500`,
        ]),
        nsFetchAllPaginated(`/domains/${D}/registrations`),
        nsFetchWithFallback([
          `/domains/${D}/callqueues?limit=500`,
          `/domains/${D}/call-queues?limit=500`,
          `/domains/${D}/queues?limit=500`,
        ]),
      ]);

    const usersData = usersAll.data;
    const results: Record<string, any> = {
      version,
      domain: { ...dom, data: Array.isArray(dom.data) ? dom.data[0] : dom.data },
      users: {
        success: usersAll.success,
        status: usersAll.status,
        latency_ms: usersAll.latency_ms,
        pages: usersAll.pages,
        count: usersData.length,
        data: usersData.map((u: any) => ({
          extension: u.user,
          name: `${u["name-first-name"] ?? ""} ${u["name-last-name"] ?? ""}`.trim() || u["display-name"] || u.user,
          email: u.email ?? "",
          scope: u["user-scope"] ?? "",
          status: u["account-status"] ?? "",
          active_calls: u["active-calls-total-current"] ?? 0,
          presence: u["user-presence-status"] ?? "",
          voicemail: u["voicemail-enabled"] ?? "",
          timezone: u["time-zone"] ?? "",
          login: u["login-username"] ?? "",
        })),
      },
      active_calls: { ...active_calls, count: Array.isArray(active_calls.data) ? active_calls.data.length : 0 },
      cdrs: { success: cdrsAll.success, status: cdrsAll.status, latency_ms: cdrsAll.latency_ms, count: cdrsAll.data.length, pages: cdrsAll.pages },
      devices: { success: devicesAll.success, status: devicesAll.status, latency_ms: devicesAll.latency_ms, count: devicesAll.data.length, pages: devicesAll.pages },
      phone_numbers: { ...phone_numbers, count: Array.isArray(phone_numbers.data) ? phone_numbers.data.length : 0 },
      registrations: { success: registrationsAll.success, status: registrationsAll.status, latency_ms: registrationsAll.latency_ms, count: registrationsAll.data.length, data: registrationsAll.data, pages: registrationsAll.pages },
      call_queues: { ...call_queues, count: Array.isArray(call_queues.data) ? call_queues.data.length : 0 },
    };

    const total_latency_ms = Math.round(performance.now() - tStart);
    const passed = Object.values(results).filter((r: any) => r.success).length;
    const failed = Object.values(results).filter((r: any) => !r.success).length;

    return json({
      summary: {
        total_tests: Object.keys(results).length,
        passed, failed,
        domain, base_url: NS_API_BASE_URL,
        total_latency_ms,
        tested_at: new Date().toISOString(),
      },
      results,
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
