import { memo, type ReactNode } from "react";
import { useInViewOnce, useSupports3D } from "./use3dCapability";

/** Global SVG filters used by .ov3d-chart shapes to look softly extruded.
 *  Tuned for elegance: a tight contact shadow + a wide soft ambient shadow,
 *  instead of the hard offset copy that looked crude. */
export const Ov3DChartFilters = memo(function Ov3DChartFilters() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <filter id="ov3dExtrude" x="-40%" y="-40%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="1" stdDeviation="0.6" floodColor="rgba(0,0,0,0.45)" />
          <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="rgba(0,0,0,0.35)" />
        </filter>
        <filter id="ov3dSoft" x="-40%" y="-40%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="rgba(0,0,0,0.32)" />
        </filter>
      </defs>
    </svg>
  );
});

/**
 * Wrapper adding the 3D stage (shadow, extrusion filters) around a chart.
 * - Lazy: the chart subtree only mounts when it approaches the viewport.
 * - Adaptive: devices that can't handle the 3D relief (low memory/CPU,
 *   reduced motion, forced flat intensity) get an accessible 2D rendering.
 */
export function Chart3D({
  children,
  minHeight = 240,
  lazy = true,
}: { children: ReactNode; minHeight?: number; lazy?: boolean }) {
  const [ref, visible] = useInViewOnce<HTMLDivElement>();
  const supports3D = useSupports3D();
  const show = !lazy || visible;

  return (
    <div
      ref={ref}
      className={`ov3d-chart${supports3D ? "" : " ov3d-2d"}`}
      data-render-mode={supports3D ? "3d" : "2d"}
      style={show ? undefined : { minHeight }}
    >
      {show ? children : (
        <div
          className="ov3d-chart-skeleton"
          role="img"
          aria-label="Graphique en cours de chargement"
          style={{ height: minHeight }}
        />
      )}
    </div>
  );
}


const gid = (color: string) => `ov3dg-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

/** Gradient defs for a set of colors — use with fill3d(color). */
export function Ov3DGradients({ colors }: { colors: string[] }) {
  const uniq = Array.from(new Set(colors));
  return (
    <defs>
      {/* Bars / sectors: side-lit cylinder shading (left highlight, right falloff)
          layered with a vertical gloss for a glassy, rounded volume. */}
      {uniq.map((c) => (
        <linearGradient key={c} id={gid(c)} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={c} stopOpacity={0.72} />
          <stop offset="22%" stopColor="#ffffff" stopOpacity={0.28} />
          <stop offset="34%" stopColor={c} stopOpacity={1} />
          <stop offset="78%" stopColor={c} stopOpacity={0.92} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.28} />
        </linearGradient>
      ))}
      {uniq.map((c) => (
        <linearGradient key={`a-${c}`} id={`${gid(c)}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity={0.55} />
          <stop offset="45%" stopColor={c} stopOpacity={0.22} />
          <stop offset="100%" stopColor={c} stopOpacity={0.02} />
        </linearGradient>
      ))}
    </defs>
  );
}

export const fill3d = (color: string) => `url(#${gid(color)})`;
export const areaFill3d = (color: string) => `url(#${gid(color)}-area)`;
