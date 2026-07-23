import "https://deno.land/std@0.224.0/dotenv/load.ts";

const baseUrl = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
const fnUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/functions/v1/mobile-dashboard` : "";

Deno.test("mobile-dashboard: rejects unauthenticated requests", async () => {
  if (!fnUrl) return;
  const res = await fetch(fnUrl, { method: "GET" });
  if (res.status !== 401 && res.status !== 405) throw new Error(`expected 401/405, got ${res.status}`);
});

Deno.test("mobile-dashboard: answers CORS preflight", async () => {
  if (!fnUrl) return;
  const res = await fetch(fnUrl, { method: "OPTIONS" });
  if (res.status < 200 || res.status >= 300) throw new Error(`expected 2xx preflight, got ${res.status}`);
});
