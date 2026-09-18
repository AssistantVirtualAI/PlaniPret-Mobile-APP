import { describe, expect, it } from "vitest";
import { buildEmailBodySrcDoc } from "../EmailBodyFrame";

describe("EmailBodyFrame", () => {
  it("force un texte lisible lorsque le courriel impose du noir", () => {
    const document = buildEmailBodySrcDoc('<p style="color:#000">Message externe</p>');

    expect(document).toContain("color-scheme: dark");
    expect(document).toContain("body, body *");
    expect(document).toContain("color: #e8eef8 !important");
    expect(document).toContain("-webkit-text-fill-color: #e8eef8 !important");
    expect(document).toContain('<p style="color:#000">Message externe</p>');
  });

  it("conserve une couleur distincte et lisible pour les liens", () => {
    const document = buildEmailBodySrcDoc('<a href="https://example.test">Lire</a>');

    expect(document).toContain("color: #a78bfa !important");
    expect(document).toContain("text-decoration: underline");
  });
});
