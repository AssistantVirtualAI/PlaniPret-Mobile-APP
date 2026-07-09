export type AdminPeriod = 1 | 7 | 30 | 90;

export type AdminReportFilters = {
  period: AdminPeriod;
  dispatcher: string;
};

export const ADMIN_REPORT_FILTERS_KEY = "pp.admin.reportFilters";
export const ADMIN_REPORT_FILTERS_EVENT = "pp:admin-report-filters";

export const DEFAULT_ADMIN_REPORT_FILTERS: AdminReportFilters = {
  period: 7,
  dispatcher: "all",
};

export function normalizePeriod(value: unknown): AdminPeriod {
  const n = Number(value);
  return n === 1 || n === 30 || n === 90 ? n : 7;
}

export function readAdminReportFilters(): AdminReportFilters {
  try {
    const raw = window.localStorage.getItem(ADMIN_REPORT_FILTERS_KEY);
    if (!raw) return DEFAULT_ADMIN_REPORT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<AdminReportFilters>;
    return {
      period: normalizePeriod(parsed.period),
      dispatcher: parsed.dispatcher || "all",
    };
  } catch {
    return DEFAULT_ADMIN_REPORT_FILTERS;
  }
}

export function writeAdminReportFilters(patch: Partial<AdminReportFilters>) {
  try {
    const next = { ...readAdminReportFilters(), ...patch };
    window.localStorage.setItem(ADMIN_REPORT_FILTERS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(ADMIN_REPORT_FILTERS_EVENT, { detail: next }));
  } catch {
    // ignore storage failures
  }
}

export function periodToRange(period: AdminPeriod): "week" | "month" | "quarter" {
  return period === 30 ? "month" : period === 90 ? "quarter" : "week";
}

export function rangeToPeriod(range: "week" | "month" | "quarter"): AdminPeriod {
  return range === "month" ? 30 : range === "quarter" ? 90 : 7;
}

export function periodLabel(period: AdminPeriod) {
  return period === 7 ? "7 derniers jours" : period === 30 ? "30 derniers jours" : "3 derniers mois";
}