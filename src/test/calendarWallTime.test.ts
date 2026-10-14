import { describe, expect, it } from "vitest";
import { addWallMinutes, graphWallTime } from "../../supabase/functions/ava-tool-executor/calendarWallTime";

describe("horaires Microsoft 365 AVA", () => {
  it("conserve une heure locale Toronto demandée verbalement", () => {
    expect(graphWallTime("2026-10-14T09:00", "America/Toronto")).toBe("2026-10-14T09:00");
  });

  it("convertit un instant UTC vers l'heure Toronto attendue", () => {
    expect(graphWallTime("2026-10-14T13:00:00Z", "America/Toronto")).toBe("2026-10-14T09:00:00");
  });

  it("calcule la fin sans décaler le rendez-vous en UTC", () => {
    expect(addWallMinutes("2026-10-14T09:00", 30)).toBe("2026-10-14T09:30:00");
  });
});
