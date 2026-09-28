import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const packageName = JSON.parse(read("package.json")).name;
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const cdr = read("supabase/functions/pp-ns-cdr/index.ts");
const autoProcess = read("supabase/functions/pp-auto-process-call/index.ts");
const callsPage = read(
  packageName === "planipret-mobile"
    ? "src/pages/planipret/mobile/MCalls.tsx"
    : "apps/planipret-mobile/src/pages/planipret/mobile/MCalls.tsx",
);

check(cdr.includes("const CDR_IDENTITY_COLUMNS"), "CDR reconciliation must use immutable SIP/CDR identity columns");
check(cdr.includes("cdrIdentityCandidates"), "CDR reconciliation must gather all leg identities");
check(cdr.includes("never guess\n * from a phone number or a timestamp"), "CDR reconciliation must not use number/time heuristics");
check(cdr.includes("queueApprovedPostCall"), "Approved CDRs must queue the post-call pipeline automatically");
check(cdr.includes('String(updated.save_consent ?? "") === "approved"'), "Automatic post-call processing must retain the explicit-consent gate");
check(cdr.includes("EdgeRuntime"), "Background post-call work must be retained by the Edge runtime");
check(!cdr.includes("maestro-sync-call", cdr.indexOf("queueApprovedPostCall")), "CDR pull must delegate through the consent-aware post-call orchestrator");

check(autoProcess.includes("requireApprovedCallConsent"), "Post-call processing must require approved consent");
check(autoProcess.includes("maestro-sync-call"), "Approved calls must still enter Maestro synchronization");

check(!callsPage.includes("calls not synced"), "The mobile page must not display a manual call-sync failure banner");
check(!callsPage.includes("appels non synchronisés"), "The mobile page must not display a manual French call-sync failure banner");
check(!callsPage.includes("resyncUnsynced"), "The mobile page must not expose a manual CDR repair path");
check(callsPage.includes("consent-aware Maestro pipeline automatically"), "The mobile page must document the automatic server pipeline");

if (failures.length) {
  console.error("Call-sync automation verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Call-sync automation verification passed.");
