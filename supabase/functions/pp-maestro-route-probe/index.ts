// Read-only discovery of Scott's new Scribe API routes (clients / addresses / telephones / contracts).
// GET only. Never sends SMS, never writes anything.
import { adminClient, corsHeaders, getMaestroConfig, json } from "../_shared/maestro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => ({} as any));
  const admin = adminClient();
  const cfg = await getMaestroConfig(admin);
  if (!cfg.url || !cfg.key) return json({ ok: false, error: "maestro_not_configured" }, 200);

  const base = String(body?.base ?? cfg.url).replace(/\/$/, "");
  const brokerId: string | null = body?.broker_id ? String(body.broker_id) : null;
  const prefixes: string[] = Array.isArray(body?.prefixes) && body.prefixes.length
    ? body.prefixes
    : ["/api/v1", "/api/v1/scribe", "/api/scribe/v1", "/scribe/api/v1"];
  const suffixes: string[] = Array.isArray(body?.suffixes) && body.suffixes.length
    ? body.suffixes
    : [
      "/clients",
      "/addresses",
      "/telephones",
      "/contracts",
      ...(brokerId
        ? [`/users/${brokerId}/clients`, `/users/${brokerId}/contracts`]
        : []),
      "/docs",
      "/documentation",
      "/openapi.json",
    ];

  const results: any[] = [];
  for (const p of prefixes) {
    for (const s of suffixes) {
      const url = `${base}${p}${s}${s.includes("?") ? "&" : "?"}machine=1&limit=1`;
      try {
        const r = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${cfg.key}`, Accept: "application/json" },
        });
        const text = (await r.text().catch(() => "")).slice(0, 2500);
        results.push({ path: `${p}${s}`, status: r.status, sample: text });
      } catch (e) {
        results.push({ path: `${p}${s}`, status: 0, error: String((e as Error)?.message ?? e) });
      }
    }
  }
  results.sort((a, b) => (a.status === 200 ? -1 : 0) - (b.status === 200 ? -1 : 0));
  return json({ ok: true, base, results });
});
