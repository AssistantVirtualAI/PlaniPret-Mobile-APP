import { describe, expect, it } from "vitest";
import { cameraPhotoToFile } from "../feedbackCamera";
import { validPortalHandoffUrl } from "../portalHandoffUrl";

describe("feedback camera media", () => {
  it("converts a camera base64 payload without a local browser URL", async () => {
    const file = cameraPhotoToFile({ base64String: "aGVsbG8=", format: "jpeg" });
    expect(file.type).toBe("image/jpeg");
    expect(file.name).toMatch(/^feedback-camera-.*\.jpg$/);
    expect(file.size).toBe(5);
  });

  it("rejects a missing camera payload", () => {
    expect(() => cameraPhotoToFile({})).toThrow("Photo de caméra introuvable.");
  });
});

describe("AVA portal handoff URL", () => {
  const handoff = "https://avastatistic.ca/planipret/portal-handoff?th=one-time&em=broker%40example.ca&to=%2Fplanipret%2Fbroker%2Foverview";
  const brokerDirect = "https://avastatistic.ca/planipret/broker?th=one-time&em=broker%40example.ca";
  const adminDirect = "https://avastatistic.ca/planipret/admin?th=one-time&em=broker%40example.ca";

  it("accepts the production HTTPS handoff", () => {
    expect(validPortalHandoffUrl(handoff)).toBe(handoff);
  });

  it("accepts direct broker and admin portal handoffs", () => {
    expect(validPortalHandoffUrl(brokerDirect)).toBe(brokerDirect);
    expect(validPortalHandoffUrl(adminDirect)).toBe(adminDirect);
  });

  it("accepts the courtierai.planipret.com production origin", () => {
    const broker = "https://courtierai.planipret.com/planipret/broker?th=one-time&em=broker%40example.ca";
    const admin = "https://courtierai.planipret.com/planipret/admin?th=one-time&em=broker%40example.ca";
    expect(validPortalHandoffUrl(broker)).toBe(broker);
    expect(validPortalHandoffUrl(admin)).toBe(admin);
  });

  it("rejects invalid, foreign, or incomplete browser URLs", () => {
    expect(validPortalHandoffUrl("capacitor://localhost/planipret/portal-handoff?th=x&em=y")).toBeNull();
    expect(validPortalHandoffUrl("https://example.invalid/planipret/portal-handoff?th=x&em=y")).toBeNull();
    expect(validPortalHandoffUrl("https://avastatistic.ca/planipret/portal-handoff?th=x")).toBeNull();
  });
});
