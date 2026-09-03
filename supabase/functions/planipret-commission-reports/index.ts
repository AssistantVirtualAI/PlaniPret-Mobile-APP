// planipret-commission-reports — secure gateway to the OFFICIAL Planiprêt
// Commission Reports API for the mobile app and the AVA tools.
//
// Actions: deposits | agents | institutions | summary | preference
// Read-only against Maestro. The broker's OAuth bearer NEVER leaves the server.
//
// Scoping rules:
//   - role "broker": always forced to their own resolved Maestro users_id.
//   - role "admin":  may pass an explicit users_id, or omit it for all brokers.
// Any other role is rejected with 403.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  getMaestroOAuthEnv,
  getUserMaestroAccessToken,
  fetchMaestroUserProfile,
  extractMaestroBrokerId,
} from "../_shared/maestro-oauth.ts";
import {
  normalizeFilters,
  buildDepositQuery,
  commissionGet,
  summarize,
  institutionLabel,
  type CommissionDepositRow,
} from "../_shared/commission-reports.ts";
import { getMaestroAdminAccessToken } from "../_shared/maestro-admin-token.ts";

const json = (body: unknown, status = 200, cid?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(cid ? { "X-Correlation-Id": cid } : {}),
    },
  });

const SUMMARY_MAX_PAGES = 10; // 10 × 200 = 2000 rows max per summary

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cid = crypto.randomUUID().slice(0, 8);
  const log = (...a: unknown[]) => console.log(`[commission-reports][${cid}]`, ...a);

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cid);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // ---- Auth ----------------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "unauthorized", message: "Authentification requise." }, 401, cid);
    const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
    const user = userRes?.user;
    if (userErr || !user) return json({ error: "unauthorized", message: "Session invalide." }, 401, cid);

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select("id, user_id, role, full_name, email, maestro_broker_id, maestro_telecom_user_id, maestro_connected")
      .or(`user_id.eq.${user.id},id.eq.${user.id}`)
      .maybeSingle();

    if (!profile) return json({ error: "forbidden", message: "Profil Planiprêt introuvable." }, 403, cid);
    const role = String(profile.role ?? "");
    if (role !== "admin" && role !== "broker") {
      return json({ error: "forbidden", message: "Accès aux commissions réservé aux courtiers et administrateurs." }, 403, cid);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "summary");

    // ---- Preference (no Maestro call needed) ----------------------------
    if (action === "preference") {
      const { data: settings } = await admin
        .from("planipret_settings")
        .select("id, preferences")
        .eq("user_id", user.id)
        .maybeSingle();
      const prefs = (settings?.preferences ?? {}) as Record<string, unknown>;

      if (body?.set === undefined) {
        return json({ ok: true, ava_include_commissions: prefs.ava_include_commissions === true }, 200, cid);
      }
      const next = body.set === true;
      const merged = { ...prefs, ava_include_commissions: next };
      if (settings?.id) {
        await admin.from("planipret_settings").update({ preferences: merged }).eq("id", settings.id);
      } else {
        await admin.from("planipret_settings").insert({ user_id: user.id, preferences: merged });
      }
      log("preference ava_include_commissions =", next);
      return json({ ok: true, ava_include_commissions: next }, 200, cid);
    }

    // ---- Maestro token + identity ---------------------------------------
    const ownToken = await getUserMaestroAccessToken(admin, user.id);
    const firmToken = role === "admin" ? await getMaestroAdminAccessToken() : { token: null, source: "none" as const };
    const token = firmToken.token ?? ownToken;
    if (!token) {
      return json({
        error: "maestro_not_connected",
        message: "Votre compte Maestro n'est pas connecté. Reconnectez-le dans Réglages › Connexions.",
      }, 409, cid);
    }

    let resolvedUsersId: string | null =
      profile.maestro_broker_id != null ? String(profile.maestro_broker_id) : null;
    if (!resolvedUsersId) {
      const env = getMaestroOAuthEnv();
      const identity = await fetchMaestroUserProfile(env, token);
      resolvedUsersId = extractMaestroBrokerId(identity);
      if (resolvedUsersId) {
        await admin.from("planipret_profiles")
          .update({ maestro_broker_id: resolvedUsersId })
          .eq("id", profile.id);
      }
    }

    // ---- Filters (allowlist) --------------------------------------------
    const { filters, errors } = normalizeFilters(body?.filters ?? body);
    if (Object.keys(errors).length) {
      return json({ error: "validation_error", fields: errors }, 422, cid);
    }

    // Broker scoping is server-enforced: they can never widen the scope.
    if (role === "broker") {
      if (!resolvedUsersId) {
        return json({
          error: "broker_id_unresolved",
          message: "Impossible de résoudre votre identifiant Maestro. Reconnectez votre compte Maestro.",
        }, 409, cid);
      }
      filters.users_id = resolvedUsersId;
    } else if (role === "admin" && !filters.users_id && resolvedUsersId) {
      // Un admin ne rapatrie jamais la firme entière par défaut : sans courtier
      // explicitement choisi, la portée reste son propre identifiant Maestro.
      filters.users_id = resolvedUsersId;
    }

    // ---- Institutions ----------------------------------------------------
    if (action === "institutions") {
      const r = await commissionGet("/api/main/financial-institutions", token, cid);
      if (!r.ok) return upstream(r, cid);
      const list = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
      return json({
        ok: true,
        institutions: list.map((i: any) => ({ id: i?.id ?? i?.financial_inst_id ?? null, label: institutionLabel(i) }))
          .filter((i: any) => i.id != null),
        correlation_id: cid,
      }, 200, cid);
    }

    // ---- Agents (admin: tous ; broker: soi-même + son équipe, filtré par Maestro) ----
    if (action === "agents") {
      const r = await commissionGet("/api/main/commissions/reports/agents", token, cid);
      if (!r.ok) return upstream(r, cid);
      const list = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
      const pick = (a: any) =>
        [a?.agent_name, a?.name, a?.full_name,
          [a?.first_name, a?.last_name].filter(Boolean).join(" ").trim(),
          a?.target_name, a?.email]
          .map((v: any) => (v == null ? "" : String(v).trim()))
          .find((v: string) => v.length > 0) ?? "—";
      let agents = list
        .map((a: any) => ({ users_id: a?.users_id ?? a?.agent_name_id ?? a?.id ?? null, name: pick(a) }))
        .filter((a: any) => a.users_id != null);
      // Défense en profondeur : un broker ne voit jamais un courtier hors de sa portée.
      if (role === "broker" && resolvedUsersId) {
        agents = agents.filter((a: any) => String(a.users_id) === String(resolvedUsersId));
        if (!agents.length) agents = [{ users_id: Number(resolvedUsersId), name: String(profile.full_name ?? "Moi") }];
      } else if (role === "admin") {
        // Maestro ne renvoie que le propriétaire du jeton : on complète avec
        // les courtiers Planiprêt dont l'identifiant Maestro est déjà résolu.
        const { data: locals } = await admin
          .from("planipret_profiles")
          .select("full_name, email, maestro_broker_id")
          .not("maestro_broker_id", "is", null)
          .limit(500);
        const seen = new Set(agents.map((a: any) => String(a.users_id)));
        for (const p of locals ?? []) {
          const id = String((p as any).maestro_broker_id);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          agents.push({ users_id: Number(id), name: String((p as any).full_name ?? (p as any).email ?? id) });
        }
        agents.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), "fr"));
      }
      return json({ ok: true, agents, correlation_id: cid }, 200, cid);
    }


    // ---- Source unique (aucun fan-out firme) ------------------------------
    // Volume oblige : on n'interroge jamais Maestro avec les jetons de tous les
    // courtiers. La portée est toujours UN courtier — soi-même par défaut, ou
    // celui explicitement sélectionné par un admin.
    type Src = { token: string; label: string; user_id: string | null };
    const failures: { broker: string; status: number; message: string }[] = [];
    let coverage = { connected: 1, total: 1 };

    async function collectSources(): Promise<Src[]> {
      const selected = filters.users_id ? String(filters.users_id) : null;
      const isOwn = !selected || (resolvedUsersId && selected === String(resolvedUsersId));

      if (isOwn) {
        return [{ token: ownToken ?? token, label: String(profile.full_name ?? profile.email ?? "moi"), user_id: user.id }];
      }

      // Admin qui consulte un autre courtier : jeton firme si disponible,
      // sinon le jeton personnel de CE courtier uniquement.
      if (firmToken.token) {
        return [{ token: firmToken.token, label: "Planiprêt", user_id: null }];
      }
      const { data: peer } = await admin
        .from("planipret_profiles")
        .select("id, user_id, full_name, email")
        .eq("maestro_broker_id", selected)
        .limit(1)
        .maybeSingle();
      const pid = (peer as any)?.user_id ?? (peer as any)?.id ?? null;
      const label = String((peer as any)?.full_name ?? (peer as any)?.email ?? selected);
      const t = pid ? await getUserMaestroAccessToken(admin, pid).catch(() => null) : null;
      if (!t) {
        failures.push({ broker: label, status: 409, message: "maestro_not_connected" });
        return [];
      }
      return [{ token: t, label, user_id: pid }];
    }

    /** Parcourt toutes les pages de dépôts pour un jeton donné. */
    async function fetchAllDeposits(src: Src, single: boolean) {
      const out: CommissionDepositRow[] = [];
      let page = 1, lastPage = 1, truncated = false, total = 0;
      // Maestro ne renvoie qu'un seul bucket par appel ("base" par défaut).
      // La commission brute = base + bonus + bonus2 + perform, donc on parcourt
      // les quatre buckets quand aucun type précis n'est demandé. Le volume de
      // prêt n'est conservé que sur la ligne "base" pour ne pas le compter 4x.
      const types = filters.commission_type ? [filters.commission_type] : ["base", "bonus", "bonus2", "perform"];
      for (const ctype of types) {
        page = 1;
        while (page <= SUMMARY_MAX_PAGES) {
          const qs = buildDepositQuery({ ...filters, commission_type: ctype, page, per_page: 200 });
          const r = await commissionGet(`/api/main/commissions/reports/deposits?${qs}`, src.token, cid);
          if (!r.ok) {
            if (single && ctype === "base") return { rows: out, truncated, total, fatal: r };
            if (ctype === "base") failures.push({ broker: src.label, status: r.status, message: String(r.data?.message ?? `HTTP ${r.status}`) });
            break;
          }
          const rows: CommissionDepositRow[] = Array.isArray(r.data?.data) ? r.data.data : [];
          for (const row of rows) {
            out.push({
              ...row,
              commission_type: (row as any).commission_type ?? ctype,
              loan_amt: ctype === "base" ? (row as any).loan_amt : 0,
              agent_name: (row as any).agent_name ?? src.label,
            } as CommissionDepositRow);
          }
          const meta = r.data?.meta ?? {};
          lastPage = Number(meta.last_page ?? 1);
          total += Number(meta.total ?? rows.length);
          if (page >= lastPage || rows.length === 0) break;
          page += 1;
        }
        if (page >= SUMMARY_MAX_PAGES && lastPage > SUMMARY_MAX_PAGES) truncated = true;
      }
      if (page >= SUMMARY_MAX_PAGES && lastPage > SUMMARY_MAX_PAGES) truncated = true;
      return { rows: out, truncated, total, fatal: null as any };
    }

    // ---- Deposits (agrégé pour les admins, passthrough sinon) -------------
    if (action === "deposits") {
      const sources = await collectSources();
      const single = sources.length === 1;
      const merged: CommissionDepositRow[] = [];
      let truncated = false;
      for (const src of sources) {
        const res = await fetchAllDeposits(src, single);
        if (res.fatal) return upstream(res.fatal, cid);
        merged.push(...res.rows);
        truncated = truncated || res.truncated;
      }
      merged.sort((a, b) => String(b.date_trans ?? "").localeCompare(String(a.date_trans ?? "")));
      const perPage = Number(filters.per_page ?? 50);
      const pageNo = Number(filters.page ?? 1);
      const slice = merged.slice((pageNo - 1) * perPage, pageNo * perPage);
      log("deposits", slice.length, "of", merged.length, "from", sources.length, "tokens");
      return json({
        ok: true,
        rows: slice,
        pagination: {
          page: pageNo,
          per_page: perPage,
          total: merged.length,
          last_page: Math.max(1, Math.ceil(merged.length / perPage)),
        },
        truncated,
        coverage,
        sources: { queried: sources.length, failed: failures.length, failures: failures.slice(0, 10) },
        scope: { role, users_id: filters.users_id ?? null, mode: sources.length > 1 ? "all_brokers" : "token_owner" },
        correlation_id: cid,
      }, 200, cid);
    }

    // ---- Par courtier (agrégat serveur sur toutes les pages) --------------
    if (action === "by_agent") {
      const buckets = new Map<string, {
        users_id: number | null; name: string; total: number; count: number; loan_volume: number;
      }>();
      let truncated = false;
      let scanned = 0;

      const sources = await collectSources();


      for (const src of sources) {
        let page = 1, lastPage = 1;
        while (page <= SUMMARY_MAX_PAGES) {
          const qs = buildDepositQuery({ ...filters, page, per_page: 200 });
          const r = await commissionGet(`/api/main/commissions/reports/deposits?${qs}`, src.token, cid);
          if (!r.ok) {
            // Un courtier en échec ne doit pas casser l'agrégat global.
            if (sources.length === 1) return upstream(r, cid);
            failures.push({ broker: src.label, status: r.status, message: String(r.data?.message ?? `HTTP ${r.status}`) });
            break;
          }
          const rows: CommissionDepositRow[] = Array.isArray(r.data?.data) ? r.data.data : [];
          for (const row of rows) {
            const id = row.agent_name_id ?? null;
            const name = String(row.agent_name ?? row.target_name ?? src.label ?? "—").trim() || "—";
            const key = id != null ? `id:${id}` : `n:${name.toLowerCase()}`;
            const b = buckets.get(key) ?? { users_id: id, name, total: 0, count: 0, loan_volume: 0 };
            b.total += num(row.amount);
            b.loan_volume += num(row.loan_amt);
            b.count += 1;
            buckets.set(key, b);
          }
          scanned += rows.length;
          const meta = r.data?.meta ?? {};
          lastPage = Number(meta.last_page ?? 1);
          if (page >= lastPage || rows.length === 0) break;
          page += 1;
        }
        if (page >= SUMMARY_MAX_PAGES && lastPage > SUMMARY_MAX_PAGES) truncated = true;
      }

      const agents = Array.from(buckets.values())
        .map((b) => ({ ...b, average: b.count ? b.total / b.count : 0 }))
        .sort((a, b) => b.total - a.total);

      log("by_agent", agents.length, "brokers over", scanned, "deposits from", sources.length, "tokens");
      return json({
        ok: true,
        agents,
        totals: {
          total: agents.reduce((s, a) => s + a.total, 0),
          count: agents.reduce((s, a) => s + a.count, 0),
          loan_volume: agents.reduce((s, a) => s + a.loan_volume, 0),
          brokers: agents.length,
        },
        truncated,
        scanned,
        coverage,
        sources: { queried: sources.length, failed: failures.length, failures: failures.slice(0, 10) },

        filters,
        scope: { role, users_id: filters.users_id ?? null, mode: sources.length > 1 ? "all_brokers" : "token_owner" },
        correlation_id: cid,
      }, 200, cid);
    }


    // ---- Summary (agrégat serveur, multi-courtiers pour les admins) -------
    if (action === "summary") {
      const sources = await collectSources();
      const single = sources.length === 1;
      const all: CommissionDepositRow[] = [];
      let truncated = false, total = 0;
      for (const src of sources) {
        const res = await fetchAllDeposits(src, single);
        if (res.fatal) return upstream(res.fatal, cid);
        all.push(...res.rows);
        truncated = truncated || res.truncated;
        total += res.total;
      }

      const summary = summarize(all, truncated);
      log("summary rows", all.length, "total", summary.total_commission, "from", sources.length, "tokens");
      return json({
        ok: true,
        summary,
        total_available: total,
        coverage,
        sources: { queried: sources.length, failed: failures.length, failures: failures.slice(0, 10) },
        scope: { role, users_id: filters.users_id ?? null, mode: sources.length > 1 ? "all_brokers" : "token_owner" },
        filters,
        correlation_id: cid,
      }, 200, cid);
    }


    return json({ error: "unknown_action", message: `Action inconnue: ${action}` }, 400, cid);
  } catch (e) {
    console.error(`[commission-reports][${cid}] fatal`, e);
    return json({ error: "internal_error", message: (e as Error).message, correlation_id: cid }, 500, cid);
  }

  function upstream(r: { status: number; data: any }, cid: string) {
    const map: Record<number, string> = {
      401: "Session Maestro expirée. Reconnectez votre compte Maestro.",
      403: "Maestro refuse l'accès à ces rapports de commissions pour votre compte.",
      404: "Rapport de commissions introuvable dans Maestro.",
      422: "Filtres refusés par Maestro.",
      504: "Maestro n'a pas répondu à temps. Réessayez.",
    };
    console.warn(`[commission-reports][${cid}] upstream`, r.status, JSON.stringify(r.data)?.slice(0, 200));
    return json({
      error: "maestro_error",
      status: r.status,
      message: map[r.status] ?? "Maestro a retourné une erreur pour ce rapport de commissions.",
      details: r.data?.message ?? null,
      correlation_id: cid,
    }, r.status === 401 ? 409 : 502, cid);
  }
});
