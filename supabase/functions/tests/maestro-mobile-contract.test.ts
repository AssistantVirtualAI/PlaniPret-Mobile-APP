// Credential-free contract tests for the Maestro mobile integration.
//
// The end-to-end suite (maestro-mobile-endpoints.test.ts) needs a real broker
// login and is skipped without PP_TEST_EMAIL / PP_TEST_PASSWORD. These tests
// always run and guard the wiring that regressed before: voice tool names,
// tool labels, chat pagination and cache, and the manual relink button.
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const ROOT = new URL("../../../", import.meta.url).pathname;
const read = (p: string) => Deno.readTextFileSync(ROOT + p);

const MAESTRO_TOOLS = [
  "list_my_clients",
  "get_maestro_client_profile",
  "list_my_brokers",
  "get_maestro_broker_profile",
];

Deno.test("voice agent config declares the four Maestro mobile tools", () => {
  const src = read("supabase/functions/ava-agent-config/index.ts");
  for (const t of MAESTRO_TOOLS) assert(src.includes(t), `ava-agent-config missing tool ${t}`);
});

Deno.test("tool executor implements the four Maestro mobile tools", () => {
  const src = read("supabase/functions/ava-tool-executor/index.ts");
  for (const t of MAESTRO_TOOLS) assert(src.includes(`${t}(ctx`), `ava-tool-executor missing handler ${t}`);
});

Deno.test("every Maestro tool has a FR and EN label in both apps", () => {
  for (const p of [
    "src/lib/i18n/avaToolLabels.ts",
    "apps/planipret-mobile/src/lib/i18n/avaToolLabels.ts",
  ]) {
    const src = read(p);
    for (const t of MAESTRO_TOOLS) assert(src.includes(`${t}:`), `${p} missing label for ${t}`);
  }
});

Deno.test("chat executes maestro_action confirmations and returns pagination", () => {
  const src = read("supabase/functions/pp-ava-chat/index.ts");
  assert(src.includes('kind === "maestro_action"'), "no maestro_action branch");
  assert(src.includes("maestro-actions"), "maestro_action branch does not invoke maestro-actions");
  for (const f of ["next_offset", "prev_offset", "has_more", "page_count"]) {
    assert(src.includes(f), `pagination field ${f} missing from pp-ava-chat`);
  }
});

Deno.test("maestro-actions caches list responses and exposes pagination", () => {
  const src = read("supabase/functions/maestro-actions/index.ts");
  assert(/CACHE_TTL[^\n]*90/.test(src), "90s cache TTL missing");
  for (const f of ["next_offset", "prev_offset", "has_more"]) {
    assert(src.includes(f), `pagination field ${f} missing from maestro-actions`);
  }
});

Deno.test("AVA chat UI renders the pager row in both apps", () => {
  for (const p of [
    "src/pages/planipret/mobile/MAvaChat.tsx",
    "apps/planipret-mobile/src/pages/planipret/mobile/MAvaChat.tsx",
  ]) {
    const src = read(p);
    assert(src.includes("maestro-next-") || src.includes("maestro-prev-"), `${p} has no pager controls`);
  }
});

Deno.test("MaestroRelinkButton exists and is mounted in both apps", () => {
  for (const p of [
    "src/components/planipret/mobile/MaestroRelinkButton.tsx",
    "apps/planipret-mobile/src/components/planipret/mobile/MaestroRelinkButton.tsx",
  ]) {
    assert(read(p).includes("link_broker_by_email"), `${p} does not call link_broker_by_email`);
  }
  for (const p of [
    "src/pages/planipret/mobile/MConnections.tsx",
    "apps/planipret-mobile/src/pages/planipret/mobile/MConnections.tsx",
  ]) {
    assert(read(p).includes("MaestroRelinkButton"), `${p} does not mount MaestroRelinkButton`);
  }
});

Deno.test("broker id is auto-linked by email on profile bootstrap", () => {
  const src = read("supabase/functions/pp-mobile-profile/index.ts");
  assert(src.includes("linkBrokerIdByEmail"), "pp-mobile-profile does not auto-link the broker id");
});
