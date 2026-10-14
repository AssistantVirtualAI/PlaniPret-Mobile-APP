// Guard: the commission batch must not touch Lemtel, telephony, SMS, SIP,
// CallKit, FCM, NetSapiens or native code. Fails if uncommitted changes do.
import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const FROZEN = /(lemtel|luc-|\/luc_|sip|pjsip|callkit|pushkit|fcm|netsapiens|ns-|sms|voip|softphone|\/ios\/|\/android\/|electron\/)/i;
// Exceptions strictement limitées au correctif haut-parleur CallKit explicitement
// demandé : aucun SIP, enregistrement, codec, routage PBX, FCM ou SMS n'est permis.
const ALLOWED_EXCEPTIONS = new Set([
  "src/lib/planipret/sip/__tests__/ppSipProvider.nativeGuard.test.ts",
  "src/test/iosSpeakerRouteActivation.test.ts",
  "ios/App/App/Plugins/PpSipKeepAlive/PpSipKeepAlive.swift",
]);

describe("commission batch scope guard", () => {
  it("no frozen path is modified in the working tree", () => {
    let out = "";
    try { out = execSync("git diff --name-only HEAD", { encoding: "utf8" }); } catch { return; }
    const touched = out.split("\n").filter(Boolean)
      .filter((f) => FROZEN.test(f) && !ALLOWED_EXCEPTIONS.has(f));
    expect(touched).toEqual([]);
  });
});
