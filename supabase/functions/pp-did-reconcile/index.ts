// pp-did-reconcile — LECTURE SEULE.
// Compare les DID NetSapiens (source de vérité du système téléphonique) avec
// les DID/afficheurs déclarés côté Maestro pour chaque courtier, et signale
// les écarts d'assignation. N'écrit JAMAIS sur NetSapiens (voir la contrainte
// « No automated DID writes »).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { nsFetch } from "../_shared/planipret-ns.ts";
import { adminClient } from "../_shared/maestro.ts";
import { getMaestroTelecomConfig, isMaestroTelecomConfigured, maestroTelecomFetch } from "../_shared/maestro-telecom.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({} as any));
    const domain = String(body?.domain ?? "planipret.ca");
    const onlyMismatch = body?.only_mismatch !== false;

    // --- Autorisation : admin Planiprêt uniquement (ou appel service-role) ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceRole = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "\u0000");
    if (!isServiceRole) {
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ error: "unauthorized" }, 401);
      const { data: ok } = await admin.rpc("is_planipret_admin", { _user_id: u.user.id });
      if (!ok) return json({ error: "forbidden" }, 403);
    }

    // --- 1. DID NetSapiens (lecture) ---------------------------------------
    const nsRes = await nsFetch(`/domains/${encodeURIComponent(domain)}/phonenumbers?limit=2000`, { method: "GET" }, { functionName: "pp-did-reconcile" });
    const nsText = await nsRes.text();
    let nsList: any[] = [];
    try { const p = JSON.parse(nsText); nsList = Array.isArray(p) ? p : (p?.data ?? []); } catch { /* ignore */ }

    const nsByExt = new Map<string, string[]>();
    const nsByDid = new Map<string, string>();
    for (const row of nsList) {
      const did = digits(row?.phonenumber ?? row?.["phonenumber"] ?? row?.number);
      const ext = String(row?.["dial-rule-translation-destination-user"] ?? row?.["dial-rule-parameter"] ?? "")
        .split("@")[0].trim();
      if (!did) continue;
      if (ext) {
        nsByDid.set(did, ext);
        nsByExt.set(ext, [...(nsByExt.get(ext) ?? []), did]);
      } else {
        nsByDid.set(did, "");
      }
    }

    // --- 2. Courtiers + DID Maestro ----------------------------------------
    const { data: profiles } = await admin
      .from("planipret_profiles")
      .select("user_id, email, full_name, extension, ns_extension, maestro_broker_id, maestro_connected")
      .not("maestro_broker_id", "is", null);

    const cfg = await getMaestroTelecomConfig(admin);
    const cfgOk = isMaestroTelecomConfigured(cfg);
    const rows: any[] = [];

    for (const p of profiles ?? []) {
      const ext = String(p.extension ?? p.ns_extension ?? "").split("@")[0].trim();
      const nsDids = ext ? (nsByExt.get(ext) ?? []) : [];
      let maestroDid = "";
      let maestroSmsDid = "";
      let maestroExt = "";
      let maestroStatus = "not_checked";

      if (cfgOk) {
        try {
          const r = await maestroTelecomFetch(cfg, `/users/${encodeURIComponent(String(p.maestro_broker_id))}/sip`, { method: "GET" });
          maestroStatus = r.ok ? "ok" : `http_${r.status}`;
          const pu = ((r.data as any)?.sip?.provider_user ?? {}) as any;
          maestroDid = digits(pu.phone_number);
          maestroSmsDid = digits(pu.sms_number ?? pu.phone_number);
          maestroExt = String(pu.provider_external_user_id ?? "").trim();
        } catch (e) {
          maestroStatus = `error:${String((e as Error).message).slice(0, 60)}`;
        }
      }

      const match = !!maestroSmsDid && nsDids.includes(maestroSmsDid);
      const extMatch = !!ext && !!maestroExt && ext === maestroExt;
      const row = {
        email: p.email,
        name: p.full_name,
        extension: ext || null,
        maestro_broker_id: p.maestro_broker_id,
        maestro_extension: maestroExt || null,
        ns_dids: nsDids,
        maestro_did: maestroDid || null,
        maestro_sms_did: maestroSmsDid || null,
        ns_did_of_maestro_ext: maestroExt ? (nsByExt.get(maestroExt) ?? []) : [],
        maestro_status: maestroStatus,
        status: !ext
          ? "no_extension"
          : nsDids.length === 0
            ? "no_ns_did"
            : !maestroSmsDid
              ? "no_maestro_did"
              : match && extMatch
                ? "match"
                : !extMatch
                  ? "extension_mismatch"
                  : "did_mismatch",
      };
      if (!onlyMismatch || row.status !== "match") rows.push(row);
    }

    const summary = rows.reduce((a: Record<string, number>, r) => {
      a[r.status] = (a[r.status] ?? 0) + 1;
      return a;
    }, {});
    summary.match = (profiles?.length ?? 0) - rows.filter((r) => r.status !== "match").length;

    // DID NetSapiens sans extension assignée (routage cassé côté PBX)
    const orphanNsDids = [...nsByDid.entries()].filter(([, ext]) => !ext).map(([d]) => d);

    return json({
      ok: true,
      domain,
      ns_did_count: nsByDid.size,
      broker_count: profiles?.length ?? 0,
      summary,
      orphan_ns_dids: orphanNsDids,
      rows,
    });
  } catch (e) {
    console.error("[pp-did-reconcile]", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
