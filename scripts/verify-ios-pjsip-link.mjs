#!/usr/bin/env node
/**
 * Refuse une archive iOS dont les sources PpPjsip sont présentes mais dont
 * libpjsip.xcframework n'est pas réellement lié à la cible App.
 *
 * Sans cette garde, Swift compile le plugin avec `#if canImport(pjsua) === false`.
 * L'application affiche alors `native_sip_unavailable` et ne peut pas REGISTER
 * l'AOR mobile en TLS/5061, même si le reste de l'application fonctionne.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const framework = path.join(root, "ios", "App", "App", "Plugins", "PpPjsip", "Frameworks", "libpjsip.xcframework");
const project = path.join(root, "ios", "App", "App.xcodeproj", "project.pbxproj");
const bridge = path.join(root, "ios", "App", "App", "AppBridgeViewController.swift");
const plugin = path.join(root, "ios", "App", "App", "Plugins", "PpPjsip", "PpPjsip.swift");

const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};

if (!fs.existsSync(framework)) {
  fail("libpjsip.xcframework absent. Lance npm run ios:oneclick avant toute archive iOS.");
}

const slices = fs.readdirSync(framework, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => fs.existsSync(path.join(framework, name, "Headers")));
if (slices.length === 0) {
  fail("libpjsip.xcframework ne contient aucune tranche Headers importable par Swift.");
}

if (!fs.existsSync(project)) fail("Projet Xcode App.xcodeproj introuvable.");
const pbx = fs.readFileSync(project, "utf8");
const frameworkPath = "App/Plugins/PpPjsip/Frameworks/libpjsip.xcframework";
if (!pbx.includes("libpjsip.xcframework") || !pbx.includes(frameworkPath)) {
  fail("libpjsip.xcframework n'est pas référencé dans App.xcodeproj.");
}
if (!/libpjsip\.xcframework in Frameworks/.test(pbx)) {
  fail("libpjsip.xcframework n'est pas dans la phase Frameworks de la cible App.");
}
if (!/SWIFT_INCLUDE_PATHS[\s\S]*?BUILT_PRODUCTS_DIR\)\/include/.test(pbx)) {
  fail("Le chemin de module pjsua n'est pas configuré dans SWIFT_INCLUDE_PATHS.");
}

if (!fs.existsSync(plugin) || !fs.readFileSync(plugin, "utf8").includes("#if canImport(pjsua)")) {
  fail("Le plugin PpPjsip ne contient pas le garde d'import du moteur natif.");
}
if (!fs.existsSync(bridge) || !fs.readFileSync(bridge, "utf8").includes("PpPjsip()")) {
  fail("PpPjsip n'est pas enregistré dans AppBridgeViewController.");
}

console.log(`✓ PJSIP iOS lié : ${slices.length} tranche(s) avec headers, framework Xcode, module Swift et plugin enregistrés.`);
