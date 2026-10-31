import { describe, expect, it } from "vitest";
import { nativeCallKitOwnsIncomingUi } from "../callKitIncomingUi";

describe("nativeCallKitOwnsIncomingUi", () => {
  it("confie exclusivement la sonnerie entrante native iOS à CallKit", () => {
    expect(nativeCallKitOwnsIncomingUi(true, "ios", "ringing-in")).toBe(true);
  });

  it("ne masque pas les interfaces Android, web, sortante ou déjà connectée", () => {
    expect(nativeCallKitOwnsIncomingUi(true, "android", "ringing-in")).toBe(false);
    expect(nativeCallKitOwnsIncomingUi(false, "ios", "ringing-in")).toBe(false);
    expect(nativeCallKitOwnsIncomingUi(true, "ios", "active")).toBe(false);
    expect(nativeCallKitOwnsIncomingUi(true, "ios", "ringing-out")).toBe(false);
  });
});
