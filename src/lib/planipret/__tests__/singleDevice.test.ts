import { describe, expect, it } from "vitest";
import { callBlocksSignOut, claimAllowsSipStart, getMobileDeviceId, isReplacedBy } from "../singleDevice";

describe("un seul appareil mobile", () => {
  it("B prend la place : A est remplacé", () => {
    expect(isReplacedBy("deviceB0000000000", "deviceA0000000000")).toBe(true);
  });
  it("même appareil : pas de déconnexion", () => {
    expect(isReplacedBy("deviceA0000000000", "deviceA0000000000")).toBe(false);
    expect(isReplacedBy(null, "deviceA0000000000")).toBe(false);
  });
  it("un appel en cours retarde la déconnexion", () => {
    for (const s of ["ringing-in", "ringing-out", "active", "held"]) expect(callBlocksSignOut(s)).toBe(true);
    expect(callBlocksSignOut("idle")).toBe(false);
    expect(callBlocksSignOut("ended")).toBe(false);
  });
  it("un claim explicitement différé ne démarre pas SIP sur le second appareil", () => {
    expect(claimAllowsSipStart({ active: false, deferred: true, confirmed: true, retryAfterSeconds: 10 })).toBe(false);
    expect(claimAllowsSipStart({ active: true, deferred: false, confirmed: true })).toBe(true);
    expect(claimAllowsSipStart({ active: true, deferred: false, confirmed: false })).toBe(true);
  });
  it("identifiant d'appareil stable", () => {
    const a = getMobileDeviceId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(getMobileDeviceId()).toBe(a);
  });
});
