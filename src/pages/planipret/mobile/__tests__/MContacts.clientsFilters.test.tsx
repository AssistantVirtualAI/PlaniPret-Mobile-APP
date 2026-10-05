/**
 * Clients tab: counter, search on name + cell_phone, activity / date-added
 * filters, sort order, zero result and the Clear button.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn(), useOutletContext: () => ({ openDialer: vi.fn(), profile: {}, registerRefresh: vi.fn() }) };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
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
vi.mock("@/lib/appointmentHistory", () => ({ saveAppointment: vi.fn(), loadAppointments: () => [], subscribeAppointments: () => () => {} }));

const DAY = 86400000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
// Alice: added 3 days ago, active. Bruno: 20 days. Chloé: 60 days. Denis: 200 days, dormant.
const clients = [
  { id: "4", name: "Denis Dormant", cell_phone: "4385550004", created_at: ago(200), last_activity_at: ago(200) },
  { id: "2", name: "Bruno Vingt", phone: "5145550002", created_at: ago(20), last_activity_at: ago(0.2) },
  { id: "1", name: "Alice Recente", cell_phone: "5145559911", created_at: ago(3), last_activity_at: ago(1) },
  { id: "3", name: "Chloe Soixante", phone: "5145550003", created_at: ago(60), last_activity_at: ago(60) },
];
vi.mock("@/lib/ppContactsCache", () => ({
  peekPpContacts: (a: string) => (a === "maestro_clients" ? clients : []),
  getPpContacts: async (a: string) => (a === "maestro_clients" ? clients : []),
  prefetchPpContacts: vi.fn(),
}));

import MContacts from "../MContacts";

const NAMES = ["Alice Recente", "Bruno Vingt", "Chloe Soixante", "Denis Dormant"];
const order = () => NAMES.map((n) => ({ n, el: screen.queryByText(n) }))
  .filter((x) => x.el)
  .sort((a, b) => (a.el!.compareDocumentPosition(b.el!) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  .map((x) => x.n);

async function open() {
  render(<MemoryRouter><MContacts /></MemoryRouter>);
  fireEvent.click(await screen.findByText("Clients"));
  await screen.findByText("Alice Recente");
}
const count = () => screen.getByTestId("clients-count").textContent;
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("MContacts — Clients filters", () => {
  it("shows the loaded counter", async () => {
    await open();
    expect(count()).toBe("4 clients chargés");
  });

  it("searches by name and by cell_phone with an X sur Y counter", async () => {
    await open();
    const box = screen.getByPlaceholderText("contacts.search");
    fireEvent.change(box, { target: { value: "bruno" } });
    expect(order()).toEqual(["Bruno Vingt"]);
    expect(count()).toBe("1 sur 4 clients");
    fireEvent.change(box, { target: { value: "5145559911" } });
    expect(order()).toEqual(["Alice Recente"]);
  });

  it("filters by activity: 30 days, 90 days, inactive", async () => {
    await open();
    pick("Activité", "recent");
    expect(order()).toEqual(["Alice Recente", "Bruno Vingt"]);
    pick("Activité", "active");
    expect(order()).toEqual(["Alice Recente", "Bruno Vingt", "Chloe Soixante"]);
    pick("Activité", "dormant");
    expect(order()).toEqual(["Denis Dormant"]);
  });

  it("filters by date added: 7 / 30 / 90 / 365 days", async () => {
    await open();
    pick("Date d'ajout", "7");
    expect(order()).toEqual(["Alice Recente"]);
    pick("Date d'ajout", "30");
    expect(order()).toEqual(["Alice Recente", "Bruno Vingt"]);
    pick("Date d'ajout", "90");
    expect(order()).toEqual(["Alice Recente", "Bruno Vingt", "Chloe Soixante"]);
    pick("Date d'ajout", "365");
    expect(order()).toHaveLength(4);
  });

  it("sorts by name, newest, oldest and recent activity", async () => {
    await open();
    expect(order()).toEqual(NAMES);
    pick("Trier", "newest");
    expect(order()).toEqual(["Alice Recente", "Bruno Vingt", "Chloe Soixante", "Denis Dormant"]);
    pick("Trier", "oldest");
    expect(order()).toEqual(["Denis Dormant", "Chloe Soixante", "Bruno Vingt", "Alice Recente"]);
    pick("Trier", "activity");
    expect(order()).toEqual(["Bruno Vingt", "Alice Recente", "Chloe Soixante", "Denis Dormant"]);
  });

  it("handles zero result and the Clear button restores the list", async () => {
    await open();
    pick("Activité", "dormant");
    pick("Date d'ajout", "7");
    expect(order()).toEqual([]);
    expect(count()).toBe("0 sur 4 clients");
    const bar = screen.getByTestId("clients-count").parentElement!;
    fireEvent.click(within(bar).getByText("Effacer"));
    expect(order()).toHaveLength(4);
    expect(count()).toBe("4 clients chargés");
  });
});
