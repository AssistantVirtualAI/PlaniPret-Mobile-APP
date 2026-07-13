#!/usr/bin/env node
/**
 * Pre-sync validation for `ios:build-sync` / `android:build-sync`.
 *
 * Verifies the freshly built `dist/` contains:
 *  1. Compiled Tailwind CSS (utility rules present).
 *  2. A build ID matching today's UTC date — proving vite.config.ts
 *     regenerated VITE_BUILD_ID on this run.
 *
 * Exits non-zero on failure so `cap sync` never ships a stale bundle.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const dist = join(root, "dist");
const assets = join(dist, "assets");

const fail = (msg) => {
  console.error(`\x1b[31m[precheck] ✗ ${msg}\x1b[0m`);
  process.exit(1);
};
const ok = (msg) => console.log(`\x1b[32m[precheck] ✓ ${msg}\x1b[0m`);

if (!existsSync(dist) || !existsSync(assets)) {
  fail("dist/ or dist/assets/ missing — did `vite build` run?");
}

const files = readdirSync(assets);

// 1. Tailwind check — look for compiled utility rules in a CSS file.
const cssFiles = files.filter((f) => f.endsWith(".css")).map((f) => join(assets, f));
if (cssFiles.length === 0) fail("no CSS file in dist/assets");

let tailwindHit = false;
for (const f of cssFiles) {
  const css = readFileSync(f, "utf8");
  // Tailwind base + a couple of utilities we know the app uses.
  if (
    /\.flex\{display:flex\}/.test(css) &&
    /\.grid\{display:grid\}/.test(css) &&
    /--tw-/.test(css)
  ) {
    tailwindHit = true;
    ok(`Tailwind compiled in ${f.split("/").pop()} (${(statSync(f).size / 1024).toFixed(1)} KB)`);
    break;
  }
}
if (!tailwindHit) fail("Tailwind utilities not found in built CSS — check postcss.config.js / tailwind.config.ts");

// 2. Build ID freshness — vite.config.ts sets VITE_BUILD_ID to today's UTC date.
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const jsFiles = files.filter((f) => f.endsWith(".js")).map((f) => join(assets, f));

let buildIdHit = false;
let foundId = null;
const idRegex = /(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)/;
for (const f of jsFiles) {
  const js = readFileSync(f, "utf8");
  const m = js.match(idRegex);
  if (m) {
    foundId = m[1];
    if (foundId.startsWith(today)) {
      buildIdHit = true;
      break;
    }
  }
}
if (!buildIdHit) {
  fail(
    `fresh VITE_BUILD_ID not found (today=${today}, seen=${foundId ?? "none"}). ` +
      "Style-diagnostics screen would show a stale build — re-run `npm run build`."
  );
}
ok(`Build ID ${foundId} matches today (${today}) — style-diagnostics will be current`);

console.log("\x1b[32m[precheck] all checks passed — safe to cap sync\x1b[0m");
