import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const webhook = read("supabase/functions/ns-webhook-receiver/index.ts");
const modernCalls = read("supabase/functions/pp-ns-calls/index.ts");
const legacyCalls = read("supabase/functions/ns-calls/index.ts");
const announcements = read("supabase/functions/pp-ns-did-announcement/index.ts");

check(webhook.includes("function normalizeCallDirection"), "CDR direction must be normalized before persistence");
check(webhook.includes("normalizeCallDirection(data.direction"), "CDR patch must use normalized direction");
check(webhook.includes("function runBackground"), "Webhook background tasks must be guarded");
check(webhook.includes('runBackground("iOS VoIP push"'), "iOS VoIP push must be prioritized independently");
check(webhook.includes('runBackground("Android incoming-call push"'), "Android incoming push must be isolated from optional work");
check(webhook.includes('runBackground("post-call orchestrator"'), "Post-call invocation must be tracked with EdgeRuntime.waitUntil");
check(!webhook.includes("direction: data.direction ??"), "Raw CDR direction must not be written to the constrained column");

check(modernCalls.includes('.from("planipret_profiles")'), "Modern outbound calls must resolve a Planiprêt profile");
check(modernCalls.includes("user_id: profile.id"), "Modern outbound calls must persist profile.id, not auth.users.id");
check(modernCalls.includes("local_persistence: localPersistence"), "Modern outbound response must surface local persistence state");
check(!modernCalls.includes("} catch { /* non-fatal */ }"), "Modern outbound persistence failures must not be swallowed");

check(legacyCalls.includes("answer_disabled_use_sip_dialog"), "Legacy REST answer path must be disabled");
check(legacyCalls.includes("user_id: ppProfile.id"), "Legacy outbound calls must persist profile.id");
check(legacyCalls.includes("ns_call_id.eq.${callId}"), "Legacy disconnect must use a real call-id column");
check(!legacyCalls.includes('.eq("call_id", callId)'), "Legacy disconnect must not update the nonexistent call_id column");

check(!announcements.includes("bootSelfHeal"), "DID announcement must not self-heal at cold start");
check(!announcements.includes("x-selfheal"), "DID announcement must not accept background self-heal headers");
check(announcements.includes("autoheal(domain, targets, false)"), "DID diagnostics must remain read-only");
check(announcements.includes('confirmation: "REPAIR_DID_QUEUES"'), "Queue repair must require an explicit confirmation token");
check(announcements.includes("probe_queue_disabled_configuration_locked"), "Arbitrary queue writes must stay disabled while configuration is locked");
check(announcements.includes("ENABLE_DID_ANNOUNCEMENT"), "DID enable must require explicit confirmation");
check(announcements.includes("DISABLE_DID_ANNOUNCEMENT"), "DID disable must require explicit confirmation");

if (failures.length) {
  console.error("Telephony backend verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Telephony backend verification passed.");
