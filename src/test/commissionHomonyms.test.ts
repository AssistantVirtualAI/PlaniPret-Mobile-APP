// Two brokers named exactly "Jean Tremblay" must stay distinct from the server
// grouping through the drill-down; unlinked rows never merge by display name.
import { describe, expect, it } from "vitest";
import {
  brokerId, isLinkedBrokerKey, resolveDetailBrokerKey, metrics, metricsByBroker, type RegisterRow,
} from "../../supabase/functions/_shared/commission-engine";

const ALL = { start: "0000-01-01", end: "9999-12-31" };
const base = { institution: "BNC", mortgage_type: "Fixe", term: "5", commission_type: "base", is_adjustment: 0, agent_name: "Jean Tremblay" };
let i = 0;
const row = (o: any): RegisterRow => ({ ...base, source_row: i++, date_trans: "2026-03-01", ...o });

const ROWS: RegisterRow[] = [
  row({ number: "A1", loan_amt: 300000, amount: 1000, broker_user_id: "u-a", maestro_broker_id: "111" }),
  row({ number: "A2", loan_amt: 200000, amount: 700, broker_user_id: "u-a", maestro_broker_id: "111" }),
  row({ number: "B1", loan_amt: 500000, amount: 1500, maestro_broker_id: "222" }),
  row({ number: "X1", loan_amt: 100000, amount: 250 }), // unlinked, same display name
];

describe("homonym brokers", () => {
  it("produces distinct stable keys", () => {
    const keys = new Set(ROWS.map(brokerId));
    expect(keys).toEqual(new Set(["user:u-a", "maestro:222", "unlinked:jean tremblay"]));
  });

  it("ranks them as separate entries", () => {
    const m = metricsByBroker(ROWS, ALL);
    expect(m.get("user:u-a")).toMatchObject({ deals: 2, volume: 500000, commission: 1700 });
    expect(m.get("maestro:222")).toMatchObject({ deals: 1, volume: 500000, commission: 1500 });
  });

  it("drill-down by stable key contains only the selected broker", () => {
    const a = metrics(ROWS, ALL, { brokerKey: "user:u-a" });
    expect(a).toMatchObject({ deals: 2, volume: 500000, commission: 1700 });
    const lines = ROWS.filter((r) => brokerId(r) === "user:u-a");
    expect(lines.map((r) => r.number)).toEqual(["A1", "A2"]);
  });

  it("unlinked rows are flagged and cannot be drilled into", () => {
    expect(isLinkedBrokerKey("user:u-a")).toBe(true);
    expect(isLinkedBrokerKey("maestro:222")).toBe(true);
    expect(isLinkedBrokerKey("unlinked:jean tremblay")).toBe(false);
    expect(isLinkedBrokerKey("Jean Tremblay")).toBe(false);
    // the unlinked row never merges into either linked broker
    const m = metricsByBroker(ROWS, ALL);
    expect(m.get("unlinked:jean tremblay")).toMatchObject({ deals: 1, volume: 100000 });
  });

  it("pp-commission-stats rejects a display name as detail key", () => {
    expect(resolveDetailBrokerKey({ detailBrokerKey: "Jean Tremblay" })).toBeNull();
    expect(resolveDetailBrokerKey({ detailAgent: "Jean Tremblay" })).toBeNull();
    expect(resolveDetailBrokerKey({ detailBrokerKey: "unlinked:jean tremblay" })).toBeNull();
    expect(resolveDetailBrokerKey({ detailBrokerKey: " user:u-a " })).toBe("user:u-a");
    expect(resolveDetailBrokerKey({ detailAgent: "maestro:222" })).toBe("maestro:222");
  });

  it("each homonym's drill-down via the server key holds only its own rows", () => {
    for (const k of ["user:u-a", "maestro:222"]) {
      const key = resolveDetailBrokerKey({ detailBrokerKey: k })!;
      const rows = ROWS.filter((r) => brokerId(r) === key);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => brokerId(r) === k)).toBe(true);
    }
  });
});
