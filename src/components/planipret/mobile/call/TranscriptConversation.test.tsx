import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { normalizeTranscriptTurns, TranscriptConversation } from "./TranscriptConversation";

describe("TranscriptConversation", () => {
  it("keeps distinct source speakers on opposite sides without claiming broker identity", () => {
    const turns = [{ speaker: "speaker_0", text: "Bonjour", start: 4 }, { speaker: "speaker_1", text: "Salut", start: 12 }, { speaker: "speaker_0", text: "Ça va ?" }];
    const { container } = render(<TranscriptConversation turns={turns} />);
    expect(container.querySelectorAll(".pp-transcript-message-right")).toHaveLength(1);
    expect(screen.getAllByText("Intervenant 1")).toHaveLength(2);
    expect(screen.getByText("0:12")).toBeInTheDocument();
    expect(screen.queryByText("Courtier")).not.toBeInTheDocument();
  });
  it("does not fabricate turns in a plain single-speaker transcript", () => {
    const turns = normalizeTranscriptTurns(null, "Allô ? Oui, ça va et toi ?");
    render(<TranscriptConversation turns={turns} />);
    expect(turns).toHaveLength(1);
    expect(screen.getByText("Intervenant non identifié")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("La source ne distingue pas");
  });
  it("parses only explicit speaker prefixes and preserves text", () => {
    expect(normalizeTranscriptTurns(null, "Agent: Bonjour\nClient: Allô\nLe montant: 100 $")).toEqual([
      { speaker: "Agent", text: "Bonjour" }, { speaker: "Client", text: "Allô" }, { speaker: null, text: "Le montant: 100 $" },
    ]);
  });
  it("keeps speaker identity stable when filtering", () => {
    const { container } = render(<TranscriptConversation query="Salut" turns={[{ speaker: "A", text: "Bonjour" }, { speaker: "B", text: "Salut" }]} />);
    expect(container.querySelectorAll(".pp-transcript-message-right")).toHaveLength(1);
    expect(screen.getByText("Intervenant 2")).toBeInTheDocument();
  });
  it("presents explicit SIP speakers clearly without inferring their roles", () => {
    const { container } = render(<TranscriptConversation turns={[
      { speaker: "sip:113M@planipret.ca", text: "Bonjour, comment allez-vous ?" },
      { speaker: "sip:1136M@planipret.ca", text: "Très bien, merci.\n\nJ’ai une question." },
    ]} />);
    expect(screen.getByText("Poste 113")).toBeInTheDocument();
    expect(screen.getByText("Poste 1136")).toBeInTheDocument();
    expect(container.textContent).not.toContain("planipret.ca");
    expect(container.querySelectorAll(".pp-transcript-bubble")[1]?.textContent).toBe("Très bien, merci.\n\nJ’ai une question.");
    expect(screen.queryByText("Courtier")).not.toBeInTheDocument();
  });
});