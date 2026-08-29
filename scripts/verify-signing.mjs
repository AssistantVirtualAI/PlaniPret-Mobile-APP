#!/usr/bin/env node
/**
 * Planiprêt Mobile — vérification entitlements / provisioning / signature.
 *
 * iOS      : App.entitlements (aps-environment, VoIP), bundle id, équipe de
 *            développement, style de signature, ExportOptions.plist et profils
 *            de provisioning.
 * Android  : applicationId, versionCode/versionName, signingConfig release,
 *            absence de secrets en clair, google-services.json.
 *
 * Usage :
 *   node scripts/verify-signing.mjs [--ios] [--android] [--post-sync]
 *
 * Sans `--post-sync`, l'absence des projets natifs générés (ios/App/App.xcodeproj,
 * android/app/build.gradle) produit une note. Avec `--post-sync` (à exécuter
 * après `npx cap sync`), leur absence est une erreur bloquante.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const postSync = args.includes("--post-sync");
const wantIos = args.includes("--ios") || !args.some((a) => a === "--android");
const wantAndroid = args.includes("--android") || !args.some((a) => a === "--ios");

const failures = [];
const notes = [];
const passed = [];

const read = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);
const check = (cond, msg) => { cond ? passed.push(msg) : failures.push(msg); };
/** Bloquant seulement en mode post-cap-sync. */
const require_ = (cond, msg) => { if (!cond) (postSync ? failures : notes).push(msg); else passed.push(msg); };

const capCfg = read(path.join(appDir, "capacitor.config.ts"));
const appId = (capCfg.match(/appId:\s*['"]([^'"]+)['"]/) ?? [])[1] ?? "";
const pkg = JSON.parse(read(path.join(appDir, "package.json")));

check(!!appId, "capacitor.config.ts doit déclarer un appId");

// ───────────────────────────── iOS ─────────────────────────────
if (wantIos) {
  // 1. Entitlements (source de vérité : gabarit + fichier généré s'il existe)
  const entTemplate = path.join(appDir, "native-config/ios-App.entitlements.snippet.xml");
  const entFile = path.join(appDir, "ios/App/App/App.entitlements");
  const entSource = exists(entFile) ? read(entFile) : exists(entTemplate) ? read(entTemplate) : "";
  check(!!entSource, "iOS : aucun App.entitlements (ni gabarit native-config)");
  if (entSource) {
    check(entSource.includes("aps-environment"), "iOS entitlements : clé aps-environment manquante (push/PushKit)");
    check(
      /<string>(production|development)<\/string>/.test(entSource),
      "iOS entitlements : aps-environment doit valoir production ou development",
    );
    if (postSync && entSource.includes("<string>development</string>")) {
      failures.push("iOS entitlements : aps-environment=development interdit pour une soumission App Store");
    }
  }

  // 2. Projet Xcode généré
  const pbxPath = path.join(appDir, "ios/App/App.xcodeproj/project.pbxproj");
  if (exists(pbxPath)) {
    const pbx = read(pbxPath);
    check(
      pbx.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${appId}`),
      `iOS signing : PRODUCT_BUNDLE_IDENTIFIER doit être ${appId}`,
    );
    check(
      pbx.includes("CODE_SIGN_ENTITLEMENTS = App/App.entitlements"),
      "iOS signing : CODE_SIGN_ENTITLEMENTS doit pointer sur App/App.entitlements",
    );
    const teamMatch = pbx.match(/DEVELOPMENT_TEAM = ([A-Z0-9]+);/);
    check(!!teamMatch, "iOS signing : DEVELOPMENT_TEAM absent du projet Xcode");
    const style = pbx.match(/CODE_SIGN_STYLE = (\w+);/)?.[1];
    check(!!style, "iOS signing : CODE_SIGN_STYLE absent");
    if (style === "Manual") {
      check(
        /PROVISIONING_PROFILE_SPECIFIER = [^;]+;/.test(pbx),
        "iOS provisioning : signature manuelle sans PROVISIONING_PROFILE_SPECIFIER",
      );
    }
    const marketing = pbx.match(/MARKETING_VERSION = ([^;]+);/)?.[1]?.trim();
    if (marketing && marketing !== pkg.version) {
      failures.push(`iOS : MARKETING_VERSION (${marketing}) ≠ package.json version (${pkg.version})`);
    } else if (marketing) passed.push("iOS : MARKETING_VERSION alignée sur package.json");
  } else {
    require_(false, "iOS : ios/App/App.xcodeproj absent — exécuter `npx cap add ios` puis `npm run ios:build-sync`");
  }

  // 3. Info.plist généré (usage descriptions liées aux entitlements)
  const plistPath = path.join(appDir, "ios/App/App/Info.plist");
  if (exists(plistPath)) {
    const plist = read(plistPath);
    check(plist.includes("UIBackgroundModes"), "iOS Info.plist : UIBackgroundModes manquant (voip/audio)");
    check(plist.includes("<string>voip</string>"), "iOS Info.plist : background mode `voip` manquant");
    check(plist.includes("ITSAppUsesNonExemptEncryption"), "iOS Info.plist : ITSAppUsesNonExemptEncryption manquant (blocage TestFlight)");
    const shortVersion = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
    if (shortVersion && !shortVersion.includes("$(") && shortVersion !== pkg.version) {
      failures.push(`iOS : CFBundleShortVersionString (${shortVersion}) ≠ package.json version (${pkg.version})`);
    }
  } else {
    require_(false, "iOS : ios/App/App/Info.plist absent — généré par `npx cap add ios`");
  }

  // 4. ExportOptions (archivage CI / distribution)
  const exportOpts = ["ios/App/ExportOptions.plist", "ios/ExportOptions.plist"]
    .map((p) => path.join(appDir, p))
    .find(exists);
  if (exportOpts) {
    const eo = read(exportOpts);
    check(/<key>method<\/key>\s*<string>(app-store|app-store-connect|release-testing)<\/string>/.test(eo),
      "iOS ExportOptions.plist : method doit être app-store / app-store-connect");
    check(eo.includes("teamID"), "iOS ExportOptions.plist : teamID manquant");
  } else {
    notes.push("iOS : ExportOptions.plist absent — l'archivage se fait via Xcode (signature automatique).");
  }
}

// ─────────────────────────── Android ───────────────────────────
if (wantAndroid) {
  const gradlePath = path.join(appDir, "android/app/build.gradle");
  if (exists(gradlePath)) {
    const gradle = read(gradlePath);
    check(gradle.includes(`applicationId "${appId}"`) || gradle.includes(`applicationId '${appId}'`),
      `Android signing : applicationId doit être ${appId}`);
    check(/signingConfigs\s*{[\s\S]*release/.test(gradle),
      "Android signing : aucun signingConfigs.release — le bundle ne pourra pas être publié sur Play");
    check(/buildTypes\s*{[\s\S]*release[\s\S]*signingConfig/.test(gradle),
      "Android signing : buildTypes.release doit référencer un signingConfig");
    const vc = gradle.match(/versionCode\s+(\d+)/)?.[1];
    if (vc && Number(vc) !== Number(pkg.androidVersionCode)) {
      failures.push(`Android : versionCode (${vc}) ≠ package.json androidVersionCode (${pkg.androidVersionCode})`);
    } else if (vc) passed.push("Android : versionCode aligné sur package.json");
    const vn = gradle.match(/versionName\s+["']([^"']+)["']/)?.[1];
    if (vn && vn !== pkg.version) {
      failures.push(`Android : versionName (${vn}) ≠ package.json version (${pkg.version})`);
    }
    // Secrets : jamais de mot de passe keystore en clair dans build.gradle
    if (/storePassword\s+["'][^"']+["']/.test(gradle) || /keyPassword\s+["'][^"']+["']/.test(gradle)) {
      failures.push("Android signing : mot de passe keystore en clair dans build.gradle — utiliser keystore.properties / variables d'environnement");
    } else passed.push("Android signing : aucun mot de passe keystore en clair");

    const keyProps = path.join(appDir, "android/keystore.properties");
    if (!exists(keyProps)) {
      notes.push("Android : android/keystore.properties absent (attendu — fourni localement / par le secret CI ANDROID_KEYSTORE).");
    }
    const gitignore = exists(path.join(appDir, "../../.gitignore")) ? read(path.join(appDir, "../../.gitignore")) : "";
    if (gitignore && !/keystore\.properties|\*\.jks|\*\.keystore/.test(gitignore)) {
      notes.push("Android : ajouter keystore.properties / *.jks au .gitignore pour éviter de committer la clé de signature.");
    }
  } else {
    require_(false, "Android : android/app/build.gradle absent — exécuter `npx cap add android` puis `npm run android:build-sync`");
  }

  const manifestPath = path.join(appDir, "android/app/src/main/AndroidManifest.xml");
  if (exists(manifestPath)) {
    const manifest = read(manifestPath);
    for (const perm of [
      "android.permission.RECORD_AUDIO",
      "android.permission.WAKE_LOCK",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.USE_FULL_SCREEN_INTENT",
      "android.permission.FOREGROUND_SERVICE_PHONE_CALL",
      "android.permission.FOREGROUND_SERVICE_MICROPHONE",
      "android.permission.RECEIVE_BOOT_COMPLETED",
    ]) {
      check(manifest.includes(perm), `AndroidManifest : permission ${perm} manquante`);
    }
    check(manifest.includes('android:foregroundServiceType="phoneCall|microphone"'),
      "AndroidManifest : PpSipKeepAliveService doit déclarer foregroundServiceType phoneCall|microphone");
    check(!/android:debuggable="true"/.test(manifest), "AndroidManifest : android:debuggable=\"true\" interdit en release");
    check(!/android:usesCleartextTraffic="true"/.test(manifest) || manifest.includes("networkSecurityConfig"),
      "AndroidManifest : cleartextTraffic autorisé sans networkSecurityConfig");
  } else {
    require_(false, "Android : AndroidManifest.xml absent — généré par `npx cap add android`");
  }

  check(exists(path.join(appDir, "android/app/google-services.json")),
    "Android : android/app/google-services.json manquant (FCM / réveil des appels)");
}

// ───────────────────────────── Rapport ─────────────────────────────
console.log(`\n──── Entitlements / provisioning / signature ${postSync ? "(post cap sync)" : ""} ────`);
console.log(`Plateformes : ${[wantIos && "iOS", wantAndroid && "Android"].filter(Boolean).join(" + ")}`);
console.log(`Contrôles OK : ${passed.length}`);
for (const n of notes) console.log(`ℹ️  ${n}`);
if (failures.length) {
  console.error(`Échecs : ${failures.length}`);
  for (const f of failures) console.error(` ❌ ${f}`);
  process.exit(1);
}
console.log("✅ Signature / entitlements conformes.");
