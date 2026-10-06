import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEVICE_CONTACTS_CACHE_TTL_MS,
  loadCachedDeviceContacts,
  resetDeviceContactsCacheForTests,
} from "./deviceContactsCache";

describe("deviceContactsCache", () => {
  afterEach(() => {
    resetDeviceContactsCacheForTests();
    vi.useRealTimers();
  });

  it("réutilise le carnet pendant cinq minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T00:00:00Z"));
    const loader = vi.fn(async () => [{ id: "device-1" }]);

    await expect(loadCachedDeviceContacts(loader)).resolves.toEqual([{ id: "device-1" }]);
    vi.setSystemTime(new Date(Date.now() + DEVICE_CONTACTS_CACHE_TTL_MS - 1));
    await expect(loadCachedDeviceContacts(loader)).resolves.toEqual([{ id: "device-1" }]);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("partage une lecture native déjà en cours et recharge après expiration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T00:00:00Z"));
    let resolve!: (rows: any[]) => void;
    const loader = vi.fn()
      .mockImplementationOnce(() => new Promise<any[]>((done) => { resolve = done; }))
      .mockResolvedValueOnce([{ id: "device-2" }]);

    const first = loadCachedDeviceContacts(loader);
    const second = loadCachedDeviceContacts(loader);
    expect(loader).toHaveBeenCalledTimes(1);

    resolve([{ id: "device-1" }]);
    await expect(Promise.all([first, second])).resolves.toEqual([[{ id: "device-1" }], [{ id: "device-1" }]]);

    vi.setSystemTime(new Date(Date.now() + DEVICE_CONTACTS_CACHE_TTL_MS));
    await expect(loadCachedDeviceContacts(loader)).resolves.toEqual([{ id: "device-2" }]);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("n’utilise pas une erreur comme cache et permet une nouvelle tentative", async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("native_read_failed"))
      .mockResolvedValueOnce([{ id: "device-2" }]);

    await expect(loadCachedDeviceContacts(loader)).rejects.toThrow("native_read_failed");
    await expect(loadCachedDeviceContacts(loader)).resolves.toEqual([{ id: "device-2" }]);

    expect(loader).toHaveBeenCalledTimes(2);
  });
});
