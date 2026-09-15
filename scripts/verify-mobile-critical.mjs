import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const hook = read("src/hooks/useMplanipretSoftphone.ts");
check(hook.includes('data?.source === "pjsip"'), "CallKit/PJSIP answer and reject must have a native-source dedupe guard");
check(hook.includes("nativeSip.repairRegistration()"), "iOS must repair registration through PJSIP");
check(hook.includes("ppSipProvider.forceReregister()"), "Android/web must repair registration through JsSIP");
const backendCheck = read("src/lib/planipret/sip/sipBackendCheck.ts");
check(backendCheck.includes("Capacitor.getPlatform()"), "SIP backend health check must send the native platform");
const backendHealth = read("supabase/functions/pp-sip-registration-check/index.ts");
check(backendHealth.includes('platform === "ios" ? "M" : "W"'), "SIP health must validate M/PJSIP on iOS and W/JsSIP on Android");
check(backendHealth.includes('from("mobile_push_tokens")') && backendHealth.includes('from("planipret_voip_push_tokens")'), "SIP health must validate FCM on Android and PushKit on iOS");

const androidService = read("android/app/src/main/java/com/planipret/mobile/PpSipKeepAliveService.java");
check(androidService.includes("SSLSocket raw") && androidService.includes("raw.startHandshake()"), "Android WSS must negotiate TLS on port 9002");
const androidPlugin = read("android/app/src/main/java/com/planipret/mobile/PpSipKeepAlivePlugin.java");
check(androidPlugin.includes("if (owns) PpSipKeepAliveService.stop"), "Android JsSIP ownership must stop the competing native WSS registration");

const notifications = read("src/lib/native/permissions/notifications.ts");
check(notifications.includes("listenersPromise") && notifications.includes("registerPromise"), "Push setup must be single-flight");
check(notifications.includes("openInternalRoute") && !notifications.includes("window.location.href = data.route"), "Push routing must use an internal allowlist without full reload");

const webhook = read("supabase/functions/ns-webhook-receiver/index.ts");
check(webhook.includes('got !== expected'), "NetSapiens webhook must validate its shared secret");
check(webhook.includes('functions/v1/pp-auto-process-call'), "CDR webhook must enter the consent-aware post-call orchestrator");
check(!webhook.includes('functions/v1/ai-analyze-call'), "CDR webhook must not invoke AI before consent");
check(!webhook.includes('functions/v1/maestro-sync-call'), "CDR webhook must not push Maestro before consent");
check(webhook.includes('ignoreDuplicates: true'), "Incoming call persistence must suppress duplicate pushes across Edge instances");

const consent = read("supabase/functions/pp-call-consent/index.ts");
check(consent.includes('already_approved') && consent.includes('functions/v1/pp-auto-process-call'), "Consent approval must be idempotent and trigger one orchestrator");
const maestroSync = read("supabase/functions/maestro-sync-call/index.ts");
check(maestroSync.includes('idempotency_key: `post_call_ready:${call_id}`') && maestroSync.includes('functions/v1/pp-push-notify'), "Successful Maestro sync must emit one idempotent post-call notification");
check(!maestroSync.includes('invoke("maestro-task"'), "Post-call analysis must not create Maestro tasks before explicit broker confirmation");
check(maestroSync.includes('requires_broker_confirmation'), "Suggested post-call tasks must remain pending broker confirmation");
const push = read("supabase/functions/pp-push-notify/index.ts");
check(push.includes('notifError?.code === "23505"') && push.includes("idempotency_key"), "Push notification logging must suppress retry duplicates");

for (const file of [
  "supabase/functions/ns-get-recording/index.ts",
  "supabase/functions/ns-get-transcription/index.ts",
  "supabase/functions/pp-admin-transcribe/index.ts",
  "supabase/functions/pp-coach-call/index.ts",
  "supabase/functions/pp-auto-process-call/index.ts",
  "supabase/functions/maestro-cdr/index.ts",
  "supabase/functions/ai-analyze-call/index.ts",
]) {
  const source = read(file);
  check(source.includes("authorizeCallAccess"), `${file} must enforce call ownership/service identity`);
  check(source.includes("requireApprovedCallConsent"), `${file} must enforce approved post-call consent`);
}

const mobileShell = read("src/pages/planipret/PlanipretMobile.tsx");
check(mobileShell.includes("<PostCallConsentSheet"), "The shipped mobile shell must mount PostCallConsentSheet");
const calls = read("src/pages/planipret/mobile/MCalls.tsx");
check(!calls.includes('functions.invoke("maestro-actions"'), "MCalls must not use legacy Maestro mutations");
check(calls.includes("createClientFollowUpTask") && calls.includes('functions.invoke("ms365-actions"'), "Post-call task/event actions must use the official Task API and Microsoft gateway");
const pipeline = read("src/pages/planipret/mobile/MPipeline.tsx");
check(!pipeline.includes('functions.invoke("maestro-actions"'), "MPipeline must not use undocumented Maestro mutations");
check(pipeline.includes('functions.invoke("maestro-client-create"'), "MPipeline client creation must use the official Maestro client gateway");

if (failures.length) {
  console.error("Mobile critical-flow verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Mobile critical-flow verification passed (SIP, push, consent, recordings and Maestro).");
