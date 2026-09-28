import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  notifyAppReady: vi.fn(),
  reset: vi.fn(),
  download: vi.fn(),
  next: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@capgo/capacitor-updater", () => ({
  CapacitorUpdater: {
    current: mocks.current,
    notifyAppReady: mocks.notifyAppReady,
    reset: mocks.reset,
    download: mocks.download,
    next: mocks.next,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import {
  checkAndApplyOtaUpdate,
  isVersionOlder,
  nativeAppVersion,
} from "../otaUpdater";

describe("otaUpdater — priorité au binaire natif", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.notifyAppReady.mockResolvedValue({});
    mocks.reset.mockResolvedValue(undefined);
  });

  it("compare les versions sans rétrograder une version égale ou supérieure", () => {
    expect(isVersionOlder("1.4.19", "1.5.8")).toBe(true);
    expect(isVersionOlder("1.5.8", "1.5.8")).toBe(false);
    expect(isVersionOlder("1.5.9", "1.5.8")).toBe(false);
    expect(isVersionOlder(null, "1.5.8")).toBe(false);
  });

  it("lit la version native même lorsqu'une OTA est active", async () => {
    mocks.current.mockResolvedValue({
      bundle: { id: "old-bundle", version: "1.4.19" },
      native: "1.5.8",
    });

    await expect(nativeAppVersion()).resolves.toBe("1.5.8");
  });

  it("revient immédiatement au bundle natif quelle que soit la version OTA", async () => {
    mocks.current.mockResolvedValue({
      bundle: { id: "old-bundle", version: "1.4.19" },
      native: "1.5.8",
    });

    await expect(checkAndApplyOtaUpdate()).resolves.toEqual({
      status: "reset-to-builtin",
      version: "1.5.8",
    });
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("ne consulte ni ne télécharge de release distante", async () => {
    mocks.current.mockResolvedValue({
      bundle: { id: "builtin", version: "builtin" },
      native: "1.5.8",
    });

    await expect(checkAndApplyOtaUpdate()).resolves.toEqual({ status: "up-to-date", version: "1.5.8" });
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.next).not.toHaveBeenCalled();
  });
});
