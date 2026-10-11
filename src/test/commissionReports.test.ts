import { describe, it, expect } from "vitest";
import {
  normalizeFilters,
  buildDepositQuery,
  commissionGet,
  summarize,
  paidAnalytics,
  collectPaidDeposits,
  PAID_COMMISSION_PATH,
  PENDING_COMMISSION_PATH,
} from "../../supabase/functions/_shared/commission-reports";
import { deterministicPaidChecks, deterministicPendingChecks } from "../../supabase/functions/_shared/commission-validation";

describe("commission report filters", () => {
  it("rejects non-numeric users_id and unknown commission types", () => {
    const { errors } = normalizeFilters({ users_id: "abc'; drop--", commission_type: "hack" });
    expect(errors.users_id).toBeTruthy();
    expect(errors.commission_type).toBeTruthy();
  });

  it("requires both dates and a valid order", () => {
    expect(normalizeFilters({ date_from: "2026-01-01" }).errors.date_to).toBeTruthy();
    expect(normalizeFilters({ date_from: "2026-05-01", date_to: "2026-01-01" }).errors.date_to).toBeTruthy();
  });

  it("expands a valid range to full days", () => {
    const { filters, errors } = normalizeFilters({ date_from: "2026-01-01", date_to: "2026-01-31" });
    expect(errors).toEqual({});
    expect(filters.date_from).toBe("2026-01-01 00:00:00");
    expect(filters.date_to).toBe("2026-01-31 23:59:59");
  });

  it("caps legacy per_page requests at the server boundary", () => {
    const legacy = normalizeFilters({ per_page: 5000 });
    expect(legacy.errors).toEqual({});
    expect(legacy.filters.per_page).toBe(200);
    const qs = buildDepositQuery({ users_id: "93135" });
    expect(qs.get("users_id")).toBe("93135");
    expect(qs.get("commission_type")).toBe("base");
    expect(qs.get("order_by")).toBe("date_trans");
    expect(qs.get("per_page")).toBe("50");
  });
});

describe("commission upstream responses", () => {
  it("keeps paid and pending endpoints distinct and sums every paid bucket", async () => {
    const originalFetch = globalThis.fetch;
    const paths: string[] = [];
    globalThis.fetch = (async (input: any) => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      return new Response(JSON.stringify({ data: [{ number: "C1", amount: 100, loan_amt: 300000, date_trans: "2026-10-01" }], meta: { last_page: 1 } }));
    }) as typeof fetch;
    try {
      const result = await collectPaidDeposits("test", { users_id: "313846" }, "cid");
      expect(result.fatal).toBeNull();
      expect(paths).toEqual(Array(4).fill(PAID_COMMISSION_PATH));
      expect(paths).not.toContain(PENDING_COMMISSION_PATH);
      expect(summarize(result.rows).total_commission).toBe(400);
      expect(summarize(result.rows).total_loan_volume).toBe(300000);
      expect(result.total).toBe(4);
    } finally { globalThis.fetch = originalFetch; }
  });

  it("does not treat a failed bonus bucket as zero or publish partial paid totals", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any) => new URL(String(input)).searchParams.get("commission_type") === "base"
      ? new Response(JSON.stringify({ data: [{ amount: 500 }], meta: { last_page: 1 } }))
      : new Response(JSON.stringify({ message: "refused" }), { status: 403 })) as typeof fetch;
    try {
      const result = await collectPaidDeposits("test", {}, "cid");
      expect(result.fatal?.status).toBe(403);
      expect(result.rows).toEqual([]);
    } finally { globalThis.fetch = originalFetch; }
  });

  it("reads every paid page and rejects malformed lists", async () => {
    const originalFetch = globalThis.fetch;
    let pages = 0;
    globalThis.fetch = (async () => {
      pages++;
      return new Response(JSON.stringify({ data: [{ amount: 10 }], meta: { last_page: 12 } }));
    }) as typeof fetch;
    try {
      const result = await collectPaidDeposits("test", { commission_type: "base" }, "cid");
      expect(pages).toBe(12);
      expect(result.rows).toHaveLength(12);
      expect(result.truncated).toBe(false);
      globalThis.fetch = (async () => new Response(JSON.stringify({ data: {} }))) as typeof fetch;
      expect((await collectPaidDeposits("test", {}, "cid")).fatal?.status).toBe(502);
    } finally { globalThis.fetch = originalFetch; }
  });
  it("does not expose an HTML 502 page as a broker diagnostic", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("<html><title>502 Bad Gateway</title></html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;
    try {
      const result = await commissionGet("/api/main/commissions/reports/deposits", "test", "cid-test");
      expect(result.ok).toBe(false);
      expect(result.status).toBe(502);
      expect(result.data.message).toBe("maestro_upstream_unavailable");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("commission summary", () => {
  it("uses portal rules for unique yearly units, tranches and lender totals", () => {
    const base = { number: "C1", loan_amt: 300000, amount: 1000, institution: "BNC", mortgage_type: "Fixe", commission_type: "base", date_trans: "2026-01-05", is_adjustment: 0 };
    const rows = [base, { ...base, date_trans: "2026-02-05" },
      { ...base, amount: 200, commission_type: "bonus" },
      { ...base, loan_amt: 100000, mortgage_type: "Marge", date_trans: "2026-03-05" },
      { ...base, number: "C2", loan_amt: 500000, is_adjustment: 1 },
      { ...base, loan_amt: -300000 },
      { ...base, number: "C3", loan_amt: 200000, institution: "TD", date_trans: "2026-12-31 23:59:59" },
    ] as any;
    const report = summarize(rows);
    const analytics = paidAnalytics(rows);
    expect(report.deal_count).toBe(2);
    expect(report.total_loan_volume).toBe(600000);
    expect(analytics.months.reduce((s, m) => s + m.volume, 0)).toBe(600000);
    expect(analytics.months.reduce((s, m) => s + m.deals, 0)).toBe(2);
    expect(analytics.lenders).toEqual([{ key: "BNC", volume: 400000, deals: 1 }, { key: "TD", volume: 200000, deals: 1 }]);
    expect(analytics.lenders.reduce((s, l) => s + l.volume, 0)).toBe(report.total_loan_volume);
    expect(report.total_commission).toBe(6200);
  });
  it("aggregates totals, institutions and dates", () => {
    const s = summarize([
      { amount: "1500.50", loan_amt: "300000", institution: "BNC", date_trans: "2026-01-05", is_adjustment: 0 },
      { amount: "500", loan_amt: "100000", institution: "BNC", date_trans: "2026-01-05", is_adjustment: 1 },
      { amount: "1000", loan_amt: "250000", institution: "Desjardins", date_trans: "2026-02-01", is_adjustment: 0 },
    ] as any);
    expect(s.total_commission).toBe(3000.5);
    expect(s.deposit_count).toBe(3);
    expect(s.total_loan_volume).toBe(550000);
    expect(s.adjustments).toBe(1);
    expect(s.top_institutions[0]).toEqual({ institution: "BNC", amount: 2000.5, count: 2 });
    expect(s.by_date.map((d) => d.date)).toEqual(["2026-01-05", "2026-02-01"]);
  });
});

describe("commission output reconciliation", () => {
  it("reconciles paid rows in cents and blocks a changed total", () => {
    const rows = [
      { number: "A", amount: "10.01", loan_amt: 100000, date_trans: "2026-10-09", commission_type: "base", institution: "BNC" },
      { number: "B", amount: "20.02", loan_amt: 200000, date_trans: "2026-10-09", commission_type: "bonus", institution: "TD" },
    ] as any;
    const summary = summarize(rows);
    expect(deterministicPaidChecks(rows, summary).filter((item) => item.key !== "paid_top_institutions_not_over_total").every((item) => item.ok)).toBe(true);
    expect(deterministicPaidChecks(rows, { ...summary, total_commission: 30.04 }).find((item) => item.key === "paid_rows_vs_total")?.delta_cents).toBe(-1);
  });

  it("matches Sandra's official pending PDF totals without confusing file rows and official categories", () => {
    const official = [
      { type: "base", label: "Base", amount: 179887.26 },
      { type: "bonus", label: "Bonus", amount: 84213.91 },
      { type: "bonus2", label: "Bonus 2", amount: 31787.40 },
      { type: "perform", label: "Performance", amount: 17037.38 },
      { type: "override", label: "Override", amount: 15302.22 },
      { type: "external", label: "External", amount: 2917.88 },
    ];
    const total = official.reduce((sum, item) => sum + item.amount, 0);
    const rows = [{ number: "SANDRA", amount: 179887.26, commission_type: "base", date_trans: "2026-10-09" }] as any;
    const checks = deterministicPendingChecks(rows, official, total);
    expect(checks.find((item) => item.key === "pending_categories_vs_official_total")?.ok).toBe(true);
    expect(checks.find((item) => item.key === "pending_base_rows_vs_official_base")?.ok).toBe(true);
    expect(checks.find((item) => item.key === "pending_rows_vs_official_total")?.delta_cents).not.toBe(0);
  });
});
