import { Smartphone, LayoutGrid, Bot, TrendingUp } from "lucide-react";
import type { ServiceFinance, ServiceKey } from "@/lib/planipret/pricing";
import { SERVICE_META, fmtMoney, fmtMoneyPrecise } from "@/lib/planipret/pricing";

const ICONS: Record<ServiceKey, any> = {
  mobile: Smartphone,
  widget: LayoutGrid,
  ai: Bot,
};

export function FinancialKpiCard({ data }: { data: ServiceFinance }) {
  const meta = SERVICE_META[data.service];
  const Icon = ICONS[data.service];
  return (
    <div
      className="pp-card relative overflow-hidden"
      style={{ padding: 20, background: `var(--pp-bg-surface), ${meta.gradient}`, borderTop: `2px solid ${meta.color}` }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: meta.gradient, opacity: 0.6 }}
      />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}44` }}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--pp-text-faint)" }}>Utilisateurs actifs</span>
            <div style={{ fontSize: 22, fontWeight: 700, color: meta.color, lineHeight: 1 }} className="tabular-nums">{data.users}</div>
          </div>
        </div>

        <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--pp-text-secondary)", marginBottom: 2 }}>{meta.label}</h3>
        <p style={{ fontSize: 10, color: "var(--pp-text-faint)" }} className="mb-3">
          {fmtMoneyPrecise(data.unitProfit)} profit / utilisateur / mois
        </p>

        <div className="space-y-1.5 pt-3" style={{ borderTop: "1px solid var(--pp-bg-border-2)" }}>
          <Row label="Revenus" value={fmtMoney(data.revenue)} color="var(--pp-text-primary)" />
          <Row label="Coûts" value={`-${fmtMoney(data.cost)}`} color="var(--pp-text-muted)" />
          <div className="flex items-center justify-between pt-1.5 mt-1.5" style={{ borderTop: "1px dashed var(--pp-bg-border-2)" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--pp-text-secondary)" }} className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" style={{ color: "#00D4AA" }} /> Profit mensuel
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#00D4AA" }} className="tabular-nums">{fmtMoney(data.profit)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>Marge</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: meta.color }} className="tabular-nums">{data.marginPct.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color }} className="tabular-nums">{value}</span>
    </div>
  );
}
