// Phase 4.3 — Bluetooth audio device manager for /mplanipret.
// Call audio routing on iOS/Android is handled by the OS audio session
// (AVAudioSession / AudioManager), not by BLE GATT: the native plugin reports
// connected headsets and we simply mirror them here.

import { audioRouter } from "./audioRouter";

export interface BtDevice { id: string; name: string }

const listeners = new Set<(devs: BtDevice[]) => void>();
let known: BtDevice[] = [];
let bound = false;

function apply(d: { bluetooth: boolean; bluetoothName: string }) {
  known = d.bluetooth ? [{ id: "bt", name: d.bluetoothName || "Casque Bluetooth" }] : [];
  listeners.forEach((f) => f(known));
}

function bind() {
  if (bound) return;
  bound = true;
  audioRouter.subscribe((d) => apply(d));
}

export const bluetoothManager = {
  devices: () => [...known],

  subscribe(fn: (devs: BtDevice[]) => void) {
    bind();
    listeners.add(fn);
    fn(known);
    return () => { listeners.delete(fn); };
  },

  /** Re-reads the OS audio route (auto-detection is push-based). */
  async scanAudioDevices(): Promise<BtDevice[]> {
    bind();
    const d = await audioRouter.refreshDevices();
    apply(d);
    return known;
  },

  /** Called at call start: the headset is picked automatically when present. */
  async autoConnectLast(): Promise<void> {
    const d = await audioRouter.refreshDevices();
    apply(d);
    if (d.bluetooth) await audioRouter.setRoute("bluetooth");
  },

  async connect(_id: string, _name: string): Promise<void> {
    await audioRouter.setRoute("bluetooth");
  },
};
