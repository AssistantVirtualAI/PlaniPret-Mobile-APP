import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  type RegisterRow,
  type Window,
  metrics,
  periodVolume,
  periodDeals,
  periodCommission,
  volumeTranches,
  dealContracts,
  excludedRows,
  monthWindow,
  ytdWindow,
  quarterWindow,
  seasonWindow,
  yearWindow,
  weekWindow,
  isoWeeksInYear,
  resolveWindow,
  isInsurance,
  type Granularity,
  yoy,
} from "../_shared/commission-engine.ts";
import { agentKey } from "../_shared/broker-identity.ts";
import { fetchLiveRegisterRows, dedupeKey } from "../_shared/commission-live.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const uniq = (xs: (string | null | undefined)[]) =>
  Array.from(new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean)));

function breakdown(
  rows: RegisterRow[],
  w: Window,
  wPy: Window,
  field: "institution" | "mortgage_type" | "term",
) {
  const keys = uniq([
    ...volumeTranches(rows, w).map((r) => r[field]),
    ...volumeTranches(rows, wPy).map((r) => r[field]),
    ...dealContracts(rows, w).map((r) => r[field]),
  ]);
  const totalVolume = periodVolume(rows, w);
  const list = keys.map((k) => {
    const c = { [field]: k } as Record<string, string>;
    const cyVolume = periodVolume(rows, w, c);
    const cyDeals = periodDeals(rows, w, c);
    const cyCommission = rows
      .filter((r) => r.date_trans && r.date_trans >= w.start && r.date_trans <= w.end && !isInsurance(r) && (r[field] ?? "") === k)
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const pyVolume = periodVolume(rows, wPy, c);
    const pyDeals = periodDeals(rows, wPy, c);
    const pyCommission = rows
      .filter((r) => r.date_trans && r.date_trans >= wPy.start && r.date_trans <= wPy.end && !isInsurance(r) && (r[field] ?? "") === k)
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    return {
      key: k,
      cyVolume,
      cyDeals,
      cyCommission,
      pyVolume,
      pyDeals,
      pyCommission,
      cyBps: cyVolume ? (cyCommission / cyVolume) * 10000 : 0,
      pyBps: pyVolume ? (pyCommission / pyVolume) * 10000 : 0,
      sharePct: totalVolume ? cyVolume / totalVolume : 0,
      volumeYoy: yoy(cyVolume, pyVolume),
      commissionYoy: yoy(cyCommission, pyCommission),
    };
  });
  list.sort((a, b) => b.cyVolume - a.cyVolume);
  return list.map((x, i) => ({ rank: i + 1, ...x }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const year = Number(body?.year) || new Date().getFullYear();
    const month = Math.min(12, Math.max(1, Number(body?.month) || 12));
    const scope: "self" | "all" = body?.scope === "all" ? "all" : "self";
    const granularity = (["week", "month", "quarter", "year", "ytd"].includes(body?.granularity)
      ? body.granularity
      : "ytd") as Granularity;
    const periodIndex = Number(body?.periodIndex) || (granularity === "ytd" ? month : granularity === "quarter" ? Math.ceil(month / 3) : granularity === "month" ? month : 1);
    const agent: string | null = typeof body?.agent === "string" && body.agent.trim() ? body.agent.trim() : null;

    const { data: isAdminData } = await admin.rpc("is_planipret_admin", { _user_id: user.id });
    const isAdmin = Boolean(isAdminData);

    // Pull the years we need: PY, CY, and the season overlap year.
    const years = [year - 4, year - 3, year - 2, year - 1, year, year + 1];
    const { data: allRowsRaw, error } = await admin
      .from("planipret_commission_register")
      .select(
        "number,loan_amt,institution,amount,mortgage_type,term,agent_name,target_name,date_trans,commission_type,is_adjustment,source_row,broker_user_id,first_name,last_name,maestro_broker_id,agent_key,cabinet,fiscal_year,sheet_name",
      )
      .in("fiscal_year", years)
      .order("source_row", { ascending: true })
      .limit(200000);
    if (error) return json({ error: error.message }, 500);

    const registerRows = (allRowsRaw ?? []) as RegisterRow[];

    // ---- Live Maestro deposits merged into the same dataset ---------------
    // One single page: the register (historical import) and the live API feed
    // the very same KPIs / charts / tables, deduplicated by deal.
    const cid = crypto.randomUUID().slice(0, 8);
    let live: Awaited<ReturnType<typeof fetchLiveRegisterRows>> = {
      rows: [], coverage: { connected: 0, total: 0 }, failures: [], brokers: [],
    };
    try {
      live = await fetchLiveRegisterRows(admin, user.id, isAdmin && scope === "all", years, cid);
    } catch (e) {
      console.warn("[pp-commission-stats] live merge failed", e);
    }
    const seenDeals = new Set(registerRows.map((r) => dedupeKey(r as any)));
    const liveMerged = live.rows.filter((r) => {
      if (!r.date_trans || !years.includes(Number(r.date_trans.slice(0, 4)))) return false;
      const k = dedupeKey(r as any);
      if (seenDeals.has(k)) return false;
      seenDeals.add(k);
      return true;
    });
    const allRows = [...registerRows, ...(liveMerged as unknown as RegisterRow[])];

    const { data: prof } = await admin
      .from("planipret_profiles")
      .select("full_name,first_name,last_name,maestro_broker_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const myName: string | null = (prof as any)?.full_name ?? null;
    const myMaestroId: string | null = (prof as any)?.maestro_broker_id ?? null;
    const myKeys = new Set(
      [
        agentKey(myName),
        agentKey([(prof as any)?.first_name, (prof as any)?.last_name].filter(Boolean).join(" ")),
      ].filter(Boolean) as string[],
    );

    const isMineRow = (r: any) => {
      if (r.broker_user_id) return r.broker_user_id === user.id;
      if (myMaestroId && (r.maestro_broker_id === myMaestroId || r.cabinet === myMaestroId)) return true;
      if (r.agent_key && myKeys.has(r.agent_key)) return true;
      const k1 = agentKey(r.agent_name);
      const k2 = agentKey(r.target_name);
      return Boolean((k1 && myKeys.has(k1)) || (k2 && myKeys.has(k2)));
    };

    const scopedAll = scope === "all" && isAdmin ? allRows : allRows.filter(isMineRow);

    // Optional agent filter (admin global view)
    const mine = agent
      ? scopedAll.filter((r) => (r.agent_name ?? "").trim().toLowerCase() === agent.toLowerCase())
      : scopedAll;

    const resolved = resolveWindow(granularity, year, periodIndex);
    const cyYtd = resolved.window;
    const pyYtd = resolved.priorWindow;
    const cyMonth = monthWindow(year, month);
    const pyMonth = monthWindow(year - 1, month);

    const kpi = {
      ytd: metrics(mine, cyYtd),
      ytdPy: metrics(mine, pyYtd),
      month: metrics(mine, cyMonth),
      monthPy: metrics(mine, pyMonth),
      activeLenders: uniq(volumeTranches(mine, cyYtd).map((r) => r.institution)).length,
      activeBrokers: uniq(volumeTranches(scopedAll, cyYtd).map((r) => r.agent_name)).length,
    };

    // Trend series adapted to the granularity (weeks when granularity=week, otherwise months)
    const series =
      granularity === "week"
        ? Array.from({ length: isoWeeksInYear(year) }, (_, i) => {
            const w = i + 1;
            const wc = weekWindow(year, w);
            const wp = weekWindow(year - 1, Math.min(isoWeeksInYear(year - 1), w));
            const c = metrics(mine, wc);
            const p = metrics(mine, wp);
            return {
              index: w,
              label: `S${w}`,
              cyVolume: c.volume, cyDeals: c.deals, cyCommission: c.commission,
              pyVolume: p.volume, pyDeals: p.deals, pyCommission: p.commission,
              avgDeal: c.avgDeal, bps: c.bps,
              volumeYoy: yoy(c.volume, p.volume), commissionYoy: yoy(c.commission, p.commission),
            };
          })
        : null;

    // Per-broker leaderboard on the selected window (admin global view)
    const brokerKeys = uniq([
      ...volumeTranches(scopedAll, cyYtd).map((r) => r.agent_name),
      ...volumeTranches(scopedAll, pyYtd).map((r) => r.agent_name),
    ]);
    const brokerTotalVolume = periodVolume(scopedAll, cyYtd);
    const brokers = brokerKeys
      .map((name) => {
        const c = metrics(scopedAll, cyYtd, { broker: name });
        const p = metrics(scopedAll, pyYtd, { broker: name });
        const idRow = scopedAll.find((x) => x.agent_name === name) as any;
        return {
          broker: name,
          firstName: idRow?.first_name ?? null,
          lastName: idRow?.last_name ?? null,
          maestroBrokerId: idRow?.maestro_broker_id ?? null,
          brokerUserId: idRow?.broker_user_id ?? null,
          isMe: !!myName && name.trim().toLowerCase() === myName.trim().toLowerCase(),
          volume: c.volume, deals: c.deals, commission: c.commission,
          avgDeal: c.avgDeal, bps: c.bps, commissionPerDeal: c.commissionPerDeal,
          pyVolume: p.volume, pyDeals: p.deals, pyCommission: p.commission,
          sharePct: brokerTotalVolume ? c.volume / brokerTotalVolume : 0,
          volumeYoy: yoy(c.volume, p.volume),
          dealYoy: yoy(c.deals, p.deals),
          commissionYoy: yoy(c.commission, p.commission),
        };
      })
      .sort((a, b) => b.volume - a.volume)
      .map((x, i) => ({ rank: i + 1, ...x }));

    const agentsWithData = uniq(scopedAll.map((r) => r.agent_name));

    // Firm-wide broker directory: in the admin global view the filter must list
    // every broker of the firm, not just those already present in the imported
    // register. Brokers without any row are flagged so the UI can explain why.
    let directoryBrokers: {
      name: string;
      userId: string | null;
      maestroBrokerId: string | null;
      connected: boolean;
      hasData: boolean;
    }[] = [];
    if (isAdmin && scope === "all") {
      const { data: profs } = await admin
        .from("planipret_profiles")
        .select("user_id, full_name, first_name, last_name, maestro_broker_id, maestro_connected")
        .limit(2000);
      const dataKeys = new Set(agentsWithData.map((n) => agentKey(n)).filter(Boolean) as string[]);
      directoryBrokers = (profs ?? [])
        .map((p: any) => {
          const name = String(
            p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(" ") ?? "",
          ).trim();
          if (!name) return null;
          const k = agentKey(name);
          return {
            name,
            userId: p.user_id ?? null,
            maestroBrokerId: p.maestro_broker_id ?? null,
            connected: Boolean(p.maestro_connected),
            hasData: Boolean(k && dataKeys.has(k)),
          };
        })
        .filter(Boolean) as typeof directoryBrokers;
      // de-dup by normalized name
      const seenDir = new Set<string>();
      directoryBrokers = directoryBrokers.filter((b) => {
        const k = agentKey(b.name) ?? b.name.toLowerCase();
        if (seenDir.has(k)) return false;
        seenDir.add(k);
        return true;
      });
      directoryBrokers.sort((a, b) => a.name.localeCompare(b.name));
    }

    const availableAgents = uniq([
      ...agentsWithData,
      ...directoryBrokers.map((b) => b.name),
    ]).sort((a, b) => a.localeCompare(b));


    // Per-broker × per-year matrix (multi-year evolution, independent of the selected window)
    const yearsWithData = Array.from(
      new Set(scopedAll.map((r) => Number((r as any).fiscal_year)).filter((y) => Number.isFinite(y))),
    ).sort((a, b) => a - b);
    const yearlyBrokerKeys = uniq(scopedAll.map((r) => r.agent_name)).sort((a, b) => a.localeCompare(b));
    const brokerYearly = yearlyBrokerKeys.map((name) => {
      const idRow = scopedAll.find((x) => x.agent_name === name) as any;
      const cells = yearsWithData.map((y) => {
        const m = metrics(scopedAll, yearWindow(y), { broker: name });
        return { year: y, volume: m.volume, deals: m.deals, commission: m.commission, bps: m.bps, avgDeal: m.avgDeal };
      });
      return {
        broker: name,
        firstName: idRow?.first_name ?? null,
        lastName: idRow?.last_name ?? null,
        brokerUserId: idRow?.broker_user_id ?? null,
        maestroBrokerId: idRow?.maestro_broker_id ?? null,
        cells,
        totalVolume: cells.reduce((a, c) => a + c.volume, 0),
        totalDeals: cells.reduce((a, c) => a + c.deals, 0),
        totalCommission: cells.reduce((a, c) => a + c.commission, 0),
      };
    }).sort((a, b) => b.totalVolume - a.totalVolume);

    // Brokers whose register rows are not attached to a portal account yet
    const unlinkedBrokers = uniq(scopedAll.filter((r: any) => !r.broker_user_id).map((r) => r.agent_name))
      .map((name) => {
        const rows = scopedAll.filter((r) => r.agent_name === name);
        return { broker: name, rows: rows.length, commission: rows.reduce((a, r) => a + (Number(r.amount) || 0), 0) };
      });

    const monthly = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const wc = monthWindow(year, m);
      const wp = monthWindow(year - 1, m);
      const c = metrics(mine, wc);
      const p = metrics(mine, wp);
      return {
        month: m,
        cyVolume: c.volume,
        cyDeals: c.deals,
        cyCommission: c.commission,
        pyVolume: p.volume,
        pyDeals: p.deals,
        pyCommission: p.commission,
        volumeYoy: yoy(c.volume, p.volume),
        dealYoy: yoy(c.deals, p.deals),
        commissionYoy: yoy(c.commission, p.commission),
        avgDeal: c.avgDeal,
        bps: c.bps,
        commissionPerDeal: c.commissionPerDeal,
      };
    });

    const quarters = [1, 2, 3, 4].map((q) => {
      const wc = quarterWindow(year, q);
      const wp = quarterWindow(year - 1, q);
      const c = metrics(mine, wc);
      const p = metrics(mine, wp);
      return { quarter: q, ...c, pyVolume: p.volume, pyDeals: p.deals, pyCommission: p.commission };
    });

    const lenders = breakdown(mine, cyYtd, pyYtd, "institution");
    const products = breakdown(mine, cyYtd, pyYtd, "mortgage_type");
    const terms = breakdown(mine, cyYtd, pyYtd, "term");

    // Type x Term volume matrix
    const typeKeys = uniq(volumeTranches(mine, cyYtd).map((r) => r.mortgage_type));
    const termKeys = uniq(volumeTranches(mine, cyYtd).map((r) => r.term));
    const matrix = typeKeys.map((t) => ({
      type: t,
      cells: termKeys.map((tm) => ({
        term: tm,
        volume: periodVolume(mine, cyYtd, { mortgage_type: t, term: tm }),
      })),
      total: periodVolume(mine, cyYtd, { mortgage_type: t }),
    }));

    // Commission by type (all commission types, no dedup)
    const commissionTypes = uniq(
      mine.filter((r) => r.date_trans && r.date_trans >= cyYtd.start && r.date_trans <= cyYtd.end && !isInsurance(r)).map((r) => r.commission_type),
    ).map((t) => ({
      type: t,
      amount: mine
        .filter(
          (r) =>
            r.date_trans &&
            r.date_trans >= cyYtd.start &&
            r.date_trans <= cyYtd.end &&
            !isInsurance(r) &&
            (r.commission_type ?? "") === t,
        )
        .reduce((s, r) => s + Number(r.amount ?? 0), 0),
    })).sort((a, b) => b.amount - a.amount);

    // Club Excellence — nominative standings across all brokers
    const seasonCur = seasonWindow(year - (month >= 8 ? 0 : 1));
    const seasonPrev = seasonWindow(year - (month >= 8 ? 1 : 2));
    const brokerNames = uniq(volumeTranches(allRows, seasonCur).map((r) => r.agent_name));
    const club = brokerNames
      .map((name) => {
        const c = metrics(allRows, seasonCur, { broker: name });
        const p = metrics(allRows, seasonPrev, { broker: name });
        const idRow = scopedAll.find((x) => x.agent_name === name) as any;
        return {
          broker: name,
          firstName: idRow?.first_name ?? null,
          lastName: idRow?.last_name ?? null,
          maestroBrokerId: idRow?.maestro_broker_id ?? null,
          brokerUserId: idRow?.broker_user_id ?? null,
          isMe: !!myName && name.trim().toLowerCase() === myName.trim().toLowerCase(),
          volume: c.volume,
          deals: c.deals,
          commission: c.commission,
          avgDeal: c.avgDeal,
          bps: c.bps,
          pyVolume: p.volume,
          pyDeals: p.deals,
          volumeYoy: yoy(c.volume, p.volume),
        };
      })
      .sort((a, b) => b.volume - a.volume)
      .map((x, i) => ({ rank: i + 1, ...x }));

    const clubMonthly = Array.from({ length: 12 }, (_, i) => {
      const m = ((7 + i) % 12) + 1; // Aug..Jul
      const y = m >= 8 ? Number(seasonCur.start.slice(0, 4)) : Number(seasonCur.start.slice(0, 4)) + 1;
      const w = monthWindow(y, m);
      const mm = metrics(mine, w);
      return { month: m, year: y, volume: mm.volume, deals: mm.deals, commission: mm.commission };
    });

    // Four Aug->Jul season blocks (v3 spec): current + three prior seasons.
    const seasonBaseYear = year - (month >= 8 ? 0 : 1);
    const seasons = [0, 1, 2, 3].map((back) => {
      const sy = seasonBaseYear - back;
      const w = seasonWindow(sy);
      const wp = seasonWindow(sy - 1);
      const c = metrics(mine, w);
      const p = metrics(mine, wp);
      return {
        seasonYear: sy,
        label: `${sy}-${sy + 1}`,
        window: w,
        priorWindow: wp,
        volume: c.volume,
        deals: c.deals,
        commission: c.commission,
        avgDeal: c.avgDeal,
        bps: c.bps,
        commissionPerDeal: c.commissionPerDeal,
        pyVolume: p.volume,
        pyDeals: p.deals,
        pyCommission: p.commission,
        volumeYoy: yoy(c.volume, p.volume),
        dealYoy: yoy(c.deals, p.deals),
        commissionYoy: yoy(c.commission, p.commission),
        monthly: Array.from({ length: 12 }, (_, i) => {
          const m2 = ((7 + i) % 12) + 1;
          const y2 = m2 >= 8 ? sy : sy + 1;
          const mw = monthWindow(y2, m2);
          const mm = metrics(mine, mw);
          return { month: m2, year: y2, volume: mm.volume, deals: mm.deals, commission: mm.commission };
        }),
      };
    });

    // Yearly history for the year filter
    const availableYearsRes = await admin
      .from("planipret_commission_register")
      .select("fiscal_year")
      .not("fiscal_year", "is", null)
      .limit(100000);
    const availableYears = Array.from(
      new Set(((availableYearsRes.data ?? []) as any[]).map((r) => r.fiscal_year as number)),
    ).sort((a, b) => b - a);

    // Reconciliation checks (v3 §17)
    const lenderVolume = lenders.reduce((s2, l) => s2 + l.cyVolume, 0);
    const lenderDeals = lenders.reduce((s2, l) => s2 + l.cyDeals, 0);
    const lenderCommission = lenders.reduce((s2, l) => s2 + l.cyCommission, 0);
    const productVolume = products.reduce((s2, l) => s2 + l.cyVolume, 0);
    const termVolume = terms.reduce((s2, l) => s2 + l.cyVolume, 0);
    const matrixVolume = matrix.reduce((s2, r) => s2 + r.total, 0);

    // Broker Monthly vs Lender Monthly independent MATCH/MISMATCH (v3 §11)
    const brokerScope = agent ? mine : scopedAll;
    const brokerBreak = uniq(brokerScope.map((r) => r.agent_name)).map((name) => ({
      broker: name,
      volume: periodVolume(brokerScope, cyYtd, { broker: name }),
      deals: periodDeals(brokerScope, cyYtd, { broker: name }),
      commission: periodCommission(brokerScope, cyYtd, { broker: name }),
    }));
    const brokerVolume = brokerBreak.reduce((s2, b) => s2 + b.volume, 0);
    const brokerDeals = brokerBreak.reduce((s2, b) => s2 + b.deals, 0);
    const brokerCommission = brokerBreak.reduce((s2, b) => s2 + b.commission, 0);

    const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
    const kpiVolume = kpi.ytd.volume;
    const kpiDeals = kpi.ytd.deals;
    const kpiCommission = kpi.ytd.commission;

    // Quarters reconcile to the cumulative window only when fully inside it (v3 §17)
    const completedQuarters = [1, 2, 3, 4]
      .map((q) => ({ q, w: quarterWindow(year, q) }))
      .filter((x) => x.w.start >= cyYtd.start && x.w.end <= cyYtd.end);
    const quarterUnionWindow: Window | null = completedQuarters.length
      ? { start: completedQuarters[0].w.start, end: completedQuarters[completedQuarters.length - 1].w.end }
      : null;
    const quarterCheck = quarterUnionWindow
      ? {
          applicable: true,
          quarters: completedQuarters.map((x) => x.q),
          window: quarterUnionWindow,
          volume: periodVolume(mine, quarterUnionWindow),
          deals: periodDeals(mine, quarterUnionWindow),
          commission: periodCommission(mine, quarterUnionWindow),
          note:
            "Le contrôle trimestriel ne porte que sur les trimestres complets inclus dans la fenêtre sélectionnée ; l'unicité est recalculée sur la fenêtre trimestrielle, jamais par addition des mois.",
        }
      : { applicable: false, quarters: [] as number[], note: "Aucun trimestre complet dans la fenêtre sélectionnée." };

    const checks = [
      { key: "lenderVolume", label: "Volume — Prêteurs vs KPI", expected: kpiVolume, actual: lenderVolume, ok: near(lenderVolume, kpiVolume) },
      { key: "productVolume", label: "Volume — Mix produits vs KPI", expected: kpiVolume, actual: productVolume, ok: near(productVolume, kpiVolume) },
      { key: "termVolume", label: "Volume — Mix termes vs KPI", expected: kpiVolume, actual: termVolume, ok: near(termVolume, kpiVolume) },
      { key: "matrixVolume", label: "Volume — Matrice type × terme vs KPI", expected: kpiVolume, actual: matrixVolume, ok: near(matrixVolume, kpiVolume) },
      { key: "brokerVolume", label: "Volume — Courtiers vs Prêteurs", expected: lenderVolume, actual: brokerVolume, ok: near(brokerVolume, lenderVolume) },
      { key: "lenderDeals", label: "Dossiers — Prêteurs vs KPI", expected: kpiDeals, actual: lenderDeals, ok: lenderDeals === kpiDeals },
      { key: "brokerDeals", label: "Dossiers — Courtiers vs Prêteurs", expected: lenderDeals, actual: brokerDeals, ok: brokerDeals === lenderDeals },
      { key: "lenderCommission", label: "Commissions — Prêteurs vs KPI", expected: kpiCommission, actual: lenderCommission, ok: near(lenderCommission, kpiCommission) },
      { key: "brokerCommission", label: "Commissions — Courtiers vs KPI", expected: kpiCommission, actual: brokerCommission, ok: near(brokerCommission, kpiCommission) },
    ].map((c) => ({ ...c, status: c.ok ? "MATCH" : "MISMATCH", delta: c.actual - c.expected }));

    const reconciliation = {
      volumeOk: checks.filter((c) => c.key.toLowerCase().includes("volume")).every((c) => c.ok),
      dealsOk: checks.filter((c) => c.key.toLowerCase().includes("deals")).every((c) => c.ok),
      commissionOk: checks.filter((c) => c.key.toLowerCase().includes("commission")).every((c) => c.ok),
      allOk: checks.every((c) => c.ok),
      checks,
      quarterCheck,
      details: {
        kpiVolume, lenderVolume, productVolume, termVolume, matrixVolume, brokerVolume,
        kpiDeals, lenderDeals, brokerDeals,
        kpiCommission, lenderCommission, brokerCommission,
      },
    };

    const calcNotes = [
      "Volume : lignes « base » avec loan_amt > 0 dans la fenêtre exacte, hors lignes d'ajustement (is_adjustment = 1) et hors commissions d'assurance ; dossiers = numéros de contrat uniques.",
      "Dossiers : lignes « base » dans la fenêtre, un contrat compté une seule fois, attribué au prêteur / type / terme / courtier de sa première ligne base de la période.",
      "Commissions : somme de tous les montants de la fenêtre, tous types confondus (base, bonus, bonus2, perform, ajustements), sans dédoublonnage.",
      "Doublons : pour un même contrat et un même type de produit, seule la première ligne base est comptée dans le volume, même si le prêteur ou le montant diffère.",
      "Réinitialisation : l'unicité est recalculée intégralement dans chaque fenêtre (mois, trimestre, cumul annuel, saison, filtre) — jamais par addition de résultats mensuels.",
      "BPS = Commissions / Volume × 10 000 · Dossier moyen = Volume / Dossiers · Commission par dossier = Commissions / Dossiers.",
    ];

    // ---- Discrepancies: raw source value vs value used in the displayed KPI (admin audit) ----
    const inWin = (r: RegisterRow) => !!r.date_trans && r.date_trans >= cyYtd.start && r.date_trans <= cyYtd.end;
    const winRows = mine.filter(inWin).sort((a, b) => a.source_row - b.source_row);
    const countedVolumeRows = new Set(volumeTranches(mine, cyYtd).map((r) => r.source_row));
    const countedDealRows = new Set(dealContracts(mine, cyYtd).map((r) => r.source_row));
    const dLabel = (k: string) =>
      k === "deduplicated"
        ? "DÉDOUBLONNÉ"
        : k === "excluded_type"
          ? "HORS VOLUME"
          : k === "missing_amount"
            ? "NON MAPPÉ"
            : k === "invalid_loan"
              ? "NON MAPPÉ"
              : "OK";

    const discRows: any[] = [];
    const discCounts: Record<string, number> = {};
    const bumpD = (k: string) => { discCounts[k] = (discCounts[k] ?? 0) + 1; };
    let discTotalGap = 0;
    for (const r of winRows) {
      const isBaseRow = (r.commission_type ?? "").trim().toLowerCase() === "base";
      const loanRaw = Number(r.loan_amt ?? 0);
      const amountRaw = r.amount;
      const push = (kind: string, field: string, rawValue: unknown, displayed: number) => {
        bumpD(kind);
        discTotalGap += Math.abs(Number(rawValue ?? 0) - displayed);
        if (discRows.length < 800) {
          discRows.push({
            source: "registre",
            sourceRow: r.source_row,
            date: r.date_trans,
            number: r.number,
            broker: r.agent_name,
            firstName: (r as any).first_name ?? null,
            lastName: (r as any).last_name ?? null,
            maestroBrokerId: (r as any).maestro_broker_id ?? null,
            institution: r.institution,
            mortgageType: r.mortgage_type,
            commissionType: r.commission_type,
            field,
            rawValue: rawValue ?? null,
            displayedValue: displayed,
            delta: Number(rawValue ?? 0) - displayed,
            kind,
            status: dLabel(kind),
          });
        }
      };

      if (isBaseRow && loanRaw > 0 && !countedVolumeRows.has(r.source_row)) {
        push("deduplicated", "loan_amt", loanRaw, 0);
      } else if (!isBaseRow && loanRaw > 0) {
        push("excluded_type", "loan_amt", loanRaw, 0);
      } else if (isBaseRow && (r.loan_amt === null || r.loan_amt === undefined || !Number.isFinite(loanRaw) || loanRaw <= 0)) {
        push("invalid_loan", "loan_amt", r.loan_amt ?? null, 0);
      }

      if (amountRaw !== null && amountRaw !== undefined && !Number.isFinite(Number(amountRaw))) {
        push("missing_amount", "amount", amountRaw, 0);
      }
    }

    const discrepancies = {
      window: cyYtd,
      scanned: winRows.length,
      countedVolumeRows: countedVolumeRows.size,
      countedDealRows: countedDealRows.size,
      total: Object.values(discCounts).reduce((s2, v) => s2 + v, 0),
      counts: discCounts,
      totalGap: discTotalGap,
      rows: discRows,
      legend: [
        "DÉDOUBLONNÉ : ligne base dont la tranche (numéro + institution + type + montant) est déjà comptée dans la fenêtre — le montant brut n'alimente pas le volume affiché.",
        "HORS VOLUME : la ligne porte un montant de prêt mais son type de commission n'est pas « base » — exclue du volume par la règle, commission conservée.",
        "NON MAPPÉ : montant du prêt absent, nul ou non numérique sur une ligne base, ou montant de commission non numérique — aucune valeur retenue.",
      ],
    };

    // ---- Drill-down: one broker, selected window, commissions by type + deal lines ----
    const detailAgent: string | null =
      typeof body?.detailAgent === "string" && body.detailAgent.trim() ? body.detailAgent.trim() : null;
    let detail: any = null;
    if (detailAgent) {
      const dRows = scopedAll
        .filter((r) => (r.agent_name ?? "").trim().toLowerCase() === detailAgent.toLowerCase())
        .filter(inWin)
        .sort((a, b) => (a.date_trans ?? "").localeCompare(b.date_trans ?? "") || a.source_row - b.source_row);
      const dVolRows = new Set(
        volumeTranches(scopedAll.filter((r) => (r.agent_name ?? "").trim().toLowerCase() === detailAgent.toLowerCase()), cyYtd)
          .map((r) => r.source_row),
      );
      const dDealRows = new Set(
        dealContracts(scopedAll.filter((r) => (r.agent_name ?? "").trim().toLowerCase() === detailAgent.toLowerCase()), cyYtd)
          .map((r) => r.source_row),
      );
      const idRow = dRows[0] as any;
      const typeKeysD = uniq(dRows.map((r) => r.commission_type));
      const byType = typeKeysD
        .map((t) => {
          const sub = dRows.filter((r) => (r.commission_type ?? "") === t);
          return {
            type: t,
            rows: sub.length,
            commission: sub.reduce((s2, r) => s2 + Number(r.amount ?? 0), 0),
            volume: sub.filter((r) => dVolRows.has(r.source_row)).reduce((s2, r) => s2 + Number(r.loan_amt ?? 0), 0),
            deals: sub.filter((r) => dDealRows.has(r.source_row)).length,
          };
        })
        .sort((a, b) => b.commission - a.commission);

      const byPeriod = Array.from(
        dRows.reduce((map, r) => {
          const k = (r.date_trans ?? "").slice(0, 7);
          const cur = map.get(k) ?? { period: k, commission: 0, volume: 0, deals: 0, rows: 0 };
          cur.rows += 1;
          cur.commission += Number(r.amount ?? 0);
          if (dVolRows.has(r.source_row)) cur.volume += Number(r.loan_amt ?? 0);
          if (dDealRows.has(r.source_row)) cur.deals += 1;
          map.set(k, cur);
          return map;
        }, new Map<string, any>()).values(),
      ).sort((a: any, b: any) => a.period.localeCompare(b.period));

      detail = {
        agent: detailAgent,
        firstName: idRow?.first_name ?? null,
        lastName: idRow?.last_name ?? null,
        maestroBrokerId: idRow?.maestro_broker_id ?? null,
        window: cyYtd,
        periodLabel: resolved.label,
        kpi: metrics(scopedAll, cyYtd, { broker: detailAgent }),
        kpiPy: metrics(scopedAll, pyYtd, { broker: detailAgent }),
        byType,
        byPeriod,
        lines: dRows.slice(0, 2000).map((r) => ({
          sourceRow: r.source_row,
          date: r.date_trans,
          number: r.number,
          institution: r.institution,
          mortgageType: r.mortgage_type,
          term: r.term,
          commissionType: r.commission_type,
          loanAmt: r.loan_amt,
          amount: r.amount,
          countedInVolume: dVolRows.has(r.source_row),
          countedInDeals: dDealRows.has(r.source_row),
          provenanceField: "amount",
          volumeField: "loan_amt",
          provenanceSource: "registre",
        })),
        truncated: dRows.length > 2000,
      };
    }


    // ---- Data integrity for the scoped rows (per fiscal year + duplicates + orphans) ----
    const volSourceRows = new Set(volumeTranches(mine, cyYtd).map((r) => r.source_row));
    const dealSourceRows = new Set(dealContracts(mine, cyYtd).map((r) => r.source_row));

    const byYearMap = new Map<number, any>();
    for (const r of mine) {
      const fy = (r as any).fiscal_year ?? (r.date_trans ? Number(r.date_trans.slice(0, 4)) : null);
      if (!fy) continue;
      const cur = byYearMap.get(fy) ?? { year: fy, rows: 0, volume: 0, commission: 0, sheets: new Set<string>(), outOfYear: 0 };
      cur.rows += 1;
      cur.commission += Number(r.amount ?? 0);
      if ((r.commission_type ?? "").trim().toLowerCase() === "base") cur.volume += Number(r.loan_amt ?? 0);
      const sheet = (r as any).sheet_name;
      if (sheet) cur.sheets.add(String(sheet));
      if (r.date_trans && Number(r.date_trans.slice(0, 4)) !== fy) cur.outOfYear += 1;
      byYearMap.set(fy, cur);
    }
    const integrityYears = Array.from(byYearMap.values())
      .map((y: any) => ({ ...y, sheets: Array.from(y.sheets) }))
      .sort((a: any, b: any) => b.year - a.year);

    const dupMap = new Map<string, number>();
    for (const r of mine) {
      const k = `${r.number ?? ""}|${r.date_trans ?? ""}|${Number(r.amount ?? 0).toFixed(2)}|${(r.commission_type ?? "")}|${Number(r.loan_amt ?? 0).toFixed(2)}`;
      dupMap.set(k, (dupMap.get(k) ?? 0) + 1);
    }
    const duplicateRows = Array.from(dupMap.values()).reduce((s2, c) => s2 + (c > 1 ? c - 1 : 0), 0);

    const orphanRows = allRows.filter((r) => !r.broker_user_id).length;
    const missingDate = mine.filter((r) => !r.date_trans).length;
    const missingAmount = mine.filter((r) => r.amount === null || r.amount === undefined).length;

    const integrity = {
      totalRows: mine.length,
      years: integrityYears,
      duplicateRows,
      orphanRows,
      missingDate,
      missingAmount,
      outOfYear: integrityYears.reduce((s2: number, y: any) => s2 + y.outOfYear, 0),
      clean: duplicateRows === 0 && missingDate === 0 && missingAmount === 0,
    };

    // ---- Undated Maestro rows: excluded from every KPI, listed for admins ----
    const undatedRows = mine.filter((r) => !r.date_trans);
    const undatedByBroker = new Map<string, any>();
    for (const r of undatedRows) {
      const key = String(r.agent_name ?? (r as any).target_name ?? "—");
      const cur = undatedByBroker.get(key) ?? { broker: key, count: 0, amount: 0, loanAmt: 0, years: new Set<number>() };
      cur.count += 1;
      cur.amount += Number(r.amount ?? 0);
      cur.loanAmt += Number(r.loan_amt ?? 0);
      const fy = (r as any).fiscal_year;
      if (fy) cur.years.add(Number(fy));
      undatedByBroker.set(key, cur);
    }
    const undatedAmount = undatedRows.reduce((s2, r) => s2 + Number(r.amount ?? 0), 0);
    const countedCommission = periodCommission(mine, cyYtd);
    const undated = {
      count: undatedRows.length,
      amount: undatedAmount,
      loanAmt: undatedRows.reduce((s2, r) => s2 + Number(r.loan_amt ?? 0), 0),
      // Share the excluded rows would represent if they were counted.
      impactPct: countedCommission ? undatedAmount / countedCommission : 0,
      byBroker: Array.from(undatedByBroker.values())
        .map((b: any) => ({ ...b, years: Array.from(b.years).sort() }))
        .sort((a: any, b: any) => b.amount - a.amount),
      rows: undatedRows
        .sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0))
        .slice(0, 500)
        .map((r) => ({
          broker: r.agent_name,
          number: r.number,
          institution: r.institution,
          commissionType: r.commission_type,
          fiscalYear: (r as any).fiscal_year ?? null,
          amount: Number(r.amount ?? 0),
          loanAmt: Number(r.loan_amt ?? 0),
          sheet: (r as any).sheet_name ?? null,
        })),
    };

    // ---- Audit: unique volume / unique deals + why rows are excluded --------
    const auditVolume = volumeTranches(mine, cyYtd);
    const auditDeals = dealContracts(mine, cyYtd);
    const auditDealRows = new Set(auditDeals.map((r) => r.source_row));
    const excluded = excludedRows(mine, cyYtd);
    const reasonLabel: Record<string, string> = {
      duplicate_amount: "Répétition exacte (contrat + prêteur + type + montant déjà compté)",
      reversal_cancelled: "Annulée par une réversion négative du même montant",
      reversal_row: "Ligne de réversion négative (annule un financement)",
      adjustment: "Ligne d'ajustement Maestro (is_adjustment = 1)",
      insurance: "Commission d'assurance (exclue partout)",
      non_base: "Type de commission ≠ « base » (bonus, bonus2, perform) — commission conservée",
      no_loan_amount: "Aucun montant de prêt utilisable",
    };
    const reasonAgg = new Map<string, { reason: string; label: string; rows: number; loanAmt: number; commission: number }>();
    for (const e of excluded) {
      const cur = reasonAgg.get(e.reason) ?? {
        reason: e.reason, label: reasonLabel[e.reason] ?? e.reason, rows: 0, loanAmt: 0, commission: 0,
      };
      cur.rows += 1;
      cur.loanAmt += Number(e.row.loan_amt ?? 0);
      cur.commission += Number(e.row.amount ?? 0);
      reasonAgg.set(e.reason, cur);
    }

    const audit = {
      window: cyYtd,
      periodLabel: resolved.label,
      scannedRows: mine.filter(inWin).length,
      uniqueVolumeRows: auditVolume.length,
      uniqueDealRows: auditDeals.length,
      volume: auditVolume.reduce((s2, r) => s2 + Number(r.loan_amt ?? 0), 0),
      commission: periodCommission(mine, cyYtd),
      excludedRows: excluded.length,
      byReason: Array.from(reasonAgg.values()).sort((a, b) => b.rows - a.rows),
      included: auditVolume.slice(0, 1000).map((r) => ({
        sourceRow: r.source_row,
        date: r.date_trans,
        number: r.number,
        institution: r.institution,
        mortgageType: r.mortgage_type,
        term: r.term,
        broker: r.agent_name,
        loanAmt: Number(r.loan_amt ?? 0),
        amount: Number(r.amount ?? 0),
        uniqueVolume: 1 as const,
        uniqueDeal: auditDealRows.has(r.source_row) ? (1 as const) : (0 as const),
      })),
      excluded: excluded.slice(0, 1000).map((e) => ({
        sourceRow: e.row.source_row,
        date: e.row.date_trans,
        number: e.row.number,
        institution: e.row.institution,
        mortgageType: e.row.mortgage_type,
        broker: e.row.agent_name,
        commissionType: e.row.commission_type,
        loanAmt: Number(e.row.loan_amt ?? 0),
        amount: Number(e.row.amount ?? 0),
        reason: e.reason,
        reasonLabel: reasonLabel[e.reason] ?? e.reason,
      })),
      truncated: { included: auditVolume.length > 1000, excluded: excluded.length > 1000 },
    };

    // ---- Deal lines for the selected window (broker "Dossiers" table) ----
    const deals = mine
      .filter(inWin)
      .sort((a, b) => (b.date_trans ?? "").localeCompare(a.date_trans ?? "") || a.source_row - b.source_row)
      .slice(0, 3000)
      .map((r) => ({
        sourceRow: r.source_row,
        date: r.date_trans,
        number: r.number,
        institution: r.institution,
        mortgageType: r.mortgage_type,
        term: r.term,
        commissionType: r.commission_type,
        loanAmt: Number(r.loan_amt ?? 0),
        amount: Number(r.amount ?? 0),
        countedInVolume: volSourceRows.has(r.source_row),
        countedInDeals: dealSourceRows.has(r.source_row),
        broker: r.agent_name,
      }));

    return json({

      ok: true,
      year,
      month,
      scope,
      granularity,
      periodIndex,
      agent,
      window: cyYtd,
      priorWindow: pyYtd,
      periodLabel: resolved.label,
      isAdmin,
      brokerName: myName,
      rowCount: mine.length,
      undated,
      audit,
      availableYears,
      availableAgents,
      agentsWithData,
      directoryBrokers,

      brokers,
      brokerYearly,
      brokerYears: yearsWithData,
      unlinkedBrokers,
      series,
      kpi,
      monthly,
      quarters,
      lenders,
      products,
      terms,
      matrix,
      termKeys,
      commissionTypes,
      club,
      clubMonthly,
      seasons,
      calcNotes,
      season: { current: seasonCur, previous: seasonPrev },
      reconciliation,
      discrepancies,
      detail,
      integrity,
      deals,
      // Live Maestro provenance shown as a single coverage banner on the page.
      liveMerge: {
        rows: liveMerged.length,
        registerRows: registerRows.length,
        coverage: live.coverage,
        liveSyncedAt: live.syncedAt ?? null,
        brokers: live.brokers,
        failures: live.failures.slice(0, 10),
      },
      syncedAt: new Date().toISOString(),


    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
