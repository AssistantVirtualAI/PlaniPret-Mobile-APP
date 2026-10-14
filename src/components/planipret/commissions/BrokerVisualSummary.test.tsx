import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BrokerVisualSummary from "./BrokerVisualSummary";

vi.mock("recharts", () => {
  const Box = ({ children, onClick }: any) => <div onClick={onClick}>{children}</div>;
  const Bar = ({ onClick, children }: any) => <button type="button" aria-label="chart-bar" onClick={() => onClick?.({ payload: { brokerKey: "broker:a", linked: true } })}>{children}</button>;
  return {
    ResponsiveContainer: Box, BarChart: Box, ComposedChart: Box,
    Bar, XAxis: Box, YAxis: Box, CartesianGrid: Box, Tooltip: Box, Legend: Box,
    Line: Box, Cell: Box,
  };
});

const brokers = [
  { brokerKey: "broker:a", linked: true, firstName: "Alexandre", lastName: "Lapointe", volume: 900000, commission: 9000, deals: 6 },
  { brokerKey: "broker:b", linked: true, firstName: "Gilles", lastName: "Bouillon", volume: 600000, commission: 7200, deals: 3 },
];

describe("BrokerVisualSummary", () => {
  it("présente quatre graphiques calculés uniquement depuis le registre", () => {
    render(<BrokerVisualSummary lang="fr" brokers={brokers} />);
    expect(screen.getByText("Part des commissions — top 8")).toBeVisible();
    expect(screen.getByText("Volume et commission — top 8")).toBeVisible();
    expect(screen.getByText("Dossiers par courtier — top 8")).toBeVisible();
    expect(screen.getByText("Dossier moyen — top 8")).toBeVisible();
  });

  it("transmet l’identité stable lors d’un clic graphique", () => {
    const select = vi.fn();
    render(<BrokerVisualSummary lang="fr" brokers={brokers} onSelect={select} />);
    fireEvent.click(screen.getAllByRole("button", { name: "chart-bar" })[0]);
    expect(select).toHaveBeenCalledWith("broker:a");
  });
});
