import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { rendered, mobileContext } = vi.hoisted(() => ({
  rendered: vi.fn(),
  mobileContext: { profile: { role: "broker" } as any },
}));

vi.mock("react-router-dom", () => ({
  useOutletContext: () => mobileContext,
}));
vi.mock("@/pages/planipret/admin/PABrokerCommissions", () => ({
  default: (props: unknown) => { rendered(props); return <div>Graphiques Commissions</div>; },
}));

import MBrokerCommissionCharts from "../MBrokerCommissionCharts";

describe("MBrokerCommissionCharts", () => {
  it("préserve la vue globale pour un administrateur", () => {
    mobileContext.profile = { role: "admin" };
    render(<MBrokerCommissionCharts />);
    expect(screen.getByText("Graphiques Commissions")).toBeInTheDocument();
    expect(rendered).toHaveBeenLastCalledWith({ selfOnly: false });
  });

  it("limite un courtier à ses propres commissions", () => {
    mobileContext.profile = { role: "broker" };
    render(<MBrokerCommissionCharts />);
    expect(rendered).toHaveBeenLastCalledWith({ selfOnly: true });
  });
});
