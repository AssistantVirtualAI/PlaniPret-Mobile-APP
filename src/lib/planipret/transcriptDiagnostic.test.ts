import { describe, expect, it } from "vitest";
import { resolveTranscriptDiagnostic as resolve, transcriptDiagnosticLabel } from "./transcriptDiagnostic";

describe("transcription diagnostic evidence", () => {
  it.each([
    ["TRANSCRIPT_PENDING", "recording_pending"], ["TRANSCRIPT_UNAVAILABLE", "audio_missing"],
    ["consent_refused", "consent_refused"], ["processing", "processing"],
    ["transcript_not_available", "native_unavailable"], ["TRANSCRIPTION_FAILED", "stt_failed"],
  ])("maps %s to %s", (error, code) => expect(resolve({ error }).code).toBe(code));
  it("prioritizes audio fallback over generic native failure", () => {
    expect(resolve({ reason: "transcript_not_available", attempts: [{ kind: "consented_audio_stt_fallback", result: "TRANSCRIPTION_FAILED", status: 200 }] }).code).toBe("stt_failed");
    expect(resolve({ reason: "transcript_not_available", attempts: [{ kind: "consented_audio_stt_fallback", result: "TRANSCRIPT_PENDING", status: 200 }] }).code).toBe("recording_pending");
  });
  it("never retries a refusal", () => expect(resolve({ reason: "consent_refused" })).toMatchObject({ retryable: false, processing: false }));
  it("does not infer processing or missing audio from CDR 404", () => expect(resolve({ attempts: [{ kind: "cdr_lookup", status: 404 }] }).code).toBe("unknown"));
  it("uses persisted evidence only without a newer result", () => {
    expect(resolve({}, { transcript_status: "no_audio" }).code).toBe("audio_missing");
    expect(resolve({ error: "TRANSCRIPTION_FAILED" }, { transcript_pending: true }).code).toBe("stt_failed");
  });
  it("tolerates numeric attempt counts returned by STT", () => expect(resolve({ error: "TRANSCRIPT_PENDING", attempts: 3 } as never).code).toBe("recording_pending"));
  it("does not expose arbitrary provider error text", () => {
    const diagnostic = resolve({ error: "private provider error" });
    expect(transcriptDiagnosticLabel(diagnostic.code, "fr")).not.toContain("private");
    expect(transcriptDiagnosticLabel("stt_failed", "en")).toBe("Audio-STT transcription failed — Retry");
  });
});