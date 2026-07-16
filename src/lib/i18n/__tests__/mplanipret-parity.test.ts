import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MP_DICT } from "@/lib/i18n/mplanipret";

/**
 * FR/EN parity for the Planiprêt mobile dictionary.
 *
 * Two checks:
 *  1. Structural equality between MP_DICT.fr and MP_DICT.en (same key paths,
 *     no empty strings).
 *  2. Every t("…") key referenced from the mobile auth screen, profile drawer
 *     and header controls exists in BOTH locales.
 *
 * If keys are missing the test prints a human-readable report so the diff is
 * obvious in CI logs.
 */

type AnyRec = Record<string, any>;

function collectPaths(obj: AnyRec, prefix = ""): string[] {
  const out: string[] = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...collectPaths(v, path));
    else out.push(path);
  }
  return out;
}

function getAt(obj: AnyRec, path: string): unknown {
  return path.split(".").reduce<any>((a, k) => (a == null ? a : a[k]), obj);
}

const FR_PATHS = collectPaths(MP_DICT.fr as AnyRec).sort();
const EN_PATHS = collectPaths(MP_DICT.en as AnyRec).sort();

describe("mplanipret i18n parity", () => {
  it("FR and EN have the exact same key set", () => {
    const onlyFr = FR_PATHS.filter((p) => !EN_PATHS.includes(p));
    const onlyEn = EN_PATHS.filter((p) => !FR_PATHS.includes(p));
    if (onlyFr.length || onlyEn.length) {
      // eslint-disable-next-line no-console
      console.error("[i18n parity] missing keys:\n  only in FR:", onlyFr, "\n  only in EN:", onlyEn);
    }
    expect(onlyFr).toEqual([]);
    expect(onlyEn).toEqual([]);
  });

  it("no empty translations in either locale", () => {
    const empties: string[] = [];
    for (const path of FR_PATHS) {
      const fr = getAt(MP_DICT.fr as AnyRec, path);
      const en = getAt(MP_DICT.en as AnyRec, path);
      if (typeof fr !== "string" || !fr.trim()) empties.push(`fr:${path}`);
      if (typeof en !== "string" || !en.trim()) empties.push(`en:${path}`);
    }
    expect(empties).toEqual([]);
  });

  it("every t(\"…\") key in auth/profile/header components exists in FR and EN", () => {
    const files = [
      "src/components/planipret/mobile/MobileAuthScreen.tsx",
      "src/components/planipret/mobile/MobileProfileSheet.tsx",
      "src/components/planipret/mobile/MobileHeaderControls.tsx",
    ];
    const keyRe = /\bt\(\s*["'`]([a-zA-Z0-9_.]+)["'`]\s*\)/g;
    const used = new Set<string>();
    for (const f of files) {
      let src = "";
      try { src = readFileSync(resolve(process.cwd(), f), "utf8"); } catch { continue; }
      for (const m of src.matchAll(keyRe)) used.add(m[1]);
    }

    const missing: { key: string; locales: string[] }[] = [];
    for (const key of used) {
      const locales: string[] = [];
      if (typeof getAt(MP_DICT.fr as AnyRec, key) !== "string") locales.push("fr");
      if (typeof getAt(MP_DICT.en as AnyRec, key) !== "string") locales.push("en");
      if (locales.length) missing.push({ key, locales });
    }

    if (missing.length) {
      // eslint-disable-next-line no-console
      console.error("[i18n parity] missing translations referenced by components:\n" +
        missing.map((m) => `  - ${m.key} (missing in: ${m.locales.join(", ")})`).join("\n"));
    }
    expect(missing).toEqual([]);
  });
});
