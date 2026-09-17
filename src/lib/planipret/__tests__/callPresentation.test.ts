import { describe, expect, it } from "vitest";
import { presentCallParty } from "../callPresentation";

describe("presentCallParty (mobile bundle)", () => {
  it("keeps the external caller name and number in Recents", () => {
    const party = presentCallParty({
      direction: "inbound",
      fromNumber: "+15145551234",
      fromName: "Marie Tremblay",
      ownExtension: "111",
    });

    expect(party.name).toBe("Marie Tremblay");
    expect(party.formattedPhone).toBe("(514) 555-1234");
  });

  it("uses a resolved directory name for a known internal extension", () => {
    const party = presentCallParty({
      direction: "inbound",
      fromNumber: "1037",
      resolvedName: "Sandra Allard",
      ownExtension: "111",
    });

    expect(party.name).toBe("Sandra Allard");
    expect(party.phone).toBeNull();
    expect(party.internalExtension).toBe("1037");
  });
});
