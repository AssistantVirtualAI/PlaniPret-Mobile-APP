// Phase 4.2 — Quality badge displayed at the top of an active call.
import { useEffect, useState } from "react";
import { Wifi, Signal, AlertTriangle, RotateCw } from "lucide-react";
import { networkMonitor, type NetSample } from "@/lib/planipret/network/networkMonitor";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const COLORS: Record<NetSample["quality"], string> = {
  excellent: "#22C55E",
  good: "#EAB308",
  fair: "#F97316",
  poor: "#EF4444",
  offline: "#EF4444",
};

export default function NetworkBadge() {
  const { lang } = useMplanipretLang();
  const [s, setS] = useState<NetSample>(networkMonitor.current());

  useEffect(() => {
    networkMonitor.init();
    networkMonitor.startSampling();
    const off = networkMonitor.subscribe(setS);
    return () => { off(); networkMonitor.stopSampling(); };
  }, []);

  const labelFr: Record<NetSample["quality"], string> = {
    excellent: "Excellent", good: "Bon", fair: "Acceptable", poor: "Faible", offline: "Reconnexion…",
  };
  const labelEn: Record<NetSample["quality"], string> = {
    excellent: "Excellent", good: "Good", fair: "Fair", poor: "Weak", offline: "Reconnecting…",
  };
  const typeLabel = s.type === "wifi" ? "WiFi" : s.type === "cellular" ? "Cellular" : s.type === "none" ? "—" : "Net";
  const Icon = s.type === "wifi" ? Wifi : s.type === "none" ? AlertTriangle : Signal;
  const color = COLORS[s.quality];
  const text = `${typeLabel} — ${(lang === "fr" ? labelFr : labelEn)[s.quality]}${s.rtt != null ? ` · ${s.rtt}ms` : ""}`;

  return (
    <div
      className="inline-flex items-center gap-1.5"
      style={{
        padding: "5px 10px", borderRadius: 999,
        background: "rgba(255,255,255,0.08)",
        border: `1px solid ${color}55`,
        color, fontFamily: "DM Sans,sans-serif", fontSize: 11, fontWeight: 600,
      }}
    >
      {s.quality === "offline"
        ? <RotateCw className="w-3 h-3 animate-spin" />
        : <Icon className="w-3 h-3" />}
      <span style={{ color: "var(--pp-text-secondary)" }}>{text}</span>
    </div>
  );
}
