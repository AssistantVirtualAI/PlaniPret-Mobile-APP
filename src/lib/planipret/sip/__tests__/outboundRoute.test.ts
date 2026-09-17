import { describe, it, expect } from "vitest";
import { canUseDistinctWebAorFallback, decideOutboundRoute } from "../outboundRoute";

describe("decideOutboundRoute", () => {
  it("compose via le moteur natif quand la ligne mobile est inscrite", () => {
    expect(decideOutboundRoute({
      clientType: "mobile", isNativePlatform: true, platform: "ios", engineAvailable: true, engineRegistered: true,
    })).toBe("native");
  });

  it("refuse l'appel si PJSIP est présent mais sa ligne TLS n'est pas inscrite", () => {
    expect(decideOutboundRoute({
      clientType: "mobile", isNativePlatform: true, platform: "ios", engineAvailable: true, engineRegistered: false,
    })).toBe("native_unregistered");
  });

  it("autorise uniquement le device W distinct si PJSIP est absent du binaire", () => {
    const allowDistinctWebAorFallback = canUseDistinctWebAorFallback({
      clientType: "mobile", isNativePlatform: true, platform: "ios", nativeFailure: "engine_not_linked",
    });
    expect(allowDistinctWebAorFallback).toBe(true);
    expect(decideOutboundRoute({
      clientType: "mobile", isNativePlatform: true, platform: "ios", engineAvailable: false, engineRegistered: false,
      allowDistinctWebAorFallback,
    })).toBe("webview");
  });

  it("autorise le device W si le plugin PJSIP n'existe pas dans un ancien binaire", () => {
    expect(canUseDistinctWebAorFallback({
      clientType: "mobile", isNativePlatform: true, platform: "ios", nativeFailure: "plugin_absent",
    })).toBe(true);
  });

  it("interdit le repli WSS lors d'un échec transitoire TLS", () => {
    const allowDistinctWebAorFallback = canUseDistinctWebAorFallback({
      clientType: "mobile", isNativePlatform: true, platform: "ios", nativeFailure: "native_register_timeout",
    });
    expect(allowDistinctWebAorFallback).toBe(false);
    expect(decideOutboundRoute({
      clientType: "mobile", isNativePlatform: true, platform: "ios", engineAvailable: true, engineRegistered: false,
      allowDistinctWebAorFallback,
    })).toBe("native_unregistered");
  });

  it("utilise JsSIP/WSS sur Android", () => {
    expect(decideOutboundRoute({
      clientType: "mobile", isNativePlatform: true, platform: "android", engineAvailable: false, engineRegistered: false,
    })).toBe("webview");
  });

  it("laisse le client web utiliser JsSIP puis le repli PBX", () => {
    expect(decideOutboundRoute({
      clientType: "web", isNativePlatform: false, platform: "web", engineAvailable: false, engineRegistered: false,
    })).toBe("web");
  });

  it("n'autorise jamais le repli REST sur plateforme native", () => {
    const routes = [true, false].flatMap((reg) => [true, false].flatMap((av) => ["ios", "android"].map((platform) =>
      decideOutboundRoute({ clientType: "mobile", isNativePlatform: true, platform, engineAvailable: av, engineRegistered: reg }))));
    expect(routes.every((r) => r !== "web")).toBe(true);
  });
});
