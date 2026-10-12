import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/planipret/ppEdge", () => ({ ppEdgeInvoke: invoke }));
vi.mock("@/hooks/useCommissionLive", () => ({ useCommissionLive: () => undefined }));
vi.mock("recharts", () => ({ ResponsiveContainer: ({ children }: any) => <div>{children}</div>, BarChart: ({ children }: any) => <div>{children}</div>, ComposedChart: ({ children }: any) => <div>{children}</div>, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Cell: () => null, Line: () => null, Legend: () => null }));
import PaidDepositsCard from "./PaidDepositsCard";

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation((_fn: string, body: any) => {
    if (body.action === "summary") return Promise.resolve({ data: { ok: true, summary: { total_commission: 0, deposit_count: 0, deal_count: 0, total_loan_volume: 0, top_institutions: [], by_date: [] } }, error: null });
    return Promise.resolve({ data: {}, error: null });
  });
});

describe("PaidDepositsCard personal admin scope", () => {
  it("requests only the administrator own Maestro identifier and hides the broker picker", async () => {
    render(<PaidDepositsCard scope="broker" forcedUsersId="93135" presentation="mobile" />);
    await screen.findByText("Commissions déboursées");
    expect(invoke).toHaveBeenCalledWith(
      "planipret-commission-reports",
      expect.objectContaining({ action: "summary", filters: expect.objectContaining({ users_id: "93135" }) }),
      expect.anything(),
    );
    expect(screen.queryByLabelText("Courtier déboursé")).not.toBeInTheDocument();
  });
});
