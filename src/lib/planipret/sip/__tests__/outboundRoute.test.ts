import { describe, it, expect } from "vitest";
import { canUseDistinctWebAorFallback, decideOutboundRoute } from "../outboundRoute";

describe("decideOutboundRoute", () => {
  for (const platform of ["ios", "android"] as const) {
    it(`${platform}: compose via le moteur natif lorsque M/TLS est inscrit`, () => {
      expect(decideOutboundRoute({
        clientType: "mobile", isNativePlatform: true, platform, engineAvailable: true, engineRegistered: true,
      })).toBe("native");
    });

    it(`${platform}: refuse de composer lorsque M/TLS n'est pas confirmé`, () => {
      expect(decideOutboundRoute({
        clientType: "mobile", isNativePlatform: true, platform, engineAvailable: true, engineRegistered: false,
      })).toBe("native_unregistered");
    });

    it(`${platform}: ne tombe jamais sur WSS/W lorsque le moteur est absent`, () => {
      expect(canUseDistinctWebAorFallback({
        clientType: "mobile", isNativePlatform: true, platform, nativeFailure: "engine_not_linked",
      })).toBe(false);
      expect(decideOutboundRoute({
        clientType: "mobile", isNativePlatform: true, platform, engineAvailable: false, engineRegistered: false,
      })).toBe("native_unregistered");
    });
  }

  it("laisse le portail utiliser exclusivement le client web W/WSS", () => {
    expect(decideOutboundRoute({
      clientType: "web", isNativePlatform: false, platform: "web", engineAvailable: false, engineRegistered: false,
    })).toBe("web");
  });

  it("n'autorise jamais le repli REST pour une application mobile native", () => {
    const routes = [true, false].flatMap((reg) => [true, false].flatMap((av) => ["ios", "android"].map((platform) =>
      decideOutboundRoute({ clientType: "mobile", isNativePlatform: true, platform, engineAvailable: av, engineRegistered: reg }))));
    expect(routes.every((route) => route === "native" || route === "native_unregistered")).toBe(true);
  });
});
