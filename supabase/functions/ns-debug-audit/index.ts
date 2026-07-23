// ns-debug-audit — Diagnoses the 201-vs-355 broker discrepancy and probes
// NS-API feature availability (CDRs, SMS, voicemails, recordings, transcriptions).
//
// Admin-only. Two modes:
//   POST { mode: "count" }       -> A/B/C/D number breakdown for /admin/debug
//   POST { mode: "capabilities" } -> Update planipret_ns_server_capabilities rows
//
// Both modes also return the raw pagination probe so the UI can show exactly
// which signal the server is honoring.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { nsFetchAll, nsGetServerVersion, nsProbe, NS_API_KEY } from "../_shared/ns-pagination.ts";

const AVA_ORG_ID = "17d6507f-a9ca-409d-8e49-371d50332615";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normEmail(v: unknown) { return String(v ?? "").toLowerCase().trim(); }
function normExt(v: unknown) { return String(v ?? "").trim(); }

function userExt(u: any) {
  return normExt(u?.user ?? u?.extension ?? u?.subscriber_login ?? u?.user_id ?? u?.id);
}
function userEmail(u: any) {
  return normEmail(u?.email ?? u?.email_address ?? u?.["email-address"]);
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: json({ error: "Unauthorized" }, 401) };
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return { error: json({ error: "Unauthorized" }, 401) };
  const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: userData.user.id });
  if (isAdmin !== true) return { error: json({ error: "Forbidden" }, 403) };
  return { admin, user: userData.user };
}

async function runCountAudit(admin: ReturnType<typeof createClient>, domain: string) {
  // A — direct portal count
  const { count: profilesCount } = await admin
    .from("planipret_profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", AVA_ORG_ID);

  // B — full NS-API paginated count
  const D = encodeURIComponent(domain);
  const nsRes = await nsFetchAll<any>(`/domains/${D}/users`, { pageSize: 200, maxPages: 50 });
  const nsExts = new Set<string>();
  const nsEmails = new Set<string>();
  for (const u of nsRes.items) {
    const e = userExt(u); if (e) nsExts.add(e);
    const em = userEmail(u); if (em) nsEmails.add(em);
  }

  // C — diff against portal profiles
  const { data: profiles } = await admin
    .from("planipret_profiles")
    .select("user_id, email, extension, ns_extension")
    .eq("organization_id", AVA_ORG_ID);
  const profileExts = new Set<string>();
  const profileEmails = new Set<string>();
  for (const p of profiles ?? []) {
    const e = normExt(p.extension ?? p.ns_extension); if (e) profileExts.add(e);
    const em = normEmail(p.email); if (em) profileEmails.add(em);
  }
  const nsNotInPortal: string[] = [];
  for (const e of nsExts) if (!profileExts.has(e)) nsNotInPortal.push(e);
  const portalNotInNs: string[] = [];
  for (const e of profileExts) if (!nsExts.has(e)) portalNotInNs.push(e);

  return {
    a_portalCount: profilesCount ?? 0,
    b_nsApiCount: nsRes.items.length,
    b_paginationSignal: nsRes.paginationSignal,
    b_totalFromHeader: nsRes.totalFromHeader,
    b_pages: nsRes.pages,
    b_warning: nsRes.warning ?? null,
    c_nsExtensionsMissingFromPortal: nsNotInPortal,
    c_portalProfilesMissingFromNs: portalNotInNs,
    c_nsExtensionsMissingFromPortalCount: nsNotInPortal.length,
    c_portalProfilesMissingFromNsCount: portalNotInNs.length,
  };
}

type ProbeFeature = {
  feature: string;
  endpoint: string;
  status: "ok" | "empty" | "unavailable" | "error";
  detail: string;
  sample_count: number;
};

async function pickFirstBrokerExt(domain: string): Promise<string | null> {
  const D = encodeURIComponent(domain);
  const res = await nsFetchAll<any>(`/domains/${D}/users`, { pageSize: 20, maxPages: 1 });
  for (const u of res.items) { const e = userExt(u); if (e && !/^\d{7,}$/.test(e)) return e; }
  return null;
}

async function runCapabilities(admin: ReturnType<typeof createClient>, domain: string): Promise<{ version: string | null; features: ProbeFeature[] }> {
  const D = encodeURIComponent(domain);
  const ver = await nsGetServerVersion();
  const ext = await pickFirstBrokerExt(domain);
  const E = ext ? encodeURIComponent(ext) : "";

  const probes: ProbeFeature[] = [];

  const cdrPath = `/domains/${D}/cdrs?limit=1&start=1`;
  const cdr = await nsProbe(cdrPath);
  probes.push({
    feature: "cdrs",
    endpoint: `GET /domains/${domain}/cdrs`,
    status: cdr.ok ? (cdr.count > 0 ? "ok" : "empty") : "unavailable",
    detail: cdr.ok ? `HTTP 200 — ${cdr.count} échantillon(s) sur la dernière sonde` : `HTTP ${cdr.status}`,
    sample_count: cdr.count,
  });

  if (E) {
    const sms = await nsProbe(`/domains/${D}/users/${E}/messagesessions?limit=1&start=1`);
    probes.push({
      feature: "messages",
      endpoint: `GET /domains/${domain}/users/{user}/messagesessions`,
      status: sms.ok ? (sms.count > 0 ? "ok" : "empty") : "unavailable",
      detail: sms.ok ? `HTTP 200 — sondage sur ${ext}` : `HTTP ${sms.status}`,
      sample_count: sms.count,
    });

    const vm = await nsProbe(`/domains/${D}/users/${E}/voicemails/inbox?limit=1&start=1`);
    probes.push({
      feature: "voicemails",
      endpoint: `GET /domains/${domain}/users/{user}/voicemails/inbox`,
      status: vm.ok ? (vm.count > 0 ? "ok" : "empty") : "unavailable",
      detail: vm.ok ? `HTTP 200 — sondage sur ${ext}` : `HTTP ${vm.status}`,
      sample_count: vm.count,
    });

    const rec = await nsProbe(`/domains/${D}/users/${E}/recordings?limit=1&start=1`);
    probes.push({
      feature: "recordings",
      endpoint: `GET /domains/${domain}/users/{user}/recordings`,
      status: rec.ok ? (rec.count > 0 ? "ok" : "empty") : "unavailable",
      detail: rec.ok
        ? `HTTP 200 — sondage sur ${ext}`
        : `HTTP ${rec.status} — les enregistrements via API nécessitent généralement NetSapiens v45+ (serveur actuel : ${ver.version ?? "inconnu"})`,
      sample_count: rec.count,
    });
  } else {
    for (const f of ["messages", "voicemails", "recordings"]) {
      probes.push({
        feature: f, endpoint: "n/a", status: "unavailable",
        detail: "Aucune extension cible trouvée pour sonder cette fonctionnalité.",
        sample_count: 0,
      });
    }
  }

  // Transcriptions — best-effort detection on CDR record fields
  const sampleCdr = await nsProbe(`/domains/${D}/cdrs?limit=5&start=1`);
  const sample = Array.isArray(sampleCdr.data) ? sampleCdr.data : (sampleCdr.data?.cdrs ?? sampleCdr.data?.data ?? []);
  const hasTranscriptField = (sample ?? []).some((c: any) =>
    c?.transcription_text || c?.transcript || c?.["transcription-text"] || c?.recording_transcript,
  );
  probes.push({
    feature: "transcriptions",
    endpoint: "champ `transcription_text` sur le CDR ou voicemail",
    status: hasTranscriptField ? "ok" : "unavailable",
    detail: hasTranscriptField
      ? "Champ de transcription détecté dans les CDR — la transcription est activée pour ce domaine."
      : "Aucun champ de transcription détecté. Activer PORTAL_VOICE_TRANSCRIPTION_SENTIMENT côté serveur (Clinton).",
    sample_count: hasTranscriptField ? 1 : 0,
  });

  // Persist
  for (const p of probes) {
    await admin.from("planipret_ns_server_capabilities").upsert({
      domain, feature: p.feature, status: p.status,
      detail: p.detail, endpoint: p.endpoint, sample_count: p.sample_count,
      last_probed_at: new Date().toISOString(),
      metadata: { server_version: ver.version },
    }, { onConflict: "domain,feature" });
  }

  return { version: ver.version, features: probes };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!NS_API_KEY) return json({ error: "NS_API_KEY missing in backend secrets" }, 500);
    const auth = await requireAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin } = auth;

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const mode = String(body.mode ?? "count");
    const domain = String(body.domain ?? NS_DEFAULT_DOMAIN);

    if (mode === "capabilities") {
      const caps = await runCapabilities(admin, domain);
      return json({ ok: true, mode, domain, ...caps });
    }

    const counts = await runCountAudit(admin, domain);
    return json({ ok: true, mode: "count", domain, ...counts });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
