import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const unique = (xs) => [...new Set(xs)];

const registry = read("supabase/functions/_shared/ava-tools.ts");
const executor = read("supabase/functions/ava-tool-executor/index.ts");
const confirmation = read("supabase/functions/_shared/ava-confirm.ts");
const voice = read("src/components/planipret/mobile/AvaVoiceAgent.tsx");
const chat = read("src/pages/planipret/mobile/MAvaChat.tsx");
const chatEdge = read("supabase/functions/pp-ava-chat/index.ts");
const tokenEdge = read("supabase/functions/pp-ava-webrtc-token/index.ts");
const assistant = read("supabase/functions/ava-assistant/index.ts");
const consentEdge = read("supabase/functions/pp-ai-consent/index.ts");
const consentUi = read("src/components/planipret/mobile/AiConsentGate.tsx");
const manage = read("supabase/functions/elevenlabs-manage-agent/index.ts");
const legacyHandler = read("supabase/functions/elevenlabs-tool-handler/index.ts");
const retention = read("supabase/functions/pp-data-retention/index.ts");
const softphone = read("src/hooks/useMplanipretSoftphone.ts");
const actionExecutor = read("supabase/functions/ava-action-executor/index.ts");
const stt = read("supabase/functions/pp-ava-stt/index.ts");
const tts = read("supabase/functions/pp-ava-tts/index.ts");
const brief = read("supabase/functions/pp-ava-brief/index.ts");
const report = read("supabase/functions/pp-ava-report/index.ts");
const emailAnalyzer = read("supabase/functions/ava-email-analyzer/index.ts");
const supabaseConfig = read("supabase/config.toml");
const mobileShell = read("src/pages/planipret/PlanipretMobile.tsx");
const proactive = read("src/services/avaProactive.ts");
const taskHandler = read("supabase/functions/_shared/planipret-task-handler.ts");
const taskApi = read("supabase/functions/planipret-task-api/index.ts");
const legacyMaestroTask = read("supabase/functions/maestro-task/index.ts");
const maestroActions = read("supabase/functions/maestro-actions/index.ts");

const specNames = unique([...registry.matchAll(/mk\("([a-z0-9_]+)"/g)].map((m) => m[1]));
const expectedBlock = registry.match(/export const EXPECTED_TOOL_NAMES = \[([\s\S]*?)\];/)?.[1] ?? "";
const expectedNames = unique([...expectedBlock.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));
const handlerNames = new Set([...executor.matchAll(/^\s{2}async\s+([a-z0-9_]+)\(/gm)].map((m) => m[1]));
const voiceBlock = voice.match(/const TOOL_NAMES = \[([\s\S]*?)\];/)?.[1] ?? "";
const voiceNames = new Set([...voiceBlock.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));
const sensitiveBlock = confirmation.match(/AVA_SENSITIVE_TOOLS = new Set<string>\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
const sensitiveNames = unique([...sensitiveBlock.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));

check(specNames.length === 77, `Expected 77 AVA tool specs, found ${specNames.length}`);
check(expectedNames.length === specNames.length && specNames.every((n) => expectedNames.includes(n)), "EXPECTED_TOOL_NAMES must exactly cover all tool specs");
check(specNames.every((n) => handlerNames.has(n)), `Missing executor handlers: ${specNames.filter((n) => !handlerNames.has(n)).join(", ")}`);
check(specNames.every((n) => voiceNames.has(n)), `Missing voice client handlers: ${specNames.filter((n) => !voiceNames.has(n)).join(", ")}`);
check(sensitiveNames.filter((n) => specNames.includes(n)).every((n) => voiceNames.has(n)), "Every registered sensitive AVA tool must be present in the mobile clientTools map");
check(registry.includes('if (isSensitiveAvaTool(name))') && registry.includes('type: "client"') && registry.includes("expects_response: true"), "Sensitive ElevenLabs tools must be client tools with responses");
check(executor.includes('auth.authMode === "ava_session" && isSensitiveAvaTool(tool_name)'), "Stale sensitive ElevenLabs webhooks must be rejected server-side");
check(executor.includes('{ ...params, confirmed: true, idempotency_key: idempotencyKey }'), "Confirmed client execution must carry confirmation and idempotence");
check(executor.includes('.in("user_id", ownerIds(ctx))') && executor.includes('error: "call_consent_required"'), "Recording, transcript and analysis tools must enforce call ownership and consent");

const sendSmsBlock = executor.match(/async send_sms\(ctx, p\) \{([\s\S]*?)\n  \},\n\n  async get_sms_conversations/)?.[1] ?? "";
check(sendSmsBlock.includes('callPlanipretFunction(ctx, "pp-ns-sms"'), "AVA SMS must use pp-ns-sms");
check(sendSmsBlock.includes('origin: "ava_tool"') && sendSmsBlock.includes("idempotency_key"), "AVA SMS must carry confirmation origin and idempotence");
check(!sendSmsBlock.includes("sms_globally_disabled"), "AVA SMS must not remain globally disabled");
check(sendSmsBlock.includes("resolveSmsContact(ctx, name)") && executor.includes('error: "contact_ambiguous"'), "AVA SMS must resolve a contact name safely and reject ambiguous recipients");

check(!chat.includes("sp.placeCall") && !chat.includes('functions.invoke("pp-ns-sms"'), "Chat suggestions must have one call owner and one SMS owner");
check(chat.includes('functions.invoke("ava-tool-executor"') && chat.includes('tool_name: "send_sms"'), "Confirmed chat SMS must execute once through ava-tool-executor");
check(chat.includes("normalizeAvaSmsRecipient") && chat.includes("contact_name: recipient.contactName"), "Confirmed chat SMS must pass a contact name to the server instead of discarding it");
check(voice.includes('callServerTool(tool, { ...params, confirmed: true })'), "Voice confirmation button must pass confirmed=true");
check(voice.includes('tool === "make_call"') && voice.includes('owner: "mobile_softphone"'), "Confirmed voice calls must remain owned by the local mobile softphone");
check(voice.includes('functions.invoke("pp-ava-chat"') && !voice.includes('functions.invoke("ava-assistant"'), "Voice text fallback must use the canonical Planiprêt chatbot");
check(!softphone.includes("restAnswerLiveCall"), "Incoming SIP answer must never fall back to a REST-created call leg");
check(!mobileShell.includes("AvaChatSheet") && mobileShell.includes("ROUTES.MPLANIPRET_AVA"), "Global AVA chat shortcut must open the complete confirmation-capable chat page");
check(!proactive.includes('from("planipret_reminders")') && !proactive.includes("maestro-pipeline-orchestrator"), "Proactive mutations must use the canonical confirmed AVA executor");
check(proactive.includes('result?.read_back !== true') && proactive.includes('result?.visible_in_maestro !== true'), "AVA reminders must not report success until Maestro read-back confirms visibility");
check(chatEdge.includes('invokeFunction("ava-tool-executor"') && chatEdge.includes('error: "client_confirmation_required"'), "Chat mutations must use the canonical executor or remain client-only");
check(chatEdge.includes('maestro_readback_unconfirmed') && chatEdge.includes('rappel n’est pas déclaré créé'), "AVA chat must explicitly report unconfirmed Maestro reminders as not created");
check(taskHandler.includes('assignee_mapping_required') && taskHandler.includes('maestro_assignment_unconfirmed'), "Task creation must fail closed when Maestro assignment cannot be proven");
check(taskHandler.includes('scope_check_timeout_fail_closed') && !taskHandler.includes('scope_check_timeout_passthrough'), "Task target validation timeouts must fail closed rather than authorize an unverified broker scope");
check(!taskHandler.includes('success: true, in_flight'), "A concurrent task mutation must not be exposed as a successful reminder");
check(taskApi.includes('read_back === true') && taskApi.includes('visible_in_maestro === true'), "AVA task claims must finish only after Maestro read-back confirms visibility");
check(taskApi.includes('maestro_html_response') && taskApi.includes('res.ok && !html') && taskApi.includes('if (html || !j || typeof j !== "object"'), "Task gateway must reject HTML and malformed 2xx Maestro responses rather than treating them as successful task data");
check(legacyMaestroTask.includes('guardPlanipret(req)') && !legacyMaestroTask.includes('x-user-id'), "Legacy Maestro task endpoint must authenticate the broker and reject caller-selected identities");
check(maestroActions.includes('CRM_ACTIONS.has(action) && !isServiceRole') && maestroActions.includes('maestro_legacy_action_forbidden'), "Legacy machine-key Maestro task and calendar actions must reject direct broker JWT requests");
check(assistant.includes("ai_consent_required") && !assistant.includes('functions.invoke("mobile-calls-start"') && !assistant.includes('functions.invoke("mobile-sms"'), "Legacy assistant must require consent and must not execute mutations server-side");

check(tokenEdge.includes("ai_consent_at") && tokenEdge.includes("ai_consent_required"), "Voice token minting must require server-side AI consent");
check(chatEdge.includes("ai_consent_at") && chatEdge.includes("ai_consent_required"), "Chatbot must require server-side AI consent");
check(consentEdge.includes('auth.authMode !== "jwt"') && consentEdge.includes('action === "grant"') && consentEdge.includes('action === "revoke"'), "AI consent endpoint must require a user JWT and support grant/revoke");
check(consentUi.includes('functions.invoke("pp-ai-consent"') && consentUi.includes("await setAiConsent()"), "AI consent UI must persist server consent before continuing");
check(fs.existsSync(path.join(root, "supabase/migrations/20260915062000_planipret_ai_consent.sql")), "AI consent migration is missing");

check(manage.includes("existingType !== desiredType") && manage.includes('method: "DELETE"') && manage.includes("Synchronisation incomplète"), "ElevenLabs sync must recreate changed tool types and reject partial attachment");
check(legacyHandler.includes('functions/v1/ava-tool-executor') && !legacyHandler.includes('functions/v1/maestro-actions'), "Legacy ElevenLabs handler must delegate to the canonical executor");
check(!retention.includes("x-cron-trigger") && !retention.includes("x-cron-secret"), "Data retention must not trust a public boolean cron header");
check(!actionExecutor.includes('executionMode = "mock"') && actionExecutor.includes('functions/v1/ava-tool-executor'), "Email-proposed Maestro actions must execute for real through the canonical router");

for (const [name, source] of [["pp-ava-stt", stt], ["pp-ava-tts", tts], ["pp-ava-brief", brief], ["pp-ava-report", report], ["ava-email-analyzer", emailAnalyzer]]) {
  check(source.includes("ai_consent_required") || source.includes("hasValidAiConsent"), `${name} must enforce persistent AI consent`);
  check(supabaseConfig.includes(`[functions.${name}]\nverify_jwt = true`), `${name} must have verify_jwt=true`);
}

if (failures.length) {
  console.error("AVA tool verification failed:");
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log(`AVA tool verification passed (${specNames.length}/${specNames.length} specs, handlers and voice registrations; ${sensitiveNames.length} sensitive tools gated).`);
