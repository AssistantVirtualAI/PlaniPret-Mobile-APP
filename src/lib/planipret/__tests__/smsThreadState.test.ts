import { describe, expect, it } from "vitest";
import { applySms, effectiveUnread, isHidden, type SmsThreadState } from "../smsThreadState";

const s0: SmsThreadState = { read: {}, unread: {}, hidden: {} };
const last = "2026-10-17T10:00:00.000Z";
const now = "2026-10-17T11:00:00.000Z";

describe("smsThreadState", () => {
  it("mark read clears badge", () => {
    expect(effectiveUnread(applySms(s0, ["a"], "read", now), "a", last, 3)).toBe(0);
  });
  it("new message after read is unread again", () => {
    const s = applySms(s0, ["a"], "read", now);
    expect(effectiveUnread(s, "a", "2026-10-17T12:00:00.000Z", 1)).toBe(1);
  });
  it("mark unread forces badge", () => {
    const s = applySms(applySms(s0, ["a"], "read", now), ["a"], "unread", "2026-10-17T11:30:00.000Z");
    expect(effectiveUnread(s, "a", last, 0)).toBe(1);
  });
  it("mark all read", () => {
    const s = applySms(s0, ["a", "b"], "read", now);
    expect(effectiveUnread(s, "a", last, 2) + effectiveUnread(s, "b", last, 5)).toBe(0);
  });
  it("hide, then reappear on newer message", () => {
    const s = applySms(s0, ["a"], "hide", now);
    expect(isHidden(s, "a", last)).toBe(true);
    expect(isHidden(s, "a", "2026-10-17T12:00:00.000Z")).toBe(false);
  });
});
