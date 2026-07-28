// Deno test for pp-ava-chat. Run via supabase--test_edge_functions.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const url = `${SUPABASE_URL}/functions/v1/pp-ava-chat`;

Deno.test("OPTIONS returns CORS", async () => {
  const r = await fetch(url, { method: "OPTIONS" });
  await r.text();
  assertEquals(r.status, 200);
  assertEquals(r.headers.get("access-control-allow-origin"), "*");
});

Deno.test("GET rejected with 405", async () => {
  const r = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${ANON}` } });
  await r.text();
  assertEquals(r.status, 405);
});

Deno.test("POST without auth returns 401", async () => {
  const r = await fetch(url, { method: "POST", body: JSON.stringify({ message: "x" }) });
  await r.text();
  assertEquals(r.status, 401);
});
