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
  commissionGet,
  summarize,
  paidAnalytics,
  paidFlags,
  normalizePendingRow,
  institutionLabel,
  collectPaidDeposits,
  PENDING_COMMISSION_PATH,
  type CommissionDepositRow,
} from "../_shared/commission-reports.ts";
import { getMaestroAdminAccessToken } from "../_shared/maestro-admin-token.ts";
import { resolveCommissionScope } from "../_shared/commission-scope.ts";
import { validateCommissionOutput, profileRows } from "../_shared/commission-validation.ts";

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

const PROFILE_FIELDS = "id, user_id, role, full_name, email, login_email, ms365_email, maestro_broker_id, maestro_telecom_user_id, maestro_connected";

function normalizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return /.+@.+\..+/.test(email) ? email : null;
}

/**
 * Resolve the signed-in broker first by Supabase user id, then by the exact
 * Microsoft/portal email recorded on an older profile.  The fallback is
 * read-only and only accepts one exact profile match, so it cannot turn an
 * arbitrary Microsoft address into access to another broker's commissions.
 */
async function findProfileForAuthenticatedUser(admin: any, user: any) {
  const { data: direct } = await admin
    .from("planipret_profiles")
    .select(PROFILE_FIELDS)
    .or(`user_id.eq.${user.id},id.eq.${user.id}`)
    .maybeSingle();
  if (direct) return direct;

  const email = normalizeEmail(user?.email);
  if (!email) return null;
  const matches = new Map<string, any>();
  for (const field of ["email", "login_email", "ms365_email"]) {
    const { data }: { data: any[] | null } = await admin
      .from("planipret_profiles")
      .select(PROFILE_FIELDS)
      .ilike(field, email)
      .limit(3);
    for (const profile of (data ?? []) as any[]) {
      if (String(profile?.[field] ?? "").trim().toLowerCase() === email && profile?.id) {
        matches.set(String(profile.id), profile);
      }
    }
  }
  return matches.size === 1 ? [...matches.values()][0] : null;
}

/**
 * Existing Capacitor clients turn any non-2xx Edge response into the generic
 * "Edge Function returned a non-2xx status code".  Once authentication has
 * succeeded, expected account and Maestro failures use this 200 contract so
 * the app can display an actionable French message instead of hiding it.
 */
function applicationError(error: string, message: string, cid: string, extra: Record<string, unknown> = {}) {
  return json({ success: false, error, message, retryable: error === "maestro_error" || error === "internal_error", correlation_id: cid, ...extra }, 200, cid);
}


const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};


async function handler(req: Request): Promise<Response> {
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
    // Trusted server-to-server path (AVA tool executor, voice sessions): only a
    // caller holding the service-role key may name the already-verified user.
    // Role/scope rules below still apply to that user exactly as for a JWT.
    const internalUid = req.headers.get("x-ava-internal-user-id")?.trim() ?? "";
    let user: any = null;
    if (internalUid && jwt === SERVICE_KEY && /^[0-9a-f-]{36}$/i.test(internalUid)) {
      const { data } = await admin.auth.admin.getUserById(internalUid);
      user = data?.user ?? null;
    } else {
      const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
      user = userErr ? null : userRes?.user ?? null;
    }
    if (!user) return json({ error: "unauthorized", message: "Session invalide." }, 401, cid);
    const authenticatedUser = user;

    const profile = await findProfileForAuthenticatedUser(admin, authenticatedUser);

    if (!profile) return applicationError("profile_not_linked", "Votre compte connecté n'est pas encore associé à un profil courtier Planiprêt. Demandez à un administrateur de vérifier votre courriel Microsoft.", cid);
    const role = String(profile.role ?? "");
    if (role !== "admin" && role !== "broker") {
      return applicationError("forbidden", "Accès aux commissions réservé aux courtiers et administrateurs.", cid);
    }
    if (role === "admin") {
      const { data: allowedAdmin } = await admin.rpc("is_planipret_admin", { _user_id: authenticatedUser.id });
      if (allowedAdmin !== true) return applicationError("forbidden", "Accès administrateur aux commissions non autorisé.", cid);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "summary");
    // Claude analyses every live read (with the previous read for drift) and each analysis is audited.
    const gate = async (source: string, brokerId: string, input: any) => {
      const { data: prev } = await admin.from("planipret_commission_ai_audit").select("headline, created_at")
        .eq("broker_id", brokerId).eq("source", source).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const previous = prev?.headline ? { ...(prev.headline as any), fetched_at: prev.created_at } : null;
      const v = await validateCommissionOutput({ ...input, previous });
      const h = input.current ?? {};
      admin.from("planipret_commission_ai_audit").insert({
        user_id: user.id, broker_id: brokerId, source, status: v.status, ai_status: v.ai_status, summary: v.summary,
        anomalies: v.anomalies, data_quality: input.dataQuality ? { ...input.dataQuality, excluded_samples: undefined } : null,
        headline: { files: h.files ?? 0, volume_cents: Math.round(num(h.volume) * 100), total_cents: Math.round(num(h.total) * 100) },
      }).then(() => {});
      return v;
    };

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
    // A historical profile may be linked to the same authenticated Microsoft
    // address but retain its original Supabase user id where the OAuth token
    // is stored.  Use that profile owner only after exact email matching above.
    const maestroTokenOwnerId = String(profile.user_id ?? authenticatedUser.id);
    const ownToken = await getUserMaestroAccessToken(admin, maestroTokenOwnerId);
    const firmToken = role === "admin"
      ? await getMaestroAdminAccessToken()
      : { token: null, source: "none" as const };

    let resolvedUsersId: string | null =
      profile.maestro_broker_id != null ? String(profile.maestro_broker_id) : null;
    if (!resolvedUsersId && ownToken) {
      const env = getMaestroOAuthEnv();
      const identity = await fetchMaestroUserProfile(env, ownToken);
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
        return applicationError("broker_id_unresolved", "Impossible de résoudre votre identifiant Maestro. Reconnectez votre compte Maestro.", cid);
      }
      filters.users_id = resolvedUsersId;
    }

    const scopeError = (error: "broker_id_unresolved" | "maestro_not_connected" | "admin_scope_unavailable") => {
      const messages = {
        broker_id_unresolved: "Impossible de résoudre votre identifiant Maestro. Reconnectez votre compte Maestro.",
        maestro_not_connected: "Votre compte Maestro n'est pas connecté. Reconnectez-le dans Réglages › Connexions.",
        admin_scope_unavailable: "La vue « Tous les courtiers » requiert un accès Maestro administrateur. Votre vue personnelle reste disponible.",
      };
      return applicationError(error, messages[error], cid);
    };

    // ---- Institutions ----------------------------------------------------
    if (action === "institutions") {
      const scope = resolveCommissionScope({
        role: role as "admin" | "broker",
        action,
        requestedUsersId: filters.users_id,
        ownUsersId: resolvedUsersId,
        ownToken,
        firmToken: firmToken.token,
      });
      if (!scope.ok) return scopeError(scope.error);
      const r = await commissionGet("/api/main/financial-institutions", scope.token, cid);
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
      const scope = resolveCommissionScope({
        role: role as "admin" | "broker",
        action,
        requestedUsersId: filters.users_id,
        ownUsersId: resolvedUsersId,
        ownToken,
        firmToken: firmToken.token,
      });
      if (!scope.ok) return scopeError(scope.error);
      const r = await commissionGet("/api/main/commissions/reports/agents", scope.token, cid);
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



    // ---- Pending commissions -------------------------------------------
    // Courtier : son propre jeton. Admin : chaque courtier déjà connecté à
    // Maestro, lu côté serveur avec son propre jeton (lecture seule, jamais
    // renvoyé au client), avec tableau par courtier et filtre par agent.
    if (action === "pending") {
      const fetchPending = async (token: string, usersId: string | null) => {
        // Maestro's pending pagination is not order-stable: pages can repeat
        // some rows and skip others. Rows are keyed by commission_id and the
        // page set is re-read (bounded) until every row reported by Maestro
        // is collected exactly once.
        const byId = new Map<string, any>();
        let upstreamSummary: unknown = null;
        let lastPage = 1, expected = 0, passes = 0, truncated = false;
        do {
          passes += 1;
          const sizeBefore = byId.size;
          let page = 1;
          while (page <= 25) {
            const qs = new URLSearchParams();
            if (usersId) qs.set("users_id", usersId);
            if (filters.financial_inst_id) qs.set("financial_inst_id", filters.financial_inst_id);
            // Pending is not period-scoped: Maestro's official totals ignore
            // dates, so rows must not be date-filtered either (else files and
            // volume drift from the totals).
            qs.set("page", String(page));
            qs.set("per_page", "200");
            const r = await commissionGet(`${PENDING_COMMISSION_PATH}?${qs}`, token, cid);
            if (!r.ok) return { ok: false as const, r };
            if (page === 1 && passes === 1) upstreamSummary = r.data?.summary ?? null;
            const rows: any[] = Array.isArray(r.data?.data) ? r.data.data : [];
            rows.forEach((row, i) => {
              // Key must distinguish legitimate repeat rows: Maestro can emit
              // several lines (base, bonus, override…) sharing one
              // commission_id. Dedup only true page-repeat duplicates.
              const key = row?.commission_id != null
                ? `${row.commission_id}|${row.commission_type ?? ""}|${row.commission_amount ?? row.amount ?? ""}`
                : `p${passes}-${page}-${i}`;
              if (!byId.has(key)) byId.set(key, row);
            });
            lastPage = Number(r.data?.meta?.last_page ?? 1);
            expected = Number(r.data?.meta?.total ?? 0) || expected;
            if (page >= lastPage || rows.length === 0) break;
            page += 1;
          }
          truncated = lastPage > 25;
          // Stop early when a full pass adds nothing new: further passes
          // won't recover rows Maestro never returns.
          if (byId.size === sizeBefore) break;
        } while (!truncated && expected > 0 && byId.size < expected && passes < 20);
        const raw = [...byId.values()];
        const rows = raw.map(normalizePendingRow);
        const official = Array.isArray(upstreamSummary)
          ? (upstreamSummary as any[]).map((x) => ({ type: String(x?.type ?? ""), label: String(x?.label ?? x?.type ?? ""), amount: Number(x?.amount ?? 0) || 0 }))
          : null;
        const diag = {
          expected_meta_total: expected,
          collected: byId.size,
          passes,
          last_page: lastPage,
          by_type: rows.reduce((acc: Record<string, number>, r: any) => {
            const t = String(r.commission_type ?? "base");
            acc[t] = Math.round(((acc[t] ?? 0) + num(r.amount)) * 100) / 100;
            return acc;
          }, {}),
          rows_sum: r2(rows.reduce((t, r: any) => t + num(r.amount), 0)),
        };
        return { ok: true as const, rows, official, truncated, diag };
      };
      const r2 = (n: number) => Math.round(n * 100) / 100;
      // Personal vs team split: a row belongs to the broker's own production when
      // Maestro's primary_broker_id equals the receiving broker; otherwise it is
      // an override earned on a team member's file (explicit field, never inferred).
      const split = (rows: CommissionDepositRow[], ownId: string | null) => {
        const mk = () => ({ amount: 0, contracts: new Map<string, number>(), vols: new Map<string, number>() });
        const own = mk(); const teamAll = mk();
        const members = new Map<string, { id: string; name: string } & ReturnType<typeof mk>>();
        const add = (b: ReturnType<typeof mk>, r: any) => {
          b.amount += num(r.commission_amount ?? r.amount);
          // Files/volume: base rows only, dated, positive loan (same rule as cards).
          const c = String(r.contract_id ?? r.number ?? "").trim();
          const loan = num(r.loan_amount ?? r.loan_amt ?? 0);
          const d = String(r.date_trans ?? "");
          if (c && loan > 0 && String(r.commission_type ?? "").toLowerCase() === "base" && /^\d{4}-\d{2}-\d{2}/.test(d) && !d.startsWith("0000")) { b.contracts.set(c, loan); b.vols.set(`${c}|${loan}`, loan); }
        };
        for (const r of rows as any[]) {
          const pid = r.primary_broker_id != null ? String(r.primary_broker_id) : null;
          const receiver = ownId ?? (r.user_id != null ? String(r.user_id) : null);
          if (!pid || pid === receiver) { add(own, r); continue; }
          add(teamAll, r);
          const name = `${r.primary_broker_first_name ?? ""} ${r.primary_broker_last_name ?? ""}`.trim() || pid;
          const m = members.get(pid) ?? { id: pid, name, ...mk() };
          add(m as any, r); members.set(pid, m);
        }
        const out = (b: { amount: number; contracts: Map<string, number>; vols: Map<string, number> }) => ({ amount: r2(b.amount), files: b.contracts.size, volume: r2([...b.vols.values()].reduce((t, v) => t + v, 0)) });
        return {
          personal: out(own),
          team: out(teamAll),
          team_members: [...members.values()].map((m) => ({ id: m.id, name: m.name, ...out(m) })).sort((a, b) => b.amount - a.amount),
        };
      };
      const pack = (rows: CommissionDepositRow[], official: { type: string; label: string; amount: number }[] | null, truncated: boolean, ownId: string | null = null) => {
        const summary = summarize(rows, truncated);
        const officialTotal = official ? r2(official.reduce((t, x) => t + x.amount, 0)) : null;
        // Pending rows may legitimately have no date yet (not funded): Maestro
        // counts them in its official total, so the displayed total must too.
        // When Maestro's official total exists it is the headline number; the
        // row sum stays available for detail tables.
        if (officialTotal != null) {
          summary.total_commission = officialTotal;
          summary.deposit_count = Math.max(summary.deposit_count, rows.length);
        }
        // Pending files/volume (same rule as the tables): broker's own base rows
        // (primary broker = receiver), dated, positive loan; one count per
        // contract; volume sums distinct contract+loan entries.
        {
          const contracts = new Set<string>(); const vol = new Map<string, number>();
          for (const r of rows as any[]) {
            if (String(r.commission_type ?? "").toLowerCase() !== "base") continue;
            const pid = r.primary_broker_id != null ? String(r.primary_broker_id) : null;
            const receiver = ownId ?? (r.user_id != null ? String(r.user_id) : null);
            if (pid && receiver && pid !== receiver) continue;
            const loan = num(r.loan_amt ?? r.loan_amount ?? 0);
            const c = String(r.contract_id ?? r.number ?? "").trim();
            const d = String(r.date_trans ?? "");
            if (!/^\d{4}-\d{2}-\d{2}/.test(d) || d.startsWith("0000")) continue;
            if (!c || loan <= 0) continue;
            contracts.add(`${receiver}|${c}`); vol.set(`${receiver}|${c}|${loan}`, loan);
          }
          summary.deal_count = contracts.size;
          summary.total_loan_volume = r2([...vol.values()].reduce((t, v) => t + v, 0));
          (summary as any).deposit_count = contracts.size;
          (summary as any).average_commission = contracts.size ? r2((summary.total_commission ?? 0) / contracts.size) : 0;
        }
        const months = baseMonths(rows as any[], { receiver: (r) => ownId ?? (r.user_id != null ? String(r.user_id) : ""), owner: (r) => r.primary_broker_id != null ? String(r.primary_broker_id) : null });
        return { ...summary, months, data_quality: profileRows(rows as any[], ownId), rows_sum: r2(rows.reduce((t, r: any) => t + num(r.amount), 0)), official_by_type: official, official_total: officialTotal, split: split(rows, ownId) };
      };

      if (role === "broker") {
        if (!ownToken) return scopeError("maestro_not_connected");
        const res = await fetchPending(ownToken, resolvedUsersId);
        if (!res.ok) return upstream(res.r, cid);
        const scope = { role, users_id: resolvedUsersId, mode: "own" };
        const summary = pack(res.rows, res.official, res.truncated, resolvedUsersId ? String(resolvedUsersId) : null);
        const dq = profileRows(res.rows as any[], resolvedUsersId ? String(resolvedUsersId) : null, Number((res as any).diag?.expected_meta_total) || null);
        (summary as any).data_quality = dq;
        const validation = await gate("pending_commissions", String(resolvedUsersId ?? ""), { source: "pending_commissions", rows: res.rows, truncated: res.truncated, official: res.official, officialTotal: summary.official_total, scope, dataQuality: dq, current: { files: summary.deal_count ?? 0, volume: summary.total_loan_volume, total: summary.total_commission } });
        if (!validation.validated) return applicationError("commission_validation_blocked", "Les commissions en attente n'ont pas passé le contrôle final. La dernière version validée reste affichée.", cid, { validation });
        return json({ ok: true, summary, validation, diag: res.diag, source_identity: { source: "pending_commissions", endpoint: PENDING_COMMISSION_PATH, users_id: resolvedUsersId, generated_at: validation.checked_at }, scope, correlation_id: cid }, 200, cid);
      }

      // Admin : vue cabinet ou courtier tiers = jeton administrateur Maestro
      // obligatoire. Aucun repli vers l'OAuth d'un autre courtier.
      if (!firmToken.token) return scopeError("admin_scope_unavailable");
      let q = admin.from("planipret_profiles")
        .select("user_id, full_name, email, maestro_broker_id")
        .eq("maestro_connected", true)
        .not("maestro_broker_id", "is", null);
      if (filters.users_id) q = q.eq("maestro_broker_id", filters.users_id);
      const { data: profs } = await q;
      const seen = new Set<string>();
      const brokers = (profs ?? []).filter((p: any) => {
        const id = String(p.maestro_broker_id);
        if (seen.has(id) || !p.user_id) return false;
        seen.add(id); return true;
      });
      const table: any[] = [];
      const failed: string[] = [];
      const allRows: CommissionDepositRow[] = [];
      const officialAll = new Map<string, { type: string; label: string; amount: number }>();
      let anyTrunc = false;
      let idx = 0;
      const worker = async () => {
        while (idx < brokers.length) {
          const p: any = brokers[idx++];
          const name = String(p.full_name ?? p.email ?? p.maestro_broker_id);
          try {
            // One retry: transient Maestro errors or a concurrent token
            // refresh must not drop a connected broker from the table.
            let res: Awaited<ReturnType<typeof fetchPending>> | null = null;
            for (let attempt = 0; attempt < 2 && !(res && res.ok); attempt++) {
              if (attempt) await new Promise((r) => setTimeout(r, 1500));
              // Strict admin scope: only the firm administrator credential.
              const token = firmToken.token;
              if (!token) continue;
              res = await fetchPending(token, String(p.maestro_broker_id));
              if (!res.ok) log("pending broker failed", name, (res as any).r?.status);
            }
            if (!res || !res.ok) { failed.push(name); continue; }
            const s = pack(res.rows, res.official, res.truncated, String(p.maestro_broker_id));
            anyTrunc ||= res.truncated;
            // Tag each row with its receiving broker so the global files/volume
            // rule (own base rows only) applies per broker, same as the table.
            allRows.push(...res.rows.map((r: any) => ({ ...r, user_id: String(p.maestro_broker_id) })));
            for (const o of res.official ?? []) {
              const e = officialAll.get(o.type) ?? { ...o, amount: 0 };
              e.amount = r2(e.amount + o.amount); officialAll.set(o.type, e);
            }
            table.push({ users_id: Number(p.maestro_broker_id), name, amount: s.official_total ?? s.total_commission, files: s.deal_count, volume: s.total_loan_volume, personal: s.split.personal, team: s.split.team, team_members: s.split.team_members, diag: res.diag });
          } catch (e) { log("pending broker exception", name, String((e as any)?.message ?? e).slice(0, 200)); failed.push(name); }
        }
      };
      await Promise.all(Array.from({ length: Math.min(5, brokers.length) }, worker));
      table.sort((a, b) => b.amount - a.amount);
      const official = officialAll.size ? [...officialAll.values()] : null;
      const scope = { role, users_id: filters.users_id ?? null, mode: filters.users_id ? "selected_broker" : "all_brokers" };
      const summary = pack(allRows, official, anyTrunc);
      const validation = await gate("pending_commissions", String(filters.users_id ?? "all"), { source: "pending_commissions", rows: allRows, truncated: anyTrunc, official, officialTotal: summary.official_total, scope, dataQuality: (summary as any).data_quality, current: { files: summary.deal_count ?? 0, volume: summary.total_loan_volume, total: summary.total_commission } });
      if (!validation.validated) return applicationError("commission_validation_blocked", "Les commissions en attente n'ont pas passé le contrôle final. La dernière version validée reste affichée.", cid, { validation });
      log("pending admin brokers", table.length, "failed", failed.length);
      return json({
        ok: true,
        summary,
        validation,
        source_identity: { source: "pending_commissions", endpoint: PENDING_COMMISSION_PATH, users_id: filters.users_id ?? null, generated_at: validation.checked_at },
        brokers: table,
        failed_brokers: failed.length,
        failed_broker_names: failed,
        scope,
        correlation_id: cid,
      }, 200, cid);
    }

    // ---- Source unique (aucun fan-out ni jeton d'un autre courtier) -------
    // La portée est strictement celle du jeton appelant, ou celle du jeton
    // administrateur Maestro explicitement configuré pour « Tous les courtiers ».
    // An authenticated Planiprêt administrator can read a selected connected
    // broker using that broker's server-only token, just like pending reports.
    // Maestro personal tokens must never be paired with a peer's users_id.
    // Strict admin scope: firm/peer views use only the firm credential.
    const brokerSources: { token: string; label: string; user_id: string | null; usersId: string }[] = [];
    const reportScope = resolveCommissionScope({
      role: role as "admin" | "broker",
      action,
      requestedUsersId: filters.users_id,
      ownUsersId: resolvedUsersId,
      ownToken,
      firmToken: firmToken.token,
    });
    if (!reportScope.ok) return scopeError(reportScope.error);
    const activeReportScope: Extract<typeof reportScope, { ok: true }> = reportScope;

    type Src = { token: string; label: string; user_id: string | null; usersId?: string };
    const failures: { broker: string; status: number; message: string }[] = [];
    let coverage = { connected: 1, total: 1 };

    async function collectSources(): Promise<Src[]> {
      if (brokerSources.length) {
        coverage = { connected: brokerSources.length, total: brokerSources.length };
        return brokerSources;
      }
      if (activeReportScope.usersId) filters.users_id = activeReportScope.usersId;
      else delete filters.users_id;
      return [{
        token: activeReportScope.token,
        label: activeReportScope.mode === "own" ? String(profile.full_name ?? profile.email ?? "moi") : "Planiprêt",
        user_id: activeReportScope.mode === "own" ? authenticatedUser.id : null,
      }];
    }

    /** Parcourt toutes les pages de dépôts pour un jeton donné. */
    async function fetchAllDeposits(src: Src, _single: boolean) {
      return collectPaidDeposits(src.token, { ...filters, ...(src.usersId ? { users_id: src.usersId } : {}) }, cid);
    }

    async function collectPaidSources(sources: Src[]) {
      const results: Awaited<ReturnType<typeof fetchAllDeposits>>[] = [];
      for (let start = 0; start < sources.length; start += 5) {
        results.push(...await Promise.all(sources.slice(start, start + 5).map((src) => fetchAllDeposits(src, true))));
      }
      return results;
    }

    // ---- Deposits (agrégé pour les admins, passthrough sinon) -------------
    if (action === "deposits") {
      const sources = await collectSources();
      const single = sources.length === 1;
      const merged: CommissionDepositRow[] = [];
      let truncated = false;
      for (const res of await collectPaidSources(sources)) {
        if (res.fatal) return upstream(res.fatal, cid);
        merged.push(...res.rows);
        truncated = truncated || res.truncated;
      }
      const validationScope = { role, users_id: filters.users_id ?? null, mode: activeReportScope.mode };
      const validationSummary = summarize(merged, truncated);
      const validation = await validateCommissionOutput({ source: "paid_deposits", rows: merged, truncated, summary: validationSummary, scope: validationScope });
      if (!validation.validated) return applicationError("commission_validation_blocked", "Les commissions déboursées n'ont pas passé le contrôle final. La dernière version validée reste affichée.", cid, { validation });
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
        validation,
        source_identity: { source: "paid_deposits", endpoint: "/api/main/commissions/reports/deposits", users_id: filters.users_id ?? null, generated_at: validation.checked_at },
        coverage,
        sources: { queried: sources.length, failed: failures.length, failures: failures.slice(0, 10) },
        scope: { role, users_id: filters.users_id ?? null, mode: activeReportScope.mode },
        correlation_id: cid,
      }, 200, cid);
    }

    // Paid files/volume — same rule as pending: base, non-adjustment rows of
    // the receiving broker's own files (target = receiver), dated, positive
    // loan; one count per contract, volume sums distinct contract+loan.
    const paidBaseFiles = (rows: CommissionDepositRow[]) => {
      const per = new Map<string, { files: Set<string>; vol: Map<string, number> }>();
      for (const r of rows as any[]) {
        if (String(r.commission_type ?? "base").toLowerCase() !== "base") continue;
        if (Number(r.is_adjustment) === 1) continue;
        const rec = r.agent_name_id != null ? String(r.agent_name_id) : "";
        const tgt = r.target_name_id != null ? String(r.target_name_id) : rec;
        if (rec && tgt && rec !== tgt) continue;
        const d = String(r.date_trans ?? "");
        if (!/^\d{4}-\d{2}-\d{2}/.test(d) || d.startsWith("0000")) continue;
        const loan = num(r.loan_amt); const c = String(r.number ?? "").trim();
        if (!c || loan <= 0) continue;
        const e = per.get(rec) ?? { files: new Set<string>(), vol: new Map<string, number>() };
        e.files.add(c); e.vol.set(`${c}|${loan}`, loan); per.set(rec, e);
      }
      const out = new Map<string, { files: number; volume: number }>();
      let files = 0, volume = 0;
      for (const [k, e] of per) { const v = [...e.vol.values()].reduce((t, x) => t + x, 0); out.set(k, { files: e.files.size, volume: Math.round(v * 100) / 100 }); files += e.files.size; volume += v; }
      return { files, volume: Math.round(volume * 100) / 100, per };
    };
    const paidBaseOut = (rows: CommissionDepositRow[]) => { const x = paidBaseFiles(rows); const m = new Map<string, { files: number; volume: number }>(); for (const [k, e] of x.per) m.set(k, { files: e.files.size, volume: Math.round([...e.vol.values()].reduce((t, v) => t + v, 0) * 100) / 100 }); return { files: x.files, volume: x.volume, by: m }; };

    // ---- Par courtier (agrégat serveur sur toutes les pages) --------------
    if (action === "by_agent") {
      const buckets = new Map<string, {
        users_id: number | null; name: string; total: number; count: number; loan_volume: number;
      }>();
      let truncated = false;
      let scanned = 0;
      const allAgentRows: CommissionDepositRow[] = [];

      const sources = await collectSources();


      for (const result of await collectPaidSources(sources)) {
        if (result.fatal) return upstream(result.fatal, cid);
        truncated ||= result.truncated;
          for (const { row, unique_volume } of paidFlags(result.rows)) {
            if (!row.date_trans) continue;
            const deposit = row as unknown as CommissionDepositRow;
            const id = deposit.agent_name_id ?? null;
            const name = String(row.agent_name ?? deposit.target_name ?? "—").trim() || "—";
            const key = id != null ? `id:${id}` : `n:${name.toLowerCase()}`;
            const b = buckets.get(key) ?? { users_id: id, name, total: 0, count: 0, loan_volume: 0 };
            b.total += num(row.amount);
            b.loan_volume += unique_volume ? num(row.loan_amt) : 0;
            b.count += 1;
            buckets.set(key, b);
          }
          scanned += result.rows.length;
          allAgentRows.push(...result.rows);
      }
      const baseBy = paidBaseOut(allAgentRows).by;
      const agents = Array.from(buckets.values())
        .map((b) => { const f = b.users_id != null ? baseBy.get(String(b.users_id)) : undefined; return { ...b, files: f?.files ?? 0, loan_volume: f?.volume ?? 0, average: f?.files ? b.total / f.files : 0 }; })
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
        scope: { role, users_id: filters.users_id ?? null, mode: activeReportScope.mode },
        correlation_id: cid,
      }, 200, cid);
    }


    // ---- Summary (agrégat serveur, multi-courtiers pour les admins) -------
    if (action === "summary" || action === "analytics") {
      const sources = await collectSources();
      const single = sources.length === 1;
      const all: CommissionDepositRow[] = [];
      let truncated = false, total = 0;
      for (const res of await collectPaidSources(sources)) {
        if (res.fatal) return upstream(res.fatal, cid);
        all.push(...res.rows);
        truncated = truncated || res.truncated;
        total += res.total;
      }

      const summary = summarize(all, truncated);
      {
        const b = paidBaseOut(all);
        summary.deal_count = b.files;
        summary.total_loan_volume = b.volume;
        (summary as any).files_rule = "own_base_unique_contracts";
        (summary as any).months = baseMonths(all as any[], { receiver: (r) => String(r.agent_name_id ?? ""), owner: (r) => r.target_name_id != null ? String(r.target_name_id) : null, skip: (r) => Number(r.is_adjustment) === 1 });
      }
      const validationScope = { role, users_id: filters.users_id ?? null, mode: activeReportScope.mode };
      const paidDq = profileRows(all as any[], null);
      (summary as any).data_quality = paidDq;
      const validation = await gate("paid_deposits", String(filters.users_id ?? (activeReportScope.mode === "own" ? profile.maestro_broker_id ?? "" : "all")), { source: "paid_deposits", rows: all, truncated, summary, scope: validationScope, dataQuality: paidDq, current: { files: summary.deal_count ?? 0, volume: summary.total_loan_volume, total: summary.total_commission } });
      if (!validation.validated) return applicationError("commission_validation_blocked", "Les commissions déboursées n'ont pas passé le contrôle final. La dernière version validée reste affichée.", cid, { validation });
      if (action === "analytics") return json({ ok: true, analytics: paidAnalytics(all), validation, source_identity: { source: "paid_deposits", endpoint: "/api/main/commissions/reports/deposits", users_id: filters.users_id ?? null, generated_at: validation.checked_at }, truncated, scope: validationScope }, 200, cid);
      // Paid split: Maestro's target_name is the broker who carried the file.
      let paid_split: unknown = null;
      try {
        let owner: string | null = activeReportScope.mode === "own" ? String(profile.full_name ?? "") : null;
        if (!owner && filters.users_id) {
          const { data: op } = await admin.from("planipret_profiles").select("full_name").eq("maestro_broker_id", String(filters.users_id)).limit(1).maybeSingle();
          owner = (op as any)?.full_name ?? null;
        }
        const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
        if (owner) {
          const o = norm(owner);
          const mk = () => ({ amount: 0, files: new Set<string>(), volume: 0, vk: new Set<string>() });
          const own = mk(), team = mk();
          const mem = new Map<string, { name: string; b: ReturnType<typeof mk> }>();
          for (const { row: r, unique_volume, unique_deal } of paidFlags(all)) {
            if (!r.date_trans) continue;
            const target = (r as unknown as CommissionDepositRow).target_name;
            const t = norm(target);
            const b = !t || t === o ? own : team;
            const amt = num(r.amount); const n = String(r.number ?? "");
            const vol = unique_volume ? num(r.loan_amt) : 0;
            const isBase = String((r as any).commission_type ?? "base").toLowerCase() === "base" && Number((r as any).is_adjustment) !== 1 && num(r.loan_amt) > 0;
            const apply = (x: ReturnType<typeof mk>) => { x.amount += amt; if (n && isBase) { const k = `${n}|${num(r.loan_amt)}`; if (!x.vk.has(k)) { x.vk.add(k); x.volume += num(r.loan_amt); } x.files.add(n); } };
            apply(b);
            if (b === team) { const m = mem.get(t) ?? { name: String(target).trim(), b: mk() }; apply(m.b); mem.set(t, m); }
          }
          const out = (x: ReturnType<typeof mk>) => ({ amount: Math.round(x.amount * 100) / 100, files: x.files.size, volume: Math.round(x.volume * 100) / 100 });
          paid_split = { personal: out(own), team: out(team), team_members: [...mem.entries()].map(([id, m]) => ({ id, name: m.name, ...out(m.b) })).sort((a, b) => b.amount - a.amount) };
        }
      } catch { paid_split = null; }
      log("summary rows", all.length, "total", summary.total_commission, "from", sources.length, "tokens");
      return json({
        ok: true,
        summary,
        validation,
        source_identity: { source: "paid_deposits", endpoint: "/api/main/commissions/reports/deposits", users_id: filters.users_id ?? null, generated_at: validation.checked_at },
        analytics: paidAnalytics(all),
        paid_split,
        total_available: total,
        coverage,
        sources: { queried: sources.length, failed: failures.length, failures: failures.slice(0, 10) },
        scope: { role, users_id: filters.users_id ?? null, mode: activeReportScope.mode },
        filters,
        correlation_id: cid,
      }, 200, cid);
    }


    return applicationError("unknown_action", `Action inconnue: ${action}`, cid);
  } catch (e) {
    console.error(`[commission-reports][${cid}] fatal`, e);
    return applicationError("internal_error", "Le rapport de commissions est temporairement indisponible. Réessayez dans un instant.", cid);
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
    return applicationError(
      "maestro_error",
      map[r.status] ?? "Maestro a retourné une erreur pour ce rapport de commissions.",
      cid,
      { upstream_status: r.status },
    );
  }
}




// Month buckets shared by paid and pending (same rule as the cards):
// commission = every dated row; files/volume = receiver's own base rows,
// dated, positive loan, one count per contract, volume per contract+loan.
function baseMonths(rows: any[], opts: { receiver: (r: any) => string; owner: (r: any) => string | null; skip?: (r: any) => boolean }) {
  const m = new Map<string, { month: string; commission: number; files: Set<string>; vol: Map<string, number> }>();
  for (const r of rows) {
    const d = String(r.date_trans ?? "");
    if (!/^\d{4}-\d{2}-\d{2}/.test(d) || d.startsWith("0000")) continue;
    const key = d.slice(0, 7);
    const b = m.get(key) ?? { month: key, commission: 0, files: new Set<string>(), vol: new Map<string, number>() };
    b.commission += Number(r.amount ?? r.commission_amount ?? 0) || 0;
    m.set(key, b);
    if (String(r.commission_type ?? "base").toLowerCase() !== "base" || opts.skip?.(r)) continue;
    const rec = opts.receiver(r); const own = opts.owner(r);
    if (own && rec && own !== rec) continue;
    const loan = Number(r.loan_amt ?? r.loan_amount ?? 0) || 0;
    const c = String(r.number ?? r.contract_id ?? "").trim();
    if (!c || loan <= 0) continue;
    b.files.add(`${rec}|${c}`); b.vol.set(`${rec}|${c}|${loan}`, loan);
  }
  return [...m.values()].sort((a, b) => a.month.localeCompare(b.month)).map((b) => ({
    month: b.month, commission: Math.round(b.commission * 100) / 100, files: b.files.size,
    volume: Math.round([...b.vol.values()].reduce((t, v) => t + v, 0) * 100) / 100,
  }));
}
// ---- Server-side snapshot cache (fresh 5 min, stale served instantly) ----
const FRESH_MS = 5 * 60_000;
const FORCE_MIN_MS = 60_000;
const CACHEABLE = new Set(["summary", "pending", "analytics", "deposits", "by_agent", "agents", "institutions"]);

async function sha(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function stableBody(b: any) {
  const { force, refresh, ...rest } = b ?? {};
  const sort = (v: any): any => Array.isArray(v) ? v.map(sort) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v;
  return sort(rest);
}
async function runFresh(req: Request, bodyText: string) {
  const h = new Headers(req.headers); h.delete("content-length");
  const r = await handler(new Request(req.url, { method: "POST", headers: h, body: bodyText }));
  const text = await r.text();
  let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
  return { r, text, data };
}
async function store(admin: any, key: string, userId: string, body: any, data: any) {
  await admin.from("planipret_commission_snapshots").upsert({ cache_key: key, user_id: userId, request_body: body, payload: data, fetched_at: new Date().toISOString(), last_accessed_at: new Date().toISOString(), refreshing_until: null });
  await notifyUpdated();
}
// Realtime nudge so open portal/app screens refetch their own (scoped)
// snapshot. Payload carries no figures, ids or names.
async function notifyUpdated() {
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ messages: [{ topic: "pp-commissions-updates", event: "updated", payload: { at: new Date().toISOString() }, private: false }] }),
    });
  } catch { /* best effort */ }
}
const out = (data: any, cached: boolean, fetchedAt: string, stale = false) =>
  new Response(JSON.stringify({ ...data, cache: { cached, stale, fetched_at: fetchedAt } }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return handler(req);
  const bodyText = await req.text();
  let body: any = {}; try { body = JSON.parse(bodyText || "{}"); } catch { /* */ }
  const action = String(body?.action ?? "summary");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY, { auth: { persistSession: false } });
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  // Hourly warm-up (service key only): refresh snapshots used in the last 24h.
  if (action === "warm_snapshots") {
    // Safe to trigger from the scheduler: it only refreshes existing, already
    // authorized snapshots older than ~55 min, bounded to 25 per run.
    const cutoff = new Date(Date.now() - FRESH_MS + 60_000).toISOString();
    const { data: rows } = await admin.from("planipret_commission_snapshots").select("cache_key,user_id,request_body")
      .lt("fetched_at", cutoff).gt("last_accessed_at", new Date(Date.now() - 2 * 3_600_000).toISOString())
      .or(`refreshing_until.is.null,refreshing_until.lt.${new Date().toISOString()}`).order("fetched_at").limit(12);
    let ok = 0, failed = 0;
    await Promise.allSettled((rows ?? []).map(async (row: any) => {
      await admin.from("planipret_commission_snapshots").update({ refreshing_until: new Date(Date.now() + 10 * 60_000).toISOString() }).eq("cache_key", row.cache_key);
      const h = new Headers({ Authorization: `Bearer ${SERVICE_KEY}`, "x-ava-internal-user-id": row.user_id, "Content-Type": "application/json" });
      const { data } = await runFresh(new Request(req.url, { method: "POST", headers: h }), JSON.stringify(row.request_body));
      if (data?.ok === true) { await store(admin, row.cache_key, row.user_id, row.request_body, data); ok++; }
      else { failed++; await admin.from("planipret_commission_snapshots").update({ refreshing_until: null }).eq("cache_key", row.cache_key); }
    }));
    return new Response(JSON.stringify({ ok: true, refreshed: ok, failed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!CACHEABLE.has(action) || !jwt) { const f = await runFresh(req, bodyText); return new Response(f.text, { status: f.r.status, headers: f.r.headers }); }

  let userId = "";
  const internalUid = req.headers.get("x-ava-internal-user-id")?.trim() ?? "";
  if (internalUid && jwt === SERVICE_KEY) userId = internalUid;
  else { const { data } = await admin.auth.getUser(jwt); userId = data?.user?.id ?? ""; }
  if (!userId) { const f = await runFresh(req, bodyText); return new Response(f.text, { status: f.r.status, headers: f.r.headers }); }

  const norm = stableBody(body);
  const key = await sha(`${userId}|${JSON.stringify(norm)}`);
  const { data: snap } = await admin.from("planipret_commission_snapshots").select("payload,fetched_at,refreshing_until").eq("cache_key", key).maybeSingle();
  const age = snap ? Date.now() - new Date(snap.fetched_at).getTime() : Infinity;
  const force = body?.force === true || body?.refresh === true;

  if (snap && (age < (force ? FORCE_MIN_MS : FRESH_MS))) {
    admin.from("planipret_commission_snapshots").update({ last_accessed_at: new Date().toISOString() }).eq("cache_key", key).then(() => {});
    return out(snap.payload, true, snap.fetched_at);
  }
  if (snap && !force) {
    // Stale: answer instantly, refresh in the background once.
    const busy = snap.refreshing_until && new Date(snap.refreshing_until).getTime() > Date.now();
    if (!busy) {
      await admin.from("planipret_commission_snapshots").update({ refreshing_until: new Date(Date.now() + 10 * 60_000).toISOString(), last_accessed_at: new Date().toISOString() }).eq("cache_key", key);
      const job = runFresh(req, bodyText).then(async ({ data }) => {
        if (data?.ok === true) await store(admin, key, userId, norm, data);
        else await admin.from("planipret_commission_snapshots").update({ refreshing_until: null }).eq("cache_key", key);
      }).catch(() => {});
      (globalThis as any).EdgeRuntime?.waitUntil?.(job);
    }
    return out(snap.payload, true, snap.fetched_at, true);
  }
  const { r, text, data } = await runFresh(req, bodyText);
  if (data?.ok === true) { await store(admin, key, userId, norm, data); return out(data, false, new Date().toISOString()); }
  // Failure never becomes $0: fall back to last good copy when present.
  if (snap) return out(snap.payload, true, snap.fetched_at, true);
  return new Response(text, { status: r.status, headers: r.headers });
});
