// ns-call-action — official NS-API v2 call control (Bearer NS_API_KEY).
// Actions: hangup | reject | hold | unhold | answer | transfer
// Endpoints:
//   GET/PUT/DELETE /domains/{d}/calls/{callid}

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const NS_API_KEY = Deno.env.get("NS_API_KEY");
const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
const NS_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? Deno.env.get("NS_API_DOMAIN") ?? "planipret.ca";

const json = (p: any, s = 200) => new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BodySchema = z.object({
  action: z.enum(["hangup", "reject", "hold", "unhold", "answer", "transfer"]),
  callid: z.string().min(1),
  transfer_to: z.string().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!NS_API_KEY) return json({ error: "NS_API_KEY not configured" }, 500);

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const { action, callid, transfer_to } = parsed.data;

  const headers = { Authorization: `Bearer ${NS_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" };
  const endpoint = `/domains/${encodeURIComponent(NS_DOMAIN)}/calls/${encodeURIComponent(callid)}`;

  let method = "PUT";
  let payload: any = {};
  switch (action) {
    case "hangup":
    case "reject":
      method = "DELETE";
      break;
    case "hold":     payload = { action: "hold" }; break;
    case "unhold":   payload = { action: "unhold" }; break;
    case "answer":   payload = { action: "answer" }; break;
    case "transfer":
      if (!transfer_to) return json({ error: "transfer_to required" }, 400);
      payload = { action: "transfer", destination: transfer_to };
      break;
  }

  const target = `${NS_API_BASE_URL}${endpoint}`;
  const r = await fetch(target, {
    method, headers,
    body: method === "DELETE" ? undefined : JSON.stringify(payload),
  });
  const text = await r.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = text; }

  return json({ success: r.ok, action, callid, status: r.status, data }, r.ok ? 200 : 502);
});
