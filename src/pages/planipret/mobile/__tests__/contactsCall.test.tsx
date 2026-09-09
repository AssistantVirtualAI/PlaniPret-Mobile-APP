/**
 * End-to-end guards for the two basic Contacts functions reported broken:
 *  1. the call button must actually place the call (auto-dial), not just open
 *     a prefilled keypad, and must warn when the contact has no number;
 *  2. searching a colleague from the Personal tab must find them even when the
 *     match only exists in the shared directory.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { openDialer, toastError } = vi.hoisted(() => ({ openDialer: vi.fn(), toastError: vi.fn() }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useOutletContext: () => ({ openDialer, profile: {}, registerRefresh: vi.fn() }),
  };
});
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("@/hooks/useMplanipretLang", () => ({ useMplanipretLang: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/native/permissions/contacts", () => ({
  ensureContacts: vi.fn(async () => "unavailable"),
  getContactsPermissionStatus: vi.fn(async () => "unavailable"),
  listDeviceContacts: vi.fn(async () => []),
}));
vi.mock("@/lib/native/permissions/platform", () => ({ openAppSettings: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn(async () => ({ data: { success: true }, error: null })) } },
}));
vi.mock("@/lib/callEdge", () => ({ callEdge: vi.fn(async () => ({ numbers: [] })), toE164: (v: string) => v }));
vi.mock("@/components/planipret/ava/AvaSummarizeSheet", () => ({ default: () => null }));
vi.mock("@/components/planipret/mobile/AiConsentHost", () => ({ ensureAiConsent: vi.fn(async () => true) }));
vi.mock("@/lib/appointmentHistory", () => ({
  saveAppointment: vi.fn(), loadAppointments: () => [], subscribeAppointments: () => () => {},
}));

const personal = [{ id: "p1", first_name: "Marc", last_name: "Client", phone: "5145551234" }];
const directory = [{ id: "d1", first_name: "Sandra", last_name: "Allard", extension: "1037", email: "sandra@planipret.com" }];

vi.mock("@/lib/ppContactsCache", () => ({
  peekPpContacts: (action: string) =>
    action === "list" ? personal : action === "directory" ? directory : [],
  getPpContacts: async (action: string) =>
    action === "list" ? personal : action === "directory" ? directory : [],
  prefetchPpContacts: vi.fn(),
}));

import MContacts from "../MContacts";

const setup = () => render(<MemoryRouter><MContacts /></MemoryRouter>);

describe("MContacts — basic call + search", () => {
  beforeEach(() => { openDialer.mockClear(); toastError.mockClear(); });

  it("places the call directly from a personal contact row", async () => {
    setup();
    const btn = await screen.findAllByLabelText("common.call");
    fireEvent.click(btn[0]);
    expect(openDialer).toHaveBeenCalledWith("5145551234", true);
  });

  it("finds a directory colleague from the Personal tab", async () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("contacts.search"), { target: { value: "sandra" } });
    await waitFor(() => expect(screen.getByText(/Sandra Allard/)).toBeInTheDocument());
    fireEvent.click(screen.getAllByLabelText("common.call")[0]);
    expect(openDialer).toHaveBeenCalledWith("1037", true);
  });
});
