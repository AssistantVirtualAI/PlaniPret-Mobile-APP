import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranscriptDiagnosticNotice } from "./TranscriptDiagnosticNotice";
import { resolveTranscriptDiagnostic } from "@/lib/planipret/transcriptDiagnostic";

describe("transcript diagnostic notice", () => {
  it("shows fallback failure and invokes manual retry", () => {
    const onRetry = vi.fn();
    render(<TranscriptDiagnosticNotice diagnostic={resolveTranscriptDiagnostic({ error: "TRANSCRIPTION_FAILED" })} lang="fr" onRetry={onRetry} />);
    expect(screen.getByRole("status")).toHaveTextContent("Transcription audio-STT échouée — Réessayer");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it("hides retry on refusal", () => {
    render(<TranscriptDiagnosticNotice diagnostic={resolveTranscriptDiagnostic({ reason: "consent_refused" })} lang="fr" onRetry={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Consentement refusé");
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("disables retry during processing", () => {
    render(<TranscriptDiagnosticNotice diagnostic={resolveTranscriptDiagnostic({ status: "processing" })} lang="en" busy onRetry={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Transcription processing");
    expect(screen.getByRole("button")).toBeDisabled();
  });
});