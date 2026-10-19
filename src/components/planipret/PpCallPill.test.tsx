import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import PpCallPill from "./PpCallPill";
const snap: any = { callState: "active", startedAt: Date.now(), remoteIdentity: "sip:15147071203@sbc1.ucstack.io", remoteNumber: "5147071203" };
const r = (path: string) => render(<MemoryRouter initialEntries={[path]}><PpCallPill snap={snap} onHangup={vi.fn()} /><textarea aria-label="sms" /></MemoryRouter>);
describe("PpCallPill", () => {
  it("sits at the bottom outside Messages", () => {
    r("/m/calls");
    expect((screen.getByText(/Toucher pour revenir/).closest("div.fixed") as HTMLElement).style.bottom).toContain("72px");
  });
  it("moves to the top on Messages", () => {
    r("/m/messages/thread");
    const el = screen.getByText(/Toucher pour revenir/).closest("div.fixed") as HTMLElement;
    expect(el.style.top).toContain("8px"); expect(el.style.bottom).toBe("");
  });
  it("hides while typing an SMS and returns after", async () => {
    r("/m/messages/thread");
    const ta = screen.getByLabelText("sms");
    act(() => { ta.focus(); fireEvent.focusIn(ta); });
    expect(screen.queryByText(/Toucher pour revenir/)).toBeNull();
    await act(async () => { ta.blur(); fireEvent.focusOut(ta); await new Promise((x) => setTimeout(x, 80)); });
    expect(screen.getByText(/Toucher pour revenir/)).toBeTruthy();
  });
});
