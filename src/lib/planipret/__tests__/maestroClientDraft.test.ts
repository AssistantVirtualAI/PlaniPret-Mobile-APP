import { describe, expect, it } from "vitest";
import { hasRequiredMaestroClientFields } from "@/lib/planipret/maestroClientDraft";

const complete = {
  firstName: "Jeanne",
  lastName: "Tremblay",
  phone: "+1 514 555 0123",
  salutation: "1",
  sex: "f" as const,
  language: "fr" as const,
  streetNumber: "123",
  streetName: "Rue Principale",
  streetType: "1",
  city: "Montréal",
  region: "QC",
  zip: "H2X 1Y4",
};

describe("Maestro client creation draft", () => {
  it("enables creation only for the complete documented client dossier", () => {
    expect(hasRequiredMaestroClientFields(complete)).toBe(true);
  });

  it("keeps submit disabled when the Maestro-required address is incomplete", () => {
    expect(hasRequiredMaestroClientFields({ ...complete, city: "" })).toBe(false);
    expect(hasRequiredMaestroClientFields({ ...complete, zip: "" })).toBe(false);
    expect(hasRequiredMaestroClientFields({ ...complete, streetType: "" })).toBe(false);
  });

  it("keeps submit disabled for a missing mandatory client identity", () => {
    expect(hasRequiredMaestroClientFields({ ...complete, lastName: "" })).toBe(false);
    expect(hasRequiredMaestroClientFields({ ...complete, phone: "1136" })).toBe(false);
  });
});
