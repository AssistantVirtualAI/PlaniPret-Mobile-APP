#!/usr/bin/env node
// patch-xcode-plugins.mjs
// Adds PpSipKeepAlive + PpVoipCall Swift/ObjC files to the Xcode project.pbxproj
// so they are compiled by Xcode without any manual drag-and-drop.
//
// The files live at:
//   ios/App/App/Plugins/PpSipKeepAlive/PpSipKeepAlive.swift
//   ios/App/App/Plugins/PpSipKeepAlive/PpSipKeepAlive.m
//   ios/App/App/Plugins/PpVoipCall/PpVoipCall.swift
//   ios/App/App/Plugins/PpVoipCall/PpVoipCall.m
//
// In the pbxproj, each PBXFileReference uses:
//   - path = "PpSipKeepAlive.swift"  (filename only — relative to its group)
//   - sourceTree = "<group>"
// and the groups are nested:
//   App (504EC3061FED79650016851F)
//     └─ Plugins (new group)
//         ├─ PpSipKeepAlive (new group)
//         │   ├─ PpSipKeepAlive.swift
//         │   └─ PpSipKeepAlive.m
//         └─ PpVoipCall (new group)
//             ├─ PpVoipCall.swift
//             └─ PpVoipCall.m
//
// Run: node scripts/patch-xcode-plugins.mjs

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

let pbx = fs.readFileSync(pbxprojPath, "utf8");

// Already patched?
if (pbx.includes("PpSipKeepAlive.swift") || pbx.includes("PpVoipCall.swift")) {
  console.log("[patch-xcode] Plugins already in pbxproj — no changes needed.");
  process.exit(0);
}

// ── Deterministic IDs ──────────────────────────────────────────────────────
const ID = {
  // Groups
  grpPlugins:        xuid("group-Plugins"),
  grpSipKeepAlive:   xuid("group-PpSipKeepAlive"),
  grpVoipCall:       xuid("group-PpVoipCall"),
  // PpSipKeepAlive files
  refSipSwift:       xuid("ref-PpSipKeepAlive.swift"),
  refSipM:           xuid("ref-PpSipKeepAlive.m"),
  bfSipSwift:        xuid("bf-PpSipKeepAlive.swift"),
  bfSipM:            xuid("bf-PpSipKeepAlive.m"),
  // PpVoipCall files
  refVoipSwift:      xuid("ref-PpVoipCall.swift"),
  refVoipM:          xuid("ref-PpVoipCall.m"),
  bfVoipSwift:       xuid("bf-PpVoipCall.swift"),
  bfVoipM:           xuid("bf-PpVoipCall.m"),
};

// ── 1. PBXBuildFile entries ────────────────────────────────────────────────
const buildFileEntries = `\t\t${ID.bfSipSwift} /* PpSipKeepAlive.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ID.refSipSwift} /* PpSipKeepAlive.swift */; };
\t\t${ID.bfSipM} /* PpSipKeepAlive.m in Sources */ = {isa = PBXBuildFile; fileRef = ${ID.refSipM} /* PpSipKeepAlive.m */; };
\t\t${ID.bfVoipSwift} /* PpVoipCall.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ID.refVoipSwift} /* PpVoipCall.swift */; };
\t\t${ID.bfVoipM} /* PpVoipCall.m in Sources */ = {isa = PBXBuildFile; fileRef = ${ID.refVoipM} /* PpVoipCall.m */; };
`;
pbx = pbx.replace(
  "/* End PBXBuildFile section */",
  buildFileEntries + "/* End PBXBuildFile section */"
);

// ── 2. PBXFileReference entries ───────────────────────────────────────────
// path = filename only (relative to group), sourceTree = "<group>"
const fileRefEntries = `\t\t${ID.refSipSwift} /* PpSipKeepAlive.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = PpSipKeepAlive.swift; sourceTree = "<group>"; };
\t\t${ID.refSipM} /* PpSipKeepAlive.m */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = PpSipKeepAlive.m; sourceTree = "<group>"; };
\t\t${ID.refVoipSwift} /* PpVoipCall.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = PpVoipCall.swift; sourceTree = "<group>"; };
\t\t${ID.refVoipM} /* PpVoipCall.m */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = PpVoipCall.m; sourceTree = "<group>"; };
`;
pbx = pbx.replace(
  "/* End PBXFileReference section */",
  fileRefEntries + "/* End PBXFileReference section */"
);

// ── 3. PBXGroup entries (nested: Plugins > PpSipKeepAlive, PpVoipCall) ────
const groupEntries = `\t\t${ID.grpPlugins} /* Plugins */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${ID.grpSipKeepAlive} /* PpSipKeepAlive */,
\t\t\t\t${ID.grpVoipCall} /* PpVoipCall */,
\t\t\t);
\t\t\tname = Plugins;
\t\t\tpath = Plugins;
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${ID.grpSipKeepAlive} /* PpSipKeepAlive */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${ID.refSipSwift} /* PpSipKeepAlive.swift */,
\t\t\t\t${ID.refSipM} /* PpSipKeepAlive.m */,
\t\t\t);
\t\t\tname = PpSipKeepAlive;
\t\t\tpath = PpSipKeepAlive;
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${ID.grpVoipCall} /* PpVoipCall */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${ID.refVoipSwift} /* PpVoipCall.swift */,
\t\t\t\t${ID.refVoipM} /* PpVoipCall.m */,
\t\t\t);
\t\t\tname = PpVoipCall;
\t\t\tpath = PpVoipCall;
\t\t\tsourceTree = "<group>";
\t\t};
`;
pbx = pbx.replace(
  "/* End PBXGroup section */",
  groupEntries + "/* End PBXGroup section */"
);

// ── 4. Add Plugins group to the App group children ────────────────────────
// The App group is 504EC3061FED79650016851F and contains AppDelegate.swift as first child
pbx = pbx.replace(
  "504EC3071FED79650016851F /* AppDelegate.swift */,",
  `504EC3071FED79650016851F /* AppDelegate.swift */,\n\t\t\t\t${ID.grpPlugins} /* Plugins */,`
);

// ── 5. Add to PBXSourcesBuildPhase files list ─────────────────────────────
pbx = pbx.replace(
  "504EC3081FED79650016851F /* AppDelegate.swift in Sources */,",
  `504EC3081FED79650016851F /* AppDelegate.swift in Sources */,
\t\t\t\t${ID.bfSipSwift} /* PpSipKeepAlive.swift in Sources */,
\t\t\t\t${ID.bfSipM} /* PpSipKeepAlive.m in Sources */,
\t\t\t\t${ID.bfVoipSwift} /* PpVoipCall.swift in Sources */,
\t\t\t\t${ID.bfVoipM} /* PpVoipCall.m in Sources */,`
);

fs.writeFileSync(pbxprojPath, pbx);
console.log("[patch-xcode] project.pbxproj updated — PpSipKeepAlive + PpVoipCall added with correct nested group paths.");
console.log("[patch-xcode] Group IDs:");
console.log(`  Plugins:       ${ID.grpPlugins}`);
console.log(`  PpSipKeepAlive: ${ID.grpSipKeepAlive}`);
console.log(`  PpVoipCall:    ${ID.grpVoipCall}`);
