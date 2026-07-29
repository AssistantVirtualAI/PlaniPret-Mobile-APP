import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Copy, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { callEdge } from "@/lib/callEdge";
import { toast } from "sonner";

type Probe = {
  key: string;
  label: string;
  group: "Téléphonie (NS)" | "Microsoft 365" | "Maestro / Agenda";
  run: () => Promise<{ ok: boolean; detail?: string; degraded?: boolean }>;
};

type Result = {
  status: "pending" | "ok" | "degraded" | "error";
  detail?: string;
  ms?: number;
  raw?: any;
};

function pill(text: string, color: string, bg: string) {
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ color, background: bg }}>
      {text}
    </span>
  );
}

const PROBES: Probe[] = [
  {
    key: "ns-auth",
    group: "Téléphonie (NS)",
    label: "pp-ns-auth · identité + extension",
    run: async () => {
      const d = await callEdge<any>("pp-ns-auth", { action: "whoami" }).catch((e) => ({ __err: e }));
      if ((d as any).__err) throw (d as any).__err;
      const ext = d?.extension || d?.data?.extension;
      const dom = d?.ns_domain || d?.data?.ns_domain;
      return { ok: !!ext && !!dom, detail: `ext ${ext ?? "—"} · dom ${dom ?? "—"}` };
    },
  },
  {
    key: "ns-sms",
    group: "Téléphonie (NS)",
    label: "pp-ns-sms · numéros SMS assignés",
    run: async () => {
      const d = await callEdge<any>("pp-ns-sms", { action: "sms-numbers" });
      const n = Array.isArray(d?.numbers) ? d.numbers.length : 0;
      return { ok: n > 0, degraded: n === 0, detail: `${n} numéro(s)` };
    },
  },
  {
    key: "ns-calls",
    group: "Téléphonie (NS)",
    label: "pp-ns-calls · historique",
    run: async () => {
      const d = await callEdge<any>("pp-ns-calls", { action: "recent", limit: 1 });
      const arr = d?.calls || d?.data || d?.items || [];
      return { ok: true, detail: `${Array.isArray(arr) ? arr.length : 0} récent(s)` };
    },
  },
  {
    key: "ns-voicemail",
    group: "Téléphonie (NS)",
    label: "pp-ns-voicemail · messages",
    run: async () => {
      const d = await callEdge<any>("pp-ns-voicemail", { action: "list", limit: 1 });
      const arr = d?.messages || d?.items || d?.data || [];
      return { ok: true, detail: `${Array.isArray(arr) ? arr.length : 0} message(s)` };
    },
  },
  {
    key: "ns-contacts",
    group: "Téléphonie (NS)",
    label: "pp-ns-contacts · annuaire",
    run: async () => {
      const d = await callEdge<any>("pp-ns-contacts", { action: "directory", limit: 1 });
      const n = (d?.contacts?.length ?? d?.data?.length ?? d?.items?.length ?? 0) as number;
      return { ok: true, detail: `${n} contact(s) (échantillon)` };
    },
  },
  {
    key: "ms365-status",
    group: "Microsoft 365",
    label: "ms365-status · connexion",
    run: async () => {
      const d = await callEdge<any>("ms365-status", {});
      const ok = d?.status === "ok" || !!d?.user?.connected;
      return { ok, degraded: !ok, detail: ok ? (d?.user?.email || "connecté") : `non authentifié · config ${d?.admin_cfg_ok ? "OK" : "incomplète"}` };
    },
  },
  {
    key: "ms365-teams",
    group: "Microsoft 365",
    label: "ms365-teams-list · Teams",
    run: async () => {
      const d = await callEdge<any>("ms365-teams-list", {});
      const n = (d?.teams?.length ?? d?.value?.length ?? 0) as number;
      return { ok: true, detail: `${n} équipe(s)` };
    },
  },
  {
    key: "ms365-mail",
    group: "Microsoft 365",
    label: "ms365-actions · dossiers mail",
    run: async () => {
      const d = await callEdge<any>("ms365-actions", { action: "list_folders" });
      const n = (d?.folders?.length ?? d?.value?.length ?? 0) as number;
      return { ok: true, detail: `${n} dossier(s)` };
    },
  },
  {
    key: "calendar-sync",
    group: "Microsoft 365",
    label: "pp-calendar-sync · agenda",
    run: async () => {
      const d = await callEdge<any>("pp-calendar-sync", { action: "probe" });
      return { ok: !!(d?.ok ?? true), detail: d?.detail || "reachable" };
    },
  },
  {
    key: "maestro-lookup",
    group: "Maestro / Agenda",
    label: "maestro-client-lookup · ping",
    run: async () => {
      const d = await callEdge<any>("maestro-client-lookup", { ping: 1 });
      return { ok: true, detail: d?.status || "ok" };
    },
  },
  {
    key: "maestro-telecom-status",
    group: "Maestro / Agenda",
    label: "Maestro Télécom · config + auth + dernier miroir",
    run: async () => {
      // Try admin-scoped status first (rich payload). Fallback to broker ping.
      let d: any = null;
      try { d = await callEdge<any>("pp-maestro-admin", { action: "status" }); } catch { /* ignore */ }
      if (d && typeof d.configured === "boolean") {
        const cfgOk = !!d.configured;
        const pingOk = !!d?.ping?.ok;
        const lastCall = d?.last_call_mirror;
        const lastSms = d?.last_sms_mirror;
        const lastAna = d?.last_analysis_mirror;
        const parts = [
          `config ${cfgOk ? "OK" : "manquante"}`,
          `auth ${pingOk ? `OK (${d?.ping?.status})` : `KO (${d?.ping?.status ?? 0})`}`,
          `24h ${d?.stats24h?.total ?? 0}× · ${d?.stats24h?.success_rate ?? "—"}%`,
          `dernier call ${lastCall ? (lastCall.success ? "✓" : "✗") : "—"}`,
          `dernier sms ${lastSms ? (lastSms.success ? "✓" : "✗") : "—"}`,
          `dernière analyse IA ${lastAna ? (lastAna.success ? "✓" : "✗") : "—"}`,
        ];
        return { ok: cfgOk && pingOk, degraded: cfgOk && !pingOk, detail: parts.join(" · ") };
      }
      // Broker fallback: call recent-comms
      const r = await callEdge<any>("pp-maestro-telecom", { action: "recent-comms" });
      const n = (r?.communications?.length ?? r?.data?.length ?? 0) as number;
      return { ok: !!r?.ok, detail: `${n} communication(s) récente(s)` };
    },
  },

];


export default function MDiagnostics() {
  const navigate = useNavigate();
  const [results, setResults] = useState<Record<string, Result>>({});

  const run = useCallback(async () => {
    const init: Record<string, Result> = {};
    PROBES.forEach((p) => (init[p.key] = { status: "pending" }));
    setResults(init);
    await Promise.all(
      PROBES.map(async (p) => {
        const t0 = performance.now();
        try {
          const r = await p.run();
          const ms = Math.round(performance.now() - t0);
          setResults((prev) => ({
            ...prev,
            [p.key]: {
              status: r.ok && !r.degraded ? "ok" : r.degraded ? "degraded" : "error",
              detail: r.detail,
              ms,
            },
          }));
        } catch (e: any) {
          const ms = Math.round(performance.now() - t0);
          const detail = e?.message || "erreur";
          setResults((prev) => ({
            ...prev,
            [p.key]: { status: "error", detail, ms, raw: e },
          }));
        }
      }),
    );
  }, []);

  useEffect(() => { void run(); }, [run]);

  const copyDetails = async (key: string) => {
    const p = PROBES.find((x) => x.key === key);
    const r = results[key];
    const payload = {
      fn: key,
      label: p?.label,
      status: r?.status,
      ms: r?.ms,
      detail: r?.detail,
      raw: r?.raw ? { status: r.raw.status, body: r.raw.body, message: r.raw.message } : null,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast.success("Détails copiés");
    } catch {
      toast.error("Copie impossible");
    }
  };

  const groups = ["Téléphonie (NS)", "Microsoft 365", "Maestro / Agenda"] as const;
  const okCount = Object.values(results).filter((r) => r.status === "ok").length;
  const errCount = Object.values(results).filter((r) => r.status === "error").length;
  const degradedCount = Object.values(results).filter((r) => r.status === "degraded").length;

  return (
    <div className="min-h-full" style={{ background: "var(--pp-bg-base)", color: "var(--pp-text-primary)" }}>
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-3"
        style={{ background: "var(--pp-bg-base)", borderBottom: "1px solid var(--pp-bg-border-2)" }}>
        <button onClick={() => navigate(-1)} style={{ color: "var(--pp-text-muted)" }} aria-label="Retour">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="text-base font-bold">Diagnostics endpoints</div>
          <div className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
            {okCount} OK · {degradedCount} dégradés · {errCount} erreurs
          </div>
        </div>
        <button onClick={() => void run()}
          className="p-2 rounded-lg"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}
          aria-label="Relancer">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 space-y-4">
        {groups.map((g) => (
          <section key={g}>
            <div className="text-[11px] font-bold uppercase mb-2" style={{ color: "var(--pp-text-muted)" }}>{g}</div>
            <div className="rounded-xl overflow-hidden"
              style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}>
              {PROBES.filter((p) => p.group === g).map((p, i, arr) => {
                const r = results[p.key] || { status: "pending" as const };
                return (
                  <div key={p.key} className="px-3 py-2.5 flex items-start gap-3"
                    style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--pp-bg-border-2)" : undefined }}>
                    <div className="mt-0.5 shrink-0">
                      {r.status === "pending" && <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pp-text-muted)" }} />}
                      {r.status === "ok" && <CheckCircle2 className="w-4 h-4" style={{ color: "#22c55e" }} />}
                      {r.status === "degraded" && <AlertTriangle className="w-4 h-4" style={{ color: "#f59e0b" }} />}
                      {r.status === "error" && <XCircle className="w-4 h-4" style={{ color: "#ef4444" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-semibold truncate">{p.label}</div>
                        {r.status === "ok" && pill("OK", "#22c55e", "rgba(34,197,94,0.12)")}
                        {r.status === "degraded" && pill("DÉGRADÉ", "#f59e0b", "rgba(251,191,36,0.14)")}
                        {r.status === "error" && pill("ERREUR", "#ef4444", "rgba(239,68,68,0.14)")}
                        {typeof r.ms === "number" && (
                          <span className="text-[10px]" style={{ color: "var(--pp-text-muted)" }}>{r.ms}ms</span>
                        )}
                      </div>
                      {r.detail && (
                        <div className="text-[11px] mt-0.5 break-all" style={{ color: "var(--pp-text-muted)" }}>
                          {r.detail}
                        </div>
                      )}
                    </div>
                    <button onClick={() => copyDetails(p.key)}
                      className="p-1.5 rounded"
                      style={{ color: "var(--pp-text-muted)" }} aria-label="Copier détails">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <div className="text-[10px] mt-4 leading-relaxed" style={{ color: "var(--pp-text-muted)" }}>
          Chaque ligne appelle l'endpoint réel avec la session actuelle. Les erreurs affichent le message brut renvoyé
          par la fonction (status HTTP et corps). Utilisez « Copier » pour partager un diagnostic au support.
        </div>
      </div>
    </div>
  );
}
