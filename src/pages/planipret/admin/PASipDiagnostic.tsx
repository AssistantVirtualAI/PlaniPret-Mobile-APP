import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ppSipProvider, type PpSipSnapshot } from "@/lib/planipret/sip/ppSipProvider";
import { Loader2, PlugZap, Wifi, WifiOff, AlertTriangle, CheckCircle2, Zap, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";
const DANGER = "#E84C4C";
const WARNING = "#F6B44B";

type ResolveResult = {
  ok: boolean;
  error?: string;
  device_name?: string;
  device_id?: string;
  sip_username?: string;
  sip_auth_user?: string;
  sip_password?: string;
  sip_extension?: string;
  sip_domain?: string;
  sip_ws_url?: string;
  sip_proxy?: string;
  sip_state?: string;
  device_registered?: boolean;
  available_devices?: string[];
  action?: string;
};

export default function PASipDiagnostic() {
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<ResolveResult | null>(null);
  const [snap, setSnap] = useState<PpSipSnapshot>(ppSipProvider.getSnapshot());
  const [testing, setTesting] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const unsub = ppSipProvider.subscribe(setSnap);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (audioRef.current) ppSipProvider.audioEl = audioRef.current;
  }, []);

  const resolveOnly = useCallback(async () => {
    setResolving(true);
    const { data, error } = await supabase.functions.invoke("ns-resolve-sip-credentials", {
      body: { client_type: "web" },
    });
    setResolving(false);
    if (error) {
      toast.error("Résolution échouée", { description: error.message });
      setResolved({ ok: false, error: error.message });
      return null;
    }
    const d = data as ResolveResult;
    setResolved(d);
    return d;
  }, []);

  const runTest = useCallback(async () => {
    setTesting(true);
    try {
      await ppSipProvider.stop();
      const d = (await resolveOnly()) as any;
      const wss = d?.sip_wss_url ?? d?.sip_ws_url;
      if (!d?.ok || !d.sip_password || !wss) {
        toast.error(d?.error ?? "Credentials indisponibles");
        return;
      }
      await ppSipProvider.init({
        wssUrl: String(wss),
        wssUrls: Array.isArray(d.sip_wss_urls) ? d.sip_wss_urls : undefined,
        sipDomain: d.sip_domain!,
        sipUsername: d.sip_username!,
        password: d.sip_password,
        extension: String(d.sip_extension),
      } as any);
    } finally {
      setTesting(false);
    }
  }, [resolveOnly]);

  const provisionSelf = useCallback(async () => {
    setProvisioning(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      toast.error("Non authentifié");
      setProvisioning(false);
      return;
    }
    const { data, error } = await supabase.functions.invoke("ns-provision-broker-devices", {
      body: { broker_id: uid },
    });
    setProvisioning(false);
    if (error || !(data as any)?.success) {
      const msg = (data as any)?.result?.error || (data as any)?.error || error?.message || "Erreur";
      toast.error(`Provisionnement échoué: ${msg}`);
      return;
    }
    toast.success("Device 113_web provisionné");
    await resolveOnly();
  }, [resolveOnly]);

  const stopTest = useCallback(async () => {
    await ppSipProvider.stop();
  }, []);

  const statusColor =
    snap.status === "registered" ? SUCCESS :
    snap.status === "error" || snap.status === "disconnected" ? DANGER :
    snap.status === "connecting" || snap.status === "connected" ? WARNING :
    "var(--pp-text-muted)";

  const StatusIcon =
    snap.status === "registered" ? Wifi :
    snap.status === "error" || snap.status === "disconnected" ? WifiOff :
    Loader2;

  const showProvisionCta = resolved && !resolved.ok && (resolved.error === "device_not_found" || resolved.error === "no_extension");

  return (
    <div className="space-y-4">
      <audio ref={audioRef} autoPlay hidden />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--pp-text-primary)" }}>Diagnostic SIP — 113_web (WSS)</h2>
          <p className="mt-1" style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>
            Teste l'enregistrement SIP.js sur le device web via wss://core1.cluster1.ucstack.io:9002.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={resolveOnly} disabled={resolving}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)", opacity: resolving ? 0.65 : 1 }}>
            {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Résoudre creds
          </button>
          <button onClick={runTest} disabled={testing}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium"
            style={{ background: ACCENT, color: "#fff", opacity: testing ? 0.65 : 1 }}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Tester SIP
          </button>
          <button onClick={stopTest}
            className="rounded-lg px-3 py-2 text-sm font-medium"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
            Arrêter
          </button>
        </div>
      </div>

      {/* Status card */}
      <div className="pp-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusIcon className={`h-5 w-5 ${snap.status === "connecting" ? "animate-spin" : ""}`} style={{ color: statusColor }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: statusColor, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {snap.status}
              </div>
              <div style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>
                {snap.lastRegistrationAt ? `Dernier register: ${new Date(snap.lastRegistrationAt).toLocaleTimeString("fr-CA")}` : "Aucun register encore"}
                {snap.errorCause && ` · ${snap.errorCause}`}
              </div>
            </div>
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}33` }}>
            {snap.status === "registered" ? "Registered" : "Unregistered"}
          </span>
        </div>
      </div>

      {/* Resolved details */}
      {resolved && (
        <div className="pp-card p-4">
          <div className="mb-3 flex items-center gap-2">
            {resolved.ok
              ? <CheckCircle2 className="h-4 w-4" style={{ color: SUCCESS }} />
              : <AlertTriangle className="h-4 w-4" style={{ color: DANGER }} />}
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pp-text-primary)" }}>
              {resolved.ok ? "Credentials résolus" : `Échec: ${resolved.error}`}
            </span>
          </div>
          <dl className="grid grid-cols-1 gap-y-2 gap-x-4 md:grid-cols-2" style={{ fontSize: 12 }}>
            <Row k="WSS URL" v={resolved.sip_ws_url} mono />
            <Row k="Device" v={resolved.device_id ?? resolved.device_name} mono />
            <Row k="Extension" v={resolved.sip_extension} />
            <Row k="Domaine" v={resolved.sip_domain} />
            <Row k="Auth user" v={resolved.sip_auth_user} mono />
            <Row k="Proxy" v={resolved.sip_proxy} mono />
            <Row k="État NS" v={resolved.sip_state ?? "—"} />
            <Row k="Password" v={resolved.sip_password ? `••••${resolved.sip_password.slice(-4)}` : "—"} mono />
          </dl>
          {resolved.available_devices && resolved.available_devices.length > 0 && (
            <div className="mt-3 rounded border p-2" style={{ borderColor: "var(--pp-bg-border-2)", background: "var(--pp-bg-elevated)" }}>
              <div style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>Devices existants sur cette extension:</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {resolved.available_devices.map((d) => (
                  <span key={d} className="rounded px-2 py-0.5 font-mono" style={{ fontSize: 11, background: "var(--pp-bg-base)", color: "var(--pp-text-secondary)" }}>{d}</span>
                ))}
              </div>
            </div>
          )}
          {resolved.action && (
            <div className="mt-3" style={{ fontSize: 12, color: "var(--pp-text-secondary)" }}>{resolved.action}</div>
          )}
        </div>
      )}

      {/* Auto-provision CTA */}
      {showProvisionCta && (
        <div className="pp-card p-4" style={{ borderColor: `${WARNING}55` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 600, color: WARNING }}>
                <AlertTriangle className="h-4 w-4" /> Device 113_web absent
              </div>
              <p className="mt-1" style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>
                Provisionne automatiquement les devices SIP (mobile + web) sur NetSapiens pour votre compte.
              </p>
            </div>
            <button onClick={provisionSelf} disabled={provisioning}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium"
              style={{ background: WARNING, color: "#111", opacity: provisioning ? 0.65 : 1 }}>
              {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Provisionner 113_web
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b pb-1" style={{ borderColor: "var(--pp-bg-border-2)" }}>
      <dt style={{ color: "var(--pp-text-muted)" }}>{k}</dt>
      <dd className={mono ? "font-mono" : ""} style={{ color: "var(--pp-text-primary)", textAlign: "right", wordBreak: "break-all" }}>{v ?? "—"}</dd>
    </div>
  );
}
