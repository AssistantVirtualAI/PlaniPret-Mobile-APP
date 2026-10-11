import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, ImageDown } from "lucide-react";
import { Chart3D } from "@/components/planipret/broker/overview/ov3dChart";
import InfoTip from "@/components/planipret/broker/overview/InfoTip";
import { CommissionsGradients } from "./chartTheme";
import { exportNodePng } from "@/lib/planipret/exportVisuals";

function titleText(t: ReactNode): string {
  return typeof t === "string" ? t : "graphique";
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="pp-frame-action inline-flex items-center justify-center rounded-lg"
      style={{
        width: 30, height: 30, minWidth: 30,
        background: "var(--pp-bg-elevated)",
        border: "1px solid var(--pp-bg-border)",
        color: "var(--pp-text-secondary)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * A single presentation frame for every commissions chart:
 * gradient header, optional explanation tooltip, actions slot,
 * lazy-mounted 3D/2D chart body with a fixed height.
 * Collapsible on mobile, exportable to PNG.
 */
export default function ChartFrame({
  title, subtitle, info, actions, height = 260, accent = "#5B8FF9", children, span,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  info?: string;
  actions?: ReactNode;
  height?: number;
  accent?: string;
  children: ReactNode;
  /** true = the card takes the full grid width */
  span?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);

  return (
    <div
      ref={ref}
      data-pp-export-block
      className="ov3d-card pp-chart-frame"
      style={{
        position: "relative", padding: 14, borderRadius: 16, overflow: "hidden",
        gridColumn: span ? "1 / -1" : undefined,
        background: "linear-gradient(160deg, var(--pp-bg-elevated) 0%, var(--pp-bg-card) 100%)",
        border: "1px solid var(--pp-bg-border)",
        boxShadow: "0 18px 40px -30px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.05)",
      }}
    >
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(120% 60% at 0% 0%, ${accent}1f, transparent 62%)`,
      }} />
      <div className="flex flex-wrap items-center gap-2 mb-2" style={{ position: "relative" }}>
        <span aria-hidden style={{ width: 3, height: 18, borderRadius: 3, background: accent, boxShadow: `0 0 12px ${accent}80` }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--pp-text-primary)", lineHeight: 1.2 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: "var(--pp-text-muted)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        {info && <InfoTip text={info} />}
        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          <span className="pp-hide-export">
            <IconAction label="Exporter en PNG" onClick={() => exportNodePng(ref.current, titleText(title))}>
              <ImageDown className="w-4 h-4" />
            </IconAction>
          </span>
          <span className="md:hidden">
            <IconAction label={open ? "Réduire" : "Afficher"} onClick={() => setOpen((v) => !v)}>
              <ChevronDown className="w-4 h-4" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            </IconAction>
          </span>
        </div>
      </div>
      <div style={{ position: "relative" }} className={open ? "" : "hidden md:block"}>
        <Chart3D minHeight={height}>
          <div style={{ height }}>
            <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden><CommissionsGradients /></svg>
            {children}
          </div>
        </Chart3D>
      </div>
    </div>
  );
}

/** Non-chart card sharing the same frame language (tables, notes, panels). */
export function PanelFrame({
  title, info, actions, children, accent = "#5B8FF9", span,
}: { title: ReactNode; info?: string; actions?: ReactNode; children: ReactNode; accent?: string; span?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);

  return (
    <div
      ref={ref}
      data-pp-export-block
      className="ov3d-card"
      style={{
        position: "relative", padding: 14, borderRadius: 16, overflow: "hidden",
        gridColumn: span ? "1 / -1" : undefined,
        background: "linear-gradient(160deg, var(--pp-bg-elevated) 0%, var(--pp-bg-card) 100%)",
        border: "1px solid var(--pp-bg-border)",
        boxShadow: "0 18px 40px -30px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.05)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span aria-hidden style={{ width: 3, height: 18, borderRadius: 3, background: accent, boxShadow: `0 0 12px ${accent}80` }} />
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--pp-text-primary)" }}>{title}</div>
        {info && <InfoTip text={info} />}
        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          <span className="pp-hide-export">
            <IconAction label="Exporter en PNG" onClick={() => exportNodePng(ref.current, titleText(title))}>
              <ImageDown className="w-4 h-4" />
            </IconAction>
          </span>
          <span className="md:hidden">
            <IconAction label={open ? "Réduire" : "Afficher"} onClick={() => setOpen((v) => !v)}>
              <ChevronDown className="w-4 h-4" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            </IconAction>
          </span>
        </div>
      </div>
      <div className={open ? "" : "hidden md:block"}>{children}</div>
    </div>
  );
}
