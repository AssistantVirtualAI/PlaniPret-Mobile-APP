export type TranscriptDiagnosticCode =
  | "recording_pending" | "audio_missing" | "consent_refused"
  | "processing" | "native_unavailable" | "stt_failed" | "unknown";

export interface TranscriptDiagnostic {
  code: TranscriptDiagnosticCode;
  retryable: boolean;
  processing: boolean;
}

type Evidence = {
  reason?: unknown; error?: unknown; status?: unknown; pending?: boolean;
  attempts?: Array<{ kind?: string; result?: unknown; error?: unknown; status?: number }>;
};

/** Use explicit response evidence, never infer missing audio from a missing URL/CDR 404. */
export function resolveTranscriptDiagnostic(response: Evidence = {}, call: {
  save_consent?: string | null; transcript_status?: string | null; transcript_pending?: boolean;
} = {}): TranscriptDiagnostic {
  const fallback = Array.isArray(response.attempts)
    ? response.attempts.slice().reverse().find((a) => a.kind === "consented_audio_stt_fallback") : undefined;
  const codes = [response.reason, response.error, response.status, fallback?.result, fallback?.error]
    .filter((v): v is string => typeof v === "string").map((v) => v.toLowerCase());
  const has = (...values: string[]) => codes.some((code) => values.includes(code));
  const result = (code: TranscriptDiagnosticCode, retryable = true, processing = false) => ({ code, retryable, processing });
  if (call.save_consent === "refused" || has("consent_refused", "call_refused", "consent_required", "call_deleted", "call_save_not_approved", "call_consent_not_approved")) return result("consent_refused", false);
  if (has("transcript_pending", "recording_pending", "recording-pending-sync", "recording-not-synced")) return result("recording_pending", true, true);
  if (has("no_audio", "audio_missing", "recording_not_found", "transcript_unavailable", "call_not_connected")) return result("audio_missing");
  if (has("transcribing", "processing", "transcription_processing") || response.pending === true) return result("processing", true, true);
  if (has("transcription_failed", "audio_stt_failed", "stt_failed") || fallback?.error || (fallback?.status && fallback.status >= 500)) return result("stt_failed");
  if (has("native_unavailable", "transcript_not_available", "ns_not_configured")) return result("native_unavailable");
  // Persisted evidence applies only when the current response supplied no diagnostic.
  if (!codes.length) {
    if (call.transcript_status === "no_audio") return result("audio_missing");
    if (call.transcript_status === "pending" || call.transcript_pending) return result("recording_pending", true, true);
    if (call.transcript_status === "transcribing") return result("processing", true, true);
    if (call.transcript_status === "failed") return result("stt_failed");
  }
  return result("unknown");
}

const LABELS: Record<TranscriptDiagnosticCode, [string, string]> = {
  recording_pending: ["Enregistrement en attente", "Recording pending"],
  audio_missing: ["Audio introuvable", "Audio not found"],
  consent_refused: ["Consentement refusé", "Consent refused"],
  processing: ["Transcription en traitement", "Transcription processing"],
  native_unavailable: ["Transcription native NetSapiens indisponible", "Native NetSapiens transcription unavailable"],
  stt_failed: ["Transcription audio-STT échouée — Réessayer", "Audio-STT transcription failed — Retry"],
  unknown: ["Diagnostic de transcription indisponible — Réessayer", "Transcription diagnostic unavailable — Retry"],
};

export function transcriptDiagnosticLabel(code: TranscriptDiagnosticCode, lang: string): string {
  return LABELS[code][lang === "en" ? 1 : 0];
}