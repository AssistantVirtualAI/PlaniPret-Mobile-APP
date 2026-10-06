#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const candidates = [
  path.join(root, "node_modules", "typescript"),
  path.join(root, "apps", "planipret-mobile", "node_modules", "typescript"),
];
const typescriptModule = candidates.find((candidate) => fs.existsSync(candidate));
if (!typescriptModule) throw new Error("TypeScript runtime unavailable for Maestro telephone verification.");
const ts = require(typescriptModule);

const helperPath = path.join(root, "supabase", "functions", "_shared", "maestro-client-telephone.ts");
const helperSource = fs.readFileSync(helperPath, "utf8");
// This verifier exercises only the pure telephone matching helper. Remove
// runtime imports before transpilation so it stays executable in Node ESM
// without loading the Deno-only Maestro HTTP client.
const pureHelperSource = helperSource.replace(/^\s*import[^;]+;\s*$/gm, "");
const compiled = ts.transpileModule(pureHelperSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
const errors = (compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
if (errors.length) throw new Error(errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n"));
const module = { exports: {} };
new Function("exports", "module", compiled.outputText)(module.exports, module);
const { clientHasTelephone } = module.exports;

assert.equal(clientHasTelephone({ telephones: [{ telephone_type: "mobile", telephone_number: "5145550123" }] }, "+1 (514) 555-0123"), true);
assert.equal(clientHasTelephone({ telephones: [{ telephone_type: "work", telephone_number: "5145550123" }] }, "+1 514 555 0123"), true);
assert.equal(clientHasTelephone({ telephones: [{ telephone_type: "work", telephone_number: "4385550100" }] }, "+1 514 555 0123"), false);

const handler = fs.readFileSync(path.join(root, "supabase", "functions", "maestro-client-create", "index.ts"), "utf8");
const telephoneFailure = handler.indexOf('error: "maestro_telephone_unconfirmed"');
const linkCall = handler.lastIndexOf("await linkCallToClient");
assert.ok(helperSource.includes("createTelephone(cfg, clientId"), "missing documented client telephone creation");
assert.ok(helperSource.includes("return { confirmed: clientHasTelephone(rb.data, phone)"), "missing verified telephone readback");
assert.ok(handler.includes("await ensureClientTelephone(cfg, clientId, confirmed, phone, token)"), "missing telephone confirmation before client completion");
assert.ok(telephoneFailure >= 0 && telephoneFailure < linkCall, "an unconfirmed telephone must fail before the call is linked");

console.log("Maestro client telephone confirmation verification passed.");
