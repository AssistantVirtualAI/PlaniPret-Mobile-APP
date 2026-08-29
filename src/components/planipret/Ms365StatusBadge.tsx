/**
 * Compact Microsoft 365 connection status badge.
 * Fetches /functions/v1/ms365-status and shows OK / Limitée / Panne.
 * Click → navigate to /mplanipret/ms365-diagnostics.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export type Ms365StatusPayload = {
  status: "ok" | "limited" | "down";
  detection: { tenant_id: string | null; client_id: string | null; has_secret: boolean; auth_mode?: string; redirect_uris?: { web: string[]; native: string[] } };
  user: { connected: boolean; email: string | null; expired: boolean; has_refresh: boolean; expires_in_sec: number | null; scopes: string[] };
  last: { tested_at: string; success: boolean; message: string } | null;
  admin_cfg_ok: boolean;
};

export function useMs365Status(pollMs = 60_000) {
  const [data, setData] = useState<Ms365StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    try {
      const { data: res } = await supabase.functions.invoke("ms365-status", { body: {} });
      if (res && !(res as any).error) setData(res as Ms365StatusPayload);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    if (pollMs > 0) {
      const id = setInterval(refresh, pollMs);
      return () => clearInterval(id);
    }
  }, [pollMs]);
  return { data, loading, refresh };
}

export default function Ms365StatusBadge({
  compact = false,
  linkTo = "/mplanipret/ms365-diagnostics",
}: { compact?: boolean; linkTo?: string }) {
  const nav = useNavigate();
  const { data, loading } = useMs365Status();

  const label = !data ? "…" : data.status === "ok" ? "Microsoft OK" : data.status === "limited" ? "Microsoft limitée" : "Microsoft en panne";
  const color = !data
    ? { bg: "rgba(74,127,165,0.10)", bd: "#0E2A45", fg: "#8FA8C0" }
    : data.status === "ok"
      ? { bg: "rgba(46,220,120,0.12)", bd: "#1a6b3a", fg: "#2EDC78" }
      : data.status === "limited"
        ? { bg: "rgba(245,166,35,0.12)", bd: "#4A3000", fg: "#F5A623" }
        : { bg: "rgba(232,76,76,0.12)", bd: "#5A1010", fg: "#E84C4C" };

  const Icon = loading
    ? Loader2
    : data?.status === "ok"
      ? CheckCircle2
      : data?.status === "limited"
        ? AlertTriangle
        : XCircle;

  return (
    <button
      type="button"
      onClick={() => nav(linkTo)}
      title="Voir diagnostics Microsoft 365"
      className="inline-flex items-center gap-1.5 rounded-full font-semibold transition-opacity hover:opacity-80"
      style={{
        background: color.bg,
        border: `1px solid ${color.bd}`,
        color: color.fg,
        padding: compact ? "3px 8px" : "5px 10px",
        fontSize: compact ? 10 : 11,
      }}
    >
      <Icon className={loading ? "animate-spin" : ""} style={{ width: compact ? 11 : 13, height: compact ? 11 : 13 }} />
      {label}
    </button>
  );
}
