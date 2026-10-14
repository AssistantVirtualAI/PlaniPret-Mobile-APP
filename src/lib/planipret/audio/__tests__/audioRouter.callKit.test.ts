/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimAorForNative, releaseAorFromNative } from "../../sip/aorArbitration";

describe("audioRouter CallKit speaker persistence", () => {
  const originalCapacitor = (window as any).Capacitor;
  let setAudioRoute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    setAudioRoute = vi.fn().mockResolvedValue({ ok: true });
    (window as any).Capacitor = {
      Plugins: {
        PpSipKeepAlive: {
          setAudioRoute,
          getAudioDevices: vi.fn().mockResolvedValue({ route: "speaker", bluetooth: false, wired: false }),
        },
      },
    };
    claimAorForNative("113M", "test");
  });

  afterEach(() => {
    releaseAorFromNative("test");
    (window as any).Capacitor = originalCapacitor;
    vi.useRealTimers();
  });

  it("réapplique le haut-parleur après l’activation CallKit et l’oublie à la fin d’appel", async () => {
    const { audioRouter } = await import("../audioRouter");
    await audioRouter.chooseRoute("speaker");
    const beforeActivation = setAudioRoute.mock.calls.length;

    window.dispatchEvent(new CustomEvent("pp:callkit-audio-active"));
    await vi.advanceTimersByTimeAsync(500);
    expect(setAudioRoute.mock.calls.length).toBeGreaterThan(beforeActivation);
    expect(setAudioRoute).toHaveBeenLastCalledWith({ route: "speaker" });

    audioRouter.stopCallAudio();
    const beforeStopEvent = setAudioRoute.mock.calls.length;
    window.dispatchEvent(new CustomEvent("pp:callkit-audio-active"));
    await vi.advanceTimersByTimeAsync(500);
    expect(setAudioRoute.mock.calls).toHaveLength(beforeStopEvent);
  });
});
