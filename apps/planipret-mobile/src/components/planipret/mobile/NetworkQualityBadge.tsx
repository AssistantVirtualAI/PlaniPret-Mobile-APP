// Planipret mobile — network + call-quality live badge.
import { Wifi, Signal, SignalZero, Radio } from "lucide-react";
import type { NetSample } from "@/lib/planipret/network/networkMonitor";
import type { CallQualitySnapshot } from "@/lib/planipret/audio/callQualitySampler";

const QUALITY_COLORS: Record<string, string> = {
  excellent: "#22c55e",
  good: "#f59e0b",
  poor: "#ef4444",
  offline: "#6b7280",
  unknown: "#94a3b8",
};

export default function NetworkQualityBadge({
  net,
  quality,
  compact,
}: {
  net: NetSample;
  quality?: CallQualitySnapshot | null;
  compact?: boolean;
}) {
  const label = quality?.label ?? net.quality;
  const color = QUALITY_COLORS[label] ?? QUALITY_COLORS.unknown;

  const Icon =
    net.type === "wifi" ? Wifi
    : net.type === "cellular" ? Signal
    : !net.connected ? SignalZero
    : Radio;

  const kindLabel =
    net.type === "wifi" ? "Wi-Fi"
    : net.type === "cellular" ? "LTE"
    : !net.connected ? "Offline"
    : "Net";

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full text-[11px]"
      style={{
        padding: compact ? "2px 8px" : "4px 10px",
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.15)",
        color: "white",
      }}
      title={
        quality
          ? `jitter ${quality.jitterMs ?? "?"}ms · loss ${quality.lossPct ?? "?"}% · rtt ${quality.rttMs ?? "?"}ms`
          : `${kindLabel} · ${label}`
      }
    >
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <span>{kindLabel}</span>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
    </div>
  );
}
