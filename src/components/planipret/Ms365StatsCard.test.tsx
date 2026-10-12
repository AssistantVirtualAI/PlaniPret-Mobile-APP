import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

import Ms365StatsCard from "./Ms365StatsCard";

const response = {
  connected: true,
  days: 7,
  totals: { emails_received: 4, emails_sent: 3, emails_unread: 1, meetings: 2, meeting_minutes: 90 },
  daily: [],
  topSenders: [],
  upcomingMeetings: [],
  insights: [],
};

describe("Ms365StatsCard — coût IA", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: response, error: null });
  });

  it("ne demande pas d’insights IA au chargement de la page", async () => {
    render(<Ms365StatsCard days={7} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("ms365-stats", { body: { days: 7, insights: false } }));
    expect(screen.getByRole("button", { name: "Générer les insights AVA" })).toBeVisible();
  });

  it("demande les insights seulement au clic explicite", async () => {
    render(<Ms365StatsCard days={30} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Générer les insights AVA" }));
    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith("ms365-stats", { body: { days: 30, insights: true } }));
  });
});
