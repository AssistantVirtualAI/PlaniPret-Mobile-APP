import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

let userId = "email-history-success";
let dbResult: { data: any[]; error: any } = { data: [], error: null };
const invoke = vi.fn();

const query = {
  select: () => query,
  order: () => query,
  limit: () => Promise.resolve(dbResult),
  eq: () => Promise.resolve(dbResult),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: userId } } }) },
    from: () => query,
    functions: { invoke: (...args: any[]) => invoke(...args) },
  },
}));
vi.mock("@/hooks/useMplanipretLang", () => ({ useMplanipretLang: () => ({ lang: "fr" }) }));

import EmailHistoryList from "./EmailHistoryList";

afterEach(() => {
  cleanup();
  invoke.mockReset();
  dbResult = { data: [], error: null };
});

describe("EmailHistoryList", () => {
  it("fusionne les courriels Outlook entrants et envoyés quand l'historique local est vide", async () => {
    invoke.mockImplementation((_fn: string, opts: any) => {
      const folder = opts?.body?.payload?.folder;
      if (folder === "inbox") {
        return Promise.resolve({ data: { success: true, emails: [{ id: "in-1", subject: "Courriel reçu", bodyPreview: "Bonjour", receivedDateTime: "2026-09-29T12:00:00Z", from: { emailAddress: { name: "Client", address: "client@example.test" } }, toRecipients: [] }] }, error: null });
      }
      return Promise.resolve({ data: { success: true, emails: [{ id: "sent-1", subject: "Courriel envoyé", bodyPreview: "Merci", sentDateTime: "2026-09-29T13:00:00Z", toRecipients: [{ emailAddress: { name: "Client", address: "client@example.test" } }] }] }, error: null });
    });

    render(<EmailHistoryList />);
    expect(await screen.findByText("Courriel reçu")).toBeInTheDocument();
    expect(screen.getByText("Courriel envoyé")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("ms365-actions", expect.objectContaining({ body: expect.objectContaining({ action: "read_emails", payload: expect.objectContaining({ folder: "inbox" }) }) }));
    expect(invoke).toHaveBeenCalledWith("ms365-actions", expect.objectContaining({ body: expect.objectContaining({ action: "read_emails", payload: expect.objectContaining({ folder: "sent" }) }) }));
  });

  it("affiche une erreur récupérable au lieu d'un historique vide si Microsoft 365 échoue", async () => {
    userId = "email-history-failure";
    dbResult = { data: [], error: { message: "Lecture locale impossible" } };
    invoke.mockResolvedValue({ data: { success: false, error: "Microsoft 365 non connecté" }, error: null });

    render(<EmailHistoryList />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Historique courriel indisponible");
    expect(screen.getByRole("alert")).toHaveTextContent("Microsoft 365 non connecté");
    expect(screen.queryByText("Aucun courriel dans l'historique.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer les courriels" })).toBeInTheDocument();
  });
});
