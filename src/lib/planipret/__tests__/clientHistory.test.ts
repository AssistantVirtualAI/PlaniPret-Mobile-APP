import { describe, expect, it } from "vitest";
import { buildClientBundles } from "@/lib/planipret/clientMaestro";
import { shouldOfferMaestroClientCreation } from "@/lib/planipret/clientHistory";
import { maestroClientProfileFromPayload } from "@/lib/planipret/clientProfile";

describe("client call history", () => {
  it("attaches a call to a Maestro client by the verified client phone without requiring a contract", () => {
    const bundles = buildClientBundles(
      [], [], [],
      [{
        id: "call-1", user_id: "broker-1", direction: "inbound", status: "completed",
        started_at: "2026-09-29T12:00:00.000Z", ended_at: null, duration_seconds: 42,
        save_consent: "approved", from_number: "+1 (514) 555-0123", to_number: "+1 438 555 0100",
        from_name: null, to_name: null, ai_summary: null, recording_url: null,
      }],
      [],
      [{ name: "Jane Doe", phone: "+1 514 555 0123", email: null, maestroClientId: "511" }],
    );

    expect(bundles).toHaveLength(1);
    expect(bundles[0]).toMatchObject({ name: "Jane Doe", maestroClientId: "511" });
    expect(bundles[0].calls.map((call) => call.id)).toEqual(["call-1"]);
  });
});

describe("client creation action", () => {
  it("offers creation for an external caller even when caller ID has a name", () => {
    expect(shouldOfferMaestroClientCreation({ phone: "+1 514 555 0123", maestroClientId: null })).toBe(true);
  });

  it("never offers creation when the call is already linked to Maestro", () => {
    expect(shouldOfferMaestroClientCreation({ phone: "+1 514 555 0123", maestroClientId: "511" })).toBe(false);
  });

  it("never offers creation for an internal extension", () => {
    expect(shouldOfferMaestroClientCreation({ phone: "1136", maestroClientId: null })).toBe(false);
  });
});

describe("Maestro client telephone profile", () => {
  it("uses the confirmed nested mobile number when Maestro has no flat phone field", () => {
    const profile = maestroClientProfileFromPayload({
      profile: {
        id: "511",
        first_name: "Jane",
        last_name: "Doe",
        telephones: [{ telephone_type: "mobile", telephone_number: "5145550123" }],
      },
    });

    expect(profile).toMatchObject({ maestroClientId: "511", phone: "5145550123" });
  });
});
