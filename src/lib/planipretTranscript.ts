export type PlanipretTranscriptSegment = {
  speaker?: string | null;
  text: string;
  timestamp?: string | null;
  summary?: string | null;
  start?: number | null;
};

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function getAiCorrectedTranscript(call: any): string {
  return asText(call?.ai_analysis_json?.corrected_transcript)
    || asText(call?.corrected_transcript)
    || "";
}

export function getAiTranscriptSegments(call: any): PlanipretTranscriptSegment[] {
  const aiSegments = call?.ai_analysis_json?.segments;
  if (Array.isArray(aiSegments) && aiSegments.length) {
    return aiSegments
      .map((segment: any) => ({
        speaker: asText(segment?.speaker) || null,
        text: asText(segment?.text),
        timestamp: asText(segment?.timestamp) || null,
        summary: asText(segment?.summary) || null,
        start: typeof segment?.start === "number" ? segment.start : null,
      }))
      .filter((segment) => segment.text);
  }

  const corrected = getAiCorrectedTranscript(call);
  if (corrected) {
    return corrected.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const match = line.match(/^([^:]{1,80}):\s*(.+)$/);
      return match
        ? { speaker: match[1].trim(), text: match[2].trim() }
        : { speaker: null, text: line };
    });
  }

  if (Array.isArray(call?.transcript_segments) && call.transcript_segments.length) return call.transcript_segments;
  return asText(call?.transcript) ? [{ speaker: null, text: call.transcript }] : [];
}

export function getDisplayTranscript(call: any): string {
  const corrected = getAiCorrectedTranscript(call);
  if (corrected) return corrected;
  const segments = getAiTranscriptSegments(call);
  if (segments.length) return segments.map((s) => `${s.speaker ? `${s.speaker}: ` : ""}${s.text}`).join("\n");
  return asText(call?.transcript);
}

export function getClientPhoneLabel(call: any): string {
  const phone = call?.direction === "outbound" ? call?.to_number : call?.from_number;
  return asText(phone) || "Client";
}