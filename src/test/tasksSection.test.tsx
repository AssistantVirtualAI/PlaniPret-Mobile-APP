import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { normalizeTask } from "../../supabase/functions/_shared/planipret-tasks";

// ── Mocks ─────────────────────────────────────────────────────────────────
const listTasks = vi.fn();
const createTask = vi.fn();
const updateTask = vi.fn();
const deleteTask = vi.fn();
let broadcastHandler: (() => void) | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: { team: [] }, error: null }) },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    channel: () => {
      // Chainable stub: TasksSection subscribes to several realtime events.
      const chan: any = {
        on: (_t: string, _f: any, cb: () => void) => { broadcastHandler = cb; return chan; },
        subscribe: () => chan,
      };
      return chan;
    },
    removeChannel: () => {},
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/planipret/tasks", async () => {
  const shared = await vi.importActual<any>("../../supabase/functions/_shared/planipret-tasks");
  return {
    ...shared,
    listTasks: (...a: any[]) => listTasks(...a),
    createTask: (...a: any[]) => createTask(...a),
    updateTask: (...a: any[]) => updateTask(...a),
    deleteTask: (...a: any[]) => deleteTask(...a),
    listClientTargets: async () => [],
    loadTaskCache: () => [],
    isTaskCacheFresh: () => false,
    taskCacheUpdatedAt: () => null,
    saveTaskCache: () => {},
    clearTaskCache: () => {},
  };
});

import TasksSection from "@/components/planipret/mobile/TasksSection";

const NOW = new Date("2026-09-02T15:00:00Z");

const TASKS = [
  { id: "a", notes: "Rappeler Jean", date: "2026-08-30 10:00:00", status: "pending" },
  { id: "b", notes: "Signer le dossier", date: "2026-09-02 18:00:00", status: "pending" },
  { id: "c", notes: "Suivi Sophie", date: "2026-09-20 10:00:00", status: "pending" },
].map(normalizeTask);

function listResult(over: any = {}) {
  return {
    success: true,
    source: "api",
    tasks: TASKS,
    buckets: { overdue: [], today: [], upcoming: [] },
    overdue_count: 1,
    counts: { overdue: 1, today: 1, upcoming: 1, open: 3, all: 3 },
    filter: "open",
    page: 1, limit: 20, total: 3, has_more: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  broadcastHandler = null;
  vi.setSystemTime(NOW);
  listTasks.mockResolvedValue(listResult());
});

describe("TasksSection", () => {
  it("renders the overdue / today / upcoming buckets", async () => {
    render(<TasksSection userId="u1" lang="fr" />);
    expect((await screen.findAllByText("Rappeler Jean"))[0]).toBeInTheDocument();
    expect(screen.getAllByText("Signer le dossier")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Suivi Sophie")[0]).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent?.replace(/\s+/g, " ").trim());
    expect(tabs).toEqual(["Ouvertes · 3", "Toutes · 3", "En retard · 1", "Aujourd'hui · 1", "À venir · 1"]);
  });

  it("shows the empty state", async () => {
    listTasks.mockResolvedValue(listResult({ tasks: [], counts: { overdue: 0, today: 0, upcoming: 0, open: 0, all: 0 } }));
    render(<TasksSection userId="u1" lang="fr" />);
    expect(await screen.findByText(/Aucune tâche ouverte/)).toBeInTheDocument();
  });

  it("shows the offline / projection notice", async () => {
    listTasks.mockResolvedValue(listResult({ source: "projection", message: "Dernier état connu" }));
    render(<TasksSection userId="u1" lang="fr" />);
    expect(await screen.findByText(/Hors ligne/)).toBeInTheDocument();
  });

  it("shows a friendly unavailable state when the API exposes no list", async () => {
    listTasks.mockResolvedValue(listResult({
      source: "unavailable", tasks: [], error: "tasks_unavailable",
      message: "Liste des tâches indisponible pour le moment.",
      counts: { overdue: 0, today: 0, upcoming: 0, open: 0, all: 0 },
    }));
    render(<TasksSection userId="u1" lang="fr" />);
    await waitFor(() => expect(listTasks).toHaveBeenCalled());
    expect(screen.getByText("Les tâches Maestro sont temporairement indisponibles.")).toBeInTheDocument();
    expect(screen.queryByText("Liste des tâches indisponible pour le moment.")).not.toBeInTheDocument();
  });

  it("hides raw transport errors behind a retry state", async () => {
    listTasks.mockResolvedValue(listResult({ success: false, error: "network_error", message: "Réseau indisponible", source: "api", tasks: [] }));
    render(<TasksSection userId="u1" lang="fr" />);
    await waitFor(() => expect(listTasks).toHaveBeenCalled());
    expect(screen.getByText("Réessayer")).toBeInTheDocument();
    expect(screen.queryByText("Réseau indisponible")).not.toBeInTheDocument();
  });

  it("keeps visible tasks when a later refresh fails", async () => {
    render(<TasksSection userId="u1" lang="fr" />);
    expect((await screen.findAllByText("Rappeler Jean"))[0]).toBeInTheDocument();
    const firstTask = screen.getAllByRole("button", { name: /Rappeler Jean/ })[0];
    fireEvent.click(firstTask);
    expect(firstTask).toHaveAttribute("aria-expanded", "true");
    listTasks.mockResolvedValue(listResult({ success: false, error: "network_error", message: "Failed to send a request to the Edge Function", source: "unavailable", tasks: [] }));
    broadcastHandler?.();
    await waitFor(() => expect(listTasks).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("Rappeler Jean")[0]).toBeInTheDocument();
    expect(firstTask).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText(/Failed to send/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Dernier état connu affiché/)).toBeInTheDocument());
  });

  it("opens the composer from the + button", async () => {
    render(<TasksSection userId="u1" lang="fr" />);
    (await screen.findAllByText("Rappeler Jean"))[0];
    fireEvent.click(screen.getByLabelText("Nouvelle tâche"));
    fireEvent.click(screen.getByText("Nouvelle tâche personnalisée"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Note")).toBeInTheDocument();
  });

  it("requires a confirmation before deleting and then calls the API", async () => {
    deleteTask.mockResolvedValue({ success: true });
    render(<TasksSection userId="u1" lang="fr" />);
    fireEvent.click((await screen.findAllByText("Rappeler Jean"))[0]);
    fireEvent.click(screen.getAllByLabelText("Supprimer")[0]);
    expect(await screen.findByText("Supprimer la tâche ?")).toBeInTheDocument();
    expect(deleteTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("alertdialog").querySelector("button:last-of-type")!);
    await waitFor(() => expect(deleteTask).toHaveBeenCalledWith("a"));
  });

  it("cancelling the delete dialog mutates nothing", async () => {
    render(<TasksSection userId="u1" lang="fr" />);
    fireEvent.click((await screen.findAllByText("Rappeler Jean"))[0]);
    fireEvent.click(screen.getAllByLabelText("Supprimer")[0]);
    fireEvent.click(await screen.findByText("Annuler"));
    await waitFor(() => expect(screen.queryByText("Supprimer la tâche ?")).not.toBeInTheDocument());
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it("snoozes a task through update", async () => {
    updateTask.mockResolvedValue({ success: true });
    render(<TasksSection userId="u1" lang="fr" />);
    fireEvent.click((await screen.findAllByText("Rappeler Jean"))[0]);
    fireEvent.click(screen.getAllByLabelText("Reporter")[0]);
    await waitFor(() => expect(updateTask).toHaveBeenCalled());
    expect(updateTask.mock.calls[0][0]).toBe("a");
  });

  it("refreshes when AVA broadcasts a task mutation", async () => {
    render(<TasksSection userId="u1" lang="fr" />);
    (await screen.findAllByText("Rappeler Jean"))[0];
    const before = listTasks.mock.calls.length;
    broadcastHandler?.();
    await waitFor(() => expect(listTasks.mock.calls.length).toBeGreaterThan(before));
  });

  it("filters through the chips", async () => {
    render(<TasksSection userId="u1" lang="fr" />);
    (await screen.findAllByText("Rappeler Jean"))[0];
    fireEvent.click(screen.getAllByRole("tab").find((t) => /En retard/.test(t.textContent ?? ""))!);
    await waitFor(() => expect(listTasks.mock.calls.some(
      ([opts]) => opts?.filter === "overdue",
    )).toBe(true));
  });
});

describe("TasksSection — see all + field errors", () => {
  it("calls onSeeAll when 'Voir tout' is pressed", async () => {
    const onSeeAll = vi.fn();
    render(<TasksSection userId="u1" lang="fr" onSeeAll={onSeeAll} />);
    await waitFor(() => expect(listTasks).toHaveBeenCalled());
    fireEvent.click(screen.getByText(/Voir tout/));
    expect(onSeeAll).toHaveBeenCalled();
  });

  it("shows per-field 422 errors returned by the gateway", async () => {
    createTask.mockResolvedValue({
      success: false,
      error: "validation_failed",
      message: "Champs invalides",
      fields: { notes: "notes_required" },
    });
    render(<TasksSection userId="u1" lang="fr" defaultTarget="387460525" />);
    await waitFor(() => expect(listTasks).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText("Nouvelle tâche"));
    fireEvent.click(screen.getByText("Nouvelle tâche personnalisée"));
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "x" } });
    fireEvent.click(screen.getByText(/^Enregistrer( la tâche)?$/));
    await waitFor(() => expect(screen.getByText("La note est obligatoire.")).toBeInTheDocument());
  });
});
