import { describe, expect, it } from "vitest";
import { normalizeAvaSmsRecipient } from "../avaSmsRecipient";

describe("normalizeAvaSmsRecipient", () => {
  it("conserve un numéro explicite et le message", () => {
    expect(normalizeAvaSmsRecipient({ number: "+1 (514) 555-0100", message: "Bonjour" })).toEqual({
      number: "+1 (514) 555-0100",
      contactName: "",
      message: "Bonjour",
    });
  });

  it("transmet un nom placé par erreur dans number au résolveur serveur", () => {
    expect(normalizeAvaSmsRecipient({ number: "Peter Parker", body: "Bonjour" })).toEqual({
      number: "",
      contactName: "Peter Parker",
      message: "Bonjour",
    });
  });

  it("accepte les variantes de nom de contact sans inventer de numéro", () => {
    expect(normalizeAvaSmsRecipient({ recipient_name: "Peter Parker", text: "Bonjour" })).toEqual({
      number: "",
      contactName: "Peter Parker",
      message: "Bonjour",
    });
  });

  it("privilégie le numéro explicite lorsque le nom est également fourni", () => {
    expect(normalizeAvaSmsRecipient({ to: "5145550100", contact_name: "Peter Parker", content: "Bonjour" })).toEqual({
      number: "5145550100",
      contactName: "Peter Parker",
      message: "Bonjour",
    });
  });
});
