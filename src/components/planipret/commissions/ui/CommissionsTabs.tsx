import { useRef } from "react";
import {
  LayoutGrid, Users, TrendingUp, Landmark, PieChart, CalendarRange,
  Table2, Star, FileText, AlertTriangle, Database, ShieldCheck,
} from "lucide-react";

export type TabKey =
  | "overview" | "brokers" | "trend" | "lenders" | "mix" | "quarters"
  | "periods" | "club" | "gaps" | "data" | "deals" | "audit";

const ICONS: Record<TabKey, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  overview: LayoutGrid, brokers: Users, trend: TrendingUp, lenders: Landmark, mix: PieChart,
  quarters: CalendarRange, periods: Table2, club: Star, deals: FileText, gaps: AlertTriangle, data: Database,
  audit: ShieldCheck,
};

/** Segmented pill tabs with icons, counters and horizontal scroll on mobile. */
export default function CommissionsTabs({
  tabs, value, onChange,
}: {
  tabs: { key: TabKey; label: string; count?: number | null; tone?: "gold" | "warn" }[];
  value: TabKey;
  onChange: (k: TabKey) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      role="tablist"
      className="pp-tabs-scroll flex items-center gap-1.5 mb-3"
      style={{ overflowX: "auto", padding: 4, borderRadius: 14, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}
    >
      {tabs.map((t) => {
        const Icon = ICONS[t.key];
        const active = value === t.key;
        const gold = t.tone === "gold";
        const warn = t.tone === "warn";
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] whitespace-nowrap pp-tab-pill"
            style={{
              fontSize: 12.5,
              fontWeight: active || gold ? 800 : 700,
              flex: "0 0 auto",
              transition: "background .18s ease, color .18s ease, box-shadow .18s ease, transform .18s ease",
              transform: active ? "translateY(-1px)" : undefined,
              background: gold
                ? (active ? "linear-gradient(135deg, #FFC94A, #E09A22)" : "linear-gradient(135deg, rgba(255,192,0,.16), rgba(255,192,0,.05))")
                : active
                  ? "linear-gradient(135deg, #2E9BDC, #6D5BF9)"
                  : "transparent",

              color: gold ? (active ? "#1b1400" : "#E0A32B") : active ? "#fff" : "var(--pp-text-secondary)",
              border: gold ? "1px solid rgba(255,192,0,.45)" : "1px solid transparent",
              boxShadow: active ? "0 14px 24px -18px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.22)" : undefined,
            }}
          >
            <Icon className="w-3.5 h-3.5" style={gold ? { fill: active ? "#1b1400" : "#E0A32B" } : undefined} />
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span style={{
                fontSize: 10.5, fontWeight: 900, padding: "1px 6px", borderRadius: 999, marginLeft: 2,
                background: warn ? "rgba(245,158,11,.20)" : active ? "rgba(255,255,255,.22)" : "var(--pp-bg-card)",
                color: warn ? "#f59e0b" : active ? "#fff" : "var(--pp-text-muted)",
              }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
