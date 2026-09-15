#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const appDir = path.resolve(path.dirname(__filename), "..");
const repoRoot = path.resolve(appDir, "../..");
const appSrc = path.join(appDir, "src");
const rootSrc = path.join(repoRoot, "src");
const importReportPath = path.join(appDir, "reports", "imports.json");

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
  const report = fs.existsSync(importReportPath) ? JSON.parse(read(importReportPath)) : { orphanFiles: [] };
  const orphanFiles = new Set((report.orphanFiles ?? []).map((file) => path.normalize(String(file))));
  const files = walk(appSrc).filter((file) => {
    const rel = path.normalize(path.relative(appDir, file));
    return [".ts", ".tsx", ".js", ".jsx"].includes(path.extname(file)) && !orphanFiles.has(rel);
  });
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
  const tsconfig = JSON.parse(read(path.join(appDir, "tsconfig.json")));
  assert(vite.includes("path.resolve(__dirname, './src')"), "vite.config.ts alias @ must point to ./src");
  const aliases = tsconfig?.compilerOptions?.paths?.["@/*"];
  assert(Array.isArray(aliases) && aliases.length === 1 && aliases[0] === "./src/*", "tsconfig.json alias @ must point to ./src only");
}

function scanNativeAssets() {
  const report = fs.existsSync(importReportPath) ? JSON.parse(read(importReportPath)) : { orphanFiles: [] };
  const orphanFiles = new Set((report.orphanFiles ?? []).map((file) => path.normalize(String(file))));
  const codeFiles = walk(appSrc).filter((file) => {
    const rel = path.normalize(path.relative(appDir, file));
    return [".ts", ".tsx", ".js", ".jsx"].includes(path.extname(file)) && !orphanFiles.has(rel);
  });
  const importedSidecars = new Set();
  for (const file of codeFiles) {
    for (const match of read(file).matchAll(/["']([^"']+\.asset\.json)["']/g)) {
      const spec = match[1];
      const resolved = spec.startsWith("@/")
        ? path.join(appSrc, spec.slice(2))
        : path.resolve(path.dirname(file), spec);
      importedSidecars.add(resolved);
    }
  }
  for (const file of importedSidecars) {
    assert(fs.existsSync(file), `${path.relative(appDir, file)} is imported but missing`);
    if (!fs.existsSync(file)) continue;
    const json = JSON.parse(read(file));
    assert(typeof json.url === "string" && json.url.startsWith("https://"), `${path.relative(appDir, file)} must use an absolute https URL`);
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
  if (!fs.existsSync(rootSrc)) {
    console.log("  [standalone] aucun arbre portail parent à comparer; le bundle mobile local reste la source de vérité");
    return;
  }
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
      // Bloquant : le fichier doit exister côté app native.
      assert(fs.existsSync(appFile), `Fichier absent de l'app native: ${appRel}/${rel}`);
      // Non bloquant : l'app native est la source de vérité et prend souvent
      // de l'avance sur le portail web.
      if (!sameFile(rootFile, appFile)) console.warn(`  [divergent] ${appRel}/${rel} (natif en avance)`);
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
    assert(fs.existsSync(path.join(appSrc, rel)), `Fichier absent de l'app native: ${rel}`);
    if (!sameFile(path.join(rootSrc, rel), path.join(appSrc, rel))) console.warn(`  [divergent] ${rel} (natif en avance)`);
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
