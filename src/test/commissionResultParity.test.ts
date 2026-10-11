// Result parity: the mobile/report path (summarize/paidAnalytics) and the
// desktop register path (commission-engine metrics) must produce identical
// files and volume on one shared synthetic fixture. Canonical model:
// supabase/functions/_shared/commission-engine.ts (both paths call it).
import { describe, expect, it } from "vitest";
import { summarize, paidAnalytics } from "../../supabase/functions/_shared/commission-reports";
import { metrics, type RegisterRow } from "../../supabase/functions/_shared/commission-engine";

const ALL = { start: "0000-01-01", end: "9999-12-31" };
const base = { institution: "BNC", mortgage_type: "Fixe", term: "5", commission_type: "base", is_adjustment: 0, agent_name: "Jean Tremblay" };
const FIXTURE: any[] = [
  { ...base, number: "C1", loan_amt: 300000, amount: 1000, date_trans: "2026-01-05", agent_name_id: 1 },
  { ...base, number: "C1", loan_amt: 300000, amount: 1000, date_trans: "2026-01-05", agent_name_id: 1 }, // exact duplicate
  { ...base, number: "C1", loan_amt: 100000, amount: 300, mortgage_type: "Marge", date_trans: "2026-02-10", agent_name_id: 1 }, // second tranche
  { ...base, number: "C1", loan_amt: 300000, amount: 900, date_trans: "2026-03-01", agent_name_id: 2 }, // same name+contract, other broker
  { ...base, number: "C1", loan_amt: 0, amount: 200, commission_type: "bonus", date_trans: "2026-01-05", agent_name_id: 1 },
  { ...base, number: "C1", loan_amt: 0, amount: 150, commission_type: "bonus2", date_trans: "2026-04-05", agent_name_id: 1 },
  { ...base, number: "C1", loan_amt: 0, amount: 90, commission_type: "performance", date_trans: "2026-05-05", agent_name_id: 1 },
  { ...base, number: "C2", loan_amt: 500000, amount: 800, is_adjustment: 1, date_trans: "2026-06-05", agent_name_id: 1 },
  { ...base, number: "C3", loan_amt: -250000, amount: -400, date_trans: "2026-07-05", agent_name_id: 1 }, // clawback
  { ...base, number: "C4", loan_amt: 0, amount: 120, institution: "Desjardins Assurances", date_trans: "2026-08-05", agent_name_id: 1 },
  { ...base, number: "C5", loan_amt: 0, amount: 75, date_trans: "2026-09-05", agent_name_id: 1 }, // referral, no loan
  { ...base, number: "C6", loan_amt: 200000, amount: 500, date_trans: null, agent_name_id: 1 }, // undated
  { ...base, number: "C7", loan_amt: 400000, amount: 1200, institution: "TD", date_trans: "2026-12-31 23:59:59", agent_name_id: 2 },
];

const toRegister = (rows: any[]): RegisterRow[] => rows.map((r, i) => ({
  ...r, source_row: i, broker_user_id: String(r.agent_name_id),
  date_trans: r.date_trans ? String(r.date_trans).slice(0, 10) : null,
}));

describe("commission result parity (desktop register vs mobile report)", () => {
  const report = summarize(FIXTURE as any);
  const desk = metrics(toRegister(FIXTURE), ALL);

  it("same files and volume on both paths", () => {
    expect(report.deal_count).toBe(desk.deals);
    expect(report.total_loan_volume).toBe(desk.volume);
  });
  it("applies the validated rule: base, unique broker+contract, distinct loans", () => {
    // broker1 C1 (300k+100k), broker2 C1 (300k), broker2 C7 (400k)
    expect(desk.deals).toBe(3);
    expect(desk.volume).toBe(1_100_000);
  });
  it("never merges two brokers sharing a display name", () => {
    const one = metrics(toRegister(FIXTURE.filter((r) => r.agent_name_id === 1)), ALL);
    const two = metrics(toRegister(FIXTURE.filter((r) => r.agent_name_id === 2)), ALL);
    expect(one.deals + two.deals).toBe(desk.deals);
    expect(one.volume + two.volume).toBe(desk.volume);
  });
  it("monthly series sum to the totals and undated rows are reported apart", () => {
    const a = paidAnalytics(FIXTURE.filter((r) => r.date_trans) as any);
    expect(a.months.reduce((s, m) => s + m.volume, 0)).toBe(report.total_loan_volume);
    expect(a.months.reduce((s, m) => s + m.deals, 0)).toBe(report.deal_count);
    expect(report.undated.count).toBe(1);
  });
  it("official commission keeps every category; engine excludes only insurance/referral", () => {
    const dated = FIXTURE.filter((r) => r.date_trans);
    const all = dated.reduce((s, r) => s + r.amount, 0);
    expect(report.total_commission).toBe(all);
    expect(all - desk.commission).toBe(120 + 75);
  });
  it("empty input yields zeros on both paths", () => {
    expect(summarize([]).deal_count).toBe(0);
    expect(metrics([], ALL).volume).toBe(0);
  });
});
