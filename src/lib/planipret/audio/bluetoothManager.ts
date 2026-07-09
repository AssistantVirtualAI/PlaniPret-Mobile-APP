// Phase 4.3 — Bluetooth audio device manager for /mplanipret.
// Uses @capacitor-community/bluetooth-le when native, no-ops on web.

import { audioRouter } from "./audioRouter";

const LAST_KEY = "pp_last_bt_device";

export interface BtDevice { id: string; name: string }

let listeners = new Set<(devs: BtDevice[]) => void>();
let known: BtDevice[] = [];

function isNative(): boolean {
  return !!(window as any)?.Capacitor?.isNativePlatform?.();
}

async function getBle(): Promise<any | null> {
  if (!isNative()) return null;
  try {
    const mod = await import("@capacitor-community/bluetooth-le");
    return (mod as any).BleClient;
  } catch {
    return null;
  }
}

export const bluetoothManager = {
  devices: () => [...known],

  subscribe(fn: (devs: BtDevice[]) => void) {
    listeners.add(fn);
    fn(known);
    return () => { listeners.delete(fn); };
  },

  async scanAudioDevices(): Promise<BtDevice[]> {
    const Ble = await getBle();
    if (!Ble) return known;
    try {
      await Ble.initialize();
      const found: BtDevice[] = [];
      await Ble.requestLEScan({}, (r: any) => {
        if (r?.device?.deviceId) found.push({ id: r.device.deviceId, name: r.device.name ?? "Casque BT" });
      });
      setTimeout(() => Ble.stopLEScan().catch(() => {}), 4000);
      known = found;
      listeners.forEach((f) => f(known));
      return known;
    } catch {
      return known;
    }
  },

  async autoConnectLast(): Promise<void> {
    const Ble = await getBle();
    if (!Ble) return;
    try {
      const id = localStorage.getItem(LAST_KEY);
      if (!id) return;
      await Ble.connect(id, () => { audioRouter.setRoute("earpiece"); });
      await audioRouter.setRoute("bluetooth");
    } catch {}
  },

  async connect(id: string, name: string): Promise<void> {
    const Ble = await getBle();
    if (!Ble) return;
    try {
      await Ble.connect(id, () => { audioRouter.setRoute("earpiece"); });
      localStorage.setItem(LAST_KEY, id);
      await audioRouter.setRoute("bluetooth");
      if (!known.find((d) => d.id === id)) known = [...known, { id, name }];
      listeners.forEach((f) => f(known));
    } catch {}
  },
};
