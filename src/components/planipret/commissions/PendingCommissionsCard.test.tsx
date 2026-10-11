import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/planipret/ppEdge", () => ({ ppEdgeInvoke: invoke }));
vi.mock("recharts", () => ({
  ResponsiveContainer: () => null, BarChart: () => null, Bar: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  PieChart: () => null, Pie: () => null, Cell: () => null, Legend: () => null,
  ComposedChart: () => null, Line: () => null,
}));
import PendingCommissionsCard from "./PendingCommissionsCard";

const categories = [
  { type: "base", label: "Base", amount: 179887.26 },
  { type: "bonus", label: "Bonus", amount: 84213.92 },
  { type: "bonus2", label: "Bonus 2", amount: 31787.41 },
  { type: "perform", label: "Performance", amount: 17037.38 },
  { type: "override", label: "Override", amount: 15302.23 },
  { type: "external", label: "External", amount: 2917.88 },
];
const money = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const normalized = (s: string) => s.replace(/\s/g, "");

beforeEach(() => {
  sessionStorage.clear();
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { ok: true, summary: {
    total_commission: 233013.55, official_total: 331146.08,
    official_by_type: categories, deposit_count: 707, total_loan_volume: 38108465.17,
  }, validation: { status: "MATCH", checked_at: "2026-10-09T18:00:00Z", summary: "Contrôlé" } }, error: null });
});

describe("Official pending commission totals", () => {
  it("shows Maestro total and all six categories with cents, not the sum of files", async () => {
    render(<PendingCommissionsCard cacheScope="broker-sandra" filters={{ users_id: "93135", date_from: "2026-01-01", date_to: "2026-12-31" }} />);
    const region = await screen.findByLabelText("Totaux officiels Maestro");
    for (const item of categories) {
      expect(within(region).getByText((_, el) => el?.children.length === 0 && normalized(el.textContent ?? "") === normalized(money(item.amount)))).toBeInTheDocument();
    }
    expect(screen.getByText((_, el) => el?.children.length === 0 && normalized(el.textContent ?? "") === normalized(money(331146.08)))).toBeInTheDocument();
    expect(within(region).getByText("Outrepasser")).toBeInTheDocument();
    expect(within(region).getByText("Tiers")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("planipret-commission-reports", expect.objectContaining({ action: "pending", filters: expect.objectContaining({ users_id: "93135" }) }), expect.anything());
    expect(screen.getByText("Maestro contrôlé")).toBeInTheDocument();
  });

  it("keeps official zero categories visible", async () => {
    invoke.mockResolvedValue({ data: { ok: true, summary: { official_total: 0, official_by_type: categories.map(item => ({ ...item, amount: 0 })), deposit_count: 0, total_loan_volume: 0 } }, error: null });
    render(<PendingCommissionsCard cacheScope="broker-zero" />);
    const region = await screen.findByLabelText("Totaux officiels Maestro");
    expect(within(region).getAllByText((_, el) => el?.children.length === 0 && normalized(el.textContent ?? "") === normalized(money(0)))).toHaveLength(6);
  });

  it("opens the exact official category table without another API call", async () => {
    render(<PendingCommissionsCard cacheScope="broker-category-table" />);
    await screen.findByLabelText("Totaux officiels Maestro");
    fireEvent.click(screen.getByRole("tab", { name: "Types de commissions" }));
    expect(screen.getByRole("table")).toHaveTextContent("Total officiel Maestro");
    expect(normalized(screen.getByRole("table").textContent ?? "")).toContain(normalized(money(331146.08)));
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("shows monthly table amounts with cents and keeps the official total separate", async () => {
    invoke.mockResolvedValue({ data: { ok: true, summary: { total_commission: 100.12, official_total: 150.23, deposit_count: 1, total_loan_volume: 1000, by_date: [{date:"2026-10-09",amount:100.12,count:1}] } }, error: null });
    render(<PendingCommissionsCard cacheScope="broker-month-table" />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("tab", { name: "Détail mensuel" }));
    expect(normalized(screen.getByRole("table").textContent ?? "")).toContain(normalized(money(100.12)));
    expect(screen.getByRole("table")).toHaveTextContent("Total ventilé");
  });
});