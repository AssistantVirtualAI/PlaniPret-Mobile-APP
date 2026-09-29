import { describe, expect, it } from "vitest";
import { hasApprovedRecordingConsent } from "../recordingConsent";

describe("recording consent gate", () => {
  it("exposes client recordings only after an explicit approval", () => {
    expect(hasApprovedRecordingConsent("approved")).toBe(true);
  });

  it("treats a missing, pending, or declined decision as not approved", () => {
    expect(hasApprovedRecordingConsent(undefined)).toBe(false);
    expect(hasApprovedRecordingConsent(null)).toBe(false);
    expect(hasApprovedRecordingConsent("pending")).toBe(false);
    expect(hasApprovedRecordingConsent("declined")).toBe(false);
  });
});
