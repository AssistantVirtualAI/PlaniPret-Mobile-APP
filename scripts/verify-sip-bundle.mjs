#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEGACY_MARKERS = [
  "sip reconnect" + " scheduled in",
  "unregistered -" + " forcing re-register",
];
const NATIVE_FORBIDDEN_MARKERS = [
  {
    label: "Android Contact URI aléatoire",
    value: "UUID.randomUUID().toString().replace(\"-\", \"\") + \".invalid;transport=wss",
  },
  {
    label: "Android re-REGISTER sur INVITE entrant",
    value: "requestReregister(this, \"incoming_invite\")",
  },
  {
    label: "iOS re-REGISTER sur INVITE entrant",
    value: "notifyListeners(\"sipReregisterRequested\", data: [\"reason\": \"incoming_invite\"])",
  },
  {
    label: "OPTIONS iOS trop rapide après REGISTER",
    value: "DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in self?.sendOptionsPing() }",
  },
  {
    label: "iOS Contact host .invalid (non routable)",
    value: "\".plan" + "ipret.invalid\"",
  },
  {
    label: "iOS Via host .invalid (non routable)",
    value: "Via: SIP/2.0/WSS plan" + "ipret-ios.invalid",
  },
];
const REQUIRED_MARKERS = [
  "sip reconnect #",
  "PP_SIP_RECONNECT_FLOOR_MS",
];
const MIN_RECONNECT_GUARD_VERSION = 5;
const FORBIDDEN_BUNDLE_MARKERS = [
  {
    label: "garde SIP v4 périmée",
    value: "reconnect guard active v4",
  },
  {
    label: "socket portail NetSapiens interdit (doit être core1/core2)",
    value: "wss://voice.ava-telecom.ca:9002",
  },
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
  const forbidden = FORBIDDEN_BUNDLE_MARKERS.filter((m) => corpus.includes(m.value)).map((m) => m.label);
  if (forbidden.length) {
    console.error(`❌ ${label}: bundle SIP périmé/interdit (${forbidden.join(", ")}). Rebuild + cap sync requis.`);
    process.exit(1);
  }
  const guardVersions = Array.from(corpus.matchAll(new RegExp(GUARD_RE.source, "g"))).map((m) => Number(m[1]));
  const staleGuard = guardVersions.find((v) => Number.isFinite(v) && v < MIN_RECONNECT_GUARD_VERSION);
  if (staleGuard !== undefined) {
    console.error(`❌ ${label}: reconnect guard active v${staleGuard} détecté; minimum requis v${MIN_RECONNECT_GUARD_VERSION}. Rebuild + cap sync requis.`);
    process.exit(1);
  }
  if (requireMarkers) {
    const guard = corpus.match(GUARD_RE);
    const guardOk = guard && Number(guard[1]) >= MIN_RECONNECT_GUARD_VERSION;
    const missing = REQUIRED_MARKERS.filter((m) => !corpus.includes(m));
    if (!guardOk) missing.push(`reconnect guard active v${MIN_RECONNECT_GUARD_VERSION}+`);
    if (missing.length) {
      console.error(`❌ ${label}: garde SIP moderne absente (${missing.join(", ")}).`);
      process.exit(1);
    }
  }
}

function nativeHits() {
  const files = [
    resolve(ROOT, "scripts/apply-native-config.mjs"),
    resolve(ROOT, "ios/App/App/Plugins/PpSipKeepAlive/PpSipKeepAlive.swift"),
  ].filter((f) => existsSync(f));
  const corpus = files.map((f) => readFileSync(f, "utf8")).join("\n");
  return NATIVE_FORBIDDEN_MARKERS.filter((m) => corpus.includes(m.value)).map((m) => m.label);
}

function scanNativeGuards() {
  let hits = nativeHits();
  if (!hits.length) return;

  // Most of the time the generator is up to date but the *generated* native
  // sources on disk are stale (old `cap sync` output). Regenerate once, re-scan.
  const generator = resolve(ROOT, "scripts/apply-native-config.mjs");
  if (existsSync(generator)) {
    console.warn(`⚠️  native SIP: marqueurs obsolètes détectés (${hits.join(", ")}) — régénération native…`);
    const res = spawnSync(process.execPath, [generator], { stdio: "inherit", cwd: ROOT });
    if (res.status === 0) hits = nativeHits();
  }

  if (hits.length) {
    console.error(`❌ native SIP: régression détectée (${hits.join(", ")}).`);
    console.error("   → Le code source local est périmé. Fais `git pull`, puis `npm run sync:ios` (ou `sync:android`).");
    process.exit(1);
  }
  console.log("✅ native SIP: sources natives régénérées, régression corrigée.");
}

scan("source", [resolve(ROOT, "src/lib/planipret/sip/ppSipProvider.ts")], { requireMarkers: true });
scanNativeGuards();


const distFiles = walk(resolve(ROOT, "dist/assets"));
if (distFiles.length) scan("dist", distFiles);

const iosPublicFiles = walk(resolve(ROOT, "ios/App/App/public"));
if (iosPublicFiles.length) scan("ios/App/App/public", iosPublicFiles);

console.log("✅ SIP bundle guard: aucun vieux reconnect 1000ms détecté");