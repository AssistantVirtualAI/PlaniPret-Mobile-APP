// Aligne la version affichée / le build number sur les deux plateformes.
//
// Source de vérité : `package.json`
//   - `version`            -> Android versionName
//   - `androidVersionCode` -> Android versionCode
//   - `iosMarketingVersion` -> iOS MARKETING_VERSION (defaults to `version`)
//   - `iosBuildNumber`      -> iOS CURRENT_PROJECT_VERSION (defaults to Android code)
//
// Les projets natifs sont générés par `npx cap add`, donc ce script est
// rejoué après chaque `cap sync` via apply-native-config.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));

export const VERSION_NAME = String(pkg.version || "1.0.0");
export const VERSION_CODE = Number(pkg.androidVersionCode || 1);
export const IOS_MARKETING_VERSION = String(pkg.iosMarketingVersion || VERSION_NAME);
export const IOS_BUILD_NUMBER = Number(pkg.iosBuildNumber || VERSION_CODE);

function writeIfChanged(file, next) {
  const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (prev === next) return false;
  fs.writeFileSync(file, next);
  return true;
}

function patchAndroid() {
  const file = path.join(appDir, "android", "app", "build.gradle");
  if (!fs.existsSync(file)) {
    console.log("[version] android/app/build.gradle absent — `npx cap add android` d'abord.");
    return;
  }
  let text = fs.readFileSync(file, "utf8");
  text = text.replace(/versionCode\s*(?:=\s*)?\d+/, `versionCode = ${VERSION_CODE}`);
  text = text.replace(/versionName\s*(?:=\s*)?"[^"]*"/, `versionName = "${VERSION_NAME}"`);
  if (writeIfChanged(file, text)) {
    console.log(`[version] Android -> versionCode ${VERSION_CODE}, versionName ${VERSION_NAME}`);
  }
}

function patchIos() {
  const file = path.join(appDir, "ios", "App", "App.xcodeproj", "project.pbxproj");
  if (!fs.existsSync(file)) {
    console.log("[version] ios project.pbxproj absent — `npx cap add ios` d'abord.");
    return;
  }
  let text = fs.readFileSync(file, "utf8");
  text = text.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${IOS_MARKETING_VERSION};`);
  text = text.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${IOS_BUILD_NUMBER};`);
  if (writeIfChanged(file, text)) {
    console.log(`[version] iOS -> MARKETING_VERSION ${IOS_MARKETING_VERSION}, build ${IOS_BUILD_NUMBER}`);
  }
}

export function applyVersion() {
  patchAndroid();
  patchIos();
}

if (process.argv[1] && process.argv[1].endsWith("apply-version.mjs")) applyVersion();
