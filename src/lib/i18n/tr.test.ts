import { afterEach, describe, expect, it } from "vitest";
import { tr } from "./tr";

afterEach(() => {
  localStorage.clear();
});

describe("tr", () => {
  it("uses French by default and when the stored locale is French", () => {
    expect(tr("Fermer", "Close")).toBe("Fermer");
    localStorage.setItem("mplanipret-lang", "fr");
    expect(tr("Fermer", "Close")).toBe("Fermer");
  });

  it("uses English from either supported app language key", () => {
    localStorage.setItem("mplanipret-lang", "en");
    expect(tr("Fermer", "Close")).toBe("Close");

    localStorage.removeItem("mplanipret-lang");
    localStorage.setItem("ava-language", "en");
    expect(tr("Envoyer", "Send")).toBe("Send");
  });
});
