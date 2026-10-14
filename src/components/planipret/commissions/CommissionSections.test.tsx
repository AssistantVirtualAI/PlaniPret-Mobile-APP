import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CommissionSections from "./CommissionSections";

vi.mock("./PendingCommissionsCard", () => ({ default: ({ cacheScope, filters, presentation }: any) => <p>pending-{cacheScope}-{filters?.users_id ?? "all"}-{presentation}</p> }));
vi.mock("./RegisterCommissions", () => ({ default: ({ scope, presentation, cacheScope }: any) => <p>register-{scope}-{cacheScope ?? "none"}-{presentation}</p> }));

describe("Commission status sections", () => {
  it("sépare les rapports en attente et déboursés", () => {
    render(<CommissionSections lang="fr" scope="admin" />);
    expect(screen.getByText("pending-admin-all-portal")).toBeVisible();
    expect(screen.queryByText("register-admin-none-portal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Déboursées" }));
    expect(screen.getByText("register-admin-none-portal")).toBeVisible();
    expect(screen.queryByText("pending-admin-all-portal")).not.toBeInTheDocument();
  });

  it("applique exactement la même portée personnelle aux deux sources", () => {
    render(<CommissionSections lang="fr" scope="broker" personalUsersId="93135" cacheScope="mobile:u1:personal" presentation="mobile" defaultSection="paid" />);
    expect(screen.getByText("register-broker-mobile:u1:personal-mobile")).toBeVisible();
    expect(screen.queryByText("pending-mobile:u1:personal-93135-mobile")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "En attente" }));
    expect(screen.getByText("pending-mobile:u1:personal-93135-mobile")).toBeVisible();
    expect(screen.queryByText("register-broker-mobile:u1:personal-mobile")).not.toBeInTheDocument();
  });
});
