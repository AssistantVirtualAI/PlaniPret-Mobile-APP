// Integration tests for pp-ava-webrtc-token edge function.
//
// Verifies the client-facing error contract:
//   - Missing / invalid Authorization  -> 401 { error: "unauthorized" }
//   - Authenticated user with voice_agent_enabled=false -> 403 { error: "voice_agent_disabled" }
//
// The 403 path requires a real user JWT for a Planipret broker whose profile
// has voice_agent_enabled=false. Provide it via the DISABLED_USER_JWT env var;
// if absent, the test is skipped (so CI without credentials still passes).
//
// Run:
//   deno test --allow-net --allow-env supabase/functions/pp-ava-webrtc-token/index.test.ts

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/pp-ava-webrtc-token`;

async function callFn(authHeader?: string) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({ type: "webrtc" }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

Deno.test("rejects request without Authorization header (401 unauthorized)", async () => {
  const { status, body } = await callFn();
  assertEquals(status, 401);
  assertEquals(body.error, "unauthorized");
});

Deno.test("rejects request with malformed Authorization header (401 unauthorized)", async () => {
  const { status, body } = await callFn("NotBearer xyz");
  assertEquals(status, 401);
  assertEquals(body.error, "unauthorized");
});

Deno.test("rejects request with invalid bearer JWT (401 unauthorized)", async () => {
  const { status, body } = await callFn("Bearer invalid.jwt.token");
  assertEquals(status, 401);
  assertEquals(body.error, "unauthorized");
});

Deno.test({
  name: "returns 403 voice_agent_disabled for user with voice_agent_enabled=false",
  ignore: !Deno.env.get("DISABLED_USER_JWT"),
  fn: async () => {
    const jwt = Deno.env.get("DISABLED_USER_JWT")!;
    const { status, body } = await callFn(`Bearer ${jwt}`);
    assertEquals(status, 403);
    // Client (AvaVoiceAgent) matches on this exact string to show
    // "Agent vocal AVA désactivé — contactez votre administrateur pour l'activer."
    assertEquals(body.error, "voice_agent_disabled");
  },
});
