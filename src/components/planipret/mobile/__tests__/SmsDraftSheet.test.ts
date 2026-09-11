import { describe, expect, it } from "vitest";
import { canSendSmsDraft } from "../SmsDraftSheet";

const base = { recipient: "+15145550123", body: "Bonjour", confirmed: true, busy: false };

describe("canSendSmsDraft", () => {
  it("autorise l'envoi seulement après confirmation explicite", () => {
    expect(canSendSmsDraft(base)).toBe(true);
    expect(canSendSmsDraft({ ...base, confirmed: false })).toBe(false);
  });

  it("refuse un destinataire incomplet ou un message vide", () => {
    expect(canSendSmsDraft({ ...base, recipient: "514555" })).toBe(false);
    expect(canSendSmsDraft({ ...base, body: "   " })).toBe(false);
  });

  it("refuse un deuxième tap pendant un envoi", () => {
    expect(canSendSmsDraft({ ...base, busy: true })).toBe(false);
  });
});
