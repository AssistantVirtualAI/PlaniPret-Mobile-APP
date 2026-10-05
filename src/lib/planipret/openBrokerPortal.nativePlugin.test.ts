import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");

describe("PpPortalExternal — native system-browser guard", () => {
  const swift = read("ios/App/App/Plugins/PpPortalExternal/PpPortalExternal.swift");
  const bridge = read("ios/App/App/AppBridgeViewController.swift");
  const java = read("android/app/src/main/java/com/planipret/mobile/PpPortalExternalPlugin.java");
  const activity = read("android/app/src/main/java/com/planipret/mobile/MainActivity.java");

  it("registers the same dedicated plugin on iOS and Android", () => {
    expect(swift).toContain('@objc(PpPortalExternal)');
    expect(swift).toContain('public let jsName = "PpPortalExternal"');
    expect(bridge).toContain("PpPortalExternal()");
    expect(java).toContain('@CapacitorPlugin(name = "PpPortalExternal")');
    expect(activity).toContain("registerPlugin(PpPortalExternalPlugin.class);");
  });

  it("only passes valid HTTPS AVA relay URLs to the system browser", () => {
    for (const source of [swift, java]) {
      expect(source).toContain("courtierai.planipret.com");
      expect(source).toContain("avastatistic.ca");
      expect(source).toMatch(/https/i);
      expect(source).toContain("/planipret/portal-handoff");
      expect(source).toContain("/planipret/broker");
      expect(source).toContain("/planipret/admin");
      expect(source).toContain("th");
      expect(source).toContain("em");
    }
  });

  it("uses an OS browser API and contains no SIP, CallKit, FCM or media code", () => {
    expect(swift).toContain("UIApplication.shared.open");
    expect(java).toContain("Intent.ACTION_VIEW");
    for (const source of [swift, java]) {
      expect(source).not.toMatch(/PJSIP|PpVoipCall|CallKit|SIP|FCM|Firebase|AudioManager|WebRTC/i);
    }
  });
});
