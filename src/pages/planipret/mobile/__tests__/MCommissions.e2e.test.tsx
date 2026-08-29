/**
 * E2E (parité portail) — écran mobile Commissions.
 *
 * Couvre :
 *  - chargement initial (summary + deposits) et KPIs
 *  - garde de rôle (non courtier / non admin)
 *  - erreur de l'API et affichage du message
 *  - changement de période -> nouvel appel avec la bonne fenêtre
 *  - pagination "Charger plus"
 *  - ouverture du détail d'un dépôt
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const invokeMock = vi.fn();
let outletProfile: any = { role: "broker" };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (fn: string, opts: any) => invokeMock(fn, opts) },
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }),
      getSession: () => Promise.resolve({ data: { session: { access_token: "t" } } }),
    },
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useOutletContext: () => ({ profile: outletProfile }),
    useSearchParams: () => [new URLSearchParams(""), vi.fn()],
  };
});

vi.mock("@/hooks/useMplanipretLang", () => ({
  useMplanipretLang: () => ({ lang: "fr", t: (k: string) => k }),
}));

// Recharts ne se rend pas dans jsdom (pas de layout) — on neutralise le conteneur.
vi.mock("recharts", async () => {
  const React = await import("react");
  const Stub = ({ children }: any) => React.createElement("div", { "data-testid": "chart" }, children);
  return {
    ResponsiveContainer: Stub, BarChart: Stub, ComposedChart: Stub, AreaChart: Stub,
    LineChart: Stub, PieChart: Stub, Pie: Stub, Cell: () => null,
    Bar: () => null, Line: () => null, Area: () => null, Legend: () => null,
    XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
  };

});

import MCommissions from "../MCommissions";

const SUMMARY = {
  total_commission: 156282.05,
  deposit_count: 75,
  average_commission: 2083.76,
  total_loan_volume: 19277881,
  adjustments: 0,
  top_institutions: [{ institution: "BNC", amount: 69606.74, count: 21 }],
  by_date: [{ date: "2026-08-01", amount: 12000, count: 3 }],
  truncated: false,
};

const makeRow = (i: number) => ({
  number: `C-${i}`,
  institution: i % 2 ? "BNC" : "Desjardins",
  amount: 1500 + i,
  loan_amt: 300000 + i,
  date_trans: "2026-08-05",
  commission_type: "base",
  split_type: "planipret",
  primary_client_name: `Client ${i}`,
  is_adjustment: 0,
});

const PAGE_1 = Array.from({ length: 25 }, (_, i) => makeRow(i));
const PAGE_2 = Array.from({ length: 5 }, (_, i) => makeRow(100 + i));

function respond(fn: string, opts: any) {
  const action = opts?.body?.action;
  if (action === "summary") return Promise.resolve({ data: { summary: SUMMARY }, error: null });
  if (action === "deposits") {
    const page = opts?.body?.filters?.page ?? 1;
    return Promise.resolve({
      data: { rows: page === 1 ? PAGE_1 : PAGE_2, pagination: { total: 30, page } },
      error: null,
    });
  }
  if (action === "institutions") return Promise.resolve({ data: { institutions: [{ id: 1, label: "BNC" }] }, error: null });
  if (action === "agents") return Promise.resolve({ data: { agents: [] }, error: null });
  if (action === "preference") return Promise.resolve({ data: { ava_include_commissions: true }, error: null });
  return Promise.resolve({ data: {}, error: null });
}


/** Compare un montant sans dépendre des espaces insécables de fr-CA. */
const norm = (s: string) => s.replace(/[\s\u00A0\u202F]/g, "");
const money = (expected: string) =>
  screen.getByText((_, el) => !!el && el.children.length === 0 && norm(el.textContent ?? "") === norm(expected));

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(respond);
  outletProfile = { role: "broker" };
});

describe("MCommissions (mobile)", () => {
  it("charge le résumé et affiche les KPIs", async () => {
    render(<MCommissions />);
    await waitFor(() => expect(money("156 282 $")).toBeInTheDocument());
    expect(screen.getByText("Dépôts")).toBeInTheDocument();
    expect(screen.getByText("75")).toBeInTheDocument();
    expect(money("19 277 881 $")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith(
      "planipret-commission-reports",
      expect.objectContaining({ body: expect.objectContaining({ action: "summary" }) }),
    );
  });

  it("bloque l'accès pour un rôle non autorisé", async () => {
    outletProfile = { role: "client" };
    render(<MCommissions />);
    expect(
      await screen.findByText(/réservés aux courtiers et administrateurs/i),
    ).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("affiche l'erreur renvoyée par l'API", async () => {
    invokeMock.mockImplementation((fn: string, opts: any) =>
      opts?.body?.action === "summary"
        ? Promise.resolve({ data: null, error: { message: "maestro_not_configured" } })
        : respond(fn, opts),
    );
    render(<MCommissions />);
    expect(await screen.findByText("maestro_not_configured")).toBeInTheDocument();
  });

  it("recharge avec une nouvelle fenêtre quand la période change", async () => {
    render(<MCommissions />);
    await waitFor(() => expect(money("156 282 $")).toBeInTheDocument());
    const firstFrom = invokeMock.mock.calls.find((c) => c[1]?.body?.action === "summary")?.[1].body.filters.date_from;

    fireEvent.click(screen.getByText("Année en cours"));

    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter((c) => c[1]?.body?.action === "summary");
      const lastFrom = calls[calls.length - 1][1].body.filters.date_from;
      expect(lastFrom).not.toBe(firstFrom);
      expect(lastFrom).toMatch(/^\d{4}-01-01/);
    });
  });

  it("pagine les dépôts avec « Charger plus »", async () => {
    render(<MCommissions />);
    await waitFor(() => expect(money("156 282 $")).toBeInTheDocument());
    const more = await screen.findByText(/charger plus/i);
    fireEvent.click(more);
    await waitFor(() =>
      expect(
        invokeMock.mock.calls.some((c) => c[1]?.body?.action === "deposits" && c[1]?.body?.filters?.page === 2),
      ).toBe(true),
    );
  });

  it("ouvre le détail d'un dépôt", async () => {
    render(<MCommissions />);
    await waitFor(() => expect(money("156 282 $")).toBeInTheDocument());
    const rows = screen.getAllByText("Desjardins");
    fireEvent.click(rows[0].closest("button")!);
    await waitFor(() => expect(screen.getAllByLabelText("Fermer").length).toBeGreaterThan(0));
  });
});
