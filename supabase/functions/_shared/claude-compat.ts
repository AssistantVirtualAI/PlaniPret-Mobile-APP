/**
 * Claude compatibility layer.
 *
 * Replaces the Lovable AI Gateway everywhere in the edge functions.
 * `aiFetch()` accepts the exact same call shape the gateway used
 * (OpenAI `/v1/chat/completions` JSON, or `/v1/audio/transcriptions`
 * multipart) and returns an OpenAI-shaped `Response`, so call sites keep
 * their existing parsing code.
 *
 *  - chat/completions  -> Anthropic Messages API (with prompt caching)
 *  - audio/transcriptions -> OpenAI Whisper (Claude has no STT endpoint)
 */

import { withPromptCache, ANTHROPIC_VERSION } from "./anthropic.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_STT_URL = "https://api.openai.com/v1/audio/transcriptions";

export const CLAUDE_DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
export const CLAUDE_FAST_MODEL = "claude-haiku-4-5-20251001";

/** Maps any legacy gateway model id to a Claude model. */
export function toClaudeModel(model?: string): string {
  const m = (model ?? "").toLowerCase();
  if (m.startsWith("claude")) return model as string;
  if (/nano|lite|mini|flash|haiku/.test(m)) return CLAUDE_FAST_MODEL;
  return CLAUDE_DEFAULT_MODEL;
}

function flattenContent(content: any): any {
  // Anthropic rejects empty text blocks, so every empty/whitespace-only part
  // is dropped instead of being forwarded as `{ type: "text", text: "" }`.
  if (typeof content === "string") return content.trim() ? content : "";
  if (!Array.isArray(content)) {
    const s = String(content ?? "");
    return s.trim() ? s : "";
  }
  const out: any[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      if (part.trim()) out.push({ type: "text", text: part });
    } else if (part?.type === "text") {
      const t = String(part.text ?? "");
      if (t.trim()) out.push({ type: "text", text: t });
    } else if (part?.type === "image_url") {
      const url: string = part.image_url?.url ?? "";
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (m) out.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
      else out.push({ type: "image", source: { type: "url", url } });
    } else if (part?.type === "image") out.push(part);
  }
  return out.length ? out : "";
}


function toAnthropicBody(body: any) {
  const systemParts: string[] = [];
  const messages: any[] = [];

  for (const msg of body.messages ?? []) {
    if (msg.role === "system" || msg.role === "developer") {
      systemParts.push(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
      continue;
    }
    if (msg.role === "tool") {
      messages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: msg.tool_call_id,
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        }],
      });
      continue;
    }
    if (msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      const content: any[] = [];
      if (msg.content && String(msg.content).trim()) content.push({ type: "text", text: String(msg.content) });
      for (const tc of msg.tool_calls) {
        let input: any = {};
        try { input = JSON.parse(tc.function?.arguments || "{}"); } catch { input = {}; }
        content.push({ type: "tool_use", id: tc.id, name: tc.function?.name, input });
      }
      messages.push({ role: "assistant", content });
      continue;
    }
    const content = flattenContent(msg.content);
    if (content === "" || (Array.isArray(content) && !content.length)) continue;
    messages.push({ role: msg.role === "assistant" ? "assistant" : "user", content });
  }

  if (!messages.length) messages.push({ role: "user", content: "." });

  const wantsJson = body.response_format?.type === "json_object" ||
    body.response_format?.type === "json_schema";
  if (wantsJson) systemParts.push("Répond UNIQUEMENT avec du JSON valide, sans texte autour, sans balises markdown.");

  const out: Record<string, any> = {
    model: toClaudeModel(body.model),
    max_tokens: body.max_tokens ?? body.max_completion_tokens ?? 2048,
    messages,
  };
  if (systemParts.length) out.system = systemParts.join("\n\n");
  if (typeof body.temperature === "number") out.temperature = body.temperature;

  if (Array.isArray(body.tools) && body.tools.length) {
    out.tools = body.tools.map((t: any) => {
      if (t?.type === "function" && t.function) {
        return {
          name: t.function.name,
          description: t.function.description ?? "",
          input_schema: t.function.parameters ?? { type: "object", properties: {} },
        };
      }
      return t;
    });
    const tc = body.tool_choice;
    if (tc === "required") out.tool_choice = { type: "any" };
    else if (tc === "auto") out.tool_choice = { type: "auto" };
    else if (tc?.type === "function") out.tool_choice = { type: "tool", name: tc.function?.name };
  }

  return withPromptCache(out, out.model);
}

function toOpenAiResponse(data: any) {
  const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
  const text = blocks.filter((b) => b?.type === "text").map((b) => b.text ?? "").join("");
  const toolUses = blocks.filter((b) => b?.type === "tool_use");
  const message: any = { role: "assistant", content: text || null };
  if (toolUses.length) {
    message.tool_calls = toolUses.map((b: any) => ({
      id: b.id,
      type: "function",
      function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
    }));
  }
  return {
    id: data?.id ?? "claude",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: data?.model ?? CLAUDE_DEFAULT_MODEL,
    choices: [{
      index: 0,
      message,
      finish_reason: toolUses.length ? "tool_calls" : "stop",
    }],
    usage: {
      prompt_tokens: data?.usage?.input_tokens ?? 0,
      completion_tokens: data?.usage?.output_tokens ?? 0,
      total_tokens: (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0),
    },
  };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Anthropic SSE -> OpenAI chat.completion.chunk SSE. */
function streamToOpenAi(upstream: ReadableStream<Uint8Array>, model: string): Response {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = "";
  const out = new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            let evt: any;
            try { evt = JSON.parse(payload); } catch { continue; }
            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
              send({
                id: "claude", object: "chat.completion.chunk", model,
                choices: [{ index: 0, delta: { content: evt.delta.text }, finish_reason: null }],
              });
            } else if (evt.type === "message_stop") {
              send({
                id: "claude", object: "chat.completion.chunk", model,
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              });
            }
          }
        }
      } catch (e) {
        console.error("[claude-compat] stream error", e);
      } finally {
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
  return new Response(out, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

/** Best-effort telemetry: which provider actually served each AI request. */
function logAiUsage(row: {
  provider: "claude" | "openai";
  model?: string;
  status_code?: number;
  failover?: boolean;
  duration_ms?: number;
  error?: string;
}) {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const endpoint = Deno.env.get("SB_EXECUTION_ID") ? "edge" : "edge";
    void fetch(`${url}/rest/v1/planipret_ai_provider_usage`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        endpoint: AI_ENDPOINT_NAME || endpoint,
        provider: row.provider,
        model: row.model ?? null,
        status_code: row.status_code ?? null,
        failover: row.failover ?? false,
        duration_ms: row.duration_ms ?? null,
        error: row.error ? String(row.error).slice(0, 500) : null,
      }),
    }).catch(() => {});
  } catch { /* telemetry must never break the call */ }
}

/** Name reported in AI usage telemetry. Set once per function. */
let AI_ENDPOINT_NAME = Deno.env.get("SB_FUNCTION_NAME") ?? "unknown";
export function setAiEndpointName(name: string) { AI_ENDPOINT_NAME = name; }

/** Maps any model id to an OpenAI failover model. */
function toOpenAiModel(model?: string): string {
  const m = (model ?? "").toLowerCase();
  if (/nano|lite|mini|flash|haiku/.test(m)) return "gpt-4o-mini";
  return "gpt-4o";
}

/** Secondary provider: OpenAI, same OpenAI-shaped request/response. */
async function openAiFailover(body: any): Promise<Response> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) {
    logAiUsage({ provider: "openai", failover: true, status_code: 502, error: "OPENAI_API_KEY missing" });
    return json({ error: { message: "claude failed and OPENAI_API_KEY is missing" } }, 502);
  }
  const payload = { ...body, model: toOpenAiModel(body.model) };
  const t0 = Date.now();
  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const raw = await res.text();
    console.error("[claude-compat] openai failover", res.status, raw.slice(0, 400));
    logAiUsage({ provider: "openai", model: payload.model, failover: true, status_code: res.status, duration_ms: Date.now() - t0, error: raw.slice(0, 300) });
    return new Response(raw, { status: res.status, headers: { "content-type": "application/json" } });
  }
  console.warn("[claude-compat] served by OpenAI failover");
  logAiUsage({ provider: "openai", model: payload.model, failover: true, status_code: 200, duration_ms: Date.now() - t0 });
  return new Response(res.body, {
    status: 200,
    headers: {
      "content-type": res.headers.get("content-type") ??
        (body.stream === true ? "text/event-stream" : "application/json"),
    },
  });
}

async function chatCompletions(init: RequestInit): Promise<Response> {
  let body: any;
  try { body = JSON.parse(String(init.body ?? "{}")); } catch { return json({ error: { message: "bad request body" } }, 400); }

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) {
    logAiUsage({ provider: "claude", model: body.model, failover: true, error: "ANTHROPIC_API_KEY missing" });
    return openAiFailover(body);
  }

  const stream = body.stream === true;
  const anthropicBody = toAnthropicBody(body);
  if (stream) anthropicBody.stream = true;

  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(anthropicBody),
      signal: (init as any).signal,
    });
  } catch (e) {
    console.error("[claude-compat] anthropic network error", e);
    logAiUsage({ provider: "claude", model: anthropicBody.model, duration_ms: Date.now() - t0, error: String(e) });
    return openAiFailover(body);
  }

  if (!res.ok) {
    const raw = await res.text();
    console.error("[claude-compat] anthropic", res.status, raw.slice(0, 400));
    logAiUsage({ provider: "claude", model: anthropicBody.model, status_code: res.status, duration_ms: Date.now() - t0, error: raw.slice(0, 300) });
    // 400 = bad request (same on OpenAI) → surface. Otherwise fail over.
    if (res.status === 400) {
      return new Response(raw, { status: 400, headers: { "content-type": "application/json" } });
    }
    return openAiFailover(body);
  }

  logAiUsage({ provider: "claude", model: anthropicBody.model, status_code: 200, duration_ms: Date.now() - t0 });

  if (stream && res.body) return streamToOpenAi(res.body, anthropicBody.model);

  const data = await res.json();
  return json(toOpenAiResponse(data));
}


async function transcriptions(init: RequestInit): Promise<Response> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ error: { message: "missing OPENAI_API_KEY" } }, 500);

  const src = init.body as FormData;
  const form = new FormData();
  let requested = "";
  for (const [k, v] of (src as any).entries()) {
    if (k === "model") { requested = String(v); continue; }
    form.append(k, v as any);
  }
  // Whisper by default; honour an explicit OpenAI transcribe model when asked.
  const model = /gpt-4o(-mini)?-transcribe/.test(requested)
    ? requested.replace(/^openai\//, "")
    : "whisper-1";
  form.append("model", model);

  const res = await fetch(OPENAI_STT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const raw = await res.text();
  return new Response(raw, { status: res.status, headers: { "content-type": "application/json" } });
}

/**
 * Drop-in replacement for `fetch()` against the old AI gateway URLs.
 * Routes chat to Claude and speech-to-text to OpenAI Whisper.
 */
export async function aiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (url.includes("/audio/transcriptions")) return transcriptions(init);
  return chatCompletions(init);
}

export default aiFetch;
