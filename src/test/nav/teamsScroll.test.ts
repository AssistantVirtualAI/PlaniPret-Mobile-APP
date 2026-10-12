/** Contrat CSS du scroll Teams 365 (JSDOM/source ; ne prouve pas l'inertie iOS/Android). */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const src = readFileSync(resolve(__dirname, "../../pages/planipret/mobile/MMessages.tsx"), "utf8");
const start = src.indexOf("Microsoft Teams</h2>");
const root = src.slice(src.lastIndexOf("<div", start - 200), start);
describe("Teams365Panel : owner vertical unique", () => {
  it("racine = unique scroller (Discussions actives, Nouveau, Équipes partagent la racine)", () => {
    for (const c of ["h-full", "min-h-0", "overflow-y-auto", "overscroll-contain"]) expect(root).toContain(c);
  });
  it("marge safe area basse présente", () => { expect(root).toContain("env(safe-area-inset-bottom)"); });
  it("les trois onglets internes existent dans le même panel", () => {
    const panel = src.slice(start, start + 12000);
    for (const k of ['k: "new"', 'k: "teams"']) expect(src.slice(start - 1500, start)).toContain(k);
    expect(panel).not.toMatch(/innerTab === "(active|new)"[^\n]*overflow-y-auto/);
  });
});
