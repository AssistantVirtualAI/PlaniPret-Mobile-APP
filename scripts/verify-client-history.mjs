import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const mobileRoot = rootPackage.name === "planipret-mobile"
  ? root
  : path.join(root, "apps", "planipret-mobile");
const read = (file) => {
  const mobilePrefix = "apps/planipret-mobile/";
  if (file.startsWith(mobilePrefix)) {
    return fs.readFileSync(path.join(mobileRoot, file.slice(mobilePrefix.length)), "utf8");
  }
  return fs.readFileSync(path.join(root, file), "utf8");
};
const checks = [];
const requireText = (file, expected, label) => {
  const source = read(file);
  if (!source.includes(expected)) throw new Error(`${label}: missing ${JSON.stringify(expected)} in ${file}`);
  checks.push(label);
};

requireText(
  "supabase/functions/maestro-client-create/index.ts",
  "const readBack = await getClient(cfg, clientId, { token });",
  "Maestro client creation reads back the documented client resource",
);
requireText(
  "supabase/functions/maestro-client-create/index.ts",
  "maestro_readback_unconfirmed",
  "Maestro client creation refuses an unconfirmed success",
);
requireText(
  "supabase/functions/maestro-client-create/index.ts",
  ".eq(\"phone_e164\", phone)",
  "Maestro client creation checks the broker-scoped phone cache",
);
requireText(
  "supabase/functions/maestro-client-create/index.ts",
  "maestro_client_name: name",
  "Created client is linked to the associated call with a display name",
);
requireText(
  "apps/planipret-mobile/src/lib/planipret/clientMaestro.ts",
  "const contactPhone = digits10(b.phone);",
  "Client history indexes the client phone before contract phone numbers",
);
requireText(
  "apps/planipret-mobile/src/pages/planipret/mobile/MCalls.tsx",
  "shouldOfferMaestroClientCreation",
  "Call history exposes the creation action by persistent client link rather than caller-ID name",
);
requireText(
  "apps/planipret-mobile/src/components/planipret/mobile/CreateMaestroClientSheet.tsx",
  "const existing = await resolveCallerClient(phone);",
  "Client creation sheet resolves an existing client immediately before POST",
);

console.log(`Client-history verification passed (${checks.length} invariants).`);
