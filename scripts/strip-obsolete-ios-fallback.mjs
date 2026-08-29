#!/usr/bin/env node
/**
 * Removes the obsolete native iOS boot fallback from generated web assets.
 * The fallback was a diagnostic overlay, but once copied into the Capacitor
 * bundle it can survive rebuilds and create an endless “Relancer” loop.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  join(root, "dist", "index.html"),
  join(root, "ios", "App", "App", "public", "index.html"),
  join(root, "android", "app", "src", "main", "assets", "public", "index.html"),
];

for (const dir of [join(root, "dist", "assets"), join(root, "ios", "App", "App", "public", "assets"), join(root, "android", "app", "src", "main", "assets", "public", "assets")]) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".js")) files.push(join(dir, name));
  }
}

function strip(html) {
  let next = html;
  next = next.replace(
    /\n\s*function showBootFallback\(message\) \{[\s\S]*?\n\s*window\.__PP_DISABLE_NATIVE_BOOT_FALLBACK__ = true;/,
    "\n        window.__PP_DISABLE_NATIVE_BOOT_FALLBACK__ = true;",
  );
  next = next.replace(/\n\s*window\.__PP_SHOW_BOOT_FALLBACK__ = showBootFallback;\s*/g, "\n");
  next = next.replace(/\n\s*<div id="pp-native-boot-fallback"[\s\S]*?\n\s*<\/body>/, "\n  </body>");
  next = next.replace(/const t=document\.getElementById\("pp-native-boot-fallback"\);t&&\(t\.style\.display="none"\)/g, "");
  return next;
}

let changed = 0;
for (const file of files) {
  if (!existsSync(file)) continue;
  const before = readFileSync(file, "utf8");
  const after = strip(before);
  if (after !== before) {
    writeFileSync(file, after);
    changed += 1;
    console.log(`[strip-fallback] removed obsolete iOS fallback from ${file.replace(root + "/", "")}`);
  }
}

if (changed === 0) console.log("[strip-fallback] no obsolete iOS fallback found");