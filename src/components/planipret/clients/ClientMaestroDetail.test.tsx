import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SmsBubble } from "./ClientMaestroDetail";

const sent = {
  id: "sms-out",
  direction: "outbound",
  body: "Bonjour, voici le suivi.",
  created_at: "2026-09-29T12:30:00.000Z",
  from_number: "+14385550100",
  to_number: "+15145550123",
};

const received = {
  ...sent,
  id: "sms-in",
  direction: "inbound",
  body: "Merci, je confirme.",
};

describe("Client SMS bubbles", () => {
  it("places broker-sent text on the right with the Sent label", () => {
    render(<SmsBubble message={sent} lang="fr" />);
    expect(screen.getByTestId("sms-outbound")).toHaveClass("justify-end");
    expect(screen.getByText(/Envoyé/)).toBeInTheDocument();
    expect(screen.getByTestId("sms-bubble").getAttribute("style")).toContain("linear-gradient");
  });

  it("places received text on the left with the Received label", () => {
    render(<SmsBubble message={received} lang="fr" />);
    expect(screen.getByTestId("sms-inbound")).toHaveClass("justify-start");
    expect(screen.getByText(/Reçu/)).toBeInTheDocument();
    expect(screen.getByTestId("sms-bubble").getAttribute("style")).toContain("rgba(16, 185, 129");
  });
});
