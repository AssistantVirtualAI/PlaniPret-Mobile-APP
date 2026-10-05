import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getSession: vi.fn() },
    functions: { invoke: vi.fn() },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}));

import { MMoreSheet } from "./MMore";

describe("MMoreSheet — fenêtres de Plus", () => {
  it("est rendue dans document.body au-dessus de la barre basse et restaure le défilement", () => {
    const onClose = vi.fn();
    const { unmount, container } = render(
      <div style={{ position: "relative", zIndex: 1 }}>
        <MMoreSheet title="Ne pas déranger" onClose={onClose}><p>Contenu</p></MMoreSheet>
      </div>,
    );

    const dialog = document.body.querySelector('[role="dialog"][aria-label="Ne pas déranger"]') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(container.contains(dialog)).toBe(false);

    const overlay = dialog.parentElement as HTMLElement;
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.className).toContain("z-[1000]");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
