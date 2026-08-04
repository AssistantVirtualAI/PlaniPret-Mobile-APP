// Regression tests for the Maestro mobile endpoints + broker sign-in linking.
//
// Covers:
//   1. GET /users/{id}/clients            → maestro-actions list_clients
//   2. GET /users/{id}/clients/{id}/profile → maestro-actions client_profile
//   3. GET /users/{id}/brokers            → maestro-actions list_brokers
//   4. GET /users/{id}/brokers/{id}/profile → maestro-actions broker_profile
//   5. Broker sign-in linking path        → pp-mobile-profile + link_broker_by_email
//   6. Pagination + cache contract on the list endpoints
//
// Requires a real broker login. Set in .env (or the shell):
//   PP_TEST_EMAIL=<broker@planipret.com>
//   PP_TEST_PASSWORD=<password>
// Without them the suite is skipped instead of failing.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const EMAIL = Deno.env.get("PP_TEST_EMAIL") ?? "";
const PASSWORD = Deno.env.get("PP_TEST_PASSWORD") ?? "";

const ready = !!(SUPABASE_URL && ANON_KEY && EMAIL && PASSWORD);
const opts = { ignore: !ready };

let accessToken = "";

async function signIn(): Promise<string> {
  if (accessToken) return accessToken;
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  accessToken = data.session?.access_token ?? "";
  assert(accessToken, "no access token returned");
  return accessToken;
}

async function callFn(name: string, body: unknown) {
  const token = await signIn();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text(); // always consume the body
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

const maestro = (action: string, payload: Record<string, unknown> = {}) =>
  callFn("maestro-actions", { action, payload });

/* ---------------- 5. broker sign-in linking path ---------------- */

Deno.test("sign-in bootstraps the profile and links the Maestro broker id", opts, async () => {
  const { status, data } = await callFn("pp-mobile-profile", {});
  assertEquals(status, 200, `pp-mobile-profile: ${JSON.stringify(data).slice(0, 300)}`);
  assert(data.profile, "profile missing from pp-mobile-profile response");
  assertEquals(String(data.profile.email ?? "").toLowerCase(), EMAIL.toLowerCase());
  const linked = data.profile.maestro_broker_id ?? data.maestro_linked;
  assert(linked, "maestro_broker_id was not resolved at sign-in");
  assert(/^\d+$/.test(String(linked)), `maestro_broker_id is not numeric: ${linked}`);
});

Deno.test("manual relink re-runs the email match and keeps the same broker id", opts, async () => {
  const { status, data } = await maestro("link_broker_by_email", { force: true });
  assertEquals(status, 200, JSON.stringify(data).slice(0, 300));
  assertEquals(data.success, true, `relink failed: ${data.error}`);
  assert(/^\d+$/.test(String(data.maestro_broker_id)), "relink returned no numeric broker id");
  assert(["email", "extension", "phone", "already_linked"].includes(String(data.matched_by)));
});

/* ---------------- 1 & 3. list endpoints ---------------- */

for (const [action, key] of [["list_clients", "clients"], ["list_brokers", "brokers"]] as const) {
  Deno.test(`${action} returns a paginated list`, opts, async () => {
    const { status, data } = await maestro(action, { offset: 0, page_size: 5, refresh: true });
    assertEquals(status, 200, JSON.stringify(data).slice(0, 300));
    assertEquals(data.success, true, `${action} failed: ${data.error}`);
    assert(Array.isArray(data[key]), `${key} is not an array`);
    assert(data[key].length <= 5, "page_size not honoured");
    assertEquals(typeof data.total, "number");
    assertEquals(data.offset, 0);
    assertEquals(data.has_prev, false);
    assertEquals(data.prev_offset, null);
    assertEquals(data.page, 1);
    // Normalized contact shape used by AVA chat + voice tools.
    for (const row of data[key]) {
      assert("id" in row, "row missing id");
      assert("name" in row, "row missing normalized name");
      assert("phone" in row, "row missing normalized phone");
    }
  });

  Deno.test(`${action} next/previous pages are stable`, opts, async () => {
    const first = await maestro(action, { offset: 0, page_size: 3 });
    if (!first.data.has_more) return; // fewer than 4 records upstream
    const nextOffset = first.data.next_offset;
    assertEquals(nextOffset, 3);
    const second = await maestro(action, { offset: nextOffset, page_size: 3 });
    assertEquals(second.data.success, true);
    assertEquals(second.data.offset, 3);
    assertEquals(second.data.has_prev, true);
    assertEquals(second.data.prev_offset, 0);
    assertEquals(second.data.page, 2);
    assertEquals(second.data.total, first.data.total);
    const firstIds = first.data[key].map((r: any) => String(r.id));
    const secondIds = second.data[key].map((r: any) => String(r.id));
    assert(!secondIds.some((id: string) => firstIds.includes(id)), "pages overlap");

    // Going back must return the original page.
    const back = await maestro(action, { offset: second.data.prev_offset, page_size: 3 });
    assertEquals(back.data[key].map((r: any) => String(r.id)).join(","), firstIds.join(","));
  });

  Deno.test(`${action} is served from cache on repeat calls`, opts, async () => {
    await maestro(action, { offset: 0, page_size: 2, refresh: true });
    const t0 = Date.now();
    const again = await maestro(action, { offset: 0, page_size: 2 });
    const elapsed = Date.now() - t0;
    assertEquals(again.data.success, true);
    // `cached` may be false if the edge instance rotated; when true it must be fast.
    if (again.data.cached === true) assert(elapsed < 4000, `cached call too slow: ${elapsed}ms`);
  });
}

/* ---------------- 2 & 4. profile endpoints ---------------- */

Deno.test("client_profile returns a normalized profile", opts, async () => {
  const list = await maestro("list_clients", { offset: 0, page_size: 1 });
  const id = list.data.clients?.[0]?.id;
  if (!id) return; // broker has no clients on this environment
  const { status, data } = await maestro("client_profile", { client_id: String(id) });
  assertEquals(status, 200, JSON.stringify(data).slice(0, 300));
  assertEquals(data.success, true, `client_profile failed: ${data.error}`);
  assert(data.profile, "no profile returned");
  assert("phone" in data.profile && "email" in data.profile, "profile not normalized");
});

Deno.test("broker_profile returns a normalized profile", opts, async () => {
  const list = await maestro("list_brokers", { offset: 0, page_size: 1 });
  const id = list.data.brokers?.[0]?.id;
  if (!id) return;
  const { status, data } = await maestro("broker_profile", { broker_id: String(id) });
  assertEquals(status, 200, JSON.stringify(data).slice(0, 300));
  assertEquals(data.success, true, `broker_profile failed: ${data.error}`);
  assert(data.profile, "no profile returned");
});

Deno.test("profile endpoints reject a missing id", opts, async () => {
  const a = await maestro("client_profile", {});
  assertEquals(a.data.success, false);
  const b = await maestro("broker_profile", {});
  assertEquals(b.data.success, false);
});

/* ---------------- AVA chat wiring ---------------- */

Deno.test("AVA chat exposes next/previous page controls for Maestro lists", opts, async () => {
  const { status, data } = await callFn("pp-ava-chat", {
    mode: "chat",
    approved: true,
    language: "fr",
    confirm_action: {
      id: "regression-list",
      label: "list clients",
      kind: "maestro_action",
      payload: { action: "list_clients", offset: 0, page_size: 3 },
    },
  });
  assertEquals(status, 200, JSON.stringify(data).slice(0, 300));
  assert(data.pagination, "chat response is missing pagination metadata");
  assertEquals(data.pagination.offset, 0);
  assertEquals(data.pagination.page, 1);
  if (data.pagination.has_more) {
    const next = (data.suggestions ?? []).find((s: any) => String(s.id).startsWith("maestro-next-"));
    assert(next, "no next-page suggestion returned");
    assertEquals(next.payload.offset, data.pagination.next_offset);

    const page2 = await callFn("pp-ava-chat", {
      mode: "chat", approved: true, language: "fr", confirm_action: next,
    });
    assertEquals(page2.data.pagination.page, 2);
    const prev = (page2.data.suggestions ?? []).find((s: any) => String(s.id).startsWith("maestro-prev-"));
    assert(prev, "no previous-page suggestion on page 2");
    assertEquals(prev.payload.offset, 0);
  }
});

Deno.test("AVA voice agent declares the four Maestro mobile tools", opts, async () => {
  const { data } = await callFn("ava-agent-config", {});
  const names: string[] = (data?.tools ?? data?.tool_names ?? [])
    .map((t: any) => (typeof t === "string" ? t : t?.name))
    .filter(Boolean);
  for (const n of ["list_my_clients", "get_maestro_client_profile", "list_my_brokers", "get_maestro_broker_profile"]) {
    assert(names.includes(n), `voice agent missing tool ${n}`);
  }
});
