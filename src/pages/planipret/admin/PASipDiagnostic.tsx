import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ppSipProvider, type PpSipSnapshot } from "@/lib/planipret/sip/ppSipProvider";
import { Loader2, PlugZap, Wifi, WifiOff, AlertTriangle, CheckCircle2, Zap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { PP_SIP_CORE_PRIMARY } from "@/lib/planipret/sip/sipEdgePolicy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import CallDoctorCard from "@/components/planipret/admin/CallDoctorCard";
import DidAnnouncementCard from "@/components/planipret/admin/DidAnnouncementCard";
import { BrokerDeviceResyncCard, BrokerSipRouteCard, ExtensionDidCard, ExtensionStatsCard } from "@/components/planipret/admin/SipBrokerTools";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";

const DICT = {
  fr: {
    title: "Portail diagnostic",
    subtitle: `Teste l'enregistrement SIP.js sur le device web via ${PP_SIP_CORE_PRIMARY}, et diagnostique les enregistrements NS-API.`,
    resolveFailed: "Résolution échouée",
    credsUnavailable: "Credentials indisponibles",
    notAuthenticated: "Non authentifié",
    provisionFailed: (msg: string) => `Provisionnement échoué: ${msg}`,
    provisionError: "Erreur",
    provisionSuccess: "Device 113W provisionné",
    resolveCreds: "Résoudre creds",
    testSip: "Tester SIP",
    stop: "Arrêter",
    diagInProgress: "Diagnostic enregistrements en cours (~30s)…",
    diagSuccess: (n: number) => `✅ ${n} endpoint(s) audio trouvé(s) — voir console`,
    diagFailNone: "Aucun endpoint audio n'a répondu 200 — voir console",
    diagFailed: (msg: string) => `Diagnostic échoué: ${msg}`,
    diagRecordings: "🔬 Diagnostiquer enregistrements",
    lastRegister: (time: string) => `Dernier register: ${time}`,
    noRegisterYet: "Aucun register encore",
    registered: "Registered",
    unregistered: "Unregistered",
    credsResolved: "Credentials résolus",
    failure: (err?: string) => `Échec: ${err}`,
    wssUrl: "WSS URL",
    device: "Device",
    extension: "Extension",
    domain: "Domaine",
    authUser: "Auth user",
    proxy: "Proxy",
    nsState: "État NS",
    password: "Password",
    existingDevices: "Devices existants sur cette extension:",
    deviceMissing: "Device 113W absent",
    provisionDesc: "Provisionne automatiquement les devices SIP (mobile + web) sur NetSapiens pour votre compte.",
    provisionButton: "Provisionner 113W",
  },
  en: {
    title: "Diagnostic portal",
    subtitle: `Tests SIP.js registration on the web device via ${PP_SIP_CORE_PRIMARY}, and diagnoses NS-API registrations.`,
    resolveFailed: "Resolution failed",
    credsUnavailable: "Credentials unavailable",
    notAuthenticated: "Not authenticated",
    provisionFailed: (msg: string) => `Provisioning failed: ${msg}`,
    provisionError: "Error",
    provisionSuccess: "Device 113W provisioned",
    resolveCreds: "Resolve creds",
    testSip: "Test SIP",
    stop: "Stop",
    diagInProgress: "Recordings diagnostic in progress (~30s)…",
    diagSuccess: (n: number) => `✅ ${n} audio endpoint(s) found — see console`,
    diagFailNone: "No audio endpoint responded 200 — see console",
    diagFailed: (msg: string) => `Diagnostic failed: ${msg}`,
    diagRecordings: "🔬 Diagnose recordings",
    lastRegister: (time: string) => `Last register: ${time}`,
    noRegisterYet: "No register yet",
    registered: "Registered",
    unregistered: "Unregistered",
    credsResolved: "Credentials resolved",
    failure: (err?: string) => `Failure: ${err}`,
    wssUrl: "WSS URL",
    device: "Device",
    extension: "Extension",
    domain: "Domain",
    authUser: "Auth user",
    proxy: "Proxy",
    nsState: "NS state",
    password: "Password",
    existingDevices: "Existing devices on this extension:",
    deviceMissing: "Device 113W missing",
    provisionDesc: "Automatically provisions the SIP devices (mobile + web) on NetSapiens for your account.",
    provisionButton: "Provision 113W",
  },
};

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

const statusMeta = (status: PpSipSnapshot["status"]) => {
  switch (status) {
    case "registered":
      return {
        icon: Wifi,
        color: "text-emerald-500",
        badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      };
    case "error":
    case "disconnected":
      return {
        icon: WifiOff,
        color: "text-destructive",
        badge: "bg-destructive/10 text-destructive border-destructive/20",
      };
    case "connecting":
    case "connected":
      return {
        icon: Loader2,
        color: "text-amber-500",
        badge: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      };
    default:
      return {
        icon: WifiOff,
        color: "text-muted-foreground",
        badge: "bg-muted text-muted-foreground border-border",
      };
  }
};

export default function PASipDiagnostic() {
  const { lang } = useMplanipretLang();
  const t = DICT[lang as "fr" | "en"];
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
      toast.error(t.resolveFailed, { description: error.message });
      setResolved({ ok: false, error: error.message });
      return null;
    }
    const d = data as ResolveResult;
    setResolved(d);
    return d;
  }, [t]);

  const runTest = useCallback(async () => {
    setTesting(true);
    try {
      await ppSipProvider.stop();
      const d = (await resolveOnly()) as any;
      const wss = d?.sip_wss_url ?? d?.sip_ws_url;
      if (!d?.ok || !d.sip_password || !wss) {
        toast.error(d?.error ?? t.credsUnavailable);
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
  }, [resolveOnly, t]);

  const provisionSelf = useCallback(async () => {
    setProvisioning(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      toast.error(t.notAuthenticated);
      setProvisioning(false);
      return;
    }
    const { data, error } = await supabase.functions.invoke("ns-provision-broker-devices", {
      body: { broker_id: uid },
    });
    setProvisioning(false);
    if (error || !(data as any)?.success) {
      const msg = (data as any)?.result?.error || (data as any)?.error || error?.message || t.provisionError;
      toast.error(t.provisionFailed(msg));
      return;
    }
    toast.success(t.provisionSuccess);
    await resolveOnly();
  }, [resolveOnly, t]);

  const stopTest = useCallback(async () => {
    await ppSipProvider.stop();
  }, []);

  const runRecordingDiag = useCallback(async () => {
    try {
      toast.message(t.diagInProgress);
      const { data, error } = await supabase.functions.invoke("ns-debug-real-cdr", { body: {} });
      if (error) throw error;
      console.log("[NS RECORDING DIAG]", data);
      const successes = (data as any)?.successes ?? [];
      if (successes.length) toast.success(t.diagSuccess(successes.length));
      else toast.error(t.diagFailNone);
    } catch (e: any) {
      toast.error(t.diagFailed(e?.message ?? e));
    }
  }, [t]);

  const meta = statusMeta(snap.status);
  const StatusIcon = meta.icon;
  const showProvisionCta = resolved && !resolved.ok && (resolved.error === "device_not_found" || resolved.error === "no_extension");

  return (
    <PAPage>
      <audio ref={audioRef} autoPlay hidden />
      <PAPageHeader icon={<PlugZap className="h-5 w-5" />} title={t.title} subtitle={t.subtitle} actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={resolveOnly} disabled={resolving}>
            {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t.resolveCreds}
          </Button>
          <Button size="sm" onClick={runTest} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            {t.testSip}
          </Button>
          <Button variant="outline" size="sm" onClick={stopTest}>
            {t.stop}
          </Button>
          <Button variant="outline" size="sm" onClick={runRecordingDiag}>
            {t.diagRecordings}
          </Button>
        </div>}
      />

      <BrokerSipRouteCard defaultExtension="1136" />
      <BrokerDeviceResyncCard />
      <ExtensionDidCard defaultExtension="1136" />
      <ExtensionStatsCard />

      <CallDoctorCard />
      <DidAnnouncementCard />

      {/* Status card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <StatusIcon className={`h-5 w-5 ${snap.status === "connecting" ? "animate-spin" : ""} ${meta.color}`} />
              <div>
                <div className={`text-xs font-semibold uppercase tracking-wider ${meta.color}`}>{snap.status}</div>
                <div className="text-xs text-muted-foreground">
                  {snap.lastRegistrationAt ? t.lastRegister(new Date(snap.lastRegistrationAt).toLocaleTimeString("fr-CA")) : t.noRegisterYet}
                  {snap.errorCause && ` · ${snap.errorCause}`}
                </div>
              </div>
            </div>
            <Badge variant="outline" className={meta.badge}>
              {snap.status === "registered" ? t.registered : t.unregistered}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Resolved details */}
      {resolved && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              {resolved.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
              {resolved.ok ? t.credsResolved : t.failure(resolved.error)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <dl className="grid grid-cols-1 gap-y-2 gap-x-4 text-xs md:grid-cols-2">
              <Row k={t.wssUrl} v={resolved.sip_ws_url} mono />
              <Row k={t.device} v={resolved.device_id ?? resolved.device_name} mono />
              <Row k={t.extension} v={resolved.sip_extension} />
              <Row k={t.domain} v={resolved.sip_domain} />
              <Row k={t.authUser} v={resolved.sip_auth_user} mono />
              <Row k={t.proxy} v={resolved.sip_proxy} mono />
              <Row k={t.nsState} v={resolved.sip_state ?? "—"} />
              <Row k={t.password} v={resolved.sip_password ? `••••${resolved.sip_password.slice(-4)}` : "—"} mono />
            </dl>
            {resolved.available_devices && resolved.available_devices.length > 0 && (
              <div className="mt-4 rounded-lg border bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">{t.existingDevices}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {resolved.available_devices.map((d) => (
                    <Badge key={d} variant="secondary" className="font-mono text-xs">
                      {d}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {resolved.action && <p className="mt-3 text-xs text-muted-foreground">{resolved.action}</p>}
          </CardContent>
        </Card>
      )}

      {/* Auto-provision CTA */}
      {showProvisionCta && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400">{t.deviceMissing}</CardTitle>
                  <CardDescription className="mt-1 text-xs">{t.provisionDesc}</CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={provisionSelf} disabled={provisioning} className="shrink-0">
                {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {t.provisionButton}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PAPage>
  );
}

function Row({ k, v, mono }: { k: string; v?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1 last:border-b-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={`text-right break-all text-foreground ${mono ? "font-mono" : ""}`}>{v ?? "—"}</dd>
    </div>
  );
}
