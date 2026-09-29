import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    functions: { invoke: vi.fn() },
  },
}));
vi.mock("@/lib/planipret/callerClient", () => ({
  invalidateCallerClient: vi.fn(),
  resolveCallerClient: vi.fn(async () => ({ found: false, maestroClientId: null, name: null })),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), message: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import CreateMaestroClientSheet from "./CreateMaestroClientSheet";

describe("CreateMaestroClientSheet", () => {
  it("renders above app navigation with a touch-scrollable, safe-area padded panel", async () => {
    render(
      <CreateMaestroClientSheet
        target={{ phone: "5145551234", name: "Client Test" }}
        onClose={vi.fn()}
      />,
    );

    await screen.findByDisplayValue("5145551234");
    const title = screen.getByText("Créer le client dans Maestro");
    const overlay = title.closest("[data-client-create-overlay]");
    const panel = title.closest("div[class*='max-h-[85dvh]']");

    expect(overlay).toBeTruthy();
    expect(overlay).toHaveClass("fixed", "inset-0", "z-[1000]");
    expect(panel).toBeTruthy();
    expect(panel).toHaveClass("overflow-y-auto", "overscroll-contain");
    expect(panel?.getAttribute("style")).toContain("safe-area-inset-bottom");
    expect(panel?.getAttribute("style")).toContain("120px");
  });
});
