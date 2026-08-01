/**
 * Shared Anthropic (Claude) client with **prompt caching** enabled.
 *
 * https://platform.claude.com/docs/en/build-with-claude/prompt-caching
 *
 * Why: every Planiprêt / Lemtel edge function re-sends the same long system
 * prompt (and tool schemas) on every single request. Anthropic bills those
 * tokens at full input price each time. With `cache_control: {type:"ephemeral"}`
 * the prefix (tools → system → messages, in that order) is cached for 5 minutes
 * and re-read at **0.1x** the input price (a write costs 1.25x once).
 *
 * Rules encoded here:
 *  - The cacheable prefix is `tools` + `system`. We place one breakpoint at the
 *    end of the tool list and one at the end of the system prompt.
 *  - Anthropic ignores (and does not bill extra for) breakpoints on prefixes
 *    shorter than the minimum cacheable length: 1024 tokens for Sonnet/Opus,
 *    2048 tokens for Haiku. We therefore only add breakpoints when the prefix
 *    is long enough to be worth it, so short one-off prompts stay untouched.
 *  - Anything that varies per request (transcript, email body, user message)
 *    MUST stay in `messages`, after the breakpoints — never in `system`.
 */

export const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** ~3.5 chars per token is a safe conservative estimate for FR/EN prose. */
const CHARS_PER_TOKEN = 3.5;

function minCacheTokens(model: string): number {
  return /haiku/i.test(model) ? 2048 : 1024;
}

export type ClaudeMessage = { role: "user" | "assistant"; content: any };

export type ClaudeCallOptions = {
  model: string;
  max_tokens: number;
  system?: string | any[];
  messages: ClaudeMessage[];
  tools?: any[];
  tool_choice?: any;
  temperature?: number;
  /** Override key (defaults to ANTHROPIC_API_KEY). */
  apiKey?: string;
  /** Set false to disable prompt caching for this call. */
  cache?: boolean;
  /** Use the 1h cache tier (2x write cost) instead of the default 5m. */
  cacheTtl?: "5m" | "1h";
  /** Label used in logs. */
  label?: string;
  signal?: AbortSignal;
};

export type ClaudeResult = {
  ok: boolean;
  status: number;
  /** Concatenated text blocks. */
  text: string;
  /** First tool_use block input, when tools were used. */
  toolInput: any | null;
  data: any;
  error?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

function approxChars(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "string") return v.length;
  try {
    return JSON.stringify(v).length;
  } catch {
    return 0;
  }
}

const CACHE_CONTROL = (ttl: "5m" | "1h") =>
  ttl === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" };

/**
 * Adds a cache breakpoint at the end of `tools` and at the end of `system`,
 * but only when the combined prefix is above the model's minimum cacheable
 * length (otherwise Anthropic silently ignores it).
 */
export function withPromptCache(
  body: Record<string, any>,
  model: string,
  ttl: "5m" | "1h" = "5m",
): Record<string, any> {
  const prefixChars = approxChars(body.tools) + approxChars(body.system);
  if (prefixChars / CHARS_PER_TOKEN < minCacheTokens(model)) return body;

  const cc = CACHE_CONTROL(ttl);
  const out = { ...body };

  if (Array.isArray(out.tools) && out.tools.length) {
    out.tools = out.tools.map((t: any, i: number) =>
      i === out.tools.length - 1 ? { ...t, cache_control: cc } : t,
    );
  }

  if (typeof out.system === "string" && out.system.length) {
    out.system = [{ type: "text", text: out.system, cache_control: cc }];
  } else if (Array.isArray(out.system) && out.system.length) {
    out.system = out.system.map((b: any, i: number) =>
      i === out.system.length - 1 ? { ...b, cache_control: cc } : b,
    );
  }

  return out;
}

/** Calls the Anthropic Messages API with prompt caching on the static prefix. */
export async function callAnthropic(opts: ClaudeCallOptions): Promise<ClaudeResult> {
  const key = opts.apiKey ?? Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { ok: false, status: 0, text: "", toolInput: null, data: null, error: "missing_anthropic_key" };

  let body: Record<string, any> = {
    model: opts.model,
    max_tokens: opts.max_tokens,
    messages: opts.messages,
  };
  if (opts.system) body.system = opts.system;
  if (opts.tools) body.tools = opts.tools;
  if (opts.tool_choice) body.tool_choice = opts.tool_choice;
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;

  // Global kill-switch: set ANTHROPIC_PROMPT_CACHE=off to fall back to plain calls.
  const cacheDisabled = (Deno.env.get("ANTHROPIC_PROMPT_CACHE") ?? "").toLowerCase() === "off";
  if (opts.cache !== false && !cacheDisabled) body = withPromptCache(body, opts.model, opts.cacheTtl ?? "5m");

  let r: Response;
  try {
    r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    return { ok: false, status: 0, text: "", toolInput: null, data: null, error: String((e as Error)?.message ?? e) };
  }

  const raw = await r.text();
  if (!r.ok) {
    console.error(`[claude${opts.label ? ":" + opts.label : ""}] http ${r.status}`, raw.slice(0, 400));
    return { ok: false, status: r.status, text: "", toolInput: null, data: null, error: raw };
  }

  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, status: r.status, text: "", toolInput: null, data: null, error: "parse_error" };
  }

  const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
  const text = blocks.filter((b) => b?.type === "text").map((b) => b.text ?? "").join("");
  const toolInput = blocks.find((b) => b?.type === "tool_use")?.input ?? null;
  const usage = data?.usage ?? {};

  console.log(
    `[claude${opts.label ? ":" + opts.label : ""}] in=${usage.input_tokens ?? 0} out=${usage.output_tokens ?? 0} ` +
      `cache_write=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0}`,
  );

  return { ok: true, status: r.status, text, toolInput, data, usage };
}

/** Convenience: system + single user message → text (null on failure). */
export async function claudeText(
  system: string,
  userText: string,
  opts: Partial<ClaudeCallOptions> & { model?: string; max_tokens?: number } = {},
): Promise<string | null> {
  const res = await callAnthropic({
    model: opts.model ?? "claude-sonnet-4-5-20250929",
    max_tokens: opts.max_tokens ?? 1200,
    system,
    messages: [{ role: "user", content: userText }],
    ...opts,
  } as ClaudeCallOptions);
  return res.ok ? (res.text || null) : null;
}
