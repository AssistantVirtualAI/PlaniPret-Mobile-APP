import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart,
} from "recharts";
import { Star, Crown, Medal, TrendingUp, TrendingDown, Info } from "lucide-react";
import { InfoTip, StatNote } from "@/components/planipret/broker/overview/InfoTip";
import { Chart3D, Ov3DChartFilters, Ov3DGradients, fill3d, areaFill3d } from "@/components/planipret/broker/overview/ov3dChart";

type Lang = "fr" | "en";

const MONTHS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v || 0);
const fmtCompact = (v: number) =>
  new Intl.NumberFormat("fr-CA", { notation: "compact", maximumFractionDigits: 1 }).format(v || 0);
const fmtNum = (v: number) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(v || 0);
const fmtBps = (v: number) => `${(v || 0).toFixed(1)} BPS`;

const GOLD = "#FFC000";
const SILVER = "#C8D0DC";
const BRONZE = "#CD7F32";
const PALETTE = ["#FFC000", "#4472C4", "#70AD47", "#ED7D31", "#8B5CF6", "#EC4899", "#14B8A6", "#A5A5A5"];

const tooltipStyle = {
  background: "rgba(8,13,26,.94)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 12,
  color: "#fff",
  fontSize: 12,
  boxShadow: "0 18px 40px -20px rgba(0,0,0,.9)",
  backdropFilter: "blur(10px)",
} as const;

function Delta({ value }: { value: number | string }) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return <span style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>{typeof value === "string" ? value : "—"}</span>;
  }
  const up = value >= 0;
  return (
    <span
      title={`Écart vs la même période l'an dernier (YoY) : ${up ? "+" : ""}${(value * 100).toFixed(1)} %. Vert = progression, rouge = recul.`}
      className="inline-flex items-center gap-0.5" style={{ fontSize: 11.5, fontWeight: 800, color: up ? "#22c55e" : "#ef4444" }}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {(value * 100).toFixed(1)} %
    </span>
  );
}

function Panel({ title, subtitle, children, right, info, note }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode; info?: string; note?: React.ReactNode }) {
  return (
    <div
      className="ov3d-card"
      style={{
        padding: 14, borderRadius: 16, marginTop: 12,
        background: "linear-gradient(160deg, var(--pp-bg-elevated) 0%, var(--pp-bg-card) 100%)",
        border: "1px solid var(--pp-bg-border)",
        boxShadow: "0 24px 50px -34px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.06)",
      }}
    >
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-1.5" style={{ fontSize: 13, fontWeight: 800, color: "var(--pp-text-primary)" }}>
            <span>{title}</span>
            {info && <InfoTip title={title} text={info} />}
          </div>
          {subtitle && <div style={{ fontSize: 11, color: "var(--pp-text-muted)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
      {note && <StatNote>{note}</StatNote>}
    </div>
  );
}

function ClubKpi({ label, value, sub, delta, accent, info }: { label: string; value: string; sub?: string; delta?: number | string; accent: string; info?: string }) {
  return (
    <div
      className="ov3d-card"
      style={{
        position: "relative", padding: 14, borderRadius: 16, overflow: "hidden",
        background: "linear-gradient(155deg, var(--pp-bg-elevated) 0%, var(--pp-bg-card) 100%)",
        border: "1px solid var(--pp-bg-border)",
        boxShadow: `0 22px 40px -30px ${accent}80, 0 10px 26px -20px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.07)`,
        transform: "translateZ(18px)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(130% 80% at 0% 0%, ${accent}26, transparent 62%)`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent, opacity: .9 }} />
      <div className="flex items-center gap-1" style={{ fontSize: 10.5, letterSpacing: .5, textTransform: "uppercase", color: "var(--pp-text-muted)", fontWeight: 800 }}>
        <span>{label}</span>
        {info && <InfoTip title={label} text={info} size={11} />}
      </div>
      <div style={{ fontSize: 23, fontWeight: 900, marginTop: 4, color: "var(--pp-text-primary)", textShadow: "0 2px 10px rgba(0,0,0,.45)" }}>{value}</div>
      <div className="flex items-center gap-2 mt-1">
        {delta !== undefined && <Delta value={delta} />}
        {sub && <span style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>{sub}</span>}
      </div>
    </div>
  );
}

function Podium({ club, isFr, clubVolume }: { club: any[]; isFr: boolean; clubVolume?: number }) {
  const top = club.slice(0, 3);
  if (!top.length) return null;
  const leader = top[0]?.volume || 0;
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights: Record<number, number> = { 1: 132, 2: 104, 3: 86 };
  const colors: Record<number, string> = { 1: GOLD, 2: SILVER, 3: BRONZE };
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${order.length}, minmax(0,1fr))`, alignItems: "end" }}>
      {order.map((c) => {
        const col = colors[c.rank] ?? GOLD;
        return (
          <div key={c.brokerKey ?? c.broker} style={{ textAlign: "center" }}>
            <div
              className="ov3d-card"
              style={{
                padding: "10px 10px 8px", borderRadius: 14, marginBottom: 8,
                background: `linear-gradient(160deg, ${col}1f, transparent 70%), var(--pp-bg-card)`,
                border: `1px solid ${col}44`,
                boxShadow: `0 24px 44px -28px ${col}90, inset 0 1px 0 rgba(255,255,255,.08)`,
              }}
            >
              <div className="inline-flex items-center gap-1.5" style={{ color: col, fontWeight: 900, fontSize: 12 }}>
                {c.rank === 1 ? <Crown className="w-4 h-4" /> : <Medal className="w-3.5 h-3.5" />}#{c.rank}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--pp-text-primary)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.broker}
              </div>
              <div style={{ fontSize: 15, fontWeight: 900, color: col, marginTop: 4 }}>{fmtMoney(c.volume)}</div>
              <div style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>
                {fmtNum(c.deals)} {isFr ? "dossiers" : "deals"} · {fmtMoney(c.commission)}
              </div>
              <div className="mt-1"><Delta value={c.volumeYoy} /></div>
            </div>
            <div
              tabIndex={0}
              role="img"
              aria-label={`#${c.rank} ${c.broker}`}
              title={(() => {
                const share = clubVolume ? (c.volume / clubVolume) * 100 : 0;
                const gap = leader - (c.volume || 0);
                return isFr
                  ? `#${c.rank} ${c.broker}\nVolume déboursé : ${fmtMoney(c.volume)} (${share.toFixed(1)} % du club)\n${fmtNum(c.deals)} dossiers · dossier moyen ${fmtMoney(c.avgDeal)}\nCommission : ${fmtMoney(c.commission)} (${fmtBps(c.bps)})\n${c.rank === 1 ? "Meneur de la saison" : `Écart avec le meneur : ${fmtMoney(gap)}`}\nLa hauteur de la marche est fixe et reflète uniquement le rang.`
                  : `#${c.rank} ${c.broker}\nFunded volume: ${fmtMoney(c.volume)} (${share.toFixed(1)}% of club)\n${fmtNum(c.deals)} deals · avg deal ${fmtMoney(c.avgDeal)}\nCommission: ${fmtMoney(c.commission)} (${fmtBps(c.bps)})\n${c.rank === 1 ? "Season leader" : `Gap to leader: ${fmtMoney(gap)}`}\nStep height is fixed and only reflects rank.`;
              })()}
              style={{
                height: heights[c.rank] ?? 80, borderRadius: "12px 12px 6px 6px",
                background: `linear-gradient(180deg, ${col}cc, ${col}55 45%, ${col}22)`,
                border: `1px solid ${col}55`,
                boxShadow: `inset 0 2px 0 rgba(255,255,255,.35), inset -10px 0 18px -12px #000, 0 26px 40px -26px ${col}aa`,
                display: "flex", alignItems: "flex-start", justifyContent: "center",
                fontSize: 26, fontWeight: 900, color: "rgba(0,0,0,.45)", paddingTop: 6,
              }}
            >
              {c.rank}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ClubExcellencePanel({
  lang, data, isAdminView, onBroker,
}: { lang: Lang; data: any; isAdminView?: boolean; onBroker?: (brokerKey: string) => void }) {
  const isFr = lang === "fr";
  const MONTHS = isFr ? MONTHS_FR : MONTHS_EN;
  const club: any[] = Array.isArray(data?.club) ? data.club : [];
  const clubMonthly: any[] = Array.isArray(data?.clubMonthly) ? data.clubMonthly : [];
  const seasons: any[] = Array.isArray(data?.seasons) ? data.seasons : [];

  const totals = useMemo(() => {
    const volume = club.reduce((s, c) => s + (c.volume || 0), 0);
    const deals = club.reduce((s, c) => s + (c.deals || 0), 0);
    const commission = club.reduce((s, c) => s + (c.commission || 0), 0);
    const pyVolume = club.reduce((s, c) => s + (c.pyVolume || 0), 0);
    return {
      volume, deals, commission, pyVolume,
      brokers: club.length,
      avgDeal: deals ? volume / deals : 0,
      bps: volume ? (commission / volume) * 10000 : 0,
      volumeYoy: pyVolume ? (volume - pyVolume) / pyVolume : ("—" as any),
    };
  }, [club]);

  const me = useMemo(() => club.find((c) => c.isMe) ?? null, [club]);
  const maxVolume = club[0]?.volume ?? 0;

  const monthlyData = useMemo(
    () => clubMonthly.map((m: any) => ({
      name: `${MONTHS[m.month - 1]} ${String(m.year).slice(2)}`,
      volume: m.volume, deals: m.deals, commission: m.commission,
    })),
    [clubMonthly, MONTHS],
  );

  const cumulative = useMemo(() => {
    let acc = 0;
    return monthlyData.map((m) => { acc += m.volume || 0; return { name: m.name, cumul: acc, volume: m.volume }; });
  }, [monthlyData]);

  const shareData = useMemo(() => {
    const top = club.slice(0, 7).map((c) => ({ name: c.broker, value: c.volume }));
    const rest = club.slice(7).reduce((s, c) => s + (c.volume || 0), 0);
    return rest > 0 ? [...top, { name: isFr ? "Autres" : "Others", value: rest }] : top;
  }, [club, isFr]);

  const radarData = useMemo(() => {
    if (!me || club.length === 0) return [];
    const avg = {
      volume: totals.volume / (club.length || 1),
      deals: totals.deals / (club.length || 1),
      commission: totals.commission / (club.length || 1),
      bps: club.reduce((s, c) => s + (c.bps || 0), 0) / (club.length || 1),
      avgDeal: club.reduce((s, c) => s + (c.avgDeal || 0), 0) / (club.length || 1),
    };
    const norm = (mine: number, average: number) => (average ? Math.min(200, (mine / average) * 100) : 0);
    return [
      { metric: "Volume", me: norm(me.volume, avg.volume), club: 100 },
      { metric: isFr ? "Dossiers" : "Deals", me: norm(me.deals, avg.deals), club: 100 },
      { metric: "Commission", me: norm(me.commission, avg.commission), club: 100 },
      { metric: "BPS", me: norm(me.bps, avg.bps), club: 100 },
      { metric: isFr ? "Doss. moyen" : "Avg deal", me: norm(me.avgDeal, avg.avgDeal), club: 100 },
    ];
  }, [me, club, totals, isFr]);

  const seasonBars = useMemo(
    () => [...seasons].reverse().map((s) => ({ name: s.label, volume: s.volume, commission: s.commission, deals: s.deals })),
    [seasons],
  );

  const gradientColors = useMemo(
    () => Array.from(new Set([...PALETTE, GOLD, SILVER, BRONZE, "#4472C4", "#70AD47", "#ED7D31", "#8B5CF6"])),
    [],
  );

  return (
    <div className="ov3d-stage">
      <Ov3DChartFilters />

      {/* Hero */}
      <div
        style={{
          position: "relative", overflow: "hidden", borderRadius: 20, padding: "20px 18px", marginTop: 4,
          background: "linear-gradient(135deg, rgba(255,192,0,.16) 0%, rgba(139,92,246,.14) 42%, rgba(20,184,166,.12) 100%), var(--pp-bg-card)",
          border: "1px solid rgba(255,192,0,.28)",
          boxShadow: "0 40px 70px -46px rgba(255,192,0,.55), inset 0 1px 0 rgba(255,255,255,.12)",
          transform: "translateZ(24px)",
        }}
      >
        <div style={{ position: "absolute", right: -60, top: -70, width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,192,0,.30), transparent 65%)", pointerEvents: "none" }} />
        <div className="flex items-center gap-2" style={{ color: GOLD, fontWeight: 900, fontSize: 12, letterSpacing: .6, textTransform: "uppercase" }}>
          <Star className="w-4 h-4" style={{ fill: GOLD }} />
          Club Excellence
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, color: "var(--pp-text-primary)", marginTop: 4, textShadow: "0 3px 16px rgba(0,0,0,.5)" }}>
          {isFr ? "Saison" : "Season"} {data?.season?.current?.start?.slice(0, 4)}–{data?.season?.current?.end?.slice(0, 4)}
        </div>
        <div style={{ fontSize: 12, color: "var(--pp-text-muted)", marginTop: 2 }}>
          {data?.season?.current?.start} → {data?.season?.current?.end} · {fmtNum(totals.brokers)} {isFr ? "courtiers" : "brokers"} · {fmtNum(totals.deals)} {isFr ? "dossiers" : "deals"}
        </div>
        <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
          <ClubKpi label={isFr ? "Volume du club" : "Club volume"} value={fmtMoney(totals.volume)} delta={totals.volumeYoy} accent={GOLD} info={isFr ? "Somme des volumes hypothécaires déboursés par tous les courtiers du registre pour la saison en cours. L'écart compare avec la même saison l'an dernier." : "Sum of funded mortgage volume for every broker in the register for the current season. The delta compares with the same season last year."} />
          <ClubKpi label="Commission" value={fmtMoney(totals.commission)} accent="#8B5CF6" info={isFr ? "Total des commissions générées par les dossiers déboursés de la saison, toutes sources du registre confondues." : "Total commissions from funded deals for the season, across all register sources."} />
          <ClubKpi label={isFr ? "Dossiers" : "Deals"} value={fmtNum(totals.deals)} accent="#70AD47" info={isFr ? "Nombre de dossiers déboursés durant la saison. Un dossier est compté à sa date de déboursement." : "Number of funded deals during the season. A deal is counted at its funding date."} />
          <ClubKpi label={isFr ? "Dossier moyen" : "Avg deal"} value={fmtMoney(totals.avgDeal)} accent="#4472C4" info={isFr ? "Volume total ÷ nombre de dossiers. Indique la taille moyenne des prêts déboursés." : "Total volume ÷ number of deals. Shows the average size of funded loans."} />
          <ClubKpi label="BPS" value={fmtBps(totals.bps)} accent="#14B8A6" info={isFr ? "Points de base : commission ÷ volume × 10 000. Mesure le rendement moyen obtenu par dollar prêté (ex. 90 BPS = 0,90 %)." : "Basis points: commission ÷ volume × 10,000. Measures average yield per dollar lent (e.g. 90 BPS = 0.90%)."} />
          {me && (
            <ClubKpi
              label={isFr ? "Mon rang" : "My rank"}
              value={`#${me.rank} / ${totals.brokers}`}
              sub={totals.volume ? `${((me.volume / totals.volume) * 100).toFixed(1)} % ${isFr ? "du club" : "of club"}` : undefined}
              delta={me.volumeYoy}
              accent={ED_ACCENT}
              info={isFr ? "Votre position au classement du club selon le volume déboursé, et votre part du volume total. L'écart indique votre progression de volume vs l'an dernier." : "Your club ranking by funded volume, plus your share of total volume. The delta shows your volume growth vs last year."}
            />
          )}
        </div>
      </div>

      <Panel
        title={isFr ? "Podium de la saison" : "Season podium"}
        subtitle={isFr ? "Top 3 par volume déboursé" : "Top 3 by funded volume"}
        info={isFr
          ? "Classement des 3 premiers courtiers selon le volume hypothécaire déboursé de la saison (1er août → 31 juillet). La hauteur des marches illustre le rang, pas l'écart réel : survolez une marche pour voir le volume, la part du club et l'écart en dollars avec le meneur."
          : "Top 3 brokers by funded mortgage volume for the season (Aug 1 → Jul 31). Step height illustrates rank, not the actual gap: hover a step to see volume, club share and the dollar gap to the leader."}
        note={isFr
          ? "Écart YoY : variation du volume par rapport à la même saison l'an dernier. Vert = progression, rouge = recul, « — » = pas d'historique comparable."
          : "YoY delta: volume change vs the same season last year. Green = growth, red = decline, “—” = no comparable history."}
      >
        <Podium club={club} isFr={isFr} clubVolume={totals.volume} />
      </Panel>

      <Panel
        title={isFr ? "Classement complet des courtiers" : "Full broker standings"}
        subtitle={isFr ? "Tous les courtiers du registre pour la saison en cours" : "All brokers in the register for the current season"}
        info={isFr
          ? "Part = volume du courtier ÷ volume total du club. La barre est proportionnelle au volume du meneur (barre pleine = 1er rang). BPS = commission ÷ volume × 10 000. YoY = variation vs la même saison l'an dernier."
          : "Share = broker volume ÷ total club volume. The bar is proportional to the leader's volume (full bar = rank 1). BPS = commission ÷ volume × 10,000. YoY = change vs the same season last year."}
        right={<span style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>{fmtNum(club.length)} {isFr ? "courtiers" : "brokers"}</span>}
      >
        <div className="overflow-x-auto">
          <table className="ov3d-table">
            <thead>
              <tr>
                {[
                  { h: "#", t: isFr ? "Rang par volume déboursé de la saison" : "Rank by funded volume for the season" },
                  { h: isFr ? "Courtier" : "Broker", t: isFr ? "Courtier au registre; « moi » identifie votre ligne" : "Broker in the register; “me” marks your row" },
                  { h: "Volume", t: isFr ? "Volume hypothécaire déboursé sur la saison" : "Funded mortgage volume for the season" },
                  { h: isFr ? "Part" : "Share", t: isFr ? "Volume du courtier ÷ volume total du club × 100. La barre est relative au meneur." : "Broker volume ÷ total club volume × 100. The bar is relative to the leader." },
                  { h: isFr ? "Doss." : "Deals", t: isFr ? "Nombre de dossiers déboursés" : "Number of funded deals" },
                  { h: "Commission", t: isFr ? "Commissions générées par ces dossiers" : "Commissions generated by those deals" },
                  { h: isFr ? "Doss. moy." : "Avg deal", t: isFr ? "Volume ÷ nombre de dossiers" : "Volume ÷ number of deals" },
                  { h: "BPS", t: isFr ? "Commission ÷ volume × 10 000 (rendement moyen)" : "Commission ÷ volume × 10,000 (average yield)" },
                  { h: "YoY", t: isFr ? "Variation du volume vs la même saison l'an dernier" : "Volume change vs the same season last year" },
                ].map(({ h, t }, i) => (
                  <th key={h} title={t} style={{ textAlign: i <= 1 ? "left" : "right", cursor: "help" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {club.map((c) => {
                const accent = c.rank === 1 ? GOLD : c.rank === 2 ? SILVER : c.rank === 3 ? BRONZE : c.isMe ? "#8B5CF6" : "#4472C4";
                const share = totals.volume ? (c.volume / totals.volume) * 100 : 0;
                return (
                  <tr
                    key={c.brokerKey ?? c.broker}
                    className="ov3d-row"
                    style={{
                      ["--ov3d-accent" as any]: accent,
                      cursor: isAdminView && onBroker ? "pointer" : undefined,
                      background: c.isMe ? "linear-gradient(90deg, rgba(139,92,246,.14), transparent 60%)" : undefined,
                    }}
                    data-broker-key={c.brokerKey}
                    onClick={() => isAdminView && c.linked !== false && c.brokerKey && onBroker?.(c.brokerKey)}
                  >
                    <td style={{ fontWeight: 900, color: accent }}>
                      <span className="inline-flex items-center gap-1">
                        {c.rank <= 3 ? (c.rank === 1 ? <Crown className="w-3.5 h-3.5" /> : <Medal className="w-3.5 h-3.5" />) : null}
                        {c.rank}
                      </span>
                    </td>
                    <td style={{ fontWeight: c.isMe ? 900 : 600, color: c.isMe ? "var(--pp-brand-accent-2)" : "var(--pp-text-primary)" }}>
                      {c.broker}{c.isMe ? ` · ${isFr ? "moi" : "me"}` : ""}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{fmtMoney(c.volume)}</td>
                    <td style={{ textAlign: "right", minWidth: 96 }}>
                      <div style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>{share.toFixed(1)} %</div>
                      <div className="ov3d-track" style={{ ["--ov3d-c" as any]: accent }}>
                        <div className="ov3d-fill" style={{ width: `${maxVolume ? (c.volume / maxVolume) * 100 : 0}%` }} />
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>{fmtNum(c.deals)}</td>
                    <td style={{ textAlign: "right" }}>{fmtMoney(c.commission)}</td>
                    <td style={{ textAlign: "right" }}>{fmtMoney(c.avgDeal)}</td>
                    <td style={{ textAlign: "right" }}>{fmtBps(c.bps)}</td>
                    <td style={{ textAlign: "right" }}><Delta value={c.volumeYoy} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", marginTop: 12 }}>
        <Panel title={isFr ? "Ma saison mois par mois (août → juillet)" : "My season month by month (Aug → Jul)"}>
          <Chart3D>
            <div style={{ height: 260 }}>
              <ResponsiveContainer>
                <ComposedChart data={monthlyData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                  <Ov3DGradients colors={gradientColors} />
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,.16)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} tickFormatter={(v) => fmtCompact(Number(v))} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar name="Volume" dataKey="volume" fill={fill3d("#8B5CF6")} radius={[7, 7, 3, 3]} filter="url(#ov3dExtrude)" />
                  <Line name="Commission" dataKey="commission" stroke={GOLD} strokeWidth={2.5} dot={false} filter="url(#ov3dSoft)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Chart3D>
        </Panel>

        <Panel title={isFr ? "Volume cumulé de la saison" : "Season cumulative volume"}>
          <Chart3D>
            <div style={{ height: 260 }}>
              <ResponsiveContainer>
                <AreaChart data={cumulative} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                  <Ov3DGradients colors={gradientColors} />
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,.16)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} tickFormatter={(v) => fmtCompact(Number(v))} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
                  <Area name={isFr ? "Cumulé" : "Cumulative"} dataKey="cumul" stroke={GOLD} strokeWidth={2.5} fill={areaFill3d(GOLD)} filter="url(#ov3dSoft)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Chart3D>
        </Panel>

        <Panel title={isFr ? "Répartition du volume du club" : "Club volume split"}>
          <Chart3D>
            <div style={{ height: 270 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Ov3DGradients colors={gradientColors} />
                  <Pie
                    data={shareData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}
                    paddingAngle={2} stroke="rgba(0,0,0,.35)" filter="url(#ov3dExtrude)"
                  >
                    {shareData.map((_, i) => <Cell key={i} fill={fill3d(PALETTE[i % PALETTE.length])} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Chart3D>
        </Panel>

        {radarData.length > 0 && (
          <Panel title={isFr ? "Mon profil vs moyenne du club" : "My profile vs club average"} subtitle={isFr ? "Base 100 = moyenne du club" : "Base 100 = club average"}>
            <Chart3D>
              <div style={{ height: 270 }}>
                <ResponsiveContainer>
                  <RadarChart data={radarData} outerRadius={95}>
                    <Ov3DGradients colors={gradientColors} />
                    <PolarGrid stroke="rgba(127,127,127,.22)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "var(--pp-text-muted)" }} />
                    <PolarRadiusAxis tick={{ fontSize: 9, fill: "var(--pp-text-muted)" }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [`${Number(v).toFixed(0)}`, n]} />
                    <Radar name={isFr ? "Moyenne club" : "Club avg"} dataKey="club" stroke="#4472C4" fill={areaFill3d("#4472C4")} strokeWidth={1.5} />
                    <Radar name={isFr ? "Moi" : "Me"} dataKey="me" stroke={GOLD} fill={areaFill3d(GOLD)} strokeWidth={2.5} filter="url(#ov3dSoft)" />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Chart3D>
          </Panel>
        )}
      </div>

      {seasonBars.length > 0 && (
        <Panel title={isFr ? "Comparatif des 4 dernières saisons" : "Last 4 seasons comparison"}>
          <Chart3D>
            <div style={{ height: 280 }}>
              <ResponsiveContainer>
                <ComposedChart data={seasonBars} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                  <Ov3DGradients colors={gradientColors} />
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,.16)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--pp-text-muted)" }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} tickFormatter={(v) => fmtCompact(Number(v))} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [n === (isFr ? "Dossiers" : "Deals") ? fmtNum(Number(v)) : fmtMoney(Number(v)), n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="l" name="Volume" dataKey="volume" fill={fill3d("#4472C4")} radius={[8, 8, 3, 3]} filter="url(#ov3dExtrude)" />
                  <Bar yAxisId="l" name="Commission" dataKey="commission" fill={fill3d(GOLD)} radius={[8, 8, 3, 3]} filter="url(#ov3dExtrude)" />
                  <Line yAxisId="r" name={isFr ? "Dossiers" : "Deals"} dataKey="deals" stroke="#70AD47" strokeWidth={2.5} dot={{ r: 3 }} filter="url(#ov3dSoft)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Chart3D>

          <div className="overflow-x-auto mt-3">
            <table className="ov3d-table">
              <thead>
                <tr>
                  {[isFr ? "Saison" : "Season", "Volume", isFr ? "Doss." : "Deals", "Commission", isFr ? "Doss. moy." : "Avg deal", "BPS", "YoY vol.", "YoY doss.", "YoY comm."].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.label} className="ov3d-row" style={{ ["--ov3d-accent" as any]: GOLD }}>
                    <td style={{ fontWeight: 800 }}>{s.label}</td>
                    <td style={{ textAlign: "right" }}>{fmtMoney(s.volume)}</td>
                    <td style={{ textAlign: "right" }}>{fmtNum(s.deals)}</td>
                    <td style={{ textAlign: "right" }}>{fmtMoney(s.commission)}</td>
                    <td style={{ textAlign: "right" }}>{fmtMoney(s.avgDeal)}</td>
                    <td style={{ textAlign: "right" }}>{fmtBps(s.bps)}</td>
                    <td style={{ textAlign: "right" }}><Delta value={s.volumeYoy} /></td>
                    <td style={{ textAlign: "right" }}><Delta value={s.dealYoy} /></td>
                    <td style={{ textAlign: "right" }}><Delta value={s.commissionYoy} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {seasons.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", marginTop: 12 }}>
          {seasons.map((s) => (
            <Panel key={s.label} title={s.label} subtitle={`${fmtMoney(s.volume)} · ${fmtNum(s.deals)} ${isFr ? "dossiers" : "deals"}`}>
              <Chart3D>
                <div style={{ height: 170 }}>
                  <ResponsiveContainer>
                    <BarChart data={(s.monthly ?? []).map((m: any) => ({ name: MONTHS[m.month - 1], ...m }))} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                      <Ov3DGradients colors={gradientColors} />
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,.14)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--pp-text-muted)" }} />
                      <YAxis tick={{ fontSize: 9, fill: "var(--pp-text-muted)" }} tickFormatter={(v) => fmtCompact(Number(v))} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
                      <Bar name="Volume" dataKey="volume" fill={fill3d("#4472C4")} radius={[6, 6, 2, 2]} filter="url(#ov3dExtrude)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Chart3D>
            </Panel>
          ))}
        </div>
      )}

      <Panel title={isFr ? "Notes de lecture" : "Reading notes"}>
        <ul style={{ fontSize: 12, color: "var(--pp-text-secondary)", lineHeight: 1.7, paddingLeft: 18, listStyle: "disc" }}>
          <li>{isFr
            ? "La saison Club Excellence couvre du 1er août au 31 juillet; les rangs sont calculés sur le volume déboursé de la saison en cours."
            : "The Club Excellence season runs from August 1 to July 31; ranks are based on funded volume for the current season."}</li>
          <li>{isFr
            ? "Le volume est dédupliqué par dossier (une seule tranche par numéro de dossier) pour éviter de compter deux fois les commissions multiples."
            : "Volume is deduplicated per deal (one tranche per deal number) to avoid double counting multiple commissions."}</li>
          <li>{isFr
            ? "Le BPS = commission / volume × 10 000. La part du club correspond au poids du courtier dans le volume total de la saison."
            : "BPS = commission / volume × 10,000. Club share is the broker's weight in the season's total volume."}</li>
          <li>{isFr
            ? "Les courtiers voient le classement nominatif complet, mais uniquement le détail de leurs propres dossiers."
            : "Brokers see the full nominative standings, but only the detail of their own deals."}</li>
        </ul>
        <div className="flex items-center gap-1.5 mt-2" style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>
          <Info className="w-3.5 h-3.5" />
          {isFr ? "Source : registre des dépôts importé (2022–2026)." : "Source: imported deposit register (2022–2026)."}
        </div>
      </Panel>
    </div>
  );
}

const ED_ACCENT = "#EC4899";
