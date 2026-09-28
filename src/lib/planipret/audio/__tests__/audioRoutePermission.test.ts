import { describe, expect, it, vi } from "vitest";
import { authorizeSpeakerRoute } from "../audioRoutePermission";

describe("speaker route authorization", () => {
  it("does not request a device permission in the browser", async () => {
    const request = vi.fn();
    await expect(authorizeSpeakerRoute(false, request)).resolves.toEqual({ allowed: true, state: "not_required" });
    expect(request).not.toHaveBeenCalled();
  });

  it("requests microphone access from the explicit native speaker tap and releases the probe stream", async () => {
    const stop = vi.fn();
    const request = vi.fn().mockResolvedValue({
      state: "granted",
      stream: { getTracks: () => [{ stop }] },
    });

    await expect(authorizeSpeakerRoute(true, request)).resolves.toEqual({ allowed: true, state: "granted" });
    expect(request).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("uses the iOS PJSIP permission prompt without opening a competing WebView track", async () => {
    const root = window as any;
    const original = root.Capacitor;
    const nativeRequest = vi.fn().mockResolvedValue({ granted: true, state: "granted" });
    const fallback = vi.fn();
    root.Capacitor = { ...(original ?? {}), Plugins: { ...(original?.Plugins ?? {}), PpPjsip: { requestMicrophonePermission: nativeRequest } } };
    try {
      await expect(authorizeSpeakerRoute(true, fallback)).resolves.toEqual({ allowed: true, state: "granted" });
      expect(nativeRequest).toHaveBeenCalledOnce();
      expect(fallback).not.toHaveBeenCalled();
    } finally {
      root.Capacitor = original;
    }
  });

  it("does not change the route when microphone authorization is denied", async () => {
    const request = vi.fn().mockResolvedValue({ state: "denied", error: "Microphone permission denied" });
    await expect(authorizeSpeakerRoute(true, request)).resolves.toEqual({ allowed: false, state: "denied" });
  });
});
