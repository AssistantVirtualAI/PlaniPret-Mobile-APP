// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAnyStatsCache, readStatsCache, statsCacheKey, writeStatsCache } from "./commissionsCache";

describe("commissionsCache — partition par compte et vue", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T00:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("ne réutilise jamais le registre personnel d’un autre compte", () => {
    const a = statsCacheKey("broker", ["mobile:broker-a:personal", "register-v3", 2026, 12, "ytd", 10, "all"]);
    const b = statsCacheKey("broker", ["mobile:broker-b:personal", "register-v3", 2026, 12, "ytd", 10, "all"]);
    writeStatsCache(a, { broker: "a" });
    vi.setSystemTime(new Date("2026-10-12T00:01:00Z"));
    writeStatsCache(b, { broker: "b" });

    expect(readAnyStatsCache("broker", "mobile:broker-a:personal")?.value).toEqual({ broker: "a" });
    expect(readAnyStatsCache("broker", "mobile:broker-b:personal")?.value).toEqual({ broker: "b" });
    expect(readStatsCache(a)?.value).toEqual({ broker: "a" });
  });

  it("garde la compatibilité du cache portail sans partition", () => {
    const key = statsCacheKey("admin", ["portal:admin", "register-v3", 2026]);
    writeStatsCache(key, { firm: true });
    expect(readAnyStatsCache("admin", "portal:admin")?.value).toEqual({ firm: true });
  });
});
