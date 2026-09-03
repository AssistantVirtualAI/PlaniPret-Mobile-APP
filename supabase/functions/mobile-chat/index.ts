// mobile-chat: AVA chatbot for the mobile app. Uses Lovable AI Gateway.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { streamText, generateText, convertToModelMessages } from "npm:ai";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";
import { callAnthropic } from "../_shared/anthropic.ts";

/**
 * Static (cacheable) part of the prompt. Keep this byte-identical across calls
 * so Anthropic prompt caching can re-read it at 0.1x input price.
 */
const AVA_SYSTEM = `You are AVA, the AI assistant inside the Lemtel Softphone mobile app.
You help the user with their phone system: calls, queues, extensions, voicemail, recordings and settings.

Rules:
- Answer concisely: max 4 sentences, no preamble, no markdown headings.
- Answer in the language of the user's last message (French or English).
- Use the live PBX context provided in the first user message when relevant.
- Never invent extensions, queue names or numbers that are not in the context.
- If the data needed is not in the context, say so in one sentence and suggest where to find it in the app.`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const message = String(body?.message || "").slice(0, 4000);
    const history = Array.isArray(body?.history) ? body.history.slice(-12) : [];
    if (!message) return json({ error: "message required" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const { data: sp } = await sb.from("pbx_softphone_users")
      .select("organization_id, extension, sip_domain").eq("portal_user_id", u.user.id).maybeSingle();
    const orgId = sp?.organization_id;

    // Quick PBX context for the LLM.
    let context = "";
    if (orgId) {
      const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
      const [{ count: callsToday }, { data: queues }, { data: extensions }] = await Promise.all([
        sb.from("pbx_call_records").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("start_at", startOfDay.toISOString()),
        sb.from("pbx_call_queues").select("name,extension,strategy").eq("organization_id", orgId).limit(20),
        sb.from("pbx_extensions_safe").select("extension,effective_cid_name").eq("organization_id", orgId).limit(40),
      ]);
      context = `Domain: ${sp?.sip_domain || "n/a"}. Calls today: ${callsToday ?? 0}. Queues: ${(queues ?? []).map((q: any) => q.name).join(", ")}. Extensions: ${(extensions ?? []).map((e: any) => e.extension).join(", ")}.`;
    }

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!key && !openaiKey) return json({ answer: "AVA is not configured yet (missing AI key)." });

    const systemPrompt = `${AVA_SYSTEM}\n\nLive PBX context: ${context}`;
    const chatMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.filter((h: any) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string").map((h: any) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    // Try Lovable AI Gateway first, then fall back to OpenAI if it fails or is missing.
    const tryOpenAI = async (): Promise<string> => {
      if (!openaiKey) throw new Error("no-openai-key");
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: chatMessages }),
      });
      if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const d = await r.json();
      return String(d?.choices?.[0]?.message?.content ?? "");
    };

    // 1) Anthropic first (prompt caching on the static system prefix → ~90% cheaper reads).
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    let text = "";
    if (anthropicKey) {
      const claudeMessages = [
        { role: "user" as const, content: `Live PBX context:\n${context || "(no PBX data available)"}` },
        { role: "assistant" as const, content: "Understood. How can I help with your phone system?" },
        ...history
          .filter((h: any) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
          .map((h: any) => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user" as const, content: message },
      ];
      const res = await callAnthropic({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 600,
        system: AVA_SYSTEM,
        messages: claudeMessages,
        label: "mobile-chat",
      });
      if (res.ok && res.text) return json({ answer: res.text });
      console.warn("[mobile-chat] anthropic failed, falling back", res.error?.slice?.(0, 200));
    }

    if (key) {
      try {
        const gateway = createLovableAiGatewayProvider(key);
        const res = await generateText({ model: gateway("google/gemini-3-flash-preview"), messages: chatMessages });
        text = res.text;
      } catch (e) {
        console.warn("Lovable gateway failed, falling back to OpenAI", (e as Error).message);
        text = await tryOpenAI();
      }
    } else {
      text = await tryOpenAI();
    }


    return json({ answer: text });
  } catch (e: any) {
    return json({ error: e.message || "error" }, 500);
  }
});
