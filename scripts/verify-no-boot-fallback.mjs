#!/usr/bin/env node
/**
 * Hard gate: fails the build if the obsolete iOS boot fallback overlay is still
 * present in any shipped web bundle.
 *
 * The overlay ("Le démarrage iOS a été interrompu avant le premier écran" +
 * "Relancer" button) was a diagnostic aid. Once it lands in the Capacitor
 * bundle it survives partial rebuilds and traps users in a reload loop.
 *
 * Run AFTER strip-obsolete-ios-fallback.mjs and AFTER `cap sync`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

/** Markers that must never reach a shipped bundle. */
const FORBIDDEN = [
  'id="pp-native-boot-fallback"',
  "__PP_SHOW_BOOT_FALLBACK__",
  "Le démarrage iOS a été interrompu",
  "function showBootFallback(",
];

const targets = [
  join(root, "dist", "index.html"),
  join(root, "ios", "App", "App", "public", "index.html"),
  join(root, "android", "app", "src", "main", "assets", "public", "index.html"),
];

for (const dir of [
  join(root, "dist", "assets"),
  join(root, "ios", "App", "App", "public", "assets"),
  join(root, "android", "app", "src", "main", "assets", "public", "assets"),
]) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".js") || name.endsWith(".html")) targets.push(join(dir, name));
  }
}

let checked = 0;
const failures = [];

for (const file of targets) {
  if (!existsSync(file)) continue;
  checked += 1;
  const content = readFileSync(file, "utf8");
  for (const marker of FORBIDDEN) {
    if (content.includes(marker)) {
      failures.push({ file: file.replace(root + "/", ""), marker });
    }
  }
}

if (checked === 0) {
  console.log(`${YELLOW}[verify-boot] no bundle found to check (dist/ not built yet?)${RESET}`);
  process.exit(0);
}

if (failures.length > 0) {
  console.error(`${RED}[verify-boot] ✗ obsolete iOS boot fallback still present in ${failures.length} location(s):${RESET}`);
  for (const f of failures) {
    console.error(`${RED}    ${f.file}  →  ${f.marker}${RESET}`);
  }
  console.error(`${RED}[verify-boot] Fix: rm -rf dist ios/App/App/public android/app/src/main/assets/public && npm run build${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}[verify-boot] ✓ no obsolete boot fallback in ${checked} bundle file(s)${RESET}`);
