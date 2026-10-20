import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ invoke: vi.fn(), insert: vi.fn(), fail: false, order: [] as string[] }));
vi.mock("@/hooks/useMplanipretLang", () => ({ useMplanipretLang: () => ({ lang: "fr" }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const report = { id: "report-1", reporter_id: "reporter", title: "Signalement de test", status: "new", severity: "normal", source: "portal", created_at: "2026-10-19T12:00:00Z", screenshots: [] };
  function from(table: string) {
    const query: any = {
      select: () => query, eq: () => query, order: () => query,
      insert: (payload: unknown) => { state.insert(payload); return query; },
      single: async () => {
        state.order.push("persist");
        return state.fail ? { error: { message: "refused" } } : { data: { id: "comment-1" } };
      },
      maybeSingle: async () => ({ data: { full_name: "Admin" } }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: table === "pp_feedback_reports" ? [report] : [], error: null }).then(resolve),
    };
    return query;
  }
  const channel: any = { on: () => channel, subscribe: () => channel };
  return { supabase: {
    from, rpc: async () => ({ data: true }),
    auth: { getUser: async () => ({ data: { user: { id: "admin" } } }) },
    functions: { invoke: (...args: unknown[]) => { state.order.push("notify"); return state.invoke(...args); } },
    channel: () => channel, removeChannel: vi.fn(),
  } };
});
import PlanipretFeedback from "@/components/planipret/PlanipretFeedback";
describe("saved feedback reply flow", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.fail = false; state.order = [];
    state.invoke.mockResolvedValue({ data: { notification_logged: true, push_status: "accepted", email_status: "sent" } });
    window.history.replaceState({}, "", "/planipret/broker/feedback");
  });
  async function reply() {
    render(<PlanipretFeedback />);
    fireEvent.click(await screen.findByRole("button", { name: "0" }));
    const input = await screen.findByRole("textbox", { name: "Ajouter un commentaire" });
    await screen.findByText("Mes signalements");
    fireEvent.change(input, { target: { value: "Votre problème a été corrigé." } });
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
  }
  it("saves the reply before notifying, using the persisted ID", async () => {
    await reply();
    await waitFor(() => expect(state.invoke).toHaveBeenCalledWith("pp-feedback-reply-notify", { body: { comment_id: "comment-1" } }));
    expect(state.order).toEqual(["persist", "notify"]);
    expect(state.insert).toHaveBeenCalledWith({ report_id: "report-1", author_id: "admin", author_name: "Admin", body: "Votre problème a été corrigé." });
  });
  it("never sends alerts when saving is refused", async () => {
    state.fail = true; await reply();
    await waitFor(() => expect(state.order).toEqual(["persist"]));
    expect(state.invoke).not.toHaveBeenCalled();
  });
});