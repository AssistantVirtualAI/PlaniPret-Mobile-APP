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

  it("accepts the production HTTPS handoff", () => {
    expect(validPortalHandoffUrl(handoff)).toBe(handoff);
  });

  it("rejects invalid, foreign, or incomplete browser URLs", () => {
    expect(validPortalHandoffUrl("capacitor://localhost/planipret/portal-handoff?th=x&em=y")).toBeNull();
    expect(validPortalHandoffUrl("https://example.invalid/planipret/portal-handoff?th=x&em=y")).toBeNull();
    expect(validPortalHandoffUrl("https://avastatistic.ca/planipret/portal-handoff?th=x")).toBeNull();
  });
});
