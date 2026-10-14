import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("surface commissions canonique", () => {
  it("redirige l'ancien rapport mobile vers le registre canonique", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('<Route path="commissions/tableaux" element={<Navigate to="/mplanipret/commissions" replace />} />');
    expect(app).not.toContain("const MBrokerCommissionCharts");
  });

  it("retire la navigation administrateur vers les agrégats historiques", () => {
    const layout = read("src/pages/planipret/admin/PlanipretAdminLayout.tsx");
    expect(layout).not.toContain('to: "/planipret/admin/broker-commissions"');
  });
});
