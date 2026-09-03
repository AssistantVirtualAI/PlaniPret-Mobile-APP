// Claude (Anthropic) provider helper for the AI SDK.
// Replaces the former Lovable AI Gateway provider: every legacy model id
// (google/*, openai/*, ...) is mapped to an equivalent Claude model.
// If ANTHROPIC_API_KEY is absent, we fall back to OpenAI (secondary provider)
// so AI features keep working instead of failing hard.
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { toClaudeModel } from "./claude-compat.ts";

function toOpenAiModel(model: string): string {
  return /nano|lite|mini|flash|haiku/i.test(model) ? "gpt-4o-mini" : "gpt-4o";
}

export function createClaudeProvider(apiKey?: string) {
  const key = apiKey ?? Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!key) {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (openaiKey) {
      console.warn("[ai-gateway] ANTHROPIC_API_KEY missing — using OpenAI failover");
      const openai = createOpenAI({ apiKey: openaiKey });
      return (model: string) => openai(toOpenAiModel(model));
    }
  }
  const anthropic = createAnthropic({ apiKey: key });
  return (model: string) => anthropic(toClaudeModel(model));
}

/** @deprecated kept for call-site compatibility — now returns Claude. */
export function createLovableAiGatewayProvider(_apiKey?: string) {
  return createClaudeProvider();
}
