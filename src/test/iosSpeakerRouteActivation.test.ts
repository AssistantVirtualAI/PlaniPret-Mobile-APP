import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const swift = readFileSync(resolve(__dirname, "../../ios/App/App/Plugins/PpSipKeepAlive/PpSipKeepAlive.swift"), "utf8");

describe("route haut-parleur CallKit", () => {
  it("réaffirme uniquement la sortie choisie après l’activation CallKit", () => {
    expect(swift).toContain("reassertCallKitRouteAfterActivation()");
    expect(swift).toContain("for delay in [0.35, 0.9] as [TimeInterval]");
    expect(swift).toContain("guard let self = self, self.callKitAudioActive else { return }");
    expect(swift).toContain("self.applyAudioRoute(retries: 0)");
    expect(swift).toContain("CallKit as the sole audio");
  });
});
