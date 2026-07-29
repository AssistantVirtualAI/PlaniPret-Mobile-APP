#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEGACY_MARKERS = [
  "sip reconnect" + " scheduled in",
  "unregistered -" + " forcing re-register",
];
const REQUIRED_MARKERS = [
  "sip reconnect #",
  "PP_SIP_RECONNECT_FLOOR_MS",
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(js|ts|tsx|html)$/.test(name)) out.push(p);
  }
  return out;
}

const GUARD_RE = /reconnect guard active v(\d+)/;

function scan(label, files, { requireMarkers = false } = {}) {
  const corpus = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const legacy = LEGACY_MARKERS.filter((m) => corpus.includes(m));
  if (legacy.length) {
    console.error(`❌ ${label}: vieux provider SIP détecté (${legacy.join(", ")}). Rebuild + cap sync requis.`);
    process.exit(1);
  }
  if (requireMarkers) {
    const guard = corpus.match(GUARD_RE);
    const guardOk = guard && Number(guard[1]) >= 3;
    const missing = REQUIRED_MARKERS.filter((m) => !corpus.includes(m));
    if (!guardOk) missing.push("reconnect guard active v3+");
    if (missing.length) {
      console.error(`❌ ${label}: garde SIP v3 absent (${missing.join(", ")}).`);
      process.exit(1);
    }
  }
}

scan("source", [resolve(ROOT, "src/lib/planipret/sip/ppSipProvider.ts")], { requireMarkers: true });

const distFiles = walk(resolve(ROOT, "dist/assets"));
if (distFiles.length) scan("dist", distFiles);

const iosPublicFiles = walk(resolve(ROOT, "ios/App/App/public"));
if (iosPublicFiles.length) scan("ios/App/App/public", iosPublicFiles);

console.log("✅ SIP bundle guard: aucun vieux reconnect 1000ms détecté");