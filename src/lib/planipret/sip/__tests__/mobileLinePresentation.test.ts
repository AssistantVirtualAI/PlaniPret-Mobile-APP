import { describe, expect, it } from "vitest";
import { mobileLinePresentation } from "../mobileLinePresentation";

describe("Maestro-resolved mobile line presentation", () => {
  it("uses Scott's 110M instead of Carlo's saved 1005", () => {
    expect(mobileLinePresentation({ extension: "110", username: "110M" }, "1005"))
      .toEqual({ extension: "110", deviceId: "110M" });
  });
  it.each(["1117", "1142", "1136"])("uses the resolved %sM for every broker", (extension) => {
    expect(mobileLinePresentation({ extension, username: `${extension}M` }, "1005"))
      .toEqual({ extension, deviceId: `${extension}M` });
  });
  it.each(["110W", "110x", "1005M", "110"])("never displays %s as Scott's mobile device", (username) => {
    expect(mobileLinePresentation({ extension: "110", username }, "1005"))
      .toEqual({ extension: "1005", deviceId: null });
  });
});