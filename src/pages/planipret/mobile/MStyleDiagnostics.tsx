/**
 * /mplanipret/style-diagnostics
 * Vérifie visuellement que Tailwind est bien actif et liste les classes
 * clés détectées sur la page. À ouvrir depuis Xcode pour valider la CSS.
 */
import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";

type Probe = { cls: string; prop: keyof CSSStyleDeclaration; expect: (v: string) => boolean; label: string };

const PROBES: Probe[] = [
  { cls: "flex",              prop: "display",       expect: (v) => v === "flex",                      label: "flex → display:flex" },
  { cls: "hidden",            prop: "display",       expect: (v) => v === "none",                      label: "hidden → display:none" },
  { cls: "items-center",      prop: "alignItems",    expect: (v) => v === "center",                    label: "items-center → align-items:center" },
  { cls: "justify-between",   prop: "justifyContent",expect: (v) => v === "space-between",             label: "justify-between" },
  { cls: "grid",              prop: "display",       expect: (v) => v === "grid",                      label: "grid → display:grid" },
  { cls: "grid-cols-3",       prop: "gridTemplateColumns", expect: (v) => v.split(" ").length === 3,  label: "grid-cols-3 → 3 tracks" },
  { cls: "absolute",          prop: "position",      expect: (v) => v === "absolute",                  label: "absolute → position:absolute" },
  { cls: "rounded-full",      prop: "borderRadius",  expect: (v) => v.includes("9999") || v.includes("50%"), label: "rounded-full" },
  { cls: "text-xs",           prop: "fontSize",      expect: (v) => v === "12px" || v === "0.75rem" || v.startsWith("12"), label: "text-xs → 12px" },
  { cls: "px-4",              prop: "paddingLeft",   expect: (v) => v === "16px",                      label: "px-4 → padding-x 16px" },
  { cls: "min-h-screen",      prop: "minHeight",     expect: (v) => v === "100vh" || v.endsWith("px"), label: "min-h-screen" },
];

function probe(cls: string, prop: keyof CSSStyleDeclaration): string {
  const el = document.createElement("div");
  el.className = cls;
  el.style.position = "absolute";
  el.style.left = "-9999px";
  el.style.visibility = "hidden";
  document.body.appendChild(el);
  const value = String(getComputedStyle(el)[prop] ?? "");
  el.remove();
  return value;
}

export default function MStyleDiagnostics() {
  const [rows, setRows] = useState<Array<Probe & { got: string; ok: boolean }>>([]);
  const [insets, setInsets] = useState({ top: 0, right: 0, bottom: 0, left: 0 });

  useEffect(() => {
    setRows(PROBES.map((p) => {
      const got = probe(p.cls, p.prop);
      return { ...p, got, ok: p.expect(got) };
    }));

    // Read env(safe-area-inset-*) live
    const probeEl = document.createElement("div");
    probeEl.style.cssText = "position:fixed;top:env(safe-area-inset-top);left:env(safe-area-inset-left);right:env(safe-area-inset-right);bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none";
    document.body.appendChild(probeEl);
    const r = probeEl.getBoundingClientRect();
    setInsets({
      top: Math.round(r.top),
      left: Math.round(r.left),
      right: Math.round(window.innerWidth - r.right),
      bottom: Math.round(window.innerHeight - r.bottom),
    });
    probeEl.remove();
  }, []);

  const okCount = rows.filter((r) => r.ok).length;
  const tailwindActive = okCount >= Math.ceil(PROBES.length * 0.75);
  const info = useMemo(() => ({
    platform: Capacitor.getPlatform(),
    isNative: Capacitor.isNativePlatform(),
    ua: navigator.userAgent,
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    dpr: window.devicePixelRatio,
    htmlClass: document.documentElement.className,
  }), []);

  return (
    <div className="px-4 py-4 space-y-4" style={{ color: "var(--pp-text-primary,#E8EDF5)", fontFamily: "Inter,sans-serif" }}>
      <header className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
          style={{ background: tailwindActive ? "#10B981" : "#EF4444" }}
        >
          {tailwindActive ? "OK" : "!"}
        </div>
        <div>
          <div className="text-lg font-bold">Diagnostic styles</div>
          <div className="text-xs opacity-70">
            Tailwind {tailwindActive ? "actif" : "INACTIF"} — {okCount}/{PROBES.length} classes correctes
          </div>
        </div>
      </header>

      <section className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="text-[11px] uppercase tracking-wider opacity-60 mb-2">Environnement</div>
        <ul className="text-xs space-y-1 font-mono">
          <li>platform: <b>{info.platform}</b> {info.isNative ? "(native)" : "(web)"}</li>
          <li>viewport: {info.viewport} · dpr {info.dpr}</li>
          <li>safe-area top/right/bottom/left: {insets.top} / {insets.right} / {insets.bottom} / {insets.left}</li>
          <li className="break-all opacity-70">html.class: {info.htmlClass || "—"}</li>
          <li className="break-all opacity-60">UA: {info.ua}</li>
        </ul>
      </section>

      <section className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="px-3 py-2 text-[11px] uppercase tracking-wider opacity-60" style={{ background: "rgba(255,255,255,0.04)" }}>
          Sondes de classes Tailwind
        </div>
        <ul>
          {rows.map((r) => (
            <li key={r.cls} className="flex items-center justify-between gap-2 px-3 py-2 text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <span className="flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: r.ok ? "#10B981" : "#EF4444" }}
                />
                <span className="font-mono">{r.cls}</span>
              </span>
              <span className="text-right font-mono opacity-80 truncate max-w-[55%]" title={r.got}>
                {r.ok ? "✓" : "✗"} {r.got || "(vide)"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {!tailwindActive && (
        <div className="rounded-xl p-3 text-xs" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)" }}>
          Tailwind n'est pas compilé. Vérifiez <code>apps/planipret-mobile/postcss.config.js</code> puis relancez
          <code> npm run build &amp;&amp; npx cap sync ios</code>.
        </div>
      )}
    </div>
  );
}
