import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import MobileProfileSheet from "./MobileProfileSheet";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
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
});
