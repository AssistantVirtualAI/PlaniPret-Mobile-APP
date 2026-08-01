/**
 * MConnections — real-time status of Microsoft 365, Maestro and ElevenLabs
 * with manual reconnect, plus the AVA end-to-end tool routing diagnostic.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Loader2, Link2, Mail, Mic, History } from "lucide-react";
import { toast } from "sonner";
import {
  fetchConnectionsStatus,
  recoverConnection,
  runAvaE2ECheck,
  getLastAvaE2E,
  type ConnectionHealth,
  type ConnectionService,
  type AvaE2EResult,
} from "@/lib/planipret/connectionRecovery";
import { connectMs365 } from "@/lib/ms365Connect";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import MaestroCallPostingPanel from "@/components/planipret/MaestroCallPostingPanel";
import MaestroRelinkButton from "@/components/planipret/mobile/MaestroRelinkButton";

const TONE = {
  ok: "#2EDC78",
  reconnecting: "#F5A623",
  error: "#E84C4C",
  not_configured: "#8FA8C0",
} as const;

export default function MConnections() {
  const nav = useNavigate();
  const { t, lang } = useMplanipretLang();
  const [services, setServices] = useState<ConnectionHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ConnectionService | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [e2e, setE2e] = useState<AvaE2EResult | null>(() => getLastAvaE2E());
  const [e2eBusy, setE2eBusy] = useState(false);

  const SERVICE_META: Record<ConnectionService, { label: string; Icon: typeof Mail }> = {
    ms365: { label: t("screens.connections.serviceMs365"), Icon: Mail },
    maestro: { label: t("screens.connections.serviceMaestro"), Icon: Link2 },
    elevenlabs: { label: t("screens.connections.serviceElevenlabs"), Icon: Mic },
  };

  const load = useCallback(async (reconnect?: ConnectionService | "all") => {
    setLoading(true);
    const res = await fetchConnectionsStatus(reconnect);
    if (res) {
      setServices(res.services);
      setCheckedAt(res.checked_at);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 120_000);
    return () => clearInterval(id);
  }, [load]);

  async function reconnect(service: ConnectionService) {
    setBusy(service);
    try {
      const res = await recoverConnection(service);
      if (res.ok) {
        toast.success(`${SERVICE_META[service].label} ${t("screens.connections.reconnectedToast")}`);
      } else if (res.needsReauth) {
        toast.error(`${SERVICE_META[service].label}: ${t("screens.connections.authRequiredToast")}`, { description: res.detail });
        if (service === "ms365") await connectMs365();
        else if (service === "maestro") nav("/mplanipret/more");
      } else {
        toast.error(`${SERVICE_META[service].label}: ${res.detail}`);
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function runE2E() {
    setE2eBusy(true);
    const res = await runAvaE2ECheck();
    setE2e(res);
    setE2eBusy(false);
    if (!res) toast.error(t("screens.connections.avaUnavailableToast"));
    else if (res.healthy) toast.success(t("screens.connections.avaHealthyToast"));
    else toast.warning(`${res.missing.length} ${t("screens.connections.avaMissingToast")}`);
  }

  return (
    <div className="min-h-screen p-4" style={{ background: "var(--pp-bg-base, #060D1A)", color: "var(--pp-text-primary, #E8EDF5)" }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => nav(-1)} className="p-2 rounded-lg" style={{ background: "#0A1628", border: "1px solid #0E2A45" }} aria-label={t("screens.connections.back")}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-bold flex-1">{t("screens.connections.title")}</h1>
          <button onClick={() => load("all")} className="p-2 rounded-lg" style={{ background: "#0A1628", border: "1px solid #0E2A45" }} aria-label={t("screens.connections.refresh")}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {checkedAt && (
          <p className="text-[11px] mb-3" style={{ color: "#8FA8C0" }}>
            {t("screens.connections.checkedAt")} {new Date(checkedAt).toLocaleTimeString(lang === "fr" ? "fr-CA" : "en-CA")}
          </p>
        )}

        <div className="space-y-2">
          {services.map((s) => {
            const meta = SERVICE_META[s.service];
            const tone = TONE[s.state];
            const Icon = s.state === "ok" ? CheckCircle2 : s.state === "error" ? XCircle : AlertTriangle;
            return (
              <div key={s.service} className="rounded-xl p-3 flex items-start gap-3" style={{ background: "#0A1628", border: "1px solid #0E2A45" }}>
                <meta.Icon className="w-5 h-5 mt-0.5 shrink-0" style={{ color: tone }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{meta.label}</span>
                    <Icon className="w-3.5 h-3.5" style={{ color: tone }} />
                  </div>
                  <p className="text-xs mt-0.5 break-words" style={{ color: "#8FA8C0" }}>{s.detail}</p>
                  {s.expires_at && (
                    <p className="text-[10px] mt-0.5" style={{ color: "#5E7A96" }}>
                      {t("screens.connections.expires")}: {new Date(s.expires_at).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA")}
                    </p>
                  )}
                </div>
                {s.can_reconnect && (
                  <button
                    onClick={() => reconnect(s.service)}
                    disabled={busy === s.service}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-full shrink-0 disabled:opacity-60"
                    style={{ background: "rgba(46,155,220,0.14)", border: "1px solid #17527d", color: "#5EC2FF" }}
                  >
                    {busy === s.service ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("screens.connections.reconnect")}
                  </button>
                )}
              </div>
            );
          })}
          {!loading && services.length === 0 && (
            <p className="text-xs" style={{ color: "#8FA8C0" }}>{t("screens.connections.statusUnavailable")}</p>
          )}
        </div>

        <MaestroRelinkButton lang={lang === "fr" ? "fr" : "en"} className="mt-4" />

        <button
          onClick={() => nav("/mplanipret/maestro-sync")}
          className="mt-4 w-full rounded-xl p-3 flex items-center gap-3 text-left"
          style={{ background: "#0A1628", border: "1px solid #0E2A45" }}
        >
          <History className="w-4 h-4" style={{ color: "#5EC2FF" }} />
          <span className="text-sm font-semibold flex-1">{t("screens.connections.maestroSyncHistory")}</span>
          <span className="text-[11px]" style={{ color: "#8FA8C0" }}>→</span>
        </button>

        <section className="mt-5 rounded-xl p-3" style={{ background: "#0A1628", border: "1px solid #0E2A45" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold flex-1">{t("screens.connections.avaE2eTitle")}</span>
            <button
              onClick={runE2E}
              disabled={e2eBusy}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-full disabled:opacity-60"
              style={{ background: "rgba(46,220,120,0.12)", border: "1px solid #1a6b3a", color: "#2EDC78" }}
            >
              {e2eBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("screens.connections.test")}
            </button>
          </div>
          {!e2e && <p className="text-xs" style={{ color: "#8FA8C0" }}>{t("screens.connections.noE2eRun")}</p>}
          {e2e && (
            <ul className="space-y-1">
              {e2e.links.map((l) => (
                <li key={l.id} className="flex items-start gap-2 text-xs">
                  {l.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" style={{ color: "#2EDC78" }} /> : <XCircle className="w-3.5 h-3.5 mt-0.5" style={{ color: "#E84C4C" }} />}
                  <span className="flex-1">
                    <span className="font-medium">{l.label}</span>
                    <span style={{ color: "#8FA8C0" }}> — {l.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <MaestroCallPostingPanel lang={lang === "fr" ? "fr" : "en"} />
      </div>
    </div>
  );
}
