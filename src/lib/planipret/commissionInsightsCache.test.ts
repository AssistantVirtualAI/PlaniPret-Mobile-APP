import { beforeEach, describe, expect, it } from "vitest";
import {
  cadenceToken,
  insightCacheKey,
  needsCommissionInsightRefresh,
  readCommissionInsightCadence,
  readCommissionInsights,
  writeCommissionInsightCadence,
  writeCommissionInsights,
} from "./commissionInsightsCache";

describe("commissionInsightsCache", () => {
  beforeEach(() => localStorage.clear());

  it("isole les résultats par compte, vue, période et langue", () => {
    const global = insightCacheKey({ partition: "mobile:admin-a:global", year: 2026, granularity: "ytd", periodIndex: 10, lang: "fr" });
    const personal = insightCacheKey({ partition: "mobile:admin-a:personal", year: 2026, granularity: "ytd", periodIndex: 10, lang: "fr" });
    const otherUser = insightCacheKey({ partition: "mobile:admin-b:global", year: 2026, granularity: "ytd", periodIndex: 10, lang: "fr" });
    const english = insightCacheKey({ partition: "mobile:admin-a:global", year: 2026, granularity: "ytd", periodIndex: 10, lang: "en" });
    expect(new Set([global, personal, otherUser, english]).size).toBe(4);
  });

  it("ne régénère pas avant le prochain créneau choisi", () => {
    const generated = new Date("2026-10-12T12:00:00.000Z");
    const value = { summary: "Stable", insights: [] };
    const key = insightCacheKey({ partition: "mobile:broker-a:personal", year: 2026, granularity: "ytd", periodIndex: 10, lang: "fr" });
    writeCommissionInsights(key, "weekly", value, generated);
    const entry = readCommissionInsights(key);
    expect(entry?.value).toEqual(value);
    expect(needsCommissionInsightRefresh(entry, "weekly", new Date("2026-10-14T12:00:00.000Z"))).toBe(false);
    expect(needsCommissionInsightRefresh(entry, "weekly", new Date("2026-10-19T12:00:00.000Z"))).toBe(true);
  });

  it("ne déclenche jamais Claude au montage en mode manuel", () => {
    const key = insightCacheKey({ partition: "mobile:broker-a:personal", year: 2026, granularity: "month", periodIndex: 10, lang: "fr" });
    expect(needsCommissionInsightRefresh(readCommissionInsights(key), "manual", new Date("2026-10-12T12:00:00.000Z"))).toBe(false);
  });

  it("persiste le choix de fréquence par compte et vue", () => {
    expect(readCommissionInsightCadence("mobile:admin-a:global")).toBe("daily");
    writeCommissionInsightCadence("mobile:admin-a:global", "quarterly");
    expect(readCommissionInsightCadence("mobile:admin-a:global")).toBe("quarterly");
    expect(readCommissionInsightCadence("mobile:admin-a:personal")).toBe("daily");
  });

  it("calcule des créneaux calendaires distincts", () => {
    const sunday = new Date("2026-10-18T12:00:00.000Z");
    expect(cadenceToken("daily", sunday)).toBe("2026-10-18");
    expect(cadenceToken("monthly", sunday)).toBe("2026-10");
    expect(cadenceToken("quarterly", sunday)).toBe("2026-Q4");
    expect(cadenceToken("yearly", sunday)).toBe("2026");
  });
});
