import { describe, expect, it } from "vitest";
import { presentCallParty } from "../callPresentation";

describe("presentCallParty", () => {
  it("prioritizes a caller name and a public phone number for an inbound call", () => {
    const party = presentCallParty({
      direction: "inbound",
      fromNumber: "sip:+15145551234@planipret.ca",
      fromName: "Marie Tremblay",
      ownExtension: "111",
    });

    expect(party).toEqual({
      name: "Marie Tremblay",
      phone: "15145551234",
      formattedPhone: "(514) 555-1234",
      internalExtension: null,
    });
  });

  it("never displays the broker extension as the other party", () => {
    const party = presentCallParty({
      direction: "inbound",
      fromNumber: "111",
      fromName: "111",
      ownExtension: "111",
    });

    expect(party.name).toBeNull();
    expect(party.phone).toBeNull();
    expect(party.internalExtension).toBe("111");
  });

  it("uses a resolved contact name only when it has a public call number", () => {
    const party = presentCallParty({
      direction: "outbound",
      toNumber: "5145554567",
      resolvedName: "Client résolu",
      ownExtension: "111",
    });

    expect(party.name).toBe("Client résolu");
    expect(party.formattedPhone).toBe("(514) 555-4567");
  });

  it("does not treat a numeric caller-id-name as a person name", () => {
    const party = presentCallParty({
      direction: "inbound",
      fromNumber: "+15145557890",
      fromName: "+1 (514) 555-7890",
      ownExtension: "111",
    });

    expect(party.name).toBeNull();
    expect(party.formattedPhone).toBe("(514) 555-7890");
  });
});
