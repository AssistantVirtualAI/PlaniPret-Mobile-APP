// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import MobileProfileSheet from "./MobileProfileSheet";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    rpc: h.rpc,
    auth: { updateUser: async () => ({ error: null }), signOut: async () => ({}) },
  },
}));
vi.mock("@/hooks/useMplanipretLang", () => ({
  useMplanipretLang: () => ({ t: (k: string) => k, lang: "fr", setLang: () => {} }),
}));
vi.mock("@/hooks/useMplanipretTheme", () => ({
  useMplanipretTheme: () => ({ theme: "light", setTheme: () => {} }),
}));

describe("MobileProfileSheet overlay", () => {
  beforeEach(() => {
    cleanup();
    document.body.innerHTML = "";
    h.rpc.mockReset();
    h.rpc.mockResolvedValue({ error: null });
  });

  it("renders inside #pp-mobile-frame as an absolute overlay (tab-style)", async () => {
    const frame = document.createElement("div");
    frame.id = "pp-mobile-frame";
    document.body.appendChild(frame);

    render(
      <MobileProfileSheet
        profile={{ user_id: "u1", full_name: "Test", email: "t@t.com", status: "available" }}
        reloadProfile={() => {}}
        onClose={() => {}}
      />
    );

    const overlay = await waitFor(() => screen.getByTestId("mobile-profile-sheet-overlay") as HTMLElement);
    expect(frame.contains(overlay)).toBe(true);
    expect(overlay.className).toContain("absolute");
    expect(overlay.className).toContain("inset-0");
  });

  it("falls back to document.body when the frame is missing", async () => {
    render(
      <MobileProfileSheet
        profile={{ user_id: "u1", status: "available" }}
        reloadProfile={() => {}}
        onClose={() => {}}
      />
    );
    const overlay = await waitFor(() => screen.getByTestId("mobile-profile-sheet-overlay") as HTMLElement, { timeout: 1000 });
    expect(overlay).toBeTruthy();
  });

  it("updates the authenticated user's status only through the guarded RPC", async () => {
    const reloadProfile = vi.fn();
    const frame = document.createElement("div");
    frame.id = "pp-mobile-frame";
    document.body.appendChild(frame);
    render(
      <MobileProfileSheet
        profile={{ user_id: "u1", status: "available" }}
        reloadProfile={reloadProfile}
        onClose={() => {}}
      />,
    );

    fireEvent.click(await screen.findByText("status.busy"));
    await waitFor(() => {
      expect(h.rpc).toHaveBeenCalledWith("set_my_planipret_status", { _status: "busy" });
      expect(reloadProfile).toHaveBeenCalledTimes(1);
    });
  });
});
