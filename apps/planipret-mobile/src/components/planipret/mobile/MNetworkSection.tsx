// Phase 4.2 — Settings section: "Réseau" with toggles + live status.
import { useEffect, useState } from "react";
import { Wifi, Signal, Phone } from "lucide-react";
import { networkMonitor, loadNetworkPrefs, saveNetworkPrefs, type NetSample, type NetworkPrefs } from "@/lib/planipret/network/networkMonitor";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

export default function MNetworkSection() {
  const { lang } = useMplanipretLang();
  const [prefs, setPrefs] = useState<NetworkPrefs>(loadNetworkPrefs());
  const [s, setS] = useState<NetSample>(networkMonitor.current());

  useEffect(() => {
    networkMonitor.init();
    networkMonitor.startSampling();
    const off = networkMonitor.subscribe(setS);
    return () => { off(); networkMonitor.stopSampling(); };
  }, []);

  const update = (patch: Partial<NetworkPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next); saveNetworkPrefs(next);
  };

  const typeLabel = s.type === "wifi" ? "WiFi" : s.type === "cellular" ? (lang === "fr" ? "Cellulaire" : "Cellular") : (lang === "fr" ? "Réseau" : "Network");
  const Icon = s.type === "wifi" ? Wifi : Signal;

  return (
    <div className="pp-card" style={{ padding: 12 }}>
      <p className="mb-2" style={{ fontSize: 11, fontWeight: 700, color: "var(--pp-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {lang === "fr" ? "Réseau" : "Network"}
      </p>
      <Toggle label={lang === "fr" ? "Basculement réseau automatique" : "Automatic network switching"}
        on={prefs.autoSwitch} onChange={(v) => update({ autoSwitch: v })} />
      <Toggle label={lang === "fr" ? "Préférer WiFi quand disponible" : "Prefer WiFi when available"}
        on={prefs.preferWifi} onChange={(v) => update({ preferWifi: v })} />
      <Toggle label={lang === "fr" ? "Appels en arrière-plan" : "Background calls"}
        on={prefs.backgroundCalls} onChange={(v) => update({ backgroundCalls: v })} />
      <div className="mt-2 rounded-lg p-2.5 flex items-center gap-2"
        style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)" }}>
        <Icon className="w-4 h-4" style={{ color: "var(--pp-brand-accent)" }} />
        <span style={{ fontSize: 12, color: "var(--pp-text-secondary)" }}>
          {lang === "fr" ? "Réseau actuel" : "Current network"}: <b>{typeLabel}</b>
          {s.rtt != null && <> — {s.rtt} ms</>}
        </span>
        <Phone className="w-3 h-3 ml-auto" style={{ color: s.connected ? "var(--pp-color-success)" : "var(--pp-color-danger)" }} />
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span style={{ fontSize: 13, color: "var(--pp-text-primary)" }}>{label}</span>
      <button onClick={() => onChange(!on)}
        className="relative" aria-pressed={on}
        style={{
          width: 38, height: 22, borderRadius: 999,
          background: on ? "rgba(46,155,220,0.55)" : "var(--pp-bg-border-2)",
          transition: "background 150ms",
        }}>
        <span style={{
          position: "absolute", top: 2, left: on ? 18 : 2,
          width: 18, height: 18, borderRadius: "50%",
          background: "#fff", transition: "left 150ms",
        }} />
      </button>
    </div>
  );
}
