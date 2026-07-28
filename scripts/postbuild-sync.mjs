#!/usr/bin/env node
// Auto-sync natif après CHAQUE `npm run build`.
//
// Objectif : plus jamais de plugins natifs "UNIMPLEMENTED" parce qu'un
// `npx cap sync ios` a été oublié après une modification.
//
// Déclenché par le hook npm `postbuild`. Se désactive avec :
//   PP_SKIP_AUTOSYNC=1 npm run build
// (utilisé par les scripts composés qui font déjà leur propre cap sync).
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.env.PP_SKIP_AUTOSYNC === "1") {
  console.log("↷ postbuild: auto-sync natif désactivé (PP_SKIP_AUTOSYNC=1)");
  process.exit(0);
}

const platforms = ["ios", "android"].filter((p) => existsSync(resolve(ROOT, p)));

if (platforms.length === 0) {
  console.log("↷ postbuild: aucune plateforme native présente — rien à synchroniser");
  process.exit(0);
}

function run(cmd) {
  console.log(`▶ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

try {
  for (const p of platforms) run(`npx cap sync ${p}`);
  // Réinjecte les plugins natifs (PpSipKeepAlive / PpVoipCall), l'orientation
  // portrait, les entitlements et les deep links — cap sync peut les écraser.
  run("node scripts/apply-native-config.mjs");
  console.log(`✅ postbuild: sync natif terminé (${platforms.join(", ")})`);
} catch (e) {
  console.error("❌ postbuild: sync natif échoué —", e?.message ?? e);
  process.exit(1);
}
