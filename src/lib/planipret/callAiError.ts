type ErrorPayload = { error?: unknown; message?: unknown; locked?: unknown; success?: unknown };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function messageForPayload(payload: ErrorPayload, fallback: string): string {
  const code = text(payload.error).toUpperCase();
  const message = text(payload.message);

  if (code === "TRANSCRIPT_MISSING") return "Aucune transcription à analyser.";
  if (code.includes("RATE") || message.toLowerCase().includes("trop de demandes")) {
    return "Analyse IA temporairement limitée. Réessayez dans quelques minutes.";
  }
  if (code.includes("CREDIT")) return "Analyse IA indisponible pour le moment.";
  if (payload.locked === true || message.toLowerCase().includes("analyse en cours")) {
    return "Analyse en cours. Réessayez dans un instant.";
  }
  return fallback;
}

/**
 * Converts an Edge Function failure into a short, safe, actionable call-analysis
 * message. Provider/debug payloads are intentionally never shown in the app.
 */
export async function callAiErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const payload = await context.clone().json().catch(() => null) as ErrorPayload | null;
    if (payload && typeof payload === "object") return messageForPayload(payload, fallback);
  }
  return fallback;
}

/** Handles a successful HTTP response that reports an application-level refusal. */
export function callAiResultMessage(result: ErrorPayload | null | undefined, fallback: string): string {
  return messageForPayload(result ?? {}, fallback);
}
