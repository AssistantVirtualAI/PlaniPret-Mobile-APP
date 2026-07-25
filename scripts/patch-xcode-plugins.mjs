#!/usr/bin/env node
// patch-xcode-plugins.mjs
// Adds PpSipKeepAlive + PpVoipCall Swift/ObjC files to the Xcode project.pbxproj
// so they are compiled by Xcode without any manual drag-and-drop.
//
// Run: node scripts/patch-xcode-plugins.mjs
// (called automatically by apply-native-config.mjs after generating the Swift files)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const appDir = path.resolve(path.dirname(__filename), "..");
const pbxprojPath = path.join(appDir, "ios", "App", "App.xcodeproj", "project.pbxproj");

if (!fs.existsSync(pbxprojPath)) {
  console.log("[patch-xcode] project.pbxproj not found — run npx cap add ios first.");
  process.exit(0);
}

// Generate a deterministic 24-char hex UUID for Xcode (same format as Xcode uses)
function xuid(seed) {
  return crypto.createHash("md5").update(seed).digest("hex").toUpperCase().slice(0, 24);
}

// Files to add: [relativePath, displayName, fileType]
const PLUGIN_FILES = [
  // PpSipKeepAlive
  ["App/Plugins/PpSipKeepAlive/PpSipKeepAlive.swift", "PpSipKeepAlive.swift", "sourcecode.swift"],
  ["App/Plugins/PpSipKeepAlive/PpSipKeepAlive.m",     "PpSipKeepAlive.m",     "sourcecode.c.objc"],
  // PpVoipCall
  ["App/Plugins/PpVoipCall/PpVoipCall.swift",          "PpVoipCall.swift",     "sourcecode.swift"],
  ["App/Plugins/PpVoipCall/PpVoipCall.m",              "PpVoipCall.m",         "sourcecode.c.objc"],
];

let pbx = fs.readFileSync(pbxprojPath, "utf8");
let changed = false;

for (const [relPath, name, fileType] of PLUGIN_FILES) {
  // Skip if already present
  if (pbx.includes(relPath)) {
    console.log(`[patch-xcode] Already in pbxproj: ${name}`);
    continue;
  }

  const fileRefId  = xuid(`fileref-${relPath}`);
  const buildFileId = xuid(`buildfile-${relPath}`);

  // 1. Add PBXFileReference entry
  const fileRefEntry = `\t\t${fileRefId} /* ${name} */ = {isa = PBXFileReference; lastKnownFileType = ${fileType}; path = "${name}"; sourceTree = "<group>"; };\n`;
  pbx = pbx.replace(
    "/* End PBXFileReference section */",
    fileRefEntry + "\t\t/* End PBXFileReference section */"
  );

  // 2. Add PBXBuildFile entry
  const buildFileEntry = `\t\t${buildFileId} /* ${name} in Sources */ = {isa = PBXBuildFile; fileRef = ${fileRefId} /* ${name} */; };\n`;
  pbx = pbx.replace(
    "/* End PBXBuildFile section */",
    buildFileEntry + "\t\t/* End PBXBuildFile section */"
  );

  // 3. Add to PBXSourcesBuildPhase files list
  pbx = pbx.replace(
    "504EC3081FED79650016851F /* AppDelegate.swift in Sources */,",
    `504EC3081FED79650016851F /* AppDelegate.swift in Sources */,\n\t\t\t\t${buildFileId} /* ${name} in Sources */,`
  );

  // 4. Add to App PBXGroup children
  // Find the App group (504EC3061FED79650016851F) and add the file ref
  pbx = pbx.replace(
    "504EC3071FED79650016851F /* AppDelegate.swift */,",
    `504EC3071FED79650016851F /* AppDelegate.swift */,\n\t\t\t\t${fileRefId} /* ${name} */,`
  );

  console.log(`[patch-xcode] Added to pbxproj: ${name} (fileRef=${fileRefId}, buildFile=${buildFileId})`);
  changed = true;
}

if (changed) {
  fs.writeFileSync(pbxprojPath, pbx);
  console.log("[patch-xcode] project.pbxproj updated successfully.");
} else {
  console.log("[patch-xcode] No changes needed — all plugin files already in pbxproj.");
}
