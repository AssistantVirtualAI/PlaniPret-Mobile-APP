import { describe, expect, it } from "vitest";
import { buildClientBundles } from "@/lib/planipret/clientMaestro";
import {
  clientProfileErrorMessage,
  maestroClientProfileFromPayload,
  mergeClientProfile,
} from "@/lib/planipret/clientProfile";
import {
  canSendWithSmsAvailability,
  smsAvailabilityFromPayload,
} from "@/lib/planipret/smsAvailability";

describe("Maestro client profile without local activity", () => {
  it("preserves a direct Maestro profile when no task, deal, call, or SMS exists locally", () => {
    const profile = maestroClientProfileFromPayload({
      profile: {
        id: 511,
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@example.test",
        mobile: "+1 514 555 0123",
        addresses: [{ city: "Montréal", province: "QC" }],
      },
    });
    const merged = mergeClientProfile(profile, null);
    const bundles = buildClientBundles([], [], [], [], [], merged ? [{
      name: merged.name,
      phone: merged.phone,
      email: merged.email,
      maestroClientId: merged.maestroClientId,
    }] : []);

    expect(merged).toMatchObject({
      name: "Jane Doe",
      maestroClientId: "511",
      phone: "+1 514 555 0123",
      city: "Montréal",
    });
    expect(bundles).toHaveLength(1);
    expect(bundles[0]).toMatchObject({ name: "Jane Doe", maestroClientId: "511" });
    expect(bundles[0].tasks).toEqual([]);
  });

  it("keeps an actionable retry message when the profile endpoint fails", () => {
    expect(clientProfileErrorMessage("client_profile_failed", "fr"))
      .toContain("Réessayez sans quitter cette page");
  });
});

describe("SMS DID availability", () => {
  it("blocks sending when no broker DID is returned", () => {
    const availability = smsAvailabilityFromPayload({ ok: true, numbers: [] });
    expect(availability.state).toBe("unavailable");
    expect(canSendWithSmsAvailability(availability)).toBe(false);
  });

  it("accepts only a usable DID returned by the protected server preflight", () => {
    const availability = smsAvailabilityFromPayload({
      ok: true,
      numbers: [{ "from-number": "+1 (438) 555-0199", source: "pbx_routing_verified" }],
    });
    expect(availability).toMatchObject({
      state: "ready",
      primaryNumber: "+14385550199",
    });
    expect(canSendWithSmsAvailability(availability)).toBe(true);
  });

  it("accepts the caller ID returned by the broker's own NetSapiens user record", () => {
    const availability = smsAvailabilityFromPayload({
      ok: true,
      numbers: [{ "caller-id-number": "438 555 0142", source: "user_caller_id_verified" }],
    });
    expect(availability).toMatchObject({
      state: "ready",
      primaryNumber: "+14385550142",
    });
    expect(canSendWithSmsAvailability(availability)).toBe(true);
  });
});
