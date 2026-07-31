/**
 * Guard: every route referenced by the mobile Settings screen (MMore) must be
 * declared in the mobile router, otherwise the catch-all silently bounces the
 * user back to Home (regression: "Change password" -> /reset-password).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../");
const more = readFileSync(resolve(ROOT, "apps/planipret-mobile/src/pages/planipret/mobile/MMore.tsx"), "utf8");
const app = readFileSync(resolve(ROOT, "apps/planipret-mobile/src/App.tsx"), "utf8");

function declaredPaths(src: string): Set<string> {
  const out = new Set<string>(["/"]);
  for (const m of src.matchAll(/path=["']([^"']+)["']/g)) {
    const p = m[1];
    if (p === "*") continue;
    out.add(p.startsWith("/") ? p : `/mplanipret/${p}`);
  }
  // <Route path="/mplanipret"> index route
  out.add("/mplanipret");
  return out;
}

function referencedPaths(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/navigate\(\s*["'](\/[^"']*)["']/g)) {
    out.add(m[1].split("?")[0]);
  }
  return [...out];
}

describe("MMore settings routes", () => {
  const declared = declaredPaths(app);

  it("declares every navigate() target from the settings screen", () => {
    const missing = referencedPaths(more).filter((p) => !declared.has(p));
    expect(missing, `Unrouted settings targets: ${missing.join(", ")}`).toEqual([]);
  });

  it("routes the change-password screen", () => {
    expect(declared.has("/mplanipret/change-password")).toBe(true);
    expect(more).toContain("/mplanipret/change-password");
    expect(more).not.toContain('navigate("/reset-password")');
  });
});
