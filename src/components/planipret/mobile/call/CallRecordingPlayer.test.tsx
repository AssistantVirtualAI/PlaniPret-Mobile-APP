import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { fetchAudioUrl } = vi.hoisted(() => ({ fetchAudioUrl: vi.fn() }));

vi.mock("@/lib/planipret/nsApi", () => ({
  recordingsApi: { fetchAudioUrl },
}));

vi.mock("@/hooks/useMplanipretLang", () => ({
  useMplanipretLang: () => ({
    t: (key: string) => ({
      "calls.loadingAudio": "Chargement…",
      "calls.recordingUnavailable": "Enregistrement non disponible",
      "common.retry": "Réessayer",
      "common.close": "Fermer",
    } as Record<string, string>)[key] ?? key,
  }),
}));

import { CallRecordingPlayer } from "./CallRecordingPlayer";

describe("CallRecordingPlayer — erreur audio", () => {
  beforeEach(() => {
    fetchAudioUrl.mockReset();
  });

  it("laisse fermer la fiche d’appel après call_not_found sans relancer l’audio", async () => {
    const onDismiss = vi.fn();
    fetchAudioUrl.mockRejectedValue(new Error("call_not_found"));

    render(<CallRecordingPlayer callId="call-404" onDismiss={onDismiss} />);

    expect(await screen.findByText(/call_not_found/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(fetchAudioUrl).toHaveBeenCalledTimes(1);
  });
});
