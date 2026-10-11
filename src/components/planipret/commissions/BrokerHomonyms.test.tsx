import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

vi.mock("recharts", async () => {
  const React = await import("react");
  const Stub = ({ children }: any) => React.createElement("div", null, children);
  const Null = () => null;
  return {
    ResponsiveContainer: Stub, BarChart: Stub, ComposedChart: Stub, AreaChart: Stub, LineChart: Stub, PieChart: Stub,
    RadarChart: Stub, ScatterChart: Stub, Treemap: Null, Pie: Null, Radar: Null, Scatter: Null, PolarGrid: Null,
    PolarAngleAxis: Null, PolarRadiusAxis: Null, Cell: Null, Bar: Null, Line: Null, Area: Null, Legend: Null,
    XAxis: Null, YAxis: Null, ZAxis: Null, Tooltip: Null, CartesianGrid: Null, ReferenceLine: Null, LabelList: Null,
    Label: Null, Brush: Null, ReferenceArea: Null, Funnel: Null, FunnelChart: Stub, RadialBar: Null, RadialBarChart: Stub,
  };
});

import BrokerLeaderboard from "./BrokerLeaderboard";
import BrokerYearMatrix from "./BrokerYearMatrix";

const A = { broker: "Jean Tremblay", brokerKey: "user:u-a", linked: true, rank: 1, volume: 500000, deals: 2, commission: 1700 };
const B = { broker: "Jean Tremblay", brokerKey: "maestro:222", linked: true, rank: 2, volume: 400000, deals: 1, commission: 1500 };
const X = { broker: "Jean Tremblay", brokerKey: "unlinked:jean tremblay", linked: false, rank: 3, volume: 100000, deals: 1, commission: 250 };

describe("homonym brokers in UI", () => {
  it("leaderboard: distinct rows, clicks send the stable key, unlinked not clickable", () => {
    const onSelect = vi.fn();
    const { container } = render(<BrokerLeaderboard lang="fr" brokers={[A, B, X]} onSelect={onSelect} />);
    const rows = container.querySelectorAll("tr[data-broker-key]");
    expect(rows).toHaveLength(3);
    fireEvent.click(rows[0]); fireEvent.click(rows[1]); fireEvent.click(rows[2]);
    expect(onSelect.mock.calls).toEqual([["user:u-a"], ["maestro:222"]]);
  });

  it("year matrix: distinct rows, clicks send the stable key", () => {
    const onSelect = vi.fn();
    const cell = (v: number) => [{ year: 2026, volume: v, deals: 1, commission: 1, bps: 0, avgDeal: 0 }];
    const mk = (b: any) => ({ ...b, cells: cell(b.volume), totalVolume: b.volume, totalDeals: b.deals, totalCommission: b.commission });
    const { container } = render(<BrokerYearMatrix lang="fr" years={[2026]} brokerYearly={[mk(A), mk(B), mk(X)]} onSelect={onSelect} />);
    const rows = container.querySelectorAll("tr[data-broker-key]");
    expect(rows).toHaveLength(3);
    rows.forEach((r) => fireEvent.click(r));
    expect(onSelect.mock.calls).toEqual([["user:u-a"], ["maestro:222"]]);
    expect(container.textContent).toContain("non rattaché");
  });
});
