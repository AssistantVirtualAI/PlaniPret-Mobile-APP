import { describe, it, expect, vi } from "vitest";
import { ppSipProvider } from "../ppSipProvider";

describe("call waiting answer", () => {
  it("answering while on a call picks up line 2 and holds line 1, never replacing it", async () => {
    const p: any = ppSipProvider;
    const line1 = { hold: vi.fn(), unhold: vi.fn(), terminate: vi.fn() };
    const line2 = { answer: vi.fn(), terminate: vi.fn() };
    p.session = line1; p.secondSession = line2;
    p.snap = { ...p.snap, callState: "active", onHold: false, second: { state: "ringing-in", number: "5145550000", name: "X", startedAt: null } };
    const track = { readyState: "live", enabled: true, stop: vi.fn() };
    (globalThis.navigator as any).mediaDevices = { getUserMedia: vi.fn(async () => ({ getAudioTracks: () => [track], getTracks: () => [track] })) };
    const ok = await p.answer();
    expect(ok).toBe(true);
    expect(line1.hold).toHaveBeenCalled();
    expect(line1.terminate).not.toHaveBeenCalled();
    expect(line2.answer).toHaveBeenCalled();
    expect(p.session).toBe(line1);
  });
});
