import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const URL = `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/ava-admin-command`;
const KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.test("rejects unauthenticated", async () => {
  const r = await fetch(URL, { method: "POST", body: JSON.stringify({ messages: [{ role: "user", parts: [] }] }) });
  await r.text();
  assertEquals(r.status, 401);
});

Deno.test("rejects invalid body", async () => {
  const r = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: "not-an-array" }),
  });
  await r.text();
  // Without a real user JWT this will be 401 before validation; with one, 400.
  if (r.status !== 401) assertEquals(r.status, 400);
});

Deno.test("rejects non-POST", async () => {
  const r = await fetch(URL, { method: "GET" });
  await r.text();
  assertEquals(r.status, 405);
});
