#!/usr/bin/env node
// Produit le paquet OTA (ZIP du dossier `dist/`) à téléverser dans le portail
// admin → Application mobile → Mises à jour du contenu.
//
//   npm run ota:bundle            → version lue dans package.json
//   npm run ota:bundle -- 1.4.2   → version explicite
//
// Le ZIP ne contient QUE le contenu web. Tout changement natif
// (SIP, CallKit, permissions, plugins) exige une soumission aux stores.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const OUT_DIR = resolve(ROOT, "ota");

if (!existsSync(DIST)) {
  console.error("✗ dist/ absent — lance `npm run build` avant.");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const version = (process.argv[2] || pkg.version || "").trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`✗ version invalide: "${version}" (attendu x.y.z)`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const outFile = resolve(OUT_DIR, `${version}.zip`);

execSync(`cd "${DIST}" && zip -qr "${outFile}" .`, { stdio: "inherit" });

const buf = readFileSync(outFile);
const sha = createHash("sha256").update(buf).digest("hex");
const size = statSync(outFile).size;

console.log("");
console.log("✅ Paquet OTA prêt");
console.log(`   Fichier : ${outFile}`);
console.log(`   Version : ${version}`);
console.log(`   Taille  : ${(size / 1024 / 1024).toFixed(2)} Mo`);
console.log(`   SHA-256 : ${sha}`);
console.log("");
console.log("→ Portail admin → Application mobile → Téléverser le paquet, puis « Pousser ».");
