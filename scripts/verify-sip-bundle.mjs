#!/usr/bin/env node
// Root build guard: the NetSapiens *portal* WSS endpoint must never appear in
// frontend source or in the built bundle. Registering on portal1 is accepted by
// the PBX but inbound calls then go straight to voicemail.
// The REST API base (https://voice.ava-telecom.ca/ns-api/v2) is legitimate and
// intentionally NOT matched here.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN = [
  {
    label: "socket portail NetSapiens interdit (doit être core1/core2)",
    re: /wss:\/\/[^"'`\s]*voice\.ava-telecom\.ca/i,
  },
  {
    label: "portail NetSapiens sur le port SIP WSS 9002",
    re: /voice\.ava-telecom\.ca:9002/i,
  },
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|ts|tsx|html)$/.test(name)) out.push(p);
  }
  return out;
}

function scan(label, files) {
  for (const f of files) {
    const body = readFileSync(f, "utf8");
    for (const m of FORBIDDEN) {
      if (m.re.test(body)) {
        console.error(`❌ ${label}: ${m.label} — ${f.replace(ROOT + "/", "")}`);
        process.exit(1);
      }
    }
  }
}

scan("source", walk(resolve(ROOT, "src")));
scan("dist", walk(resolve(ROOT, "dist")));
console.log("✅ SIP guard: aucun endpoint WSS portail détecté");
