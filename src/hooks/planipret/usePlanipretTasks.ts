import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  bucketTasks,
  clearTaskCache,
  createTask as apiCreate,
  deleteTask as apiDelete,
  listTasks,
  loadTaskCache,
  saveTaskCache,
  updateTask as apiUpdate,
  type NormalizedTask,
  type TaskFilterValue,
  type TaskSource,
} from "@/lib/planipret/tasks";

const PAGE_SIZE = 20;

export interface UsePlanipretTasks {
  tasks: NormalizedTask[];
  buckets: { overdue: NormalizedTask[]; today: NormalizedTask[]; upcoming: NormalizedTask[] };
  counts: { overdue: number; today: number; upcoming: number; open: number; all: number };
  openCount: number;
  filter: TaskFilterValue;
  setFilter: (f: TaskFilterValue) => void;
  page: number;
  total: number;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  loading: boolean;
  refreshing: boolean;
  /** ISO timestamp of the last successful Maestro synchronisation. */
  lastSyncAt: string | null;
  source: TaskSource;
  error: string | null;
  message: string | null;
  refresh: () => Promise<void>;
  create: (input: Record<string, unknown>) => Promise<any>;
  update: (taskId: string, changes: Record<string, unknown>) => Promise<any>;
  remove: (taskId: string) => Promise<any>;
}

export interface UsePlanipretTasksOptions {
  /** Admin only: scope the list to another broker's Maestro id (read-only). */
  brokerId?: string | null;
}

export function usePlanipretTasks(
  userId: string | null | undefined,
  options: UsePlanipretTasksOptions = {},
): UsePlanipretTasks {
  const brokerId = options.brokerId ?? null;
  const [tasks, setTasks] = useState<NormalizedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [source, setSource] = useState<TaskSource>("projection");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilterState] = useState<TaskFilterValue>("open");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState({ overdue: 0, today: 0, upcoming: 0, open: 0, all: 0 });
  const generation = useRef(0);
  /** Tasks created locally in the last 5 min — merged in until the server list catches up. */
  const pending = useRef<Map<string, { task: NormalizedTask; at: number }>>(new Map());

  const mergePending = useCallback((list: NormalizedTask[]): NormalizedTask[] => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [id, v] of pending.current) if (v.at < cutoff) pending.current.delete(id);
    if (!pending.current.size) return list;
    // Locally-known versions win over the eventually-consistent server list.
    const seen = new Set<string>();
    const merged = list.map((t) => {
      const p = pending.current.get(String(t.id));
      if (!p) return t;
      seen.add(String(t.id));
      return p.task;
    });
    for (const [id, v] of pending.current) if (!seen.has(id)) merged.push(v.task);
    return merged;
  }, []);

  // Paint the per-user cache immediately.
  useEffect(() => {
    if (!userId || brokerId) return;
    const cached = loadTaskCache(userId);
    if (cached.length) { setTasks(cached); setLoading(false); }
  }, [userId, brokerId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const gen = ++generation.current;
    setRefreshing(true);
    const res = await listTasks({ filter, page: 1, limit: PAGE_SIZE, broker_id: brokerId });
    if (gen !== generation.current) return; // stale identity/response
    setRefreshing(false);
    setLoading(false);
    setSource(res.source);
    setError(res.success ? (res.source === "unavailable" ? res.error ?? null : null) : res.error ?? "load_failed");
    setMessage(res.message ?? null);
    setCounts(res.counts);
    setPage(res.page);
    setTotal(res.total);
    setHasMore(res.has_more);
    if (res.success && res.source !== "unavailable") {
      setLastSyncAt(new Date().toISOString());
      const merged = mergePending(res.tasks);
      setTasks(merged);
      if (!brokerId) saveTaskCache(userId, merged);
    } else if (res.source === "unavailable") {
      // Planiprêt exposes no upstream GET: never wipe what we already know.
      const fallback = mergePending(loadTaskCache(userId));
      setTasks(fallback);
      if (!fallback.length) clearTaskCache(userId);
    }
  }, [userId, filter, brokerId, mergePending]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    const next = page + 1;
    const res = await listTasks({ filter, page: next, limit: PAGE_SIZE, broker_id: brokerId });
    setLoadingMore(false);
    if (gen !== generation.current) return;
    if (!res.success) return;
    setPage(res.page);
    setTotal(res.total);
    setHasMore(res.has_more);
    setCounts(res.counts);
    setTasks((cur) => {
      const seen = new Set(cur.map((t) => t.id));
      return [...cur, ...res.tasks.filter((t) => !seen.has(t.id))];
    });
  }, [userId, filter, brokerId, page, hasMore, loadingMore]);

  const setFilter = useCallback((f: TaskFilterValue) => {
    setFilterState(f);
    setPage(1);
  }, []);

  useEffect(() => { if (userId) void refresh(); }, [userId, refresh]);

  // Refresh when the home screen comes back to the foreground.
  useEffect(() => {
    if (!userId) return;
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [userId, refresh]);

  // Realtime: AVA (or another device) mutated a task.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`pp-tasks:${userId}`)
      .on("broadcast", { event: "tasks" }, () => { void refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_tasks_projection" }, () => { void refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_task_mutations" }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, refresh]);

  const create = useCallback(async (input: Record<string, unknown>) => {
    const r = await apiCreate(input);
    if (r?.success) {
      // Paint the new task immediately — the upstream list endpoint is
      // eventually consistent (and currently undocumented).
      if (r.task?.id) {
        const id = String(r.task.id);
        pending.current.set(id, { task: r.task, at: Date.now() });
        setTasks((cur) => (cur.some((t) => String(t.id) === id) ? cur : [...cur, r.task]));
        setCounts((c) => ({ ...c, open: c.open + 1, all: c.all + 1 }));
      }
      await refresh();
    }
    return r;
  }, [refresh]);

  const update = useCallback(async (taskId: string, changes: Record<string, unknown>) => {
    const previous = tasks;
    const id = String(taskId);
    const patch = (t: NormalizedTask): NormalizedTask => {
      const next: NormalizedTask = { ...t };
      const due = changes.date ?? changes.due_at;
      if (due) {
        const d = new Date(String(due));
        if (!Number.isNaN(d.getTime())) next.due_at = d.toISOString();
      }
      if (changes.notes !== undefined) next.notes = String(changes.notes);
      if (changes.description !== undefined) next.description = changes.description ? String(changes.description) : null;
      if (changes.status !== undefined) next.status = changes.status ? String(changes.status) : null;
      if (changes.target !== undefined || changes.xid !== undefined) next.xid = String(changes.target ?? changes.xid ?? "") || null;
      if (changes.target_type !== undefined) next.type = (changes.target_type as NormalizedTask["type"]) ?? next.type;
      const assignee = changes.users_id ?? changes.assignee_id;
      if (assignee !== undefined && assignee !== null && String(assignee)) {
        next.assignee_ids = [String(assignee)];
        next.assignment_source = "users_id";
      }
      return next;
    };
    setTasks((cur) => cur.map((t) => (String(t.id) === id ? patch(t) : t)));
    const r = await apiUpdate(taskId, changes);
    if (!r?.success) { setTasks(previous); return r; }

    // Maestro's list endpoint is eventually consistent (and sometimes absent):
    // keep the edited version pinned locally so re-opening shows the changes.
    const base = previous.find((t) => String(t.id) === id);
    const edited: NormalizedTask | null = r.task?.id
      ? { ...(base ?? ({} as NormalizedTask)), ...r.task }
      : base ? patch(base) : null;
    if (edited) {
      pending.current.set(id, { task: edited, at: Date.now() });
      setTasks((cur) => {
        const merged = cur.map((t) => (String(t.id) === id ? edited : t));
        if (userId) saveTaskCache(userId, merged);
        return merged;
      });
    }
    await refresh();
    return r;
  }, [tasks, refresh, userId]);

  const remove = useCallback(async (taskId: string) => {
    const previous = tasks;
    setTasks((cur) => cur.filter((t) => t.id !== taskId));
    pending.current.delete(String(taskId));
    const r = await apiDelete(taskId);
    if (!r?.success) setTasks(previous); else await refresh();
    return r;
  }, [tasks, refresh]);

  const buckets = useMemo(() => bucketTasks(tasks), [tasks]);
  const openCount = counts.open || (buckets.overdue.length + buckets.today.length + buckets.upcoming.length);

  return {
    tasks, buckets, counts, openCount, filter, setFilter, page, total, hasMore,
    loadMore, loadingMore, loading, refreshing, lastSyncAt, source, error, message,
    refresh, create, update, remove,
  };
}
