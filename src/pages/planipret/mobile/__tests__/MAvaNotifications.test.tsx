import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { state, supabase } = vi.hoisted(() => {
  const state: { pendingUsers: Array<(value: unknown) => void> } = { pendingUsers: [] };
  const channel: any = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
  const query: any = {
    select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query), limit: vi.fn(async () => ({ data: [], error: null })),
  };
  return {
    state,
    supabase: {
      auth: { getUser: vi.fn(() => new Promise((resolve) => state.pendingUsers.push(resolve))) },
      from: vi.fn(() => query),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    },
  };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useMplanipretLang", () => ({ useMplanipretLang: () => ({ t: (key: string) => key, lang: "fr" }) }));
vi.mock("@/lib/i18n/tr", () => ({ tr: (fr: string) => fr }));

import MAvaNotifications from "../MAvaNotifications";

describe("MAvaNotifications — cycle de vie Realtime", () => {
  beforeEach(() => {
    state.pendingUsers.length = 0;
    supabase.channel.mockClear();
    supabase.removeChannel.mockClear();
  });

  it("n’ouvre aucun canal si l’écran est quitté avant la résolution de l’authentification", async () => {
    const view = render(<MemoryRouter><MAvaNotifications /></MemoryRouter>);
    view.unmount();
    for (const resolve of state.pendingUsers.splice(0)) resolve({ data: { user: { id: "user-1" } } });
    await waitFor(() => expect(supabase.channel).not.toHaveBeenCalled());
  });
});
