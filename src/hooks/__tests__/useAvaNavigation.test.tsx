import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const { state, navigate, supabase } = vi.hoisted(() => {
  const state: { broadcast: ((message: unknown) => void) | null } = { broadcast: null };
  const navigate = vi.fn();
  const channel: any = {
    on: vi.fn((_type: string, _filter: unknown, cb: (message: unknown) => void) => {
      state.broadcast = cb;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  return {
    state,
    navigate,
    supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn() },
  };
});

vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@/integrations/supabase/client", () => ({ supabase }));

import { useAvaNavigation } from "../useAvaNavigation";

describe("useAvaNavigation — réglages AVA", () => {
  beforeEach(() => {
    state.broadcast = null;
    navigate.mockReset();
    supabase.channel.mockClear();
    supabase.removeChannel.mockClear();
    localStorage.clear();
  });

  it("reflète les réglages locaux et annonce le changement sans navigation", () => {
    const notified = vi.fn();
    window.addEventListener("ava:settings-changed", notified);
    try {
      renderHook(() => useAvaNavigation("admin-1"));
      expect(state.broadcast).not.toBeNull();

      act(() => state.broadcast?.({ payload: { settings_changed: { setting: "dark_mode", value: true } } }));
      expect(localStorage.getItem("planipret_dark")).toBe("1");
      expect(notified).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { setting: "dark_mode", value: true } }));

      act(() => state.broadcast?.({ payload: { settings_changed: { setting: "language", value: "en" } } }));
      expect(localStorage.getItem("mplanipret-lang")).toBe("en");
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("ava:settings-changed", notified);
    }
  });

  it("ignore une langue invalide tout en conservant les réglages existants", () => {
    localStorage.setItem("mplanipret-lang", "fr");
    renderHook(() => useAvaNavigation("admin-1"));
    act(() => state.broadcast?.({ payload: { settings_changed: { setting: "language", value: "xx" } } }));
    expect(localStorage.getItem("mplanipret-lang")).toBe("fr");
  });
});
