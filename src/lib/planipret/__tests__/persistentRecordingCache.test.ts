import { describe, expect, it } from "vitest";
import { RECORDING_CACHE_LIMITS } from "../persistentRecordingCache";

describe("persistent recording cache (mobile bundle)", () => {
  it("keeps a bounded durable cache for restart playback", () => {
    expect(RECORDING_CACHE_LIMITS.maxEntries).toBe(40);
    expect(RECORDING_CACHE_LIMITS.maxBytes).toBe(150 * 1024 * 1024);
    expect(RECORDING_CACHE_LIMITS.ttlMs).toBe(30 * 24 * 60 * 60 * 1000);
  });
});