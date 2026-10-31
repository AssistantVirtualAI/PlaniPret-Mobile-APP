import { beforeEach, describe, expect, it } from "vitest";
import { loadMissedCallReadState, missedCallReadKey, missedCallStorageKey, updateMissedCallReadState } from "../missedCallReadState";

describe("missed call badge presentation", () => {
  beforeEach(() => localStorage.clear());
  const calls = [
    { id: "call-1", started_at: "2026-10-17T09:00:00Z" },
    { id: "call-2", started_at: "2026-10-17T10:00:00Z" },
  ];
  it("marks one call read without removing history", () => {
    const read = updateMissedCallReadState([], [missedCallReadKey(calls[0])], true);
    expect(calls.filter(c => !read.includes(missedCallReadKey(c)))).toEqual([calls[1]]);
    expect(calls).toHaveLength(2);
  });
  it("clears the badge for all loaded missed calls but leaves a new call unread", () => {
    const read = updateMissedCallReadState([], calls.map(missedCallReadKey), true);
    expect(calls.filter(c => !read.includes(missedCallReadKey(c)))).toHaveLength(0);
    expect(read.includes(missedCallReadKey({ id: "call-3", started_at: "2026-10-18T09:00:00Z" }))).toBe(false);
  });
  it("can mark a call unread again", () => {
    const key = missedCallReadKey(calls[0]);
    expect(updateMissedCallReadState([key], [key], false)).toEqual([]);
  });
  it("retains read state after reload and isolates users", () => {
    localStorage.setItem(missedCallStorageKey("broker-a"), JSON.stringify([missedCallReadKey(calls[0])]));
    expect(loadMissedCallReadState("broker-a")).toEqual([missedCallReadKey(calls[0])]);
    expect(loadMissedCallReadState("broker-b")).toEqual([]);
  });
  it("tolerates invalid storage", () => {
    localStorage.setItem(missedCallStorageKey("broker-a"), "invalid");
    expect(loadMissedCallReadState("broker-a")).toEqual([]);
  });
});