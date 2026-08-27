/**
 * pp-did-assign — assignation et RE-SYNCHRONISATION ciblée d'un DID.
 *
 * Actions :
 *   verify      { e164?, extension? }  — lecture seule : recharge la config de
 *                 routage depuis NetSapiens et vérifie que la destination
 *                 correspond bien au bon `user_XXXX`. Sans `e164`, vérifie
 *                 tous les numéros assignés dans le portail.
 *   assign      { e164, extension }    — écrit le routage d'UN numéro (payload
 *                 complet + relecture obligatoire), met à jour le miroir DB.
 *   auto_assign { extension }          — choisit le premier numéro disponible
 *                 et l'assigne au poste (utilisé à la création d'un poste).
 *
 * Portée : un numéro à la fois. Les réécritures en masse restent interdites.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requirePlanipretAdmin } from "../_shared/ns-broker.ts";
import {
  NS_DEFAULT_DOMAIN,
  assignDidToExtension,
  e164Of,
  pbxNumberId,
  verifyDidRouting,
  listLiveExtensions,
  listLiveDids,
  releaseDid,
} from "../_shared/pp-did-routing.ts";

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    let isService = !!SERVICE_KEY && authHeader === `Bearer ${SERVICE_KEY}`;

    // Jeton d'opération temporaire (maintenance) stocké en base et expirable.
    const opsToken = req.headers.get("x-ops-token") ?? "";
    if (!isService && opsToken) {
      const { data: cfg } = await db
        .from("planipret_integration_config")
        .select("config_data, is_enabled")
        .eq("integration_key", "did_release_ops")
        .maybeSingle();
      const stored = String((cfg as any)?.config_data?.token ?? "");
      const exp = Date.parse(String((cfg as any)?.config_data?.expires_at ?? ""));
      if ((cfg as any)?.is_enabled && stored && stored === opsToken && Number.isFinite(exp) && exp > Date.now()) {
        isService = true;
      }
    }

    let actorId: string | null = null;
    let actorEmail: string | null = null;
    if (!isService) {
      const auth = await requirePlanipretAdmin(req);
      if ("error" in auth) return auth.error;
      actorId = (auth as any)?.profile?.user_id ?? (auth as any)?.user?.id ?? null;
      actorEmail = (auth as any)?.profile?.email ?? (auth as any)?.user?.email ?? null;
    }


    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "verify");
    const domain = String(body?.domain ?? NS_DEFAULT_DOMAIN);


    /* ---------------- verify (re-synchronisation lecture seule) ---------------- */
    if (action === "verify") {
      const single = String(body?.e164 ?? body?.phone_number ?? "").trim();
      let targets: { pn: string; ext: string | null }[] = [];

      if (single) {
        let ext = String(body?.extension ?? "").trim() || null;
        if (!ext) {
          const { data: row } = await db
            .from("planipret_did_assignments")
            .select("extension")
            .eq("phone_number_digits", pbxNumberId(single))
            .maybeSingle();
          ext = (row as any)?.extension ?? null;
        }
        targets = [{ pn: pbxNumberId(single), ext }];
      } else {
        const { data: rows } = await db
          .from("planipret_did_assignments")
          .select("phone_number_digits, phone_number_e164, extension")
          .eq("domain", domain)
          .eq("status", "assigned")
          .order("phone_number_digits")
          .limit(Math.min(Number(body?.limit ?? 60), 120));
        targets = (rows ?? []).map((r: any) => ({
          pn: pbxNumberId(r.phone_number_digits || r.phone_number_e164),
          ext: r.extension ?? null,
        }));
      }

      const results = [];
      for (const t of targets) {
        const v = await verifyDidRouting(domain, t.pn, t.ext);
        results.push({ e164: e164Of(t.pn), ...v });
      }

      const drift = results.filter((r) => !r.matches);
      if (results.length) {
        await db.from("planipret_did_routing_snapshots").insert(
          results.map((r) => ({
            domain,
            phone_number: r.phone_number,
            destination_user: r.live.destination_user,
            dial_rule_application: r.live.dial_rule_application,
            dial_rule_parameter: r.live.dial_rule_parameter,
            description: r.live.description,
            enabled: r.live.enabled,
            source: isService ? "cron" : "admin_resync",
          })),
        );
      }

      return json({
        success: true,
        action,
        domain,
        checked: results.length,
        matching: results.length - drift.length,
        drift_count: drift.length,
        verdict: drift.length ? "fail" : "ok",
        summary: drift.length
          ? `${drift.length} numéro(s) sur ${results.length} ne pointent pas vers le bon poste.`
          : `Les ${results.length} numéro(s) vérifiés pointent vers le bon user_XXXX.`,
        results,
      });
    }

    /* ---------------- assign / auto_assign (écriture ciblée) ---------------- */
    if (action === "assign" || action === "auto_assign") {
      const extension = String(body?.extension ?? "").trim();
      if (!/^[0-9]{2,10}$/.test(extension)) {
        return json({ success: false, error: "extension_invalide" }, 400);
      }

      let e164 = String(body?.e164 ?? body?.phone_number ?? "").trim();

      if (action === "auto_assign") {
        // Déjà un numéro pour ce poste ? On ne double pas.
        const { data: existing } = await db
          .from("planipret_did_assignments")
          .select("phone_number_e164")
          .eq("domain", domain)
          .eq("extension", extension)
          .eq("status", "assigned")
          .maybeSingle();
        if (existing) {
          return json({
            success: true, action, skipped: "already_assigned",
            e164: (existing as any).phone_number_e164, extension,
          });
        }
        if (!e164) {
          const { data: free } = await db
            .from("planipret_did_assignments")
            .select("phone_number_e164")
            .eq("domain", domain)
            .eq("status", "available")
            .is("extension", null)
            .order("phone_number_digits")
            .limit(1)
            .maybeSingle();
          e164 = String((free as any)?.phone_number_e164 ?? "");
        }
        if (!e164) {
          return json({
            success: false, action, extension,
            error: "no_available_did",
            diagnostic: "Aucun numéro disponible dans l'inventaire : ajouter des DID avant de créer d'autres postes.",
          }, 409);
        }
      }

      if (!e164) return json({ success: false, error: "e164_requis" }, 400);

      const result = await assignDidToExtension(domain, e164, extension);

      if (result.verified) {
        const { data: prof } = await db
          .from("planipret_profiles")
          .select("full_name")
          .eq("extension", extension)
          .maybeSingle();
        await db.from("planipret_did_assignments")
          .update({
            status: "assigned",
            extension,
            display_name: (prof as any)?.full_name ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("domain", domain)
          .eq("phone_number_digits", result.phone_number);
      }

      await db.from("planipret_did_routing_snapshots").insert({
        domain,
        phone_number: result.phone_number,
        destination_user: result.live.destination_user,
        dial_rule_application: result.live.dial_rule_application,
        dial_rule_parameter: result.live.dial_rule_parameter,
        description: result.live.description,
        enabled: result.live.enabled,
        source: isService ? "auto_assign" : "admin_assign",
      });

      return json({
        success: result.verified,
        action,
        domain,
        e164: e164Of(result.phone_number),
        extension,
        verified: result.verified,
        diagnostic: result.diagnostic,
        live: result.live,
      }, result.verified ? 200 : 502);
    }

    /* -------- release_orphans : rendre disponibles les DID sans courtier -------- */
    if (action === "release_orphans" || action === "release") {
      const dryRun = body?.dry_run !== false;
      const limit = Math.min(Number(body?.limit ?? 400), 500);

      const liveExts = await listLiveExtensions(domain);

      // Postes rattachés à un vrai courtier (profil + compte utilisateur).
      const { data: profs } = await db
        .from("planipret_profiles")
        .select("extension, user_id, full_name, email")
        .not("extension", "is", null);
      const brokerExts = new Set(
        (profs ?? [])
          .filter((p: any) => !!p.user_id && (liveExts.size === 0 || liveExts.has(String(p.extension))))
          .map((p: any) => String(p.extension)),
      );
      const brokerByExt = new Map<string, { name: string | null; user_id: string | null }>(
        (profs ?? []).map((p: any) => [
          String(p.extension),
          { name: p.full_name ?? p.email ?? null, user_id: p.user_id ?? null },
        ]),
      );
      const jobId = crypto.randomUUID();
      const auditRows: any[] = [];


      const single = String(body?.e164 ?? body?.phone_number ?? "").trim();
      let query = db
        .from("planipret_did_assignments")
        .select("phone_number_e164, phone_number_digits, extension, status, display_name")
        .eq("domain", domain)
        .order("phone_number_digits")
        .limit(limit);
      if (single) query = query.eq("phone_number_digits", pbxNumberId(single));
      const { data: rows } = await query;

      // Source de vérité : le routage RÉEL du PBX (le miroir DB peut être périmé).
      const liveDids = await listLiveDids(domain);

      // Orphelin = destination vide, ou poste qui n'appartient à aucun courtier
      // réel / n'existe plus dans le PBX.
      const orphans = (rows ?? [])
        .map((r: any) => {
          const pn = pbxNumberId(r.phone_number_digits || r.phone_number_e164);
          const liveExt = (liveDids.get(pn) ?? "").split("@")[0].trim();
          return { ...r, pn, liveExt, known: liveDids.has(pn) };
        })
        .filter((r: any) => {
          if (!r.known) return false;                 // numéro absent du PBX : on ne touche pas
          if (!r.liveExt) return r.status !== "available" || !!r.extension; // déjà libre : rien à faire
          return !brokerExts.has(r.liveExt);          // routé vers un poste sans courtier réel
        });

      const results: any[] = [];
      const source = isService ? "cron_release" : "admin_release";
      for (const r of orphans as any[]) {
        const pn = r.pn as string;
        const prevExt = r.liveExt || r.extension || null;
        const prevBroker = prevExt ? brokerByExt.get(String(prevExt)) : undefined;
        const reason = r.liveExt ? "poste sans courtier actif" : "routage vide";
        const auditBase = {
          job_id: jobId,
          domain,
          phone_number: pn,
          phone_number_e164: e164Of(pn),
          previous_extension: prevExt,
          previous_broker_name: prevBroker?.name ?? r.display_name ?? null,
          previous_broker_user_id: prevBroker?.user_id ?? null,
          reason,
          dry_run: dryRun,
          triggered_by: actorId,
          triggered_by_email: actorEmail,
          source,
        };

        if (dryRun) {
          auditRows.push({ ...auditBase, success: false, error_message: "simulation" });
          results.push({ e164: e164Of(pn), previous_extension: prevExt, reason, released: null });
          continue;
        }

        let rel: any;
        let failure: string | null = null;
        try {
          rel = r.liveExt
            ? await releaseDid(domain, pn)
            : { released: true, phone_number: pn, write_status: 0, live: { destination_user: null, dial_rule_application: null, dial_rule_parameter: null, description: null, enabled: null } };
        } catch (err) {
          failure = String((err as Error)?.message ?? err);
          rel = { released: false, write_status: null, live: {} };
        }

        if (rel.released) {
          await db.from("planipret_did_assignments")
            .update({
              status: "available",
              extension: null,
              display_name: null,
              callerid_name: null,
              updated_at: new Date().toISOString(),
            })
            .eq("domain", domain)
            .eq("phone_number_digits", pn);
        }
        await db.from("planipret_did_routing_snapshots").insert({
          domain,
          phone_number: pn,
          destination_user: rel.live?.destination_user ?? null,
          dial_rule_application: rel.live?.dial_rule_application ?? null,
          dial_rule_parameter: rel.live?.dial_rule_parameter ?? null,
          description: rel.live?.description ?? null,
          enabled: rel.live?.enabled ?? null,
          source,
        });
        auditRows.push({
          ...auditBase,
          success: !!rel.released,
          write_status: typeof rel.write_status === "number" ? rel.write_status : null,
          error_message: failure ?? (rel.released ? null : "écriture PBX refusée"),
        });
        results.push({
          e164: e164Of(pn),
          previous_extension: prevExt,
          previous_broker_name: auditBase.previous_broker_name,
          reason,
          released: rel.released,
          write_status: rel.write_status,
          error: failure,
        });
      }

      // Journal d'audit (best-effort, ne bloque jamais la libération).
      if (auditRows.length) {
        for (let i = 0; i < auditRows.length; i += 200) {
          const { error: auditErr } = await db
            .from("planipret_did_release_audit")
            .insert(auditRows.slice(i, i + 200));
          if (auditErr) console.error("[pp-did-assign] audit insert failed", auditErr.message);
        }
      }

      const freed = results.filter((r) => r.released).length;
      return json({
        success: true,
        action: "release_orphans",
        domain,
        job_id: jobId,
        dry_run: dryRun,
        live_extensions: liveExts.size,
        broker_extensions: brokerExts.size,
        candidates: orphans.length,
        released: freed,
        failed: dryRun ? 0 : orphans.length - freed,
        summary: dryRun
          ? `${orphans.length} numéro(s) ne pointent vers aucun courtier réel (simulation, rien de modifié).`
          : `${freed}/${orphans.length} numéro(s) libérés et remis en « disponible » pour réassignation.`,
        results,
      });

    }

    return json({ success: false, error: `unknown action ${action}` }, 400);
  } catch (e) {
    return json({ success: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
