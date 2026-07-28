import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Smartphone, Radio } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { PlanipretMobileContext } from "../PlanipretMobile";

type State = "ok" | "provisioning" | "missing" | "error" | "idle";

type DeviceDetail = { id: string; user_agent: string | null; ip: string | null; registered_at: string | null; registered: boolean; is_mine: boolean };

export default function MExtensionSync() {
  const { profile, reloadProfile } = useOutletContext<PlanipretMobileContext>();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [lastResult, setLastResult] = useState<any>(null);
  const [devices, setDevices] = useState<string[] | null>(null);
  const [devicesDetail, setDevicesDetail] = useState<DeviceDetail[] | null>(null);
  const [registeredDeviceId, setRegisteredDeviceId] = useState<string | null>(null);


  const extension = profile?.ns_extension || profile?.extension || null;
  const domain = profile?.ns_domain || "planipret.ca";
  const linked = !!profile?.ns_linked;
  const mobileDeviceId = profile?.ns_mobile_device_id || (extension ? `${extension}_mobile` : null);
  const runResync = async (opts?: { silent?: boolean }) => {
    if (!extension) {
      toast.error("Aucune extension associée à ce profil.");
      return;
    }
    setBusy(true);
    setState("provisioning");
    const { data, error } = await supabase.functions.invoke("ns-resolve-sip-credentials", {
      body: { client_type: "mobile" },
    });
    setBusy(false);
    const res = (data ?? {}) as any;
    setLastResult({ error: error?.message ?? null, ...res });
    if (Array.isArray(res?.ns_devices)) setDevices(res.ns_devices);
    else if (Array.isArray(res?.ns_devices_now)) setDevices(res.ns_devices_now);
    if (Array.isArray(res?.ns_devices_detail)) setDevicesDetail(res.ns_devices_detail);
    if (res?.ns_registered_device_id) setRegisteredDeviceId(res.ns_registered_device_id);
    if (error || !res?.ok) {
      setState("error");
      if (!opts?.silent) toast.error(res?.error ?? error?.message ?? "Échec du resync");
      return;
    }
    await reloadProfile();
    setState("ok");
    if (!opts?.silent) toast.success(`Extension ${res.sip_extension} synchronisée`);
  };

  const items: Array<{ label: string; value: string; ok: boolean | null; icon: any }> = [
    { label: "Extension NetSapiens", value: extension ?? "—", ok: !!extension, icon: Smartphone },
    { label: "Domaine NetSapiens", value: domain, ok: !!domain, icon: Radio },
    { label: "État lié (ns_linked)", value: linked ? "Oui" : "Non", ok: linked, icon: linked ? CheckCircle2 : AlertTriangle },
    { label: "Appareil mobile", value: mobileDeviceId ?? "—", ok: !!mobileDeviceId, icon: Smartphone },
    { label: "Mode d'appel", value: "REST seulement", ok: true, icon: CheckCircle2 },
  ];

  const globalOk = !!extension && linked;

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}
          aria-label="Retour"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 18 }}>
          Synchronisation d'extension
        </div>
      </div>

      <div
        className="pp-card"
        style={{
          padding: 14,
          borderColor: globalOk
            ? "rgba(52,199,89,0.35)"
            : state === "error"
              ? "rgba(232,76,76,0.35)"
              : "rgba(245,158,11,0.35)",
        }}
      >
        <div className="flex items-center gap-2">
          {globalOk
            ? <CheckCircle2 className="w-5 h-5" style={{ color: "var(--pp-color-success)" }} />
            : state === "error"
              ? <XCircle className="w-5 h-5" style={{ color: "var(--pp-color-danger)" }} />
              : <AlertTriangle className="w-5 h-5" style={{ color: "#F59E0B" }} />}
          <div className="flex-1">
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {globalOk ? "Appels REST prêts" : "Synchronisation requise"}
            </div>
            <div style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>
              {extension ? `Extension ${extension} · ${domain}` : "Aucune extension"}
            </div>
          </div>
        </div>
      </div>

      <div className="pp-card" style={{ padding: 8 }}>
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <div
              key={i}
              className="flex items-center gap-3"
              style={{
                padding: "10px 8px",
                borderBottom: i < items.length - 1 ? "1px solid var(--pp-bg-border-2)" : "none",
              }}
            >
              <Icon
                className="w-4 h-4"
                style={{
                  color: it.ok === true
                    ? "var(--pp-color-success)"
                    : it.ok === false
                      ? "var(--pp-color-danger)"
                      : "var(--pp-text-muted)",
                }}
              />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 13, fontWeight: 600 }}>{it.label}</div>
                <div style={{ fontSize: 12, color: "var(--pp-text-muted)", wordBreak: "break-all" }}>{it.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => runResync()}
        disabled={busy || !extension}
        className="w-full flex items-center justify-center gap-2 active:scale-[0.99] transition"
        style={{
          padding: "14px 16px",
          borderRadius: 14,
          background: busy ? "var(--pp-bg-elevated)" : "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
          color: busy ? "var(--pp-text-muted)" : "#fff",
          fontFamily: "Inter,sans-serif",
          fontWeight: 700,
          fontSize: 14,
          border: "none",
          opacity: !extension ? 0.5 : 1,
        }}
      >
        <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Synchronisation en cours…" : "Forcer le resync"}
      </button>

      {(devicesDetail || devices) && (
        <div className="pp-card" style={{ padding: 10 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>
              Appareils NetSapiens ({(devicesDetail ?? devices ?? []).length})
            </div>
            <button
              onClick={() => runResync({ silent: true })}
              disabled={busy}
              className="flex items-center gap-1 px-2 py-1 rounded-md"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", fontSize: 11 }}
              aria-label="Rafraîchir la liste"
            >
              <RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />
              Rafraîchir
            </button>
          </div>
          {(devicesDetail ?? []).length === 0 && (devices ?? []).length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>Aucun appareil trouvé.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(devicesDetail ?? (devices ?? []).map((id) => ({ id, user_agent: null, ip: null, registered_at: null, registered: false, is_mine: id === mobileDeviceId } as DeviceDetail))).map((d) => {
                const isMine = d.is_mine || d.id === mobileDeviceId;
                const isActive = d.id === registeredDeviceId || d.registered;
                const borderColor = isActive
                  ? "rgba(52,199,89,0.55)"
                  : isMine
                    ? "rgba(46,155,220,0.35)"
                    : "var(--pp-bg-border-2)";
                const bg = isActive
                  ? "rgba(52,199,89,0.10)"
                  : isMine
                    ? "rgba(46,155,220,0.08)"
                    : "transparent";
                return (
                  <div
                    key={d.id}
                    style={{
                      fontSize: 12,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: bg,
                      border: `1px solid ${borderColor}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {isActive
                        ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--pp-color-success)" }} />
                        : isMine
                          ? <Smartphone className="w-3.5 h-3.5" style={{ color: "#2E9BDC" }} />
                          : <Radio className="w-3.5 h-3.5" style={{ color: "var(--pp-text-muted)" }} />}
                      <span style={{ fontWeight: (isMine || isActive) ? 700 : 500, wordBreak: "break-all" }}>{d.id}</span>
                      <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                        {isActive && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--pp-color-success)" }}>● ACTIF</span>
                        )}
                        {isMine && (
                          <span style={{ fontSize: 10, color: "#2E9BDC" }}>ce téléphone</span>
                        )}
                      </span>
                    </div>
                    {(d.user_agent || d.ip || d.registered_at) ? (
                      <div style={{ fontSize: 10.5, color: "var(--pp-text-muted)", marginTop: 4, lineHeight: 1.4 }}>
                        {d.user_agent && <div>UA · {d.user_agent}</div>}
                        {d.ip && <div>IP · {d.ip}</div>}
                        {d.registered_at && <div>Enregistré · {d.registered_at}</div>}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10.5, color: "var(--pp-text-muted)", marginTop: 4 }}>
                        Appareil créé mais non actif.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {lastResult && (

        <div className="pp-card" style={{ padding: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Dernier résultat</div>
          <pre style={{
            fontSize: 11,
            color: "var(--pp-text-muted)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            margin: 0,
          }}>
{JSON.stringify(
  { ok: lastResult.ok, device_id: lastResult.device_id, extension: lastResult.sip_extension, error: lastResult.error },
  null,
  2,
)}
          </pre>
        </div>
      )}
    </div>
  );
}
