/**
 * Web mirror of the mobile Style Diagnostics page.
 * Standalone: no Capacitor plugins, safe to render in browser.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Hammer, Info } from "lucide-react";

const TAILWIND_PROBE_CLASSES = [
  { cls: "flex", prop: "display", expect: "flex" },
  { cls: "grid", prop: "display", expect: "grid" },
  { cls: "absolute", prop: "position", expect: "absolute" },
  { cls: "rounded-full", prop: "borderRadius", expect: /^(9999px|50%)$/ },
  { cls: "text-xs", prop: "fontSize", expect: /^12px$/ },
  { cls: "px-4", prop: "paddingLeft", expect: /^16px$/ },
  { cls: "min-h-screen", prop: "minHeight", expect: /^(100vh|100dvh|100svh|100lvh|100cqh|100%)$/ },
  { cls: "bg-primary", prop: "backgroundColor", expect: /rgb\(/ },
  { cls: "text-foreground", prop: "color", expect: /rgb\(/ },
  { cls: "border-border", prop: "borderTopColor", expect: /rgb\(/ },
  { cls: "shadow-md", prop: "boxShadow", expect: /rgb\(/ },
  { cls: "backdrop-blur-xl", prop: "backdropFilter", expect: /blur/ },
] as const;

export default function MStyleDiagnosticsWeb() {
  const nav = useNavigate();
  const [checks, setChecks] = useState<{ cls: string; ok: boolean; actual: string }[]>([]);
  const [tailwindActive, setTailwindActive] = useState<boolean | null>(null);
  const [insets, setInsets] = useState({ top: 0, bottom: 0, left: 0, right: 0 });

  function probeTailwind() {
    const host = document.createElement("div");
    host.style.position = "absolute";
    host.style.visibility = "hidden";
    document.body.appendChild(host);
    const results = TAILWIND_PROBE_CLASSES.map(({ cls, prop, expect }) => {
      const el = document.createElement("div");
      el.className = cls;
      host.appendChild(el);
      const style = window.getComputedStyle(el);
      const actual = (style as any)[prop] ?? "";
      const ok = expect instanceof RegExp ? expect.test(actual) : actual === expect;
      return { cls, ok, actual };
    });
    host.remove();
    setChecks(results);
    setTailwindActive(results.every((r) => r.ok));
  }

  function probeInsets() {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;left:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;";
    document.body.appendChild(probe);
    const s = window.getComputedStyle(probe);
    const parse = (v: string) => parseFloat(v) || 0;
    setInsets({ top: parse(s.paddingTop), bottom: parse(s.paddingBottom), left: parse(s.paddingLeft), right: parse(s.paddingRight) });
    probe.remove();
  }

  useEffect(() => { probeTailwind(); probeInsets(); }, []);

  const statusColor = tailwindActive === null ? "#F5A623" : tailwindActive ? "#2EDC78" : "#E84C4C";
  const StatusIcon = tailwindActive === null ? AlertTriangle : tailwindActive ? CheckCircle2 : XCircle;
  const buildId = (import.meta.env.VITE_BUILD_ID as string) ?? "web-dev";
  const buildTime = (import.meta.env.VITE_BUILD_TIME as string) ?? new Date().toISOString();

  return (
    <div className="min-h-screen p-4" style={{ background: "#060D1A", color: "#E8EDF5" }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => nav(-1)} className="p-2 rounded-lg" style={{ background: "#0A1628", border: "1px solid #0E2A45" }}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Diagnostic styles (web)</h1>
            <p className="text-xs" style={{ color: "#8FA8C0" }}>Miroir de la page mobile — Tailwind, safe-area et build info</p>
          </div>
          <button onClick={() => { probeTailwind(); probeInsets(); }} className="p-2 rounded-lg" style={{ background: "#0A1628", border: "1px solid #0E2A45" }}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-xl p-4 mb-3" style={{ background: "#0A1628", border: `1px solid ${statusColor}44` }}>
          <div className="flex items-center gap-3">
            <StatusIcon className="w-8 h-8" style={{ color: statusColor }} />
            <div className="flex-1">
              <div className="text-base font-bold" style={{ color: statusColor }}>
                {tailwindActive === null ? "Analyse…" : tailwindActive ? "Tailwind actif" : "Tailwind non détecté"}
              </div>
              <div className="text-xs" style={{ color: "#8FA8C0" }}>
                {tailwindActive ? `${checks.length} classes clés détectées` : "Vérifiez la config postcss + tailwind."}
              </div>
            </div>
          </div>
        </div>

        <Card title="Classes Tailwind détectées">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {checks.map((c) => (
              <div key={c.cls} className="flex items-center gap-2 text-xs p-2 rounded-lg" style={{ background: "#040B16", border: "1px solid #0E2A45" }}>
                {c.ok ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#2EDC78" }} /> : <XCircle className="w-3.5 h-3.5" style={{ color: "#E84C4C" }} />}
                <div className="flex-1 min-w-0">
                  <div className="font-mono truncate">.{c.cls}</div>
                  <div className="truncate text-[10px]" style={{ color: "#4A7FA5" }} title={c.actual}>{c.actual || "non défini"}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Safe-area insets (CSS env)">
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {[
              { label: "Top", v: insets.top },
              { label: "Bottom", v: insets.bottom },
              { label: "Left", v: insets.left },
              { label: "Right", v: insets.right },
            ].map((i) => (
              <div key={i.label} className="p-2 rounded-lg" style={{ background: "#040B16", border: "1px solid #0E2A45" }}>
                <div style={{ color: "#8FA8C0" }}>{i.label}</div>
                <div className="font-mono">{i.v.toFixed(1)}px</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Build info" icon={<Hammer className="w-3.5 h-3.5" />}>
          <div className="space-y-1.5 text-xs">
            <BuildRow label="Plateforme" value="web (navigateur)" />
            <BuildRow label="User-Agent" value={navigator.userAgent} />
            <BuildRow label="Viewport" value={`${window.innerWidth}×${window.innerHeight} · dpr=${window.devicePixelRatio}`} />
            <BuildRow label="Build web ID" value={buildId} mono />
            <BuildRow label="Build web time" value={buildTime} />
          </div>
          <div className="mt-3 p-2 rounded-lg text-[11px]" style={{ background: "#0D1F35", border: "1px solid #0E2A45", color: "#8FA8C0" }}>
            <Info className="w-3 h-3 inline mr-1" style={{ color: "#2E9BDC" }} />
            Cette page est le miroir web de <code>/mplanipret/style-diagnostics</code> de l'app mobile standalone. Les infos natives (Capacitor, iOS, Android) ne sont visibles que dans l'app compilée.
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3 mb-3" style={{ background: "#0A1628", border: "1px solid #0E2A45" }}>
      <div className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: "#8FA8C0" }}>
        {icon}{title}
      </div>
      {children}
    </div>
  );
}

function BuildRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-[110px]" style={{ fontSize: 10, color: "#4A7FA5", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div className="flex-1 break-all" style={{ fontFamily: mono ? "monospace" : "inherit" }}>{value}</div>
    </div>
  );
}
