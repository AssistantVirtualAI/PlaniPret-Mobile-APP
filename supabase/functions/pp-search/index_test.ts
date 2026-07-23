import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const url = `${SUPABASE_URL}/functions/v1/pp-search`;

Deno.test("OPTIONS returns CORS", async () => {
  const r = await fetch(url, { method: "OPTIONS" });
  await r.text();
  assertEquals(r.status, 200);
});

Deno.test("empty query returns empty arrays", async () => {
  const r = await fetch(`${url}?q=`, { method: "GET", headers: { Authorization: "Bearer x" } });
  const body = await r.json();
  assertEquals(Array.isArray(body.calls), true);
  assertEquals(body.calls.length, 0);
});

Deno.test("query without auth returns 401", async () => {
  const r = await fetch(`${url}?q=test`, { method: "GET" });
  await r.text();
  assertEquals(r.status, 401);
});
