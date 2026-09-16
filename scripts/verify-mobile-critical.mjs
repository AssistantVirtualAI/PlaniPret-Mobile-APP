import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mobileRoot = fs.existsSync(path.join(root, "android"))
  ? root
  : path.join(root, "apps", "planipret-mobile");
const resolvePath = (p) => {
  const direct = path.join(root, p);
  return fs.existsSync(direct) ? direct : path.join(mobileRoot, p);
};
const read = (p) => fs.readFileSync(resolvePath(p), "utf8");
const readOptional = (p) => {
  const target = resolvePath(p);
  return fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
};
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const hook = read("src/hooks/useMplanipretSoftphone.ts");
check(hook.includes('data?.source === "pjsip"'), "CallKit/PJSIP answer and reject must have a native-source dedupe guard");
check(hook.includes("nativeSip.repairRegistration()"), "iOS must repair registration through PJSIP");
check(hook.includes("ppSipProvider.forceReregister()"), "Android/web must repair registration through JsSIP");
check(!hook.includes("setInterval(run, 30_000)") && !hook.includes("ownershipTick") && !hook.includes("voipRecheck"), "SIP/PBX and PushKit checks must be event-driven, not periodic API polling");
const backendCheck = read("src/lib/planipret/sip/sipBackendCheck.ts");
check(backendCheck.includes("Capacitor.getPlatform()"), "SIP backend health check must send the native platform");
const backendHealth = read("supabase/functions/pp-sip-registration-check/index.ts");
check(backendHealth.includes('platform === "ios" ? "M" : "W"'), "SIP health must validate M/PJSIP on iOS and W/JsSIP on Android");
check(backendHealth.includes('from("mobile_push_tokens")') && backendHealth.includes('from("planipret_voip_push_tokens")'), "SIP health must validate FCM on Android and PushKit on iOS");

const androidService = readOptional("android/app/src/main/java/com/planipret/mobile/PpSipKeepAliveService.java");
const androidPlugin = readOptional("android/app/src/main/java/com/planipret/mobile/PpSipKeepAlivePlugin.java");
if (androidService && androidPlugin) {
  check(androidService.includes("SSLSocket raw") && androidService.includes("raw.startHandshake()"), "Android WSS must negotiate TLS on port 9002");
  check(androidPlugin.includes("if (owns) PpSipKeepAliveService.stop"), "Android JsSIP ownership must stop the competing native WSS registration");
} else {
  console.warn("Mobile critical-flow: native Android sources absent from this monorepo checkout; validated in standalone release repository.");
}

const notifications = read("src/lib/native/permissions/notifications.ts");
check(notifications.includes("listenersPromise") && notifications.includes("registerPromise"), "Push setup must be single-flight");
check(notifications.includes("openInternalRoute") && !notifications.includes("window.location.href = data.route"), "Push routing must use an internal allowlist without full reload");

const webhook = read("supabase/functions/ns-webhook-receiver/index.ts");
const nsEvents = read("supabase/functions/_shared/ns-call-events.ts");
const postCallSweeper = read("supabase/functions/pp-maestro-push-sweeper/index.ts");
const cdrRetryJob = read("supabase/functions/maestro-cdr-retry-job/index.ts");
check(webhook.includes('got !== expected'), "NetSapiens webhook must validate its shared secret");
check(webhook.includes('functions/v1/pp-auto-process-call'), "CDR webhook must enter the consent-aware post-call orchestrator");
check(!webhook.includes('functions/v1/ai-analyze-call'), "CDR webhook must not invoke AI before consent");
check(!webhook.includes('functions/v1/maestro-sync-call'), "CDR webhook must not push Maestro before consent");
check(webhook.includes("CDR reconciled to existing call") && webhook.includes("findExistingCdrCall") && webhook.includes("ns_orig_callid"), "CDR webhook must reconcile the final CDR to the original owned call before post-call processing");
check(nsEvents.includes('if (looksLikeCdr(item))') && nsEvents.indexOf('if (looksLikeCdr(item))') < nsEvents.indexOf('if (looksLikeCall(item))'), "NetSapiens CDRs must be classified before call-leg events so post-call processing is not skipped");
check(webhook.includes('ignoreDuplicates: true'), "Incoming call persistence must suppress duplicate pushes across Edge instances");
check(postCallSweeper.includes("maestro-cdr-retry-job") && postCallSweeper.includes("skip_cdr_retry"), "The scheduled Maestro sweeper must also drain consented CDR retries");
check(cdrRetryJob.includes('.eq("save_consent", "approved")') && cdrRetryJob.includes('.is("deleted_at", null)'), "CDR retry sweeps must process only approved, undeleted calls");
check(webhook.includes('stableWebhookId("sms"') && webhook.includes('duplicate SMS ignored') && webhook.includes('stableWebhookId("voicemail"') && webhook.includes('duplicate voicemail ignored'), "SMS and voicemail webhooks must be idempotent before broadcast/push");

const nsCalls = read("supabase/functions/pp-ns-calls/index.ts");
check(nsCalls.includes("callback_disabled_use_sip_dialog") && !nsCalls.includes('"call-orig-user": `${deviceName}'), "Inbound answer fallback must never create a callback/double call");

const consent = read("supabase/functions/pp-call-consent/index.ts");
check(consent.includes('already_approved') && consent.includes('functions/v1/pp-auto-process-call'), "Consent approval must be idempotent and trigger one orchestrator");
const maestroSync = read("supabase/functions/maestro-sync-call/index.ts");
check(maestroSync.includes('idempotency_key: `post_call_ready:${call_id}`') && maestroSync.includes('functions/v1/pp-push-notify'), "Successful Maestro sync must emit one idempotent post-call notification");
check(!maestroSync.includes('invoke("maestro-task"'), "Post-call analysis must not create Maestro tasks before explicit broker confirmation");
check(maestroSync.includes('requires_broker_confirmation'), "Suggested post-call tasks must remain pending broker confirmation");
const push = read("supabase/functions/pp-push-notify/index.ts");
check(push.includes('notifError?.code === "23505"') && push.includes("idempotency_key"), "Push notification logging must suppress retry duplicates");
check(push.includes("delivery_attempts") && push.includes("retryable: true") && push.includes("existing?.delivered"), "Undelivered idempotent pushes must remain retryable without duplicate in-app rows");

for (const file of [
  "supabase/functions/ns-get-recording/index.ts",
  "supabase/functions/ns-get-transcription/index.ts",
  "supabase/functions/pp-admin-transcribe/index.ts",
  "supabase/functions/pp-coach-call/index.ts",
  "supabase/functions/pp-auto-process-call/index.ts",
  "supabase/functions/maestro-cdr/index.ts",
  "supabase/functions/maestro-transcript/index.ts",
  "supabase/functions/maestro-ai-analysis/index.ts",
  "supabase/functions/maestro-recording/index.ts",
  "supabase/functions/ai-analyze-call/index.ts",
]) {
  const source = read(file);
  check(source.includes("authorizeCallAccess"), `${file} must enforce call ownership/service identity`);
  check(source.includes("requireApprovedCallConsent"), `${file} must enforce approved post-call consent`);
}
const recordingsList = read("supabase/functions/pp-ns-recordings/index.ts");
check(recordingsList.includes('eq("save_consent", "approved")') && recordingsList.includes("user_id.eq.${ctx.userId}") && recordingsList.includes("ownerScope") && recordingsList.includes("call_consent_required"), "pp-ns-recordings must return only owned, approved calls");

const mobileShell = read("src/pages/planipret/PlanipretMobile.tsx");
check(mobileShell.includes("<PostCallConsentSheet"), "The shipped mobile shell must mount PostCallConsentSheet");
const calls = read("src/pages/planipret/mobile/MCalls.tsx");
check(!calls.includes('functions.invoke("maestro-actions"'), "MCalls must not use legacy Maestro mutations");
check(calls.includes("createClientFollowUpTask") && calls.includes('functions.invoke("ms365-actions"'), "Post-call task/event actions must use the official Task API and Microsoft gateway");
check(!calls.includes("setInterval(fetchActive") && !calls.includes("setTimeout(tick, delay)"), "Calls and recordings must refresh through Realtime/events instead of API polling");
const more = read("src/pages/planipret/mobile/MMore.tsx");
const connections = read("src/pages/planipret/mobile/MConnections.tsx");
const messages = read("src/pages/planipret/mobile/MMessages.tsx");
const smsDraft = read("src/components/planipret/mobile/SmsDraftSheet.tsx");
const smsEdge = read("supabase/functions/pp-ns-sms/index.ts");
const sipDebug = read("src/pages/planipret/mobile/MSipDebug.tsx");
const networkMonitor = read("src/lib/planipret/network/networkMonitor.ts");
const callerLookup = read("src/lib/planipret/callerLookup.ts");
const nsTranscription = read("supabase/functions/ns-get-transcription/index.ts");
const adminTranscription = read("supabase/functions/pp-admin-transcribe/index.ts");
check(!more.includes("setInterval(() => run(true)") && !sipDebug.includes("setInterval(() => run(false)"), "PBX diagnostics must run on demand or on foreground resume");
check(!connections.includes("setInterval(() => load()") && !messages.includes("setInterval(() => { load(); }"), "Integration and Microsoft views must not poll APIs continuously");
check(!networkMonitor.includes("setInterval(() => this.checkSignalQuality()") && !callerLookup.includes("window.setInterval"), "Calls must not generate periodic network probes or caller lookups");
check(messages.includes("getSmsAvailability") && messages.includes("canSendWithSmsAvailability"), "Manual SMS must verify the broker DID before sending");
check(smsDraft.includes("getSmsAvailability") && smsDraft.includes("canSendWithSmsAvailability"), "Draft SMS must stay disabled until the broker DID is confirmed");
check(smsEdge.includes("user_caller_id_verified") && smsEdge.includes('"caller-id-number"') && smsEdge.includes("caller_id_routing"), "SMS DID lookup must accept the broker's own verified NetSapiens caller ID");
check(smsEdge.includes("sms_sender_not_assigned") && smsEdge.includes("permitted.has(requested)"), "SMS must reject a client-supplied sender that is not assigned to the broker");
check(smsEdge.includes("PAS de repli Maestro"), "SMS sender resolution must never fall back to Maestro");
check(nsTranscription.includes("requireApprovedCallConsent") && nsTranscription.includes("pp-admin-transcribe") && nsTranscription.includes("skip_fallback"), "Missing NetSapiens transcript must use only the consented audio-STT fallback without recursion");
check(adminTranscription.includes("skip_fallback: true"), "The internal transcription probe must disable its own audio-STT fallback to prevent recursion");
const taskHandler = read("supabase/functions/_shared/planipret-task-handler.ts");
check(taskHandler.includes("pending_confirmation: !confirmed") && taskHandler.includes("visible_in_maestro: confirmed") && taskHandler.includes("maestro_readback_unconfirmed"), "Task creation must fail closed until documented Maestro read-back confirms visibility");
const pipeline = read("src/pages/planipret/mobile/MPipeline.tsx");
check(!pipeline.includes('functions.invoke("maestro-actions"'), "MPipeline must not use undocumented Maestro mutations");
check(pipeline.includes('functions.invoke("maestro-client-create"'), "MPipeline client creation must use the official Maestro client gateway");

if (failures.length) {
  console.error("Mobile critical-flow verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Mobile critical-flow verification passed (SIP, push, consent, recordings and Maestro).");
