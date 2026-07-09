// Modèle financier Planiprêt — coûts & prix de vente par service par utilisateur/mois
export const SALE_PRICE = 49.95;

export const SERVICE_COSTS = {
  mobile: 8.00,
  widget: 18.99,
  ai: 25.00,
} as const;

export type ServiceKey = keyof typeof SERVICE_COSTS;

export const SERVICE_META: Record<ServiceKey, { label: string; color: string; gradient: string }> = {
  mobile: { label: "Application mobile", color: "#2E9BDC", gradient: "linear-gradient(135deg, rgba(46,155,220,0.18), rgba(46,155,220,0.02))" },
  widget: { label: "Widget web",         color: "#F5A623", gradient: "linear-gradient(135deg, rgba(245,166,35,0.18), rgba(245,166,35,0.02))" },
  ai:     { label: "Agent AI",            color: "#9B7FE8", gradient: "linear-gradient(135deg, rgba(155,127,232,0.18), rgba(155,127,232,0.02))" },
};

export type ServiceFinance = {
  service: ServiceKey;
  users: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  unitProfit: number;
};

export function computeServiceFinance(service: ServiceKey, users: number): ServiceFinance {
  const cost = SERVICE_COSTS[service];
  const unitProfit = SALE_PRICE - cost;
  const revenue = users * SALE_PRICE;
  const totalCost = users * cost;
  const profit = users * unitProfit;
  return {
    service,
    users,
    revenue,
    cost: totalCost,
    profit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    unitProfit,
  };
}

export function computeTotals(rows: ServiceFinance[]) {
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const profit = rows.reduce((s, r) => s + r.profit, 0);
  const users = rows.reduce((s, r) => s + r.users, 0);
  return {
    revenue, cost, profit, users,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    annualProfit: profit * 12,
    annualRevenue: revenue * 12,
  };
}

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

export const fmtMoneyPrecise = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(n);
