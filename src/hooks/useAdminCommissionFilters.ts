import { useCallback, useEffect, useRef, useState } from "react";

export type AdminCommissionFilters = {
  year: number;
  granularity: "week" | "month" | "quarter" | "year" | "ytd";
  periodIndex: number;
  agent: string;
  lender: string;
  tab: string;
};

const key = (scope: string) => `pp-commission-filters:${scope}:v2`;

export function defaultAdminCommissionFilters(): AdminCommissionFilters {
  const now = new Date();
  return {
    year: now.getFullYear(),
    granularity: "ytd",
    // Year in progress: YTD stops at the current month so the prior-year
    // comparison covers the same period (never a full year vs a partial one).
    periodIndex: now.getMonth() + 1,
    agent: "",
    lender: "",
    tab: "overview",
  };
}

export function readAdminCommissionFilters(scope = "admin"): AdminCommissionFilters | null {
  try {
    const raw = localStorage.getItem(key(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const d = defaultAdminCommissionFilters();
    return {
      year: Number(parsed.year) || d.year,
      granularity: ["week", "month", "quarter", "year", "ytd"].includes(parsed.granularity) ? parsed.granularity : d.granularity,
      periodIndex: (() => {
        const y = Number(parsed.year) || d.year;
        const idx = Number(parsed.periodIndex) || d.periodIndex;
        const now = new Date();
        const cap = parsed.granularity === "ytd" && y === now.getFullYear() ? now.getMonth() + 1 : idx;
        return Math.min(idx, cap);
      })(),
      agent: typeof parsed.agent === "string" ? parsed.agent : "",
      lender: typeof parsed.lender === "string" ? parsed.lender : "",
      tab: typeof parsed.tab === "string" ? parsed.tab : d.tab,
    };
  } catch {
    return null;
  }
}

/** Persists the admin commission filters in the browser (admin portal only). */
export function useAdminCommissionFilters(enabled: boolean, value: AdminCommissionFilters, scope = "admin") {
  const [restored] = useState<AdminCommissionFilters | null>(() => (enabled ? readAdminCommissionFilters(scope) : null));
  const first = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      localStorage.setItem(key(scope), JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [enabled, scope, value.year, value.granularity, value.periodIndex, value.agent, value.lender, value.tab]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(key(scope));
    } catch {
      /* ignore */
    }
  }, [scope]);

  return { restored, clear };
}
