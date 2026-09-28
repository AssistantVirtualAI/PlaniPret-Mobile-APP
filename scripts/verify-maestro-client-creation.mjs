#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const nestedMobileRoot = path.join(root, "apps", "planipret-mobile");
const mobileRoot = fs.existsSync(path.join(nestedMobileRoot, "src", "components", "planipret", "mobile", "CreateMaestroClientSheet.tsx"))
  ? nestedMobileRoot
  : root;
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const mobileRead = (relative) => fs.readFileSync(path.join(mobileRoot, relative), "utf8");

const form = mobileRead("src/components/planipret/mobile/CreateMaestroClientSheet.tsx");
const draft = mobileRead("src/lib/planipret/maestroClientDraft.ts");
const edge = read("supabase/functions/maestro-client-create/index.ts");

for (const required of [
  "hasRequiredMaestroClientFields",
  "streetNumber",
  "streetName",
  "streetType",
  "city",
  "region",
  "zip",
  "salutation",
  "sex",
  "language",
]) assert.ok(form.includes(required), `form missing ${required}`);
for (const required of [
  "last_name_required",
  "phone_required",
  "salutation_required",
  "sex_m_or_f_required",
  "language_fr_or_en_required",
  "address.street_number",
  "address.street_name",
  "address.street_type_dd",
  "address.city",
  "address.region",
  "address.zip",
  "mobile_number: phone",
]) assert.ok(edge.includes(required), `edge contract missing ${required}`);
assert.ok(draft.includes("Maestro creation contract"), "draft validation lacks documented-contract guard");
console.log("Maestro client-creation contract verification passed.");
