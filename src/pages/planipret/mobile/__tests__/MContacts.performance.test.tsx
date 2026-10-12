import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { getPpContacts, listDeviceContacts, deferRefresh, completeRefresh } = vi.hoisted(() => {
  let resolve: ((rows: any[]) => void) | null = null;
  const old = [{ id: "old", first_name: "Marc", last_name: "Déjà chargé", phone: "5145550000" }];
  const getPpContacts = vi.fn(async () => old);
  return {
    getPpContacts,
    deferRefresh: () => getPpContacts.mockImplementationOnce(() => new Promise<any[]>((done) => { resolve = done; })),
    completeRefresh: (rows: any[]) => { if (resolve) resolve(rows); },
    listDeviceContacts: vi.fn(async () => [{ id: "iphone-1", first_name: "Moe", last_name: "Téléphone", phone: "5145550999" }]),
  };
});
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useOutletContext: () => ({ openDialer: vi.fn(), profile: {}, registerRefresh: vi.fn() }),
  };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useMplanipretLang", () => ({ useMplanipretLang: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/native/permissions/contacts", () => ({
  ensureContacts: vi.fn(async () => "granted"),
  getContactsPermissionStatus: vi.fn(async () => "granted"),
  listDeviceContacts,
}));
vi.mock("@/lib/native/deviceContactsCache", () => ({ loadCachedDeviceContacts: vi.fn(async (loader: () => Promise<any[]>) => loader()) }));
vi.mock("@/lib/native/permissions/platform", () => ({ openAppSettings: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn(async (_fn: string, options: any) => {
      const action = options?.body?.action;
      if (action === "list_clients") return { data: { success: true, maestro_user_id: "test-broker", clients: [], total: 0 }, error: null };
      if (action === "list_brokers") return { data: { success: true, maestro_user_id: "test-broker", brokers: [], total: 0 }, error: null };
      return { data: {}, error: null };
    }) },
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })), onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) },
  },
}));
vi.mock("@/lib/callEdge", () => ({ callEdge: vi.fn(async () => ({ numbers: [] })), toE164: (value: string) => value }));
vi.mock("@/components/planipret/ava/AvaSummarizeSheet", () => ({ default: () => null }));
vi.mock("@/components/planipret/mobile/AiConsentHost", () => ({ ensureAiConsent: vi.fn(async () => true) }));
vi.mock("@/lib/appointmentHistory", () => ({ saveAppointment: vi.fn(), loadAppointments: () => [], subscribeAppointments: () => () => {} }));
vi.mock("@/lib/ppContactsCache", () => ({
  peekPpContactsVerified: vi.fn(async () => []),
  peekPpContacts: (action: string) => action === "list" ? [{ id: "old", first_name: "Marc", last_name: "Déjà chargé", phone: "5145550000" }] : null,
  getPpContacts,
  prefetchPpContacts: vi.fn(),
}));

import MContacts from "../MContacts";

describe("MContacts — rafraîchissement en arrière-plan", () => {
  it("conserve les contacts visibles pendant un rafraîchissement forcé", async () => {
    render(<MemoryRouter><MContacts /></MemoryRouter>);

    expect(await screen.findByText("Marc Déjà chargé")).toBeInTheDocument();
    await waitFor(() => expect(getPpContacts).toHaveBeenCalledWith("list", expect.objectContaining({ force: true })));
    deferRefresh();
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    await waitFor(() => expect(getPpContacts.mock.calls.filter(([, options]) => options?.force).length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText("Marc Déjà chargé")).toBeInTheDocument();
    expect(screen.queryByText("common.loading")).not.toBeInTheDocument();
    completeRefresh([{ id: "fresh", first_name: "Marc", last_name: "Actualisé", phone: "5145550001" }]);
    expect(await screen.findByText("Marc Actualisé")).toBeInTheDocument();
  });

  it("charge automatiquement les contacts du téléphone après autorisation", async () => {
    render(<MemoryRouter><MContacts /></MemoryRouter>);
    expect(await screen.findByText("Moe Téléphone")).toBeInTheDocument();
    expect(listDeviceContacts).toHaveBeenCalled();
  });

  it("ouvre le formulaire Maestro complet depuis Nouveau", async () => {
    render(<MemoryRouter><MContacts /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: /common\.new/i }));

    expect(await screen.findByText("Créer le client dans Maestro")).toBeInTheDocument();
    expect(screen.getByText("Identité")).toBeInTheDocument();
    expect(screen.getByText("Coordonnées")).toBeInTheDocument();
    expect(screen.getByText("Adresse Maestro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /créer le client/i })).toBeDisabled();
  });
});
