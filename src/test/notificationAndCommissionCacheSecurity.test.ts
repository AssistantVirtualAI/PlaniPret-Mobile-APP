import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("push internal et cache Commissions quinze minutes", () => {
  it("protège pp-row-push par JWT service et ne place aucun jeton public dans le trigger", () => {
    const config = read("supabase/config.toml");
    const migration = read("supabase/migrations/20261014000000_planipret_row_push_triggers.sql");
    const handler = read("supabase/functions/pp-row-push/index.ts");
    expect(config).toContain("[functions.pp-row-push]\nverify_jwt = true");
    expect(migration).toContain("vault.decrypted_secrets");
    expect(migration).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(migration).toContain("'Authorization', 'Bearer ' || _service_key");
    expect(migration).not.toMatch(/["']apikey["']\s*[,=:]\s*["']eyJ/);
    expect(handler).toContain('bearer !== SERVICE_KEY');
    expect(handler).toContain('service_role_required');
    expect(handler).toContain('row.direction === "missed"');
    expect(migration).toContain("NEW.direction = 'missed'");
  });

  it("garde les rapports Déboursées et En attente frais quinze minutes avec préchauffage", () => {
    const reports = read("supabase/functions/planipret-commission-reports/index.ts");
    const migration = read("supabase/migrations/20261014000100_planipret_commission_snapshot_warm_15min.sql");
    const client = read("src/lib/planipret/commissionClientCache.ts");
    expect(reports).toContain("const FRESH_MS = 15 * 60_000;");
    expect(client).toContain("COMMISSION_CACHE_TTL_MS = 15 * 60_000");
    expect(migration).toContain("'*/15 * * * *'");
    expect(migration).toContain("pp_warm_commission_snapshots");
    expect(migration).toContain("vault.decrypted_secrets");
    expect(reports).toContain('new Set(["summary", "pending", "analytics", "deposits", "by_agent", "agents", "institutions"])');
  });
});
