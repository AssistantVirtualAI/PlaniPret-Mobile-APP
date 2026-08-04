#!/usr/bin/env node
/**
 * verify-ios-scene.mjs
 *
 * Post-`cap sync` guard: asserts that the UIScene / SceneDelegate patch is
 * actually present in the native iOS project. `cap sync` can regenerate or
 * overwrite native files, so this runs after every sync (invoked at the end of
 * apply-native-config.mjs, and available standalone via `npm run verify:ios:scene`).
 *
 * Exits non-zero (unless PP_SCENE_CHECK_SOFT=1) with a clear, actionable
 * warning when any piece of the patch is missing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

const iosApp = path.join(appDir, "ios", "App", "App");
const pbxproj = path.join(appDir, "ios", "App", "App.xcodeproj", "project.pbxproj");

export function verifyIosScene({ soft = false } = {}) {
  if (!fs.existsSync(path.join(appDir, "ios"))) {
    console.log(yellow("[scene-check] ! no ios/ project — run `npx cap add ios` on a Mac; skipping UIScene verification"));
    return true;
  }

  const problems = [];
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);

  // 1. SceneDelegate.swift present and valid
  const sceneFile = path.join(iosApp, "SceneDelegate.swift");
  const scene = read(sceneFile);
  if (scene === null) {
    problems.push(`SceneDelegate.swift introuvable (${path.relative(appDir, sceneFile)}) — le patch UIScene n'a pas été appliqué après cap sync.`);
  } else {
    if (!/class\s+SceneDelegate\s*:\s*UIResponder\s*,\s*UIWindowSceneDelegate/.test(scene)) {
      problems.push("SceneDelegate.swift ne déclare pas `class SceneDelegate: UIResponder, UIWindowSceneDelegate`.");
    }
    if (!scene.includes("willConnectTo session")) {
      problems.push("SceneDelegate.swift ne contient pas `scene(_:willConnectTo:options:)` — la fenêtre racine ne sera pas créée.");
    }
  }

  // 2. Xcode project references SceneDelegate.swift
  const proj = read(pbxproj);
  if (proj === null) {
    problems.push(`project.pbxproj introuvable (${path.relative(appDir, pbxproj)}).`);
  } else if (!proj.includes("SceneDelegate.swift")) {
    problems.push("SceneDelegate.swift n'est pas référencé dans App.xcodeproj/project.pbxproj — le fichier ne sera pas compilé.");
  }

  // 3. Info.plist scene manifest
  const plistFile = path.join(iosApp, "Info.plist");
  const plist = read(plistFile);
  if (plist === null) {
    problems.push(`Info.plist introuvable (${path.relative(appDir, plistFile)}).`);
  } else {
    if (!plist.includes("<key>UIApplicationSceneManifest</key>")) {
      problems.push("Info.plist ne contient pas `UIApplicationSceneManifest` — iOS gardera le cycle de vie legacy (assert futur).");
    }
    if (!plist.includes("$(PRODUCT_MODULE_NAME).SceneDelegate")) {
      problems.push("Info.plist ne pointe pas `UISceneDelegateClassName` vers `$(PRODUCT_MODULE_NAME).SceneDelegate`.");
    }
    if (!plist.includes("<key>UISceneStoryboardFile</key>")) {
      problems.push("Info.plist ne définit pas `UISceneStoryboardFile` (Main) pour la scène par défaut.");
    }
  }

  // 4. AppDelegate must observe UIScene notifications, not only UIApplication
  const appDelegate = read(path.join(iosApp, "AppDelegate.swift"));
  if (appDelegate && !/UIScene\.(didActivate|willEnterForeground|didEnterBackground)Notification/.test(appDelegate)) {
    problems.push("AppDelegate.swift n'observe aucune notification `UIScene.*` — les transitions foreground/background SIP ne seront pas captées.");
  }

  if (problems.length === 0) {
    console.log(green("[scene-check] ✓ patch iOS UIScene/SceneDelegate présent (SceneDelegate.swift + pbxproj + Info.plist)."));
    return true;
  }

  const header = soft ? yellow("[scene-check] ! ") : red("[scene-check] ✗ ");
  console.error(`\n${header}Patch iOS UIScene/SceneDelegate INCOMPLET après cap sync :`);
  for (const p of problems) console.error(`${soft ? yellow("  •") : red("  •")} ${p}`);
  console.error(yellow("\n  Correctif : exécute `node scripts/apply-native-config.mjs` (ou `npm run sync:ios`) puis relance ce contrôle.\n"));
  return false;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const soft = process.env.PP_SCENE_CHECK_SOFT === "1";
  const ok = verifyIosScene({ soft });
  if (!ok && !soft) process.exit(1);
}
