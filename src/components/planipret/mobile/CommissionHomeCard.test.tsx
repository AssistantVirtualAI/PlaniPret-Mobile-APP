import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import CommissionHomeCard from "./CommissionHomeCard";

const navigate = vi.fn();
const invoke = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@/lib/planipret/ppEdge", () => ({
  ppEdgeInvoke: (...args: unknown[]) => invoke(...args),
}));

const summary = {
  total_commission: 12500,
  deposit_count: 4,
  average_commission: 3125,
  total_loan_volume: 1500000,
  top_institutions: [{ institution: "BNC", amount: 7000 }],
  by_date: [{ date: "2026-09-12", amount: 12500 }],
};

beforeEach(() => {
  navigate.mockReset();
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { summary }, error: null });
});

describe("CommissionHomeCard", () => {
  it("uses the resilient Edge client and keeps an admin home card limited to that admin", async () => {
    render(<CommissionHomeCard profile={{ role: "admin", maestro_broker_id: "admin-broker" }} />);

    await waitFor(() => expect(screen.getByText(/Commissions du mois/i)).toBeInTheDocument());
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));

    for (const [fn, body, options] of invoke.mock.calls) {
      expect(fn).toBe("planipret-commission-reports");
      expect(body).toMatchObject({
        action: "summary",
        filters: { users_id: "admin-broker", commission_type: "base" },
      });
      expect(options).toEqual({ retries: 1, timeoutMs: 12_000 });
    }
  });

  it("shows an actionable state when either summary request fails", async () => {
    invoke
      .mockResolvedValueOnce({ data: { summary }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "Load failed" } });

    render(<CommissionHomeCard profile={{ role: "broker", maestro_broker_id: "broker-1" }} />);

    expect(await screen.findByText(/Commissions Maestro indisponibles/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnecter" })).toBeInTheDocument();
  });
});
