import { TrendingUp, TrendingDown } from "lucide-react";
import InfoTip from "@/components/planipret/broker/overview/InfoTip";

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v || 0);
const fmtNum = (v: number) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(v || 0);

function HeroStat({ label, value, delta, deltaLabel, info }: { label: string; value: string; delta?: number | null; deltaLabel: string; info?: string }) {
  const up = (delta ?? 0) >= 0;
  return (
    <div style={{ minWidth: 130 }}>
      <div className="inline-flex items-center gap-1" style={{ fontSize: 10.5, letterSpacing: .6, textTransform: "uppercase", fontWeight: 800, color: "var(--pp-text-muted)" }}>
        {label}{info && <InfoTip text={info} />}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.6, color: "var(--pp-text-primary)", lineHeight: 1.15, textShadow: "0 8px 22px rgba(0,0,0,.28)" }}>
        {value}
      </div>
      {typeof delta === "number" && Number.isFinite(delta) && (
        <div className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-md"
          style={{ fontSize: 11, fontWeight: 800, color: up ? "#16a34a" : "#ef4444", background: up ? "rgba(22,163,74,.12)" : "rgba(239,68,68,.12)" }}>
          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {(delta * 100).toFixed(1)} % {deltaLabel}
        </div>
      )}
    </div>
  );
}

/** Aurora hero banner heading both commission portals. */
export default function CommissionsHero({
  lang, title, subtitle, periodLabel, volume, deals, commission, volumeDelta, dealsDelta, commissionDelta, right,
}: {
  lang: "fr" | "en";
  title: string;
  subtitle?: string;
  periodLabel?: string;
  volume: number;
  deals: number;
  commission: number;
  volumeDelta?: number | null;
  dealsDelta?: number | null;
  commissionDelta?: number | null;
  right?: React.ReactNode;
}) {
  const isFr = lang === "fr";
  const deltaLabel = isFr ? "vs même période l’an dernier" : "vs same period last year";
  return (
    <div
      className="ov3d-card"
      style={{
        position: "relative", overflow: "hidden", borderRadius: 18, padding: "16px 18px", marginBottom: 12,
        background: "linear-gradient(140deg, var(--pp-bg-elevated) 0%, var(--pp-bg-card) 60%, var(--pp-bg-elevated) 100%)",
        border: "1px solid var(--pp-bg-border)",
        boxShadow: "0 26px 56px -38px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.06)",
      }}
    >
      <div aria-hidden className="pp-hero-aurora" style={{
        position: "absolute", inset: -60, pointerEvents: "none", opacity: .55,
        background:
          "radial-gradient(38% 60% at 12% 0%, rgba(91,143,249,.55), transparent 62%)," +
          "radial-gradient(34% 62% at 78% 8%, rgba(139,92,246,.42), transparent 64%)," +
          "radial-gradient(30% 55% at 52% 100%, rgba(20,184,166,.34), transparent 62%)",
        filter: "blur(6px)",
      }} />
      <div style={{ position: "relative" }}>
        <div className="flex flex-wrap items-start gap-3">
          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.4, color: "var(--pp-text-primary)" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: "var(--pp-text-secondary)", marginTop: 2 }}>{subtitle}</div>}
            {periodLabel && (
              <span className="inline-flex items-center mt-2 px-2 py-0.5 rounded-full"
                style={{ fontSize: 11, fontWeight: 700, color: "var(--pp-text-secondary)", background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}>
                {periodLabel}
              </span>
            )}
          </div>
          {right && <div className="flex flex-wrap items-center gap-1.5">{right}</div>}
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3 mt-4">
          <HeroStat
            label={isFr ? "Volume" : "Volume"} value={fmtMoney(volume)} delta={volumeDelta} deltaLabel={deltaLabel}
            info={isFr ? "Somme des montants de prêt des dossiers comptés dans le volume, sur la période sélectionnée. L'écart compare la même fenêtre de l'année précédente."
              : "Sum of loan amounts counted in volume for the selected period. The delta compares the same window last year."}
          />
          <HeroStat
            label={isFr ? "Dossiers" : "Deals"} value={fmtNum(deals)} delta={dealsDelta} deltaLabel={deltaLabel}
            info={isFr ? "Nombre de dossiers comptés (hors lignes d'ajustement et bonis)." : "Number of counted deals (excluding adjustment and bonus lines)."}
          />
          <HeroStat
            label="Commission" value={fmtMoney(commission)} delta={commissionDelta} deltaLabel={deltaLabel}
            info={isFr ? "Total des commissions inscrites au registre pour la période, toutes catégories confondues."
              : "Total commissions recorded in the register for the period, all categories included."}
          />
        </div>
      </div>
    </div>
  );
}
