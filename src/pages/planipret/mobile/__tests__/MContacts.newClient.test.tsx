import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const getPpContacts = vi.fn(async (action: string) => action === "maestro_clients" ? [{ maestro_client_id: "c1", name: "Client déjà présent" }] : []);
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn(), useOutletContext: () => ({ openDialer: vi.fn(), profile: {}, registerRefresh: vi.fn() }) };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useMplanipretLang", () => ({ useMplanipretLang: () => ({ lang: "fr", t: (key: string) => key }) }));
vi.mock("@/lib/native/permissions/contacts", () => ({ ensureContacts: vi.fn(async () => "unavailable"), getContactsPermissionStatus: vi.fn(async () => "unavailable"), listDeviceContacts: vi.fn(async () => []) }));
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
vi.mock("@/components/planipret/mobile/CreateMaestroClientSheet", () => ({
  default: ({ onCreated }: { onCreated: () => void }) => <div role="dialog"><button onClick={onCreated}>Terminer la création simulée</button></div>,
}));
vi.mock("@/lib/ppContactsCache", () => ({
  peekPpContacts: () => null,
  peekPpContactsVerified: vi.fn(async () => []),
  getPpContacts: (...args: any[]) => getPpContacts(...args),
  prefetchPpContacts: vi.fn(),
}));
import MContacts from "../MContacts";

describe("MContacts — création depuis Clients", () => {
  it("affiche Nouveau client, ouvre la fiche puis recharge les clients", async () => {
    render(<MemoryRouter><MContacts /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Clients"));
    expect(screen.queryByRole("button", { name: "Outlook" })).toBeNull();
    const create = await screen.findByRole("button", { name: "Nouveau client" });
    fireEvent.click(create);
    fireEvent.click(await screen.findByRole("button", { name: "Terminer la création simulée" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(getPpContacts).toHaveBeenCalledWith("maestro_clients", expect.objectContaining({ force: true })));
  });
});
