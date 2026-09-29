import { describe, expect, it } from "vitest";
import { canViewLocalCallMedia } from "../recordingConsent";

describe("recording consent gate", () => {
  it("keeps locally retained media visible while the broker decides", () => {
    expect(canViewLocalCallMedia("approved")).toBe(true);
    expect(canViewLocalCallMedia(undefined)).toBe(true);
    expect(canViewLocalCallMedia(null)).toBe(true);
    expect(canViewLocalCallMedia("pending")).toBe(true);
  });

  it("hides media after the broker chooses delete", () => {
    expect(canViewLocalCallMedia("declined")).toBe(false);
  });
});
