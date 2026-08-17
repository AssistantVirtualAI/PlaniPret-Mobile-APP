import { describe, expect, it } from "vitest";
import { dedupeSmsMessages } from "../smsDedupe";

const at = (seconds: number) => new Date(Date.UTC(2026, 7, 18, 4, 0, seconds)).toISOString();

describe("dedupeSmsMessages", () => {
  it("merges NetSapiens orig and term echoes", () => {
    const result = dedupeSmsMessages([
      { id: "orig", direction: "orig", body: "Bonjour", timestamp: at(0) },
      { id: "term", direction: "term", body: "Bonjour", timestamp: at(2) },
    ], "113M");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("orig");
  });

  it("replaces an optimistic bubble with the persisted local row", () => {
    const result = dedupeSmsMessages([
      { id: "tmp-1", direction: "outbound", body: "Test", timestamp: at(0) },
      { id: "db-1", source: "local", direction: "outbound", body: "Test", timestamp: at(1) },
    ], "113M");
    expect(result).toEqual([expect.objectContaining({ id: "db-1" })]);
  });

  it("normalizes invisible spaces and mixed timestamp formats", () => {
    const result = dedupeSmsMessages([
      { id: "a", direction: "orig", text: "Salut\u00a0 Gilles", timestamp: "2026-08-18 04:00:00" },
      { id: "b", direction: "term", body: "Salut Gilles", sent_at: "2026-08-18T04:00:03Z" },
    ], "113M");
    expect(result).toHaveLength(1);
  });

  it("keeps two intentional outbound messages", () => {
    const result = dedupeSmsMessages([
      { id: "a", direction: "outbound", body: "Oui", timestamp: at(0) },
      { id: "b", direction: "outbound", body: "Oui", timestamp: at(20) },
    ], "113M");
    expect(result).toHaveLength(2);
  });

  it("keeps the same text when sent again later", () => {
    const result = dedupeSmsMessages([
      { id: "a", direction: "orig", body: "Relance", timestamp: at(0) },
      { id: "b", direction: "term", body: "Relance", timestamp: at(0) },
      { id: "c", direction: "orig", body: "Relance", timestamp: new Date(Date.UTC(2026, 7, 18, 4, 10)).toISOString() },
    ], "113M");
    expect(result).toHaveLength(2);
  });
});