import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { Trash2, Play, RefreshCw, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getDeepLinkLog,
  clearDeepLinkLog,
  subscribeDeepLinkLog,
  probePlanipretScheme,
  logDeepLink,
  type DeepLinkEvent,
} from "@/lib/deepLinkDebug";

type CheckState = "idle" | "running" | "ok" | "fail";
interface Check { label: string; state: CheckState; detail?: string }

export default function MDeepLinkDebug() {
  const [events, setEvents] = useState<DeepLinkEvent[]>(() => getDeepLinkLog());
  const [probing, setProbing] = useState(false);
  const [schemeOk, setSchemeOk] = useState<null | boolean>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => subscribeDeepLinkLog(() => setEvents(getDeepLinkLog())), []);

  const runProbe = async () => {
    setProbing(true);
    setSchemeOk(null);
    const ok = await probePlanipretScheme(1800);
    setSchemeOk(ok);
    setProbing(false);
    ok ? toast.success("Scheme planipret:// OK") : toast.error("Scheme planipret:// non enregistré");
  };

  const runFullValidation = async () => {
    setRunning(true);
    const list: Check[] = [
      { label: "Scheme planipret:// enregistré", state: "running" },
      { label: "Microsoft: config serveur (pp-ms-auth-start)", state: "idle" },
      { label: "Microsoft: callback route disponible", state: "idle" },
      { label: "Maestro: session + route start", state: "idle" },
      { label: "Maestro: callback route disponible", state: "idle" },
    ];
    setChecks([...list]);
    const set = (i: number, patch: Partial<Check>) => setChecks((prev) => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));

    // 1. Scheme
    if (Capacitor.isNativePlatform()) {
      const ok = await probePlanipretScheme(1500);
      set(0, { state: ok ? "ok" : "fail", detail: ok ? "OS a routé planipret:// vers l'app" : "OS n'a pas routé — rebuild avec npx cap sync" });
    } else {
      set(0, { state: "ok", detail: "web preview (non applicable)" });
    }

    // 2. MS start
    set(1, { state: "running" });
    try {
      const { data, error } = await supabase.functions.invoke("pp-ms-auth-start", { body: {} });
      const d = data as any;
      if (error || !d?.configured) set(1, { state: "fail", detail: error?.message || "not configured" });
      else set(1, { state: "ok", detail: `client_id=${String(d.client_id).slice(0, 8)}… tenant=${d.tenant_id}` });
    } catch (e: any) { set(1, { state: "fail", detail: e?.message }); }

    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
    const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const { data: { session } } = await supabase.auth.getSession();
    const authz = session?.access_token ? `Bearer ${session.access_token}` : `Bearer ${anon}`;
    const rawInvoke = async (name: string, body: any) => {
      try {
        const res = await fetch(`${fnUrl}/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anon, Authorization: authz },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        return { status: res.status, data };
      } catch (e: any) {
        return { status: 0, data: null, error: e };
      }
    };
    const probeOptions = async (name: string) => {
      try {
        const res = await fetch(`${fnUrl}/${name}`, {
          method: "OPTIONS",
          headers: { apikey: anon, Authorization: authz },
        });
        await res.text();
        return { ok: res.ok, status: res.status };
      } catch (e: any) {
        return { ok: false, status: 0, error: e?.message ?? "network error" };
      }
    };

    // 3. MS callback route probe — no fake code, avoids Azure 400 runtime noise.
    set(2, { state: "running" });
    {
      const probe = await probeOptions("pp-ms-auth-callback");
      set(2, probe.ok
        ? { state: "ok", detail: "Endpoint callback prêt (test sans échange OAuth réel)" }
        : { state: "fail", detail: probe.error || `HTTP ${probe.status}` });
    }

    // 4. Maestro start — requires a real signed-in user. Never call it signed-out (401 is expected).
    set(3, { state: "running" });
    {
      if (!session?.access_token) {
        set(3, { state: "fail", detail: "Connecte-toi dans l'app puis relance ce test" });
      } else {
      const isNative = Capacitor.isNativePlatform();
      const { status, data } = await rawInvoke("maestro-oauth-start", {
        platform: isNative ? "mobile" : "web",
        redirect_uri: isNative ? "planipret://auth/maestro/callback" : `${window.location.origin}/auth/maestro/callback`,
        origin: window.location.origin,
      });
      const d = data as any;
      if (!d?.authorize_url) {
        const detail = status === 401 || d?.error === "unauthorized"
          ? "requiert une session utilisateur (connecte-toi puis relance)"
          : (d?.error || `HTTP ${status}`);
        set(3, { state: "fail", detail });
      } else {
        try {
          const u = new URL(d.authorize_url);
          set(3, { state: "ok", detail: `authorize host=${u.host}` });
        } catch { set(3, { state: "fail", detail: "authorize_url invalide" }); }
      }
      }
    }

    // 5. Maestro callback route probe — no fake code, avoids provider token-exchange errors.
    set(4, { state: "running" });
    {
      const probe = await probeOptions("maestro-oauth-callback");
      set(4, probe.ok
        ? { state: "ok", detail: "Endpoint callback prêt (test sans échange OAuth réel)" }
        : { state: "fail", detail: probe.error || `HTTP ${probe.status}` });
    }

    setRunning(false);
    toast.success("Validation terminée");
  };


  const triggerTestCallback = () => {
    const url = "planipret://auth/maestro/callback?code=TEST_DEBUG&state=debug";
    logDeepLink({ kind: "info", source: "TestCallback", url, detail: "manual trigger" });
    try {
      if (Capacitor.isNativePlatform()) {
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = url;
        document.body.appendChild(iframe);
        setTimeout(() => { try { iframe.remove(); } catch {} }, 500);
      } else {
        window.location.href = "/auth/maestro/callback?code=TEST_DEBUG&state=debug";
      }
      toast.info("Test callback déclenché");
    } catch (e: any) {
      toast.error(e?.message || "Échec du test");
    }
  };

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--pp-text-primary)" }}>Deep-link debug</div>

      <div className="rounded-lg" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", padding: 12 }}>
        <div style={{ fontSize: 12, color: "var(--pp-text-secondary)", marginBottom: 8 }}>
          Plateforme : <b>{Capacitor.getPlatform()}</b>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={runProbe}
            disabled={probing}
            className="flex items-center gap-1 rounded-md"
            style={{ background: "#0369a1", color: "white", fontSize: 12, fontWeight: 600, padding: "8px 12px" }}
          >
            {schemeOk === true ? <ShieldCheck className="w-3 h-3" /> : schemeOk === false ? <ShieldAlert className="w-3 h-3" /> : <RefreshCw className={`w-3 h-3 ${probing ? "animate-spin" : ""}`} />}
            Vérifier scheme planipret://
          </button>
          <button
            onClick={triggerTestCallback}
            className="flex items-center gap-1 rounded-md"
            style={{ background: "#a855f7", color: "white", fontSize: 12, fontWeight: 600, padding: "8px 12px" }}
          >
            <Play className="w-3 h-3" /> Test callback Maestro
          </button>
          <button
            onClick={() => { clearDeepLinkLog(); setEvents([]); }}
            className="flex items-center gap-1 rounded-md"
            style={{ background: "transparent", border: "1px solid #ef4444", color: "#ef4444", fontSize: 12, fontWeight: 600, padding: "8px 12px" }}
          >
            <Trash2 className="w-3 h-3" /> Vider
          </button>
        </div>
        {schemeOk !== null && (
          <div style={{ marginTop: 8, fontSize: 11, color: schemeOk ? "#22c55e" : "#ef4444" }}>
            {schemeOk ? "Le scheme est déclaré et opérationnel." : "Le scheme n'a pas été routé vers l'app. Vérifie Info.plist / AndroidManifest et refais npx cap sync."}
          </div>
        )}
      </div>

      <div className="rounded-lg" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", padding: 12 }}>
        <div className="flex items-center justify-between mb-2">
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pp-text-primary)" }}>Validation Maestro + Microsoft</div>
          <button
            onClick={runFullValidation}
            disabled={running}
            className="flex items-center gap-1 rounded-md"
            style={{ background: "#22c55e", color: "white", fontSize: 11, fontWeight: 600, padding: "6px 10px" }}
          >
            {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Lancer
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {checks.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>
              Clique « Lancer » pour vérifier la config serveur, le routage callback et les endpoints des deux connexions.
            </div>
          )}
          {checks.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11 }}>
              {c.state === "ok" && <CheckCircle2 className="w-3 h-3 mt-0.5" style={{ color: "#22c55e" }} />}
              {c.state === "fail" && <XCircle className="w-3 h-3 mt-0.5" style={{ color: "#ef4444" }} />}
              {c.state === "running" && <Loader2 className="w-3 h-3 mt-0.5 animate-spin" style={{ color: "#0369a1" }} />}
              {c.state === "idle" && <div className="w-3 h-3 mt-0.5" />}
              <div style={{ flex: 1 }}>
                <div style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>{c.label}</div>
                {c.detail && <div style={{ color: "var(--pp-text-muted)", fontFamily: "monospace", fontSize: 10 }}>{c.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>


      <div className="rounded-lg" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pp-text-primary)", marginBottom: 8 }}>
          Historique ({events.length})
        </div>
        {events.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>Aucun événement pour le moment.</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto" }}>
          {events.slice().reverse().map((ev, i) => (
            <div key={i} style={{ padding: 8, background: "var(--pp-bg-base)", borderRadius: 6, fontFamily: "monospace", fontSize: 10 }}>
              <div style={{
                color: ev.kind === "error" ? "#ef4444" : ev.kind === "handler" ? "#22c55e" : "#a855f7",
                fontWeight: 700,
              }}>
                [{new Date(ev.ts).toLocaleTimeString()}] {ev.source} · {ev.kind}
              </div>
              {ev.url && <div style={{ color: "var(--pp-text-secondary)", wordBreak: "break-all" }}>{ev.url}</div>}
              {ev.detail && <div style={{ color: "var(--pp-text-muted)" }}>{ev.detail}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
