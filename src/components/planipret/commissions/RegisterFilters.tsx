import { useEffect, useState } from "react";
import { Users, Landmark, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { causeLabel, coverageFor, type CoverageMap } from "@/lib/planipret/brokerCoverage";

export type Granularity = "week" | "month" | "quarter" | "year" | "ytd";

const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const selStyle: React.CSSProperties = {
  background: "var(--pp-bg-elevated)",
  border: "1px solid var(--pp-bg-border)",
  color: "var(--pp-text-primary)",
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 10,
  padding: "6px 10px",
};

export function isoWeeksInYear(y: number): number {
  const dec28 = new Date(Date.UTC(y, 11, 28));
  const dow = dec28.getUTCDay() || 7;
  const thu = new Date(dec28.getTime() + (4 - dow) * 86400000);
  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  return Math.ceil(((thu.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
}

export default function RegisterFilters({
  lang, years, year, onYear,
  granularity, onGranularity,
  periodIndex, onPeriodIndex,
  agents, agent, onAgent, agentsWithData = [], coverage,
  showAgent,
  lenders = [], lender = "", onLender,
}: {
  lang: "fr" | "en";
  years: number[];
  year: number;
  onYear: (y: number) => void;
  granularity: Granularity;
  onGranularity: (g: Granularity) => void;
  periodIndex: number;
  onPeriodIndex: (i: number) => void;
  agents: string[];
  agentsWithData?: string[];
  coverage?: CoverageMap;
  agent: string;

  onAgent: (a: string) => void;
  showAgent: boolean;
  lenders?: string[];
  lender?: string;
  onLender?: (l: string) => void;
}) {
  const isFr = lang === "fr";
  const [nameSearch, setNameSearch] = useState("");
  const matchingAgents = agents.filter(a => a.toLocaleLowerCase().includes(nameSearch.trim().toLocaleLowerCase()) || a === agent);
  const MONTHS = isFr ? MONTHS_FR : MONTHS_EN;

  const grans: { key: Granularity; label: string }[] = [
    { key: "week", label: isFr ? "Semaine" : "Week" },
    { key: "month", label: isFr ? "Mois" : "Month" },
    { key: "quarter", label: isFr ? "Trimestre" : "Quarter" },
    { key: "ytd", label: isFr ? "Cumul annuel" : "Year to date" },
    { key: "year", label: isFr ? "Année" : "Year" },
  ];

  // Never offer future periods for the year in progress: the prior-year comparison
  // always covers the exact same date interval (Jan -> selected month).
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  const maxMonth = isCurrentYear ? now.getMonth() + 1 : 12;

  const periodOptions = (): { value: number; label: string }[] => {
    if (granularity === "week") {
      const maxWeek = isCurrentYear
        ? Math.min(isoWeeksInYear(year), Math.ceil(((now.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7))
        : isoWeeksInYear(year);
      return Array.from({ length: maxWeek }, (_, i) => ({
        value: i + 1,
        label: isFr ? `Semaine ${i + 1}` : `Week ${i + 1}`,
      }));
    }
    if (granularity === "month") return MONTHS.slice(0, maxMonth).map((m, i) => ({ value: i + 1, label: m }));
    if (granularity === "quarter") {
      return [1, 2, 3, 4].filter((q) => q <= Math.ceil(maxMonth / 3)).map((q) => ({ value: q, label: `Q${q}` }));
    }
    if (granularity === "ytd") {
      return MONTHS.slice(0, maxMonth).map((m, i) => ({ value: i + 1, label: isFr ? `Jusqu'à ${m}` : `Through ${m}` }));
    }
    return [];
  };

  const options = periodOptions();
  const maxOption = options.length ? options[options.length - 1].value : 0;

  useEffect(() => {
    if (maxOption && periodIndex > maxOption) onPeriodIndex(maxOption);
  }, [maxOption, periodIndex, onPeriodIndex]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={isFr ? "Année déboursées" : "Paid year"} value={year} onChange={(e) => onYear(Number(e.target.value))} style={{ ...selStyle, fontWeight: 800 }}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>

      <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--pp-bg-border)" }}>
        {grans.map((g) => (
          <Button variant="ghost" size="sm"
            key={g.key}
            aria-pressed={granularity === g.key}
            onClick={() => onGranularity(g.key)}
            style={{
              fontSize: 12, fontWeight: 700, padding: "6px 10px",
              background: granularity === g.key ? "var(--pp-brand-accent-2)" : "var(--pp-bg-elevated)",
              color: granularity === g.key ? "hsl(var(--primary-foreground))" : "var(--pp-text-secondary)",
            }}
          >
            {g.label}
          </Button>
        ))}
      </div>

      {options.length > 0 && (
        <select aria-label={isFr ? "Période déboursées" : "Paid period"} value={periodIndex} onChange={(e) => onPeriodIndex(Number(e.target.value))} style={selStyle}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}

      {onLender && (
        <div className="inline-flex items-center gap-1.5">
          <Landmark className="w-3.5 h-3.5" style={{ color: "var(--pp-text-muted)" }} />
          <select
            value={lender}
            onChange={(e) => onLender(e.target.value)}
            aria-label={isFr ? "Prêteur" : "Lender"}
            style={{ ...selStyle, maxWidth: 220 }}
          >
            <option value="">{isFr ? "Tous les prêteurs" : "All lenders"}</option>
            {lenders.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      )}

      {showAgent && (
        <div className="inline-flex flex-wrap items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input aria-label={isFr ? "Rechercher un courtier déboursées" : "Search paid broker"} placeholder={isFr ? "Rechercher par nom" : "Search by name"} value={nameSearch} onChange={e => setNameSearch(e.target.value)} style={selStyle} className="w-44" />
          <Users className="w-3.5 h-3.5" style={{ color: "var(--pp-text-muted)" }} />
          <select aria-label={isFr ? "Courtier déboursées" : "Paid broker"} value={agent} onChange={(e) => onAgent(e.target.value)} style={{ ...selStyle, maxWidth: 280 }}>
            <option value="">
              {isFr ? `Vue globale — tous les courtiers (${agents.length})` : `Global view — all brokers (${agents.length})`}
            </option>
            {matchingAgents.map((a) => {
              const hasData = agentsWithData.length === 0 || agentsWithData.includes(a);
              const cause = coverage ? coverageFor(coverage, a).cause : null;
              const why = !hasData
                ? cause && cause !== "ok"
                  ? causeLabel(cause, isFr)
                  : (isFr ? "aucune donnée" : "no data")
                : null;
              return (
                <option key={a} value={a} title={why ?? undefined}>
                  {why ? `${a} — ${why}` : a}
                </option>
              );
            })}
          </select>

        </div>
      )}
    </div>
  );
}
