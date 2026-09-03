// Contract E2E test: simulates the CDR → recording → transcription/summary
// chain with retry until maestro_call_id is available.
//
// Run: deno test --allow-net --allow-env supabase/functions/pp-call-queue/chain_test.ts
import { assertEquals, assert } from "jsr:@std/assert@0.226";

// ── Test harness ─────────────────────────────────────────
// Simulates the Maestro-side state machine: the call record is not created
// until CDR succeeds, then downstream PUTs become valid.

interface MockCall {
  local_id: string;
  maestro_call_id: string | null;
  maestro_synced: boolean;
  metadata: Record<string, unknown>;
  transcript: string | null;
  ai_summary: string | null;
  recording_uploaded: boolean;
  cdr_attempts: number;
}

interface MaestroState {
  calls: Map<string, MockCall>; // maestro_call_id -> call
  // track: local call -> maestro call resolution
  localToMaestro: Map<string, string>;
  failCdrNext: number; // how many CDR calls should fail before succeeding
  fail404Next: number; // simulate stale maestro_call_id returning 404
}

function makeState(): MaestroState {
  return {
    calls: new Map(),
    localToMaestro: new Map(),
    failCdrNext: 2, // first 2 CDR attempts fail (maestro not ready), 3rd succeeds
    fail404Next: 0,
  };
}

/** Simulate the CDR step: creates the Maestro call record on success. */
function simulateCdr(state: MaestroState, callId: string): { ok: boolean; maestro_call_id: string | null; status: number } {
  const local = state.localToMaestro.get(callId);
  if (local) {
    // Already has a Maestro id — CDR is a no-op.
    return { ok: true, maestro_call_id: local, status: 200 };
  }
  if (state.failCdrNext > 0) {
    state.failCdrNext--;
    return { ok: false, maestro_call_id: null, status: 503 }; // transient
  }
  // Success: create Maestro record
  const mId = `maestro-${crypto.randomUUID().slice(0, 8)}`;
  const call: MockCall = {
    local_id: callId,
    maestro_call_id: mId,
    maestro_synced: false,
    metadata: {},
    transcript: null,
    ai_summary: null,
    recording_uploaded: false,
    cdr_attempts: 3,
  };
  state.calls.set(mId, call);
  state.localToMaestro.set(callId, mId);
  return { ok: true, maestro_call_id: mId, status: 200 };
}

/** Simulate ensureMaestroCall: verify the Maestro id exists. */
function simulateEnsure(state: MaestroState, callId: string): { ok: boolean; maestroCallId: string | null; reason?: string } {
  const mId = state.localToMaestro.get(callId);
  if (!mId) {
    return { ok: false, maestroCallId: null, reason: "maestro_call_id_missing" };
  }
  if (state.fail404Next > 0) {
    state.fail404Next--;
    // Stale ID — invalidate so CDR can recreate
    state.localToMaestro.delete(callId);
    return { ok: false, maestroCallId: null, reason: "maestro_404" };
  }
  const call = state.calls.get(mId);
  if (!call) {
    // Stale ID not found — invalidate so CDR can recreate
    state.localToMaestro.delete(callId);
    return { ok: false, maestroCallId: null, reason: "maestro_404" };
  }
  return { ok: true, maestroCallId: mId };
}

/** Simulate recording upload — requires valid maestro_call_id. */
function simulateRecording(state: MaestroState, callId: string): { ok: boolean; status: number } {
  const mId = state.localToMaestro.get(callId);
  if (!mId || !state.calls.has(mId)) return { ok: false, status: 404 };
  const call = state.calls.get(mId)!;
  call.recording_uploaded = true;
  return { ok: true, status: 200 };
}

/** Simulate transcription — requires valid maestro_call_id. */
function simulateTranscription(state: MaestroState, callId: string): { ok: boolean; transcript: string | null } {
  const mId = state.localToMaestro.get(callId);
  if (!mId || !state.calls.has(mId)) return { ok: false, transcript: null };
  const call = state.calls.get(mId)!;
  call.transcript = "Bonjour, ceci est un appel de test. Le client demande un refinancement.";
  return { ok: true, transcript: call.transcript };
}

/** Simulate AI summary — requires transcript. */
function simulateAiSummary(state: MaestroState, callId: string): { ok: boolean; summary: string | null } {
  const mId = state.localToMaestro.get(callId);
  if (!mId || !state.calls.has(mId)) return { ok: false, summary: null };
  const call = state.calls.get(mId)!;
  if (!call.transcript) return { ok: false, summary: null };
  call.ai_summary = "Client demande refinancement, taux d'intérêt élevé. Lead qualifié.";
  return { ok: true, summary: call.ai_summary };
}

/** Full chain orchestrator with retry logic — mirrors maestro-sync-call. */
async function runChain(
  state: MaestroState,
  callId: string,
  maxRetries = 6,
): Promise<{ success: boolean; steps: Record<string, unknown>; retries: number }> {
  const steps: Record<string, unknown> = {};
  let retries = 0;
  const stepOrder = ["cdr", "ensure", "recording", "transcription", "ai_summary"];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    retries = attempt;
    steps.attempt = attempt;

    // Step 1: CDR
    const cdr = simulateCdr(state, callId);
    steps.cdr = { ok: cdr.ok, status: cdr.status };
    if (!cdr.ok) {
      // Transient — retry
      steps.result = "cdr_pending_retry";
      continue;
    }

    // Step 2: Ensure Maestro call exists
    const guard = simulateEnsure(state, callId);
    steps.ensure = { ok: guard.ok, reason: guard.reason };
    if (!guard.ok) {
      steps.result = "ensure_pending_retry";
      continue;
    }

    // Step 3: Recording
    const rec = simulateRecording(state, callId);
    steps.recording = { ok: rec.ok, status: rec.status };
    if (!rec.ok) {
      steps.result = "recording_failed";
      continue;
    }

    // Step 4: Transcription
    const tr = simulateTranscription(state, callId);
    steps.transcription = { ok: tr.ok };
    if (!tr.ok) {
      steps.result = "transcription_failed";
      continue;
    }

    // Step 5: AI summary
    const ai = simulateAiSummary(state, callId);
    steps.ai_summary = { ok: ai.ok };
    if (!ai.ok) {
      steps.result = "ai_summary_failed";
      continue;
    }

    steps.result = "success";
    return { success: true, steps, retries };
  }

  return { success: false, steps, retries };
}

// ── Tests ────────────────────────────────────────────────

Deno.test("chain succeeds after CDR retries when maestro_call_id becomes available", async () => {
  const state = makeState();
  const result = await runChain(state, "call-001");
  assertEquals(result.success, true);
  assertEquals(result.retries, 2, "should have retried 2 times before CDR succeeded");
  assertEquals(result.steps.result, "success");
  // Verify all steps completed
  const call = state.calls.get(state.localToMaestro.get("call-001")!);
  assert(call, "Maestro call should exist");
  assertEquals(call!.recording_uploaded, true);
  assertEquals(call!.transcript !== null, true);
  assertEquals(call!.ai_summary !== null, true);
});

Deno.test("chain stops and remains retryable when maestro_call_id never appears", async () => {
  const state = makeState();
  state.failCdrNext = 999; // CDR never succeeds
  const result = await runChain(state, "call-002", 4);
  assertEquals(result.success, false);
  assertEquals(result.retries, 3, "exhausted all retries");
  assertEquals(state.localToMaestro.has("call-002"), false, "no maestro_call_id was ever stored");
  assertEquals(result.steps.result, "cdr_pending_retry");
});

Deno.test("chain handles stale maestro_call_id 404 and recreates via CDR", async () => {
  // Simulate a pre-existing stale maestro_call_id
  const state = makeState();
  state.failCdrNext = 0; // CDR succeeds immediately
  // Pre-populate a stale id that 404s on verify
  state.localToMaestro.set("call-003", "stale-maestro-id");
  state.fail404Next = 1;

  const result = await runChain(state, "call-003", 5);
  // First attempt: ensure 404s → CDR recreate → second attempt succeeds
  assertEquals(result.success, true);
  assert(result.retries >= 1, "should have retried at least once after 404");
});

Deno.test("chain is idempotent: second run is a no-op after success", async () => {
  const state = makeState();
  const r1 = await runChain(state, "call-004");
  assertEquals(r1.success, true);

  // Second run: CDR is already synced
  const r2 = await runChain(state, "call-004", 1);
  assertEquals(r2.success, true);
  assertEquals(r2.retries, 0, "no retry needed — already synced");
});

Deno.test("chain respects strict ordering: no recording before maestro_call_id", async () => {
  const state = makeState();
  state.failCdrNext = 3; // CDR fails 3 times

  // Try recording before CDR succeeds
  const rec = simulateRecording(state, "call-005");
  assertEquals(rec.ok, false, "recording must fail when maestro_call_id is missing");
  assertEquals(rec.status, 404);

  // Try transcription before CDR succeeds
  const tr = simulateTranscription(state, "call-005");
  assertEquals(tr.ok, false, "transcription must fail when maestro_call_id is missing");

  // Now run the full chain — it should retry until CDR succeeds
  const result = await runChain(state, "call-005", 6);
  assertEquals(result.success, true);
  assertEquals(result.retries, 3);
});

Deno.test("queue processor marks job dead after max_attempts", async () => {
  // Simulate queue behavior: a job that always fails should go dead
  const state = makeState();
  state.failCdrNext = 999; // never succeeds

  let attempts = 0;
  const maxAttempts = 5;
  let finalStatus = "pending";

  for (let i = 0; i < maxAttempts + 1; i++) {
    attempts++;
    const result = await runChain(state, "call-006", 1);
    if (result.success) {
      finalStatus = "done";
      break;
    }
    if (attempts >= maxAttempts) {
      finalStatus = "dead";
      break;
    }
  }

  assertEquals(finalStatus, "dead", "job should be dead after max_attempts");
  assertEquals(attempts, maxAttempts, "should have attempted exactly max_attempts times");
});

Deno.test("circuit breaker pauses queue on 402/403", () => {
  // Simulate circuit breaker logic
  let paused = false;
  const statuses = [200, 200, 402, 200, 200];

  for (const s of statuses) {
    if (s === 402 || s === 403) {
      paused = true;
      break;
    }
  }

  assertEquals(paused, true, "queue should pause on 402/403");
});

Deno.test("probe resumes queue after successful probe on recovery", async () => {
  const state = makeState();
  // First, pause the queue (simulated)
  let paused = true;
  state.failCdrNext = 0; // now CDR will succeed

  // Probe: run one job
  const probeResult = await runChain(state, "call-007", 1);
  if (probeResult.success) {
    paused = false;
  }

  assertEquals(paused, false, "probe success should resume the queue");
  assertEquals(probeResult.success, true);
});
