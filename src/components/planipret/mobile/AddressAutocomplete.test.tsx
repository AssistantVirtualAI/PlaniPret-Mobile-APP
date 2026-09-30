import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import AddressAutocomplete, { splitRoute } from "./AddressAutocomplete";

describe("splitRoute", () => {
  it("maps leading and trailing street types to the Maestro codes", () => {
    expect(splitRoute("Rue de la Montagne")).toEqual({ streetType: "1", streetName: "de la Montagne" });
    expect(splitRoute("Main Street")).toEqual({ streetType: "1", streetName: "Main" });
    expect(splitRoute("Boulevard Saint-Laurent")).toEqual({ streetType: "3", streetName: "Saint-Laurent" });
  });

  it("preserves an unknown route for manual completion", () => {
    expect(splitRoute("Promenade du Canal")).toEqual({ streetType: "", streetName: "Promenade du Canal" });
  });
});

describe("AddressAutocomplete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("loads suggestions and fills the selected Google address", async () => {
    const onSelect = vi.fn();
    invoke
      .mockResolvedValueOnce({ data: { suggestions: [{ placeId: "abc", text: "123 Rue Principale, Montréal, QC" }] }, error: null })
      .mockResolvedValueOnce({ data: { streetNumber: "123", route: "Rue Principale", city: "Montréal", region: "QC", zip: "H2X 1Y4" }, error: null });
    render(<AddressAutocomplete className="field" style={{}} onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText("Rechercher l’adresse Google"), { target: { value: "123 rue" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(301); });
    expect(screen.getByRole("button", { name: /123 Rue Principale/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /123 Rue Principale/i }));
    await act(async () => {});
    expect(onSelect).toHaveBeenCalledWith({ streetNumber: "123", route: "Rue Principale", city: "Montréal", region: "QC", zip: "H2X 1Y4" });
    expect(invoke.mock.calls[0][1].body.sessionToken).toBeTruthy();
    expect(invoke.mock.calls[1][1].body).toMatchObject({ action: "details", placeId: "abc" });
  });

  it("keeps the manual address path visible and explains a missing server key", async () => {
    invoke.mockResolvedValue({ data: { error: "not_configured", suggestions: [] }, error: null });
    render(<AddressAutocomplete className="field" style={{}} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Rechercher l’adresse Google"), { target: { value: "123 rue" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(301); });

    expect(screen.getByLabelText("Rechercher l’adresse Google")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Recherche Google indisponible");
  });
});
