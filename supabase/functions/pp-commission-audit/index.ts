// Audit des commissions : chaque ligne de la base, sa source Maestro et la
// cause exacte de l'écart avec les totaux affichés. Lecture seule, admin only.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  type RegisterRow,
  helperFlags,
  isAdjustment,
  isInsurance,
  hasTransactionDate,
  yearWindow,
  monthWindow,
  metrics,
} from "../_shared/commission-engine.ts";
import { dedupeKey } from "../_shared/commission-live.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

type AuditRow = RegisterRow & {
  id: string;
  source: "register" | "maestro_live";
  broker_label: string | null;
  target_name: string | null;
  synced_at: string | null;
  in_volume: boolean;
  in_deals: boolean;
  in_commission: boolean;
  reason: string;
};

/** Cause lisible expliquant pourquoi une ligne ne compte pas (ou compte). */
function reasonFor(r: RegisterRow, uniqueVolume: boolean, uniqueDeal: boolean, inWindow: boolean): string {
  if (!hasTransactionDate(r)) return "Aucune date de transaction dans Maestro";
  if (!inWindow) return "Hors de la période demandée";
  if (isInsurance(r)) return "Ligne d'assurance — exclue partout";
  if (isAdjustment(r)) return "Ajustement Maestro — compte en commission seulement";
  const type = (r.commission_type ?? "").trim().toLowerCase();
  if (type !== "base") return `Type « ${r.commission_type ?? "inconnu"} » — commission seulement`;
  if (num(r.loan_amt) <= 0) return "Montant de prêt nul ou négatif";
  if (!uniqueVolume && !uniqueDeal) return "Doublon ou contrepassation annulée";
  if (!uniqueVolume) return "Tranche déjà comptée pour ce dossier";
  if (!uniqueDeal) return "Dossier déjà compté";
  return "Comptée dans volume, dossiers et commission";
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
    const { data: isAdminData } = await admin.rpc("is_planipret_admin", { _user_id: user.id });
    const isAdmin = Boolean(isAdminData);

    const body = await req.json().catch(() => ({}));
    const year = Number(body?.year) || new Date().getFullYear();
    const brokerUserId: string | null = typeof body?.broker_user_id === "string" && body.broker_user_id
      ? body.broker_user_id
      : null;
    // Un non-admin n'audite jamais que ses propres lignes.
    const scopedBroker = isAdmin ? brokerUserId : user.id;

    // 1) Registre importé.
    let regQ = admin
      .from("planipret_commission_register")
      .select(
        "id,number,loan_amt,institution,amount,mortgage_type,term,agent_name,target_name,date_trans,commission_type,is_adjustment,source_row,broker_user_id,fiscal_year,sheet_name,map_status",
      )
      .eq("fiscal_year", year)
      .order("source_row", { ascending: true })
      .range(0, 49999);
    if (scopedBroker) regQ = regQ.eq("broker_user_id", scopedBroker);
    const { data: reg, error: regErr } = await regQ;
    if (regErr) return json({ error: regErr.message }, 500);

    // 2) Cache Maestro (source live).
    let liveQ = admin
      .from("planipret_commission_live_cache")
      .select("id,broker_user_id,broker_label,agent_name,date_trans,fiscal_year,row_data,synced_at,dedupe_key")
      .eq("fiscal_year", year)
      .range(0, 49999);
    if (scopedBroker) liveQ = liveQ.eq("broker_user_id", scopedBroker);
    const { data: live, error: liveErr } = await liveQ;
    if (liveErr) return json({ error: liveErr.message }, 500);

    const rows: AuditRow[] = [];
    let source_row = 0;

    for (const r of reg ?? []) {
      rows.push({
        ...(r as any),
        id: (r as any).id,
        source: "register",
        broker_label: (r as any).agent_name ?? null,
        synced_at: null,
        source_row: (r as any).source_row ?? source_row++,
        in_volume: false, in_deals: false, in_commission: false, reason: "",
      });
    }

    const seen = new Set(rows.map((r) => dedupeKey(r as any)));
    let duplicates = 0;
    for (const c of live ?? []) {
      const d = (c as any).row_data ?? {};
      const row: AuditRow = {
        id: (c as any).id,
        source: "maestro_live",
        number: d.number ?? null,
        loan_amt: num(d.loan_amt),
        institution: d.institution ?? null,
        amount: num(d.amount),
        mortgage_type: d.mortgage_type ?? null,
        term: d.term ?? null,
        agent_name: (c as any).agent_name ?? d.agent_name ?? null,
        target_name: d.target_name ?? null,
        broker_label: (c as any).broker_label ?? null,
        date_trans: (c as any).date_trans ?? d.date_trans ?? null,
        commission_type: d.commission_type ?? null,
        is_adjustment: d.is_adjustment,
        source_row: 100000 + source_row++,
        broker_user_id: (c as any).broker_user_id ?? null,
        synced_at: (c as any).synced_at ?? null,
        in_volume: false, in_deals: false, in_commission: false, reason: "",
      } as AuditRow;
      const k = dedupeKey(row as any);
      if (seen.has(k)) {
        duplicates++;
        row.reason = "Déjà présente dans le registre importé — ignorée";
        rows.push(row);
        continue;
      }
      seen.add(k);
      rows.push(row);
    }

    // 3) Classement par les règles officielles, sur l'année civile.
    const w = yearWindow(year);
    const counted = rows.filter((r) => r.reason === "") as RegisterRow[];
    const flags = new Map<RegisterRow, { v: 0 | 1; d: 0 | 1 }>();
    for (const f of helperFlags(counted, w)) flags.set(f.row, { v: f.unique_volume, d: f.unique_deal });

    for (const r of rows) {
      if (r.reason) continue; // doublon live déjà expliqué
      const f = flags.get(r as unknown as RegisterRow) ?? { v: 0 as const, d: 0 as const };
      const inWin = hasTransactionDate(r) && (r.date_trans ?? "") >= w.start && (r.date_trans ?? "") <= w.end;
      r.in_volume = f.v === 1;
      r.in_deals = f.d === 1;
      r.in_commission = inWin && !isInsurance(r);
      r.reason = reasonFor(r, f.v === 1, f.d === 1, inWin);
    }

    // 4) Totaux et détail mensuel, calculés sur exactement le même jeu.
    const totals = metrics(counted, w);
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const mw = monthWindow(year, i + 1);
      const m = metrics(counted, mw);
      return { month: i + 1, volume: m.volume, deals: m.deals, commission: m.commission };
    });

    const gapByReason = new Map<string, { rows: number; amount: number }>();
    for (const r of rows) {
      if (r.in_commission && r.in_volume && r.in_deals) continue;
      const g = gapByReason.get(r.reason) ?? { rows: 0, amount: 0 };
      g.rows++;
      g.amount += num(r.amount);
      gapByReason.set(r.reason, g);
    }

    return json({
      ok: true,
      year,
      is_admin: isAdmin,
      totals,
      monthly,
      duplicates,
      counts: { register: (reg ?? []).length, maestro_live: (live ?? []).length, total: rows.length },
      gaps: Array.from(gapByReason.entries())
        .map(([reason, g]) => ({ reason, ...g }))
        .sort((a, b) => b.rows - a.rows),
      rows: rows
        .sort((a, b) => String(b.date_trans ?? "").localeCompare(String(a.date_trans ?? "")))
        .slice(0, 5000)
        .map((r) => ({
          id: r.id,
          source: r.source,
          number: r.number,
          date_trans: r.date_trans,
          agent_name: r.agent_name,
          broker_label: r.broker_label,
          broker_user_id: r.broker_user_id ?? null,
          institution: r.institution,
          mortgage_type: r.mortgage_type,
          commission_type: r.commission_type,
          loan_amt: num(r.loan_amt),
          amount: num(r.amount),
          in_volume: r.in_volume,
          in_deals: r.in_deals,
          in_commission: r.in_commission,
          reason: r.reason,
          synced_at: r.synced_at,
        })),
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
