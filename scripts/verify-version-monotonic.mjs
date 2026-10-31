#!/usr/bin/env node
// Refuse toute baisse de `androidVersionCode` ou de `version`.
//
// Pourquoi : un numéro de build consommé par un APK/AAB déjà distribué ne peut
// plus jamais resservir. Le miroir Lovable est à 1.5.1 / 30 alors que la
// production est à 1.6.10 / 53 : une synchro ou une « correction » automatique
// du package.json suffirait à produire un build rejeté par Play, ou pire, à
// écraser une version en production.
//
//   node scripts/verify-version-monotonic.mjs <ref-de-base>
//   (défaut : origin/main)

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.argv[2] || "origin/main";

const semver = (v) => String(v ?? "0").split(".").map((n) => parseInt(n, 10) || 0);
const cmp = (a, b) => {
  const x = semver(a), y = semver(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
};

const here = JSON.parse(readFileSync("package.json", "utf8"));

let there;
try {
  there = JSON.parse(execSync(`git show ${base}:package.json`, { encoding: "utf8" }));
} catch {
  console.log(`ℹ  ${base} introuvable — contrôle ignoré (première branche ?).`);
  process.exit(0);
}

const problems = [];

const codeHere = Number(here.androidVersionCode);
const codeThere = Number(there.androidVersionCode);
if (Number.isFinite(codeHere) && Number.isFinite(codeThere) && codeHere < codeThere) {
  problems.push(
    `androidVersionCode recule : ${codeThere} → ${codeHere}. ` +
    `Un code de build déjà distribué ne peut pas resservir.`,
  );
}

if (cmp(here.version, there.version) < 0) {
  problems.push(`version recule : ${there.version} → ${here.version}.`);
}

if (problems.length) {
  console.error("✘ Régression de version détectée\n");
  for (const p of problems) console.error("   " + p);
  console.error(
    `\n   Base comparée : ${base}` +
    `\n   Si la montée est volontaire, corrigez package.json.` +
    `\n   Si elle vient d'une synchro depuis le miroir Lovable, annulez-la :` +
    `\n   le miroir n'est pas la source de vérité des numéros de version.\n`,
  );
  process.exit(1);
}

console.log(
  `✔ Versions cohérentes — ${there.version} (${codeThere}) → ${here.version} (${codeHere})`,
);
