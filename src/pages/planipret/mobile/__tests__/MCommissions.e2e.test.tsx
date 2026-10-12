/**
 * Régression de composition: l'app mobile ne possède plus un deuxième moteur de
 * rapports. Elle rend exactement les sections qui servent au portail, avec la
 * portée explicite admin globale ou personnelle.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

let outletProfile: any = { role: "broker", maestro_broker_id: "123", user_id: "broker-1" };
const sections = vi.fn();

vi.mock("@/components/planipret/commissions/CommissionSections", () => ({
  default: (props: any) => {
    sections(props);
    return <output data-testid="sections">{JSON.stringify({
      scope: props.scope,
      personalUsersId: props.personalUsersId ?? null,
      defaultSection: props.defaultSection,
      presentation: props.presentation,
      cacheScope: props.cacheScope,
    })}</output>;
  },
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn(), useOutletContext: () => ({ profile: outletProfile }) };
});
vi.mock("@/hooks/useMplanipretLang", () => ({ useMplanipretLang: () => ({ lang: "fr" }) }));

import MCommissions from "../MCommissions";

beforeEach(() => { sections.mockClear(); outletProfile = { role: "broker", maestro_broker_id: "123", user_id: "broker-1" }; });

describe("MCommissions — même architecture que le portail", () => {
  it("utilise une seule section portail pour un courtier", () => {
    render(<MCommissions />);
    expect(screen.getByTestId("sections")).toHaveTextContent('"scope":"broker"');
    expect(screen.getByTestId("sections")).toHaveTextContent('"defaultSection":"paid"');
    expect(screen.getByTestId("sections")).toHaveTextContent('"presentation":"mobile"');
    expect(screen.getByTestId("sections")).toHaveTextContent('"cacheScope":"mobile:broker-1:personal"');
    expect(screen.queryByRole("button", { name: "Tous les courtiers" })).not.toBeInTheDocument();
  });

  it("donne à un administrateur une seule vue globale, puis sa vue personnelle", () => {
    outletProfile = { role: "admin", maestro_broker_id: "456", user_id: "admin-1" };
    render(<MCommissions />);
    expect(screen.getByTestId("sections")).toHaveTextContent('"scope":"admin"');
    expect(screen.getByTestId("sections")).toHaveTextContent('"personalUsersId":null');
    expect(screen.getByTestId("sections")).toHaveTextContent('"cacheScope":"mobile:admin-1:global"');
    fireEvent.click(screen.getByRole("button", { name: "Mes commissions" }));
    expect(screen.getByTestId("sections")).toHaveTextContent('"scope":"broker"');
    expect(screen.getByTestId("sections")).toHaveTextContent('"personalUsersId":"456"');
    expect(screen.getByTestId("sections")).toHaveTextContent('"cacheScope":"mobile:admin-1:personal"');
    expect(screen.getByRole("button", { name: "Mes commissions" })).toHaveAttribute("aria-pressed", "true");
  });

  it("ne fabrique pas de vue personnelle avec un identifiant Maestro absent ou invalide", () => {
    outletProfile = { role: "admin", maestro_broker_id: "not-an-id", user_id: "admin-2" };
    render(<MCommissions />);
    fireEvent.click(screen.getByRole("button", { name: "Mes commissions" }));
    expect(screen.getByTestId("sections")).toHaveTextContent('"scope":"broker"');
    expect(screen.getByTestId("sections")).toHaveTextContent('"personalUsersId":null');
  });
});
