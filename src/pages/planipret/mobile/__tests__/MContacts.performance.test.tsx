import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { getPpContacts, releaseRefresh } = vi.hoisted(() => {
  let resolve!: (rows: any[]) => void;
  return {
    getPpContacts: vi.fn(() => new Promise<any[]>((done) => { resolve = done; })),
    releaseRefresh: (rows: any[]) => resolve(rows),
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
  listDeviceContacts: vi.fn(async () => []),
}));
vi.mock("@/lib/native/deviceContactsCache", () => ({ loadCachedDeviceContacts: vi.fn(async (loader: () => Promise<any[]>) => loader()) }));
vi.mock("@/lib/native/permissions/platform", () => ({ openAppSettings: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/lib/callEdge", () => ({ callEdge: vi.fn(async () => ({ numbers: [] })), toE164: (value: string) => value }));
vi.mock("@/components/planipret/ava/AvaSummarizeSheet", () => ({ default: () => null }));
vi.mock("@/components/planipret/mobile/AiConsentHost", () => ({ ensureAiConsent: vi.fn(async () => true) }));
vi.mock("@/lib/appointmentHistory", () => ({ saveAppointment: vi.fn(), loadAppointments: () => [], subscribeAppointments: () => () => {} }));
vi.mock("@/lib/ppContactsCache", () => ({
  peekPpContacts: (action: string) => action === "list" ? [{ id: "old", first_name: "Marc", last_name: "Déjà chargé", phone: "5145550000" }] : null,
  getPpContacts,
  prefetchPpContacts: vi.fn(),
}));

import MContacts from "../MContacts";

describe("MContacts — rafraîchissement en arrière-plan", () => {
  it("conserve les contacts visibles pendant un rafraîchissement forcé", async () => {
    render(<MemoryRouter><MContacts /></MemoryRouter>);

    expect(await screen.findByText("Marc Déjà chargé")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));

    await waitFor(() => expect(getPpContacts).toHaveBeenCalledWith("list", expect.objectContaining({ force: true })));
    expect(screen.getByText("Marc Déjà chargé")).toBeInTheDocument();
    expect(screen.queryByText("common.loading")).not.toBeInTheDocument();

    releaseRefresh([{ id: "fresh", first_name: "Marc", last_name: "Actualisé", phone: "5145550001" }]);
    expect(await screen.findByText("Marc Actualisé")).toBeInTheDocument();
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
