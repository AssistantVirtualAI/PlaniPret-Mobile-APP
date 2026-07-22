#!/usr/bin/env node
/**
 * audit-parity.mjs
 * Vérifie que apps/planipret-mobile/src/{pages,components}/planipret/mobile
 * est strictement identique à src/{pages,components}/planipret/mobile de la webapp.
 *
 * Différences autorisées :
 *  - imports remplacés par les shims Vite (framer-motion, livekit-client)
 *  - fichiers listés dans ALLOWED_MOBILE_ONLY
 *
 * Sort avec code 1 si divergence non-tolérée.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MOBILE_ROOT = join(HERE, '..');
const REPO_ROOT = join(MOBILE_ROOT, '..', '..');

const PAIRS = [
  ['src/pages/planipret/mobile', 'apps/planipret-mobile/src/pages/planipret/mobile'],
  ['src/components/planipret/mobile', 'apps/planipret-mobile/src/components/planipret/mobile'],
];

const ALLOWED_MOBILE_ONLY = new Set([
  // pages ou composants qui existent uniquement dans l'app mobile Capacitor
  // (vide — tous les fichiers sont maintenant syncés via sync-parity.sh)
]);
const ALLOWED_WEB_ONLY = new Set([]);

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|css)$/.test(name) && !name.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

function hash(path) {
  return createHash('sha1').update(readFileSync(path, 'utf8')).digest('hex');
}

let errors = 0;
let checked = 0;
let divergent = 0;

for (const [webRel, mobRel] of PAIRS) {
  const webAbs = join(REPO_ROOT, webRel);
  const mobAbs = join(REPO_ROOT, mobRel);
  const webFiles = new Set(walk(webAbs).map((f) => relative(webAbs, f)));
  const mobFiles = new Set(walk(mobAbs).map((f) => relative(mobAbs, f)));

  for (const f of webFiles) {
    if (!mobFiles.has(f) && !ALLOWED_WEB_ONLY.has(f)) {
      console.error(`  [MISSING mobile] ${webRel}/${f}`);
      errors++;
    }
  }
  for (const f of mobFiles) {
    if (!webFiles.has(f) && !ALLOWED_MOBILE_ONLY.has(f)) {
      console.error(`  [MISSING web]    ${mobRel}/${f}`);
      errors++;
    }
  }
  for (const f of webFiles) {
    if (!mobFiles.has(f)) continue;
    checked++;
    const h1 = hash(join(webAbs, f));
    const h2 = hash(join(mobAbs, f));
    if (h1 !== h2) {
      divergent++;
      console.error(`  [DIVERGENT] ${f}`);
      console.error(`      web:    ${webRel}/${f}`);
      console.error(`      mobile: ${mobRel}/${f}`);
      errors++;
    }
  }
}

if (errors === 0) {
  console.log(`✓ Parity OK — ${checked} fichiers identiques web ↔ mobile.`);
  process.exit(0);
}
console.error(`\n✗ Parity failed — ${errors} problème(s), ${divergent} divergence(s) sur ${checked} fichiers.`);
console.error(`  Copie la version web vers l'app mobile :`);
console.error(`    cp src/<path> apps/planipret-mobile/src/<path>`);
process.exit(1);
