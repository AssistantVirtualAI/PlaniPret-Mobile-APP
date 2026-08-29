/**
 * E2E (parité portail) — écran mobile Tâches (MTasks + TasksSection).
 *
 * Couvre :
 *  - rendu de la liste (sections en retard / aujourd'hui / à venir)
 *  - filtres par onglet
 *  - rafraîchissement
 *  - état vide et état d'erreur avec bouton Réessayer
 *  - lien « Ouvrir dans Maestro »
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn().mockResolvedValue(undefined);
const setFilter = vi.fn();
const openWindow = vi.fn();

let hookState: any;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { maestro_broker_id: 387460525 }, error: null }) }) }),
    }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/planipret/mobile/TaskComposerSheet", () => ({ default: () => null }));

vi.mock("@/hooks/planipret/usePlanipretTasks", () => ({
  usePlanipretTasks: () => hookState,
}));

import MTasks from "../MTasks";

const task = (id: string, notes: string, due: string) => ({
  id,
  notes,
  description: "",
  due_at: due,
  status: "open",
  xid: null,
  target_name: "Jean-Éric Gagnon",
  is_recurring: false,
  created_by_ava: false,
  sync_status: "synced",
  sync_reason: "ok",
});

const OVERDUE = task("t1", "Rappeler le client", "2020-01-01T15:00:00Z");
const TODAY = task("t2", "Envoyer les documents", new Date().toISOString());
const UPCOMING = task("t3", "Suivi hypothèque", new Date(Date.now() + 86400000 * 3).toISOString());

function baseState(over: Partial<any> = {}) {
  return {
    tasks: [OVERDUE, TODAY, UPCOMING],
    buckets: { overdue: [OVERDUE], today: [TODAY], upcoming: [UPCOMING] },
    counts: { overdue: 1, today: 1, upcoming: 1, open: 3, all: 3 },
    openCount: 3,
    filter: "open",
    setFilter,
    page: 1,
    total: 3,
    hasMore: false,
    loadMore: vi.fn(),
    loadingMore: false,
    loading: false,
    refreshing: false,
    source: "maestro",
    error: null,
    message: null,
    refresh,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  refresh.mockClear();
  setFilter.mockClear();
  openWindow.mockClear();
  hookState = baseState();
  vi.stubGlobal("open", openWindow);
  localStorage.setItem("pp_lang", "fr");
});

describe("MTasks (mobile)", () => {
  it("affiche le titre et les tâches par section", async () => {
    render(<MTasks />);
    expect(await screen.findByText("Toutes mes tâches")).toBeInTheDocument();
    expect(screen.getByText("Rappeler le client")).toBeInTheDocument();
    expect(screen.getByText("Envoyer les documents")).toBeInTheDocument();
    expect(screen.getByText("Suivi hypothèque")).toBeInTheDocument();
  });

  it("expose les onglets de filtre et déclenche setFilter", async () => {
    render(<MTasks />);
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.length).toBe(4);
    fireEvent.click(tabs[1]);
    expect(setFilter).toHaveBeenCalledWith("overdue");
  });

  it("rafraîchit la liste", async () => {
    render(<MTasks />);
    fireEvent.click(await screen.findByLabelText("Rafraîchir"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("affiche l'état vide", async () => {
    hookState = baseState({ tasks: [], buckets: { overdue: [], today: [], upcoming: [] }, counts: { overdue: 0, today: 0, upcoming: 0, open: 0, all: 0 }, openCount: 0 });
    render(<MTasks />);
    expect(await screen.findByText(/Aucune tâche ouverte/)).toBeInTheDocument();
  });

  it("affiche l'erreur avec un bouton Réessayer", async () => {
    hookState = baseState({ error: "boom", message: "Chargement impossible" });
    render(<MTasks />);
    fireEvent.click(await screen.findByText("Réessayer"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("ouvre la tâche dans Maestro", async () => {
    render(<MTasks />);
    const btns = await screen.findAllByLabelText("Ouvrir dans Maestro");
    fireEvent.click(btns[0]);
    await waitFor(() => expect(openWindow).toHaveBeenCalled());
  });
});
