import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

const invoke = vi.fn();
vi.mock("@/lib/planipret/ppEdge", () => ({ ppEdgeInvoke: (...a: any[]) => invoke(...a) }));

vi.mock("recharts", async () => {
  const R = await import("react");
  const Stub = ({ children }: any) => R.createElement("div", { "data-testid": "chart" }, children);
  return {
    ResponsiveContainer: Stub, BarChart: Stub, ComposedChart: Stub, AreaChart: Stub,
    LineChart: Stub, PieChart: Stub, Pie: Stub, Cell: () => null,
    Bar: () => null, Line: () => null, Area: () => null, Legend: () => null,
    XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
  };
});

import MCommissionCharts from "../MCommissionCharts";

const rows = [
  { amount: 1000, loan_amt: 300000, date_trans: "2026-01-15", institution: "BNC", commission_type: "base" },
  { amount: 2000, loan_amt: 500000, date_trans: "2026-02-10", institution: "TD", commission_type: "bonus" },
];

const filters = { date_from: "2026-01-01", date_to: "2026-12-31", commission_type: "base" };

describe("MCommissionCharts", () => {
  beforeEach(() => { invoke.mockReset(); localStorage.clear(); });

  it("charge l'année courante et l'année précédente puis affiche les graphiques", async () => {
    invoke.mockResolvedValue({ data: { rows }, error: null });
    render(<MCommissionCharts filters={filters} lang="fr" cacheScope="test-a" />);

    await waitFor(() => expect(screen.getByTestId("commission-charts")).toBeInTheDocument());
    expect(invoke).toHaveBeenCalledTimes(2);
    const years = invoke.mock.calls.map((c) => c[1].filters.date_from);
    expect(years).toEqual(expect.arrayContaining(["2026-01-01", "2025-01-01"]));
    expect(screen.getAllByTestId("chart").length).toBeGreaterThan(3);
  });

  it("garde les totaux accessibles et explique l'indisponibilité des graphiques si l'API échoue", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "boom" } });
    render(<MCommissionCharts filters={filters} lang="fr" cacheScope="test-b" />);
    expect(await screen.findByTestId("commission-charts-unavailable")).toHaveTextContent(/graphiques sont temporairement indisponibles/i);
  });

  it("revalide une seule fois les graphiques lorsqu’un rafraîchissement est demandé", async () => {
    invoke.mockResolvedValue({ data: { rows }, error: null });
    const view = render(<MCommissionCharts filters={filters} lang="fr" cacheScope="test-c" refreshToken={0} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    view.rerender(<MCommissionCharts filters={filters} lang="fr" cacheScope="test-c" refreshToken={1} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(4));
  });
});
