import { describe, expect, it } from "vitest";
import { voiceConfirmationDecision } from "./avaVoiceConfirmation";

describe("confirmation vocale AVA", () => {
  it("accepte seulement les confirmations explicites", () => {
    for (const value of ["oui", "Oui, confirme", "vas-y", "d'accord", "yes"]) {
      expect(voiceConfirmationDecision(value)).toBe("confirm");
    }
  });

  it("annule seulement les refus explicites", () => {
    for (const value of ["non", "annule", "stop", "pas maintenant"]) {
      expect(voiceConfirmationDecision(value)).toBe("cancel");
    }
  });

  it("ne déduit jamais une confirmation d'une phrase ambiguë", () => {
    for (const value of ["peux-tu vérifier?", "je ne sais pas", "", "oui mais attends", "ça marche"]) {
      expect(voiceConfirmationDecision(value)).toBeNull();
    }
  });
});
