import { describe, expect, it, beforeEach } from "vitest";
import {
  normalizeNsEvents,
  nsCallKey,
  isTeardown,
  shouldProcessCall,
  __resetCallDedupForTests,
} from "../ns-call-events.ts";

describe("normalizeNsEvents", () => {
  beforeEach(() => __resetCallDedupForTests());

  it("handles an array of NS v2 call objects", () => {
    const events = normalizeNsEvents([
      { orig_callid: "abc123", term_user: "113@planipret.ca", orig_from_user: "5145551234" },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("call.inbound");
    expect(events[0].data.extension).toBe("113");
    expect(events[0].data.from_number).toBe("5145551234");
    expect(events[0].data.call_id).toBe("abc123");
  });

  it("ignores teardown events (remove: yes)", () => {
    expect(isTeardown({ remove: "yes" })).toBe(true);
    const events = normalizeNsEvents([{ orig_callid: "x", term_user: "113", remove: "yes" }]);
    expect(events).toHaveLength(0);
  });

  it("still accepts legacy { type, data } payloads", () => {
    const events = normalizeNsEvents({ type: "voicemail.new", data: { id: 9 } });
    expect(events).toEqual([{ type: "voicemail.new", data: { id: 9 } }]);
  });

  it("strips sip: and domain from the terminating extension", () => {
    const [ev] = normalizeNsEvents([{ orig_callid: "k", "term-user": "sip:207@dom.com" }]);
    expect(ev.data.extension).toBe("207");
  });

  it("keeps the orig call id as the dedup key", () => {
    expect(nsCallKey({ orig_callid: "aaa" })).toBe("aaa");
    expect(nsCallKey({ "call-orig-call-id": "bbb" })).toBe("bbb");
  });

  it("dedups repeated state changes for the same call", () => {
    expect(shouldProcessCall("call-1")).toBe(true);
    expect(shouldProcessCall("call-1")).toBe(false);
    expect(shouldProcessCall("call-2")).toBe(true);
  });

  it("re-allows a call id after the dedup TTL expires", () => {
    const t0 = 1_000_000;
    expect(shouldProcessCall("call-3", 60_000, t0)).toBe(true);
    expect(shouldProcessCall("call-3", 60_000, t0 + 61_000)).toBe(true);
  });

  it("returns nothing for garbage payloads", () => {
    expect(normalizeNsEvents(null)).toEqual([]);
    expect(normalizeNsEvents(["nope", 3])).toEqual([]);
  });
});
