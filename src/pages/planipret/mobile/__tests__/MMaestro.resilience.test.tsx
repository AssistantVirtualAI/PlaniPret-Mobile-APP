import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { fetchClientCalls, fetchClientMessages, fetchClientContacts } = vi.hoisted(() => ({
  fetchClientCalls: vi.fn(),
  fetchClientMessages: vi.fn(),
  fetchClientContacts: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useOutletContext: () => ({ profile: { user_id: "broker-1", maestro_broker_id: "m-1" } }),
  };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/hooks/planipret/usePlanipretTasks", () => ({
  usePlanipretTasks: () => ({ tasks: [], loading: false, lastSyncAt: null }),
}));
vi.mock("@/components/planipret/mobile/MaestroTaskRow", () => ({ default: () => null }));
vi.mock("@/components/planipret/mobile/CommissionHomeCard", () => ({ default: () => null }));
vi.mock("@/lib/planipret/clientMaestro", () => ({
  clientKey: (value: string) => value,
  digits10: (value: string | null) => value ?? "",
  fetchClientCalls,
  fetchClientMessages,
  fetchClientContacts,
}));

import MMaestro from "../MMaestro";

describe("MMaestro resilience", () => {
  it("keeps an actionable error state instead of an empty content area after a load failure", async () => {
    localStorage.setItem("pp_lang", "fr");
    fetchClientCalls.mockRejectedValue(new Error("offline"));
    fetchClientMessages.mockRejectedValue(new Error("offline"));
    fetchClientContacts.mockRejectedValue(new Error("offline"));

    render(<MemoryRouter><MMaestro /></MemoryRouter>);

    expect(await screen.findByRole("alert")).toHaveTextContent("données Maestro");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(fetchClientCalls).toHaveBeenCalledTimes(2));
  });
});
