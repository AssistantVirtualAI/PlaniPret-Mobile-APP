import { describe, expect, it } from "vitest";
import { resolveCommissionScope } from "../../supabase/functions/_shared/commission-scope";

describe("commission report scope", () => {
  it("forces a broker to their own Maestro identifier", () => {
    expect(resolveCommissionScope({
      role: "broker",
      action: "summary",
      requestedUsersId: "999",
      ownUsersId: "123",
      ownToken: "broker-token",
    })).toEqual({ ok: true, usersId: "123", token: "broker-token", mode: "own" });
  });

  it("uses the administrator credential for all brokers", () => {
    expect(resolveCommissionScope({
      role: "admin",
      action: "summary",
      ownUsersId: "123",
      ownToken: "own-token",
      firmToken: "firm-token",
    })).toEqual({ ok: true, usersId: null, token: "firm-token", mode: "all_brokers" });
  });

  it("uses the administrator credential for a selected broker", () => {
    expect(resolveCommissionScope({
      role: "admin",
      action: "deposits",
      requestedUsersId: "456",
      ownUsersId: "123",
      ownToken: "own-token",
      firmToken: "firm-token",
    })).toEqual({ ok: true, usersId: "456", token: "firm-token", mode: "selected_broker" });
  });

  it("never falls back to another broker OAuth token when administrator scope is absent", () => {
    expect(resolveCommissionScope({
      role: "admin",
      action: "summary",
      ownUsersId: "123",
      ownToken: "own-token",
    })).toEqual({ ok: false, error: "admin_scope_unavailable" });
  });

  it("keeps an administrator personal view on their own token", () => {
    expect(resolveCommissionScope({
      role: "admin",
      action: "summary",
      requestedUsersId: "123",
      ownUsersId: "123",
      ownToken: "own-token",
    })).toEqual({ ok: true, usersId: "123", token: "own-token", mode: "own" });
  });
});
