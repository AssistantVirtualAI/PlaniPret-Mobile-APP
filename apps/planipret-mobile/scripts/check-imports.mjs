#!/usr/bin/env node
/**
 * Pre-build guard: detect imports of local files that do not exist.
 *
 * The mobile app is a standalone copy of a subset of the web app. When a file
 * is added to the web app and forgotten here, `vite build` fails deep inside
 * Rollup with a cryptic message. This script scans every source file first and
 * fails fast with an explicit list of missing modules.
 *
 * Covers: relative imports (./ ../) and alias imports (@/...), including
 * `import`, `import type`, `export ... from`, dynamic `import()` and
 * `new Worker(new URL(...))`-style specifiers.
 *
 * Run with `npm run check:imports` (also wired into `prebuild`).
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");
const sharedDir = resolve(root, "../../shared");

const SOURCE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"];
const RESOLVE_EXT = [
  "",
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json",
  ".css", ".scss", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".woff2",
];

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

/** Resolve a local specifier to an existing file, or null. */
function resolveLocal(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = join(srcDir, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = resolve(dirname(fromFile), spec);
  else return "external";

  // Strip query/hash suffixes such as `?raw` or `?worker`.
  base = base.split("?")[0].split("#")[0];

  for (const ext of RESOLVE_EXT) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  // Directory index resolution.
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of RESOLVE_EXT.filter(Boolean)) {
      const candidate = join(base, `index${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const SPECIFIER_RE = [
  // import x from "..."; import "..."; export * from "..."
  /(?:^|[\s;}])(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']/g,
  // dynamic import("...")
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  // new URL("...", import.meta.url)
  /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g,
];

// ---------------------------------------------------------------------------
// Two passes:
//  1. REACHABLE graph from the real entry point(s) → hard failure (breaks build)
//  2. Orphan source files not in the graph → warning only (dead copies)
// ---------------------------------------------------------------------------
const entries = [join(srcDir, "index.tsx")].filter(existsSync);
if (entries.length === 0) {
  console.error(red("[check-imports] ✗ entry point src/index.tsx not found"));
  process.exit(1);
}

function collectSpecifiers(code) {
  const out = [];
  const seen = new Set();
  for (const re of SPECIFIER_RE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) {
      const spec = m[1];
      if (seen.has(spec)) continue;
      seen.add(spec);
      if (!spec.startsWith("@/") && !spec.startsWith("./") && !spec.startsWith("../")) continue;
      out.push({ spec, index: m.index });
    }
  }
  return out;
}

const missing = [];
const reachable = new Set();
let checked = 0;
const queue = [...entries];

while (queue.length) {
  const file = queue.pop();
  if (reachable.has(file)) continue;
  reachable.add(file);
  if (!SOURCE_EXT.some((e) => file.endsWith(e))) continue;
  const code = readFileSync(file, "utf8");
  for (const { spec, index } of collectSpecifiers(code)) {
    checked++;
    const resolved = resolveLocal(spec, file);
    if (resolved === null) {
      const line = code.slice(0, index).split("\n").length;
      missing.push({ file: relative(root, file), line, spec });
    } else if (resolved !== "external" && !reachable.has(resolved)) {
      queue.push(resolved);
    }
  }
}

if (missing.length > 0) {
  console.error(red(`\n[check-imports] \u2717 ${missing.length} missing local module(s) reachable from src/index.tsx:\n`));
  for (const { file, line, spec } of missing) {
    console.error(red(`  \u2022 ${file}:${line}`));
    console.error(`    imports ${yellow(`"${spec}"`)} \u2192 file not found`);
    const hint = spec.startsWith("@/")
      ? `apps/planipret-mobile/src/${spec.slice(2)}.(ts|tsx)`
      : `resolved relative to ${file}`;
    console.error(`    expected: ${hint}`);
  }
  console.error(red(`\nFix: copy the missing file(s) from the web app into apps/planipret-mobile/src/, or remove the import.`));
  console.error(red(`Build aborted before vite so the iOS/Android bundle is never shipped broken.\n`));
  process.exit(1);
}

// Orphan files: not part of the bundle graph, so broken imports there cannot
// break the build — report them so they get cleaned up or fixed.
const orphanIssues = [];
for (const file of [...walk(srcDir), ...walk(sharedDir)]) {
  if (reachable.has(file)) continue;
  const code = readFileSync(file, "utf8");
  for (const { spec, index } of collectSpecifiers(code)) {
    if (resolveLocal(spec, file) === null) {
      const line = code.slice(0, index).split("\n").length;
      orphanIssues.push({ file: relative(root, file), line, spec });
    }
  }
}

console.log(green(`[check-imports] \u2713 ${checked} local imports across ${reachable.size} bundled files all resolve`));
if (orphanIssues.length > 0) {
  console.log(yellow(`[check-imports] ! ${orphanIssues.length} broken import(s) in ${new Set(orphanIssues.map((o) => o.file)).size} unbundled file(s) (not shipped):`));
  for (const { file, line, spec } of orphanIssues) console.log(yellow(`    ${file}:${line} \u2192 "${spec}"`));
}
