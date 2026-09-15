import { describe, it, expect } from "vitest";
import { decideOutboundRoute } from "../outboundRoute";

describe("decideOutboundRoute", () => {
  it("compose via le moteur natif quand la ligne mobile est inscrite", () => {
    expect(decideOutboundRoute({
      clientType: "mobile", isNativePlatform: true, platform: "ios", engineAvailable: true, engineRegistered: true,
    })).toBe("native");
  });

  it("refuse l'appel (pas de faux ringing REST) si la ligne n'est pas inscrite", () => {
    expect(decideOutboundRoute({
      clientType: "mobile", isNativePlatform: true, platform: "ios", engineAvailable: true, engineRegistered: false,
    })).toBe("native_unregistered");
  });

  it("ne bascule jamais iOS sur JsSIP quand PJSIP est absent", () => {
    expect(decideOutboundRoute({
      clientType: "mobile", isNativePlatform: true, platform: "ios", engineAvailable: false, engineRegistered: false,
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
