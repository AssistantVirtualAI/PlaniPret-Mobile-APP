import { describe, expect, it } from "vitest";
import { buildEmailBodySrcDoc } from "../EmailBodyFrame";

describe("EmailBodyFrame", () => {
  it("force un texte lisible lorsque le courriel impose du noir", () => {
    const document = buildEmailBodySrcDoc('<p style="color:#000">Message externe</p>');

    expect(document).toContain("color-scheme: light");
    expect(document).toContain("body, body *");
    expect(document).toContain("background: #ffffff !important");
    expect(document).toContain("color: #0b1220 !important");
    expect(document).toContain("-webkit-text-fill-color: #0b1220 !important");
    expect(document).toContain('style.setProperty("color", "#0b1220", "important")');
    expect(document).toContain('<p style="color:#000">Message externe</p>');
  });

  it("conserve une couleur distincte et lisible pour les liens", () => {
    const document = buildEmailBodySrcDoc('<a href="https://example.test">Lire</a>');

    expect(document).toContain("color: #075985 !important");
    expect(document).toContain("text-decoration: underline");
  });

  it("neutralise les fonds sombres imposés par les courriels", () => {
    const document = buildEmailBodySrcDoc('<div style="background:#06152d;color:#000">Lisible</div>');
    expect(document).toContain("background-color: transparent !important");
    expect(document).toContain('style.setProperty("background-color", "transparent", "important")');
  });
});
