#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const appDir = path.resolve(path.dirname(__filename), "..");
const repoRoot = path.resolve(appDir, "../..");
const appSrc = path.join(appDir, "src");
const rootSrc = path.join(repoRoot, "src");

const failures = [];

const textExt = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".json", ".html"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function sameFile(a, b) {
  return fs.existsSync(a) && fs.existsSync(b) && read(a) === read(b);
}

function scanImports() {
  const files = walk(appSrc).filter((file) => [".ts", ".tsx", ".js", ".jsx"].includes(path.extname(file)));
  const importRe = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\(["']([^"']+)["']\)/g;

  for (const file of files) {
    const source = read(file);
    let match;
    while ((match = importRe.exec(source))) {
      const spec = match[1] || match[2];
      if (!spec || !spec.startsWith(".")) continue;
      const resolved = path.resolve(path.dirname(file), spec);
      assert(resolved === appSrc || resolved.startsWith(appSrc + path.sep), `${path.relative(appDir, file)} imports outside mobile src: ${spec}`);
    }
  }
}

function scanAliasConfig() {
  const vite = read(path.join(appDir, "vite.config.ts"));
  const tsconfig = read(path.join(appDir, "tsconfig.json"));
  assert(vite.includes("path.resolve(__dirname, './src')"), "vite.config.ts alias @ must point to ./src");
  assert(tsconfig.includes('"@/*": ["./src/*"]'), "tsconfig.json alias @ must point to ./src only");
}

function scanNativeAssets() {
  const assetFiles = walk(path.join(appSrc, "assets")).filter((file) => file.endsWith(".asset.json"));
  for (const file of assetFiles) {
    const json = JSON.parse(read(file));
    assert(typeof json.url === "string" && json.url.startsWith("https://"), `${path.relative(appDir, file)} must use an absolute https URL for Capacitor WebView assets`);
  }
}

function scanDistIfPresent() {
  const dist = path.join(appDir, "dist");
  if (!fs.existsSync(dist)) return;
  const html = path.join(dist, "index.html");
  assert(fs.existsSync(html), "dist/index.html is missing");
  if (fs.existsSync(html)) {
    const content = read(html);
    assert(!content.includes('src="/assets/') && !content.includes('href="/assets/'), "dist/index.html contains absolute /assets paths; Vite base must be ./ for Capacitor");
    assert(/<link[^>]+href="\.\/assets\/.+\.css"/.test(content), "dist/index.html has no relative CSS asset link");
    assert(/<script[^>]+src="\.\/assets\/.+\.js"/.test(content), "dist/index.html has no relative JS asset link");
  }
}

function scanParity() {
  const pairs = [
    ["pages/planipret/mobile", "pages/planipret/mobile"],
    ["components/planipret/mobile", "components/planipret/mobile"],
    ["lib/planipret", "lib/planipret"],
    ["locales", "locales"],
  ];

  for (const [rootRel, appRel] of pairs) {
    const rootDir = path.join(rootSrc, rootRel);
    const appDirPath = path.join(appSrc, appRel);
    for (const rootFile of walk(rootDir)) {
      if (!textExt.has(path.extname(rootFile))) continue;
      const rel = path.relative(rootDir, rootFile);
      const appFile = path.join(appDirPath, rel);
      assert(sameFile(rootFile, appFile), `Parity mismatch: ${appRel}/${rel}`);
    }
  }

  for (const rel of [
    "pages/planipret/PlanipretMobile.tsx",
    "components/auth/MplanipretGuard.tsx",
    "hooks/useMplanipretLang.ts",
    "hooks/useMplanipretTheme.ts",
    "hooks/useAvaNavigation.ts",
    "hooks/usePullToRefresh.tsx",
    "hooks/useRealtimeManager.ts",
    "lib/routes.ts",
    "lib/debug/navDebug.ts",
  ]) {
    assert(sameFile(path.join(rootSrc, rel), path.join(appSrc, rel)), `Parity mismatch: ${rel}`);
  }
}

scanImports();
scanAliasConfig();
scanNativeAssets();
scanDistIfPresent();
scanParity();

if (failures.length) {
  console.error("Planiprêt mobile native audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Planiprêt mobile native audit passed.");