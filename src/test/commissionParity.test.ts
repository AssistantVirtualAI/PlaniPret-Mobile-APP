// Planiprêt native delivers one shared Vite/Capacitor web bundle to iOS and Android.
// This test guards the delivery contract for the complete Commissions surface.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const commissionFiles = [
  "src/pages/planipret/mobile/MCommissions.tsx",
  "src/components/planipret/commissions/PaidDepositsCard.tsx",
  "src/components/planipret/commissions/PendingCommissionsCard.tsx",
  "src/components/planipret/commissions/RegisterCommissions.tsx",
  "src/components/planipret/commissions/BrokerLeaderboard.tsx",
  "src/components/planipret/commissions/BrokerTopSellers.tsx",
  "src/components/planipret/commissions/BrokerYearMatrix.tsx",
  "src/components/planipret/commissions/ClubExcellencePanel.tsx",
  "src/components/planipret/mobile/MCommissionCharts.tsx",
  "src/hooks/useCommissionLive.ts",
  "src/hooks/useAdminCommissionFilters.ts",
  "src/lib/planipret/commissionStats.ts",
];

describe("commission parity iOS ↔ Android", () => {
  it("uses one shared Capacitor web bundle", () => {
    const config = readFileSync(resolve(root, "capacitor.config.ts"), "utf8");
    const postbuild = readFileSync(resolve(root, "scripts/postbuild-sync.mjs"), "utf8");

    expect(config).toMatch(/webDir:\s*["']dist["']/);
    expect(postbuild).toContain('const platforms = ["ios", "android"]');
    expect(postbuild).toContain("npx cap sync ${p}");
  });

  for (const file of commissionFiles) {
    it(`ships the shared commission surface: ${file}`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
    });
  }
});
