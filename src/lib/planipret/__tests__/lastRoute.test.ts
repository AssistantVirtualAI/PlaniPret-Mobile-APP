import { beforeEach, describe, expect, it } from "vitest";
import {
  lastRememberedRoute,
  MOBILE_HOME_ROUTE,
  previousMobileRoute,
  rememberLastRoute,
} from "../lastRoute";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("mobile last route", () => {
  it("restores the last permitted Planiprêt route after a cold start", () => {
    rememberLastRoute("/mplanipret/tasks?filter=open");
    expect(lastRememberedRoute()).toBe("/mplanipret/tasks");
  });

  it("keeps the back action inside Planiprêt and falls back to Home", () => {
    expect(previousMobileRoute("/mplanipret/maestro")).toBeNull();
    expect(MOBILE_HOME_ROUTE).toBe("/mplanipret/home");

    rememberLastRoute("/mplanipret/home");
    rememberLastRoute("/mplanipret/maestro");
    rememberLastRoute("/mplanipret/stats");

    expect(previousMobileRoute("/mplanipret/stats")).toBe("/mplanipret/maestro");
    expect(previousMobileRoute("/mplanipret/maestro")).toBe("/mplanipret/home");
  });

  it("never persists external paths or the AVA route in the back stack", () => {
    rememberLastRoute("https://outside.example/redirect");
    rememberLastRoute("/auth/maestro/callback?code=never-store");
    rememberLastRoute("/mplanipret/ava");

    expect(lastRememberedRoute()).toBeNull();
    expect(previousMobileRoute("/mplanipret/tasks")).toBeNull();
  });
});
