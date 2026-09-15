import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fail = (message) => {
  console.error(`❌ Maestro API: ${message}`);
  process.exitCode = 1;
};

const actions = [
  "clients.get", "clients.create", "clients.update",
  "addresses.create", "addresses.update", "addresses.delete",
  "telephones.create", "telephones.update", "telephones.delete",
  "contracts.list", "contracts.create", "contracts.update", "contracts.delete",
  "institutions.list",
  "commissions.deposits", "commissions.agents",
  "tasks.list", "tasks.create", "tasks.update", "tasks.delete",
];

const mobile = read("src/lib/planipret/maestroScribe.ts");
const edge = read("supabase/functions/pp-maestro-scribe/index.ts");
const shared = read("supabase/functions/_shared/maestro-scribe.ts");
const activeMobile = [
  "src/pages/planipret/mobile/MContacts.tsx",
  "src/pages/planipret/mobile/MCalls.tsx",
  "src/components/planipret/mobile/recordings/RecordingsList.tsx",
].map(read).join("\n");

for (const action of actions) {
  if (!mobile.includes(`"${action}"`)) fail(`action mobile absente: ${action}`);
  if (!edge.includes(`case "${action}"`)) fail(`action Edge absente: ${action}`);
}

const routeFragments = [
  '"/clients"', '`/clients/${id(clientId)}`',
  '`/clients/${id(clientId)}/addresses`', '`/clients/${id(clientId)}/addresses/${id(addressId)}`',
  '`/clients/${id(clientId)}/telephones`', '`/clients/${id(clientId)}/telephones/${id(telephoneId)}`',
  '"/contracts"', '`/contracts/${id(contractId)}`',
  '"/financial-institutions"',
  '"/commissions/reports/deposits"', '"/commissions/reports/agents"',
  '"/tasks"', '`/tasks/${id(taskId)}`',
];
for (const fragment of routeFragments) {
  if (!shared.includes(fragment)) fail(`route serveur absente: ${fragment}`);
}

if (!shared.includes('export const API_PREFIX = "/api/main"')) fail("préfixe /api/main non verrouillé");
if (!shared.includes('export const DEFAULT_HOST = "https://client.planipret.com"')) fail("hôte officiel non verrouillé");
if (/body\?\.prefix|opts\.prefix|\bprefix\?:/.test(edge + mobile + shared)) fail("préfixe contrôlable encore exposé");
if (activeMobile.includes('functions.invoke("maestro-task"')) fail("un écran mobile appelle encore maestro-task legacy");
if (!activeMobile.includes('createClientFollowUpTask')) fail("les tâches mobiles ne passent pas par le résolveur officiel");
if (!read("supabase/functions/maestro-client-create/index.ts").includes("createClient_(cfg, payload, { token })")) {
  fail("la création client ne passe pas par POST /api/main/clients");
}

if (!process.exitCode) console.log(`✅ Maestro API: ${actions.length}/20 opérations mobiles et Edge vérifiées, hôte et préfixe verrouillés`);
