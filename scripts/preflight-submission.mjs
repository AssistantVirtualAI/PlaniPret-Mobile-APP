#!/usr/bin/env node
/**
 * Planiprêt Mobile — vérification automatisée avant soumission (iOS / Android).
 *
 * Usage:
 *   node scripts/preflight-submission.mjs            # les deux plateformes
 *   node scripts/preflight-submission.mjs --ios
 *   node scripts/preflight-submission.mjs --android
 *
 * Étapes :
 *   1. typecheck TypeScript
 *   2. tests unitaires (vitest)
 *   3. résolution des imports embarqués
 *   4. parité native (audit-native)
 *   5. inventaire des endpoints edge appelés par l'app
 *   6. permissions natives (Info.plist / AndroidManifest.xml si générés,
 *      sinon les gabarits native-config/)
 *   6bis. entitlements / provisioning / signature (verify-signing.mjs,
 *      strict avec PP_POST_CAP_SYNC=1 après `npx cap sync`)
 *   7. garde SIP (aucun endpoint WSS portail dans le bundle)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const wantIos = args.includes("--ios") || !args.some((a) => a === "--android");
const wantAndroid = args.includes("--android") || !args.some((a) => a === "--ios");

const failures = [];
const notes = [];
const ok = [];

function step(label, fn) {
  process.stdout.write(`\n▶ ${label}\n`);
  try {
    fn();
    ok.push(label);
    console.log(`✅ ${label}`);
  } catch (err) {
    failures.push(`${label}: ${err.message?.split("\n")[0] ?? err}`);
    console.error(`❌ ${label}`);
  }
}

const run = (cmd) => execSync(cmd, { cwd: appDir, stdio: "inherit" });
const read = (p) => fs.readFileSync(p, "utf8");

// ---- 1..4 ---------------------------------------------------------------
step("Typecheck TypeScript", () => run("npx tsc --noEmit -p tsconfig.json"));
step("Tests unitaires", () => run("npx vitest run"));
step("Imports embarqués", () => run("node scripts/check-imports.mjs"));
step("Parité native (portail ↔ app)", () => run("node scripts/audit-native.mjs"));

// ---- 5. Inventaire des endpoints ---------------------------------------
step("Inventaire des endpoints edge", () => {
  const found = new Set();
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === "node_modules") continue;
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) {
        for (const m of read(p).matchAll(/functions\.invoke\(\s*["'`]([a-z0-9-]+)["'`]/gi)) found.add(m[1]);
        for (const m of read(p).matchAll(/invokeEdge\(\s*["'`]([a-z0-9-]+)["'`]/gi)) found.add(m[1]);
      }
    }
  };
  walk(path.join(appDir, "src"));
  const list = [...found].sort();
  fs.mkdirSync(path.join(appDir, "reports"), { recursive: true });
  fs.writeFileSync(
    path.join(appDir, "reports/endpoints.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), count: list.length, endpoints: list }, null, 2),
  );
  console.log(`   ${list.length} endpoints → reports/endpoints.json`);
  if (list.length === 0) throw new Error("aucun endpoint détecté — le scan a probablement échoué");
});

// ---- 6. Permissions natives --------------------------------------------
const IOS_REQUIRED = [
  "NSMicrophoneUsageDescription",
  "NSContactsUsageDescription",
  "NSCameraUsageDescription",
  "NSPhotoLibraryUsageDescription",
  "NSLocalNetworkUsageDescription",
  "UIBackgroundModes",
  "CFBundleURLTypes",
  "ITSAppUsesNonExemptEncryption",
];

const ANDROID_REQUIRED = [
  "android.permission.RECORD_AUDIO",
  "android.permission.WAKE_LOCK",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.USE_FULL_SCREEN_INTENT",
  "android.permission.FOREGROUND_SERVICE_PHONE_CALL",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.RECEIVE_BOOT_COMPLETED",
];

if (wantIos) {
  step("Permissions iOS", () => {
    const plist = path.join(appDir, "ios/App/App/Info.plist");
    const generated = fs.existsSync(plist);
    const source = generated ? read(plist) : read(path.join(appDir, "native-config/ios-Info.plist.snippet.xml"));
    if (!generated) notes.push("ios/App/App/Info.plist absent (projet natif non généré) — gabarit native-config vérifié à la place. Relancer `npm run ios:build-sync` après `npx cap add ios`.");
    const missing = IOS_REQUIRED.filter((k) => !source.includes(k));
    if (missing.length) throw new Error(`clés Info.plist manquantes: ${missing.join(", ")}`);
    const ent = path.join(appDir, "ios/App/App/App.entitlements");
    if (fs.existsSync(ent) && !read(ent).includes("aps-environment")) {
      throw new Error("App.entitlements sans aps-environment (push désactivé)");
    }
  });
}

if (wantAndroid) {
  step("Permissions Android", () => {
    const manifest = path.join(appDir, "android/app/src/main/AndroidManifest.xml");
    const generated = fs.existsSync(manifest);
    const source = generated ? read(manifest) : read(path.join(appDir, "scripts/apply-native-config.mjs"));
    if (!generated) notes.push("android/app/src/main/AndroidManifest.xml absent (projet natif non généré) — générateur vérifié à la place. Relancer `npm run android:build-sync` après `npx cap add android`.");
    const missing = ANDROID_REQUIRED.filter((k) => !source.includes(k));
    if (missing.length) throw new Error(`permissions manquantes: ${missing.join(", ")}`);
    run("node scripts/verify-android.mjs");
  });
}

// ---- 6bis. Entitlements / provisioning / signature ---------------------
const signingFlags = [wantIos && "--ios", wantAndroid && "--android", process.env.PP_POST_CAP_SYNC === "1" && "--post-sync"]
  .filter(Boolean)
  .join(" ");
step("Entitlements / provisioning / signature", () => run(`node scripts/verify-signing.mjs ${signingFlags}`));

// ---- 7. Garde SIP -------------------------------------------------------
step("Garde SIP (bundle)", () => run("node scripts/verify-sip-bundle.mjs"));

// ---- Rapport ------------------------------------------------------------
console.log("\n──────── Préflight soumission ────────");
console.log(`Plateformes : ${[wantIos && "iOS", wantAndroid && "Android"].filter(Boolean).join(" + ")}`);
console.log(`Réussis     : ${ok.length}`);
for (const n of notes) console.log(`ℹ️  ${n}`);
if (failures.length) {
  console.error(`Échecs      : ${failures.length}`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("✅ Préflight OK — prêt pour build + cap sync + soumission.");
