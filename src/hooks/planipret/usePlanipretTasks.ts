import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  bucketTasks,
  createTask as apiCreate,
  deleteTask as apiDelete,
  listTasks,
  loadTaskCache,
  saveTaskCache,
  updateTask as apiUpdate,
  type NormalizedTask,
  type TaskFilterValue,
  type TaskListResult,
  type TaskSource,
} from "@/lib/planipret/tasks";

const PAGE_SIZE = 20;

const taskRequests = new Map<string, Promise<TaskListResult>>();

function listKey(userId: string, brokerId: string | null, filter: TaskFilterValue, page: number) {
  return `${userId}:${brokerId ?? "self"}:${filter}:${page}`;
}

async function readTasks(
  userId: string,
  brokerId: string | null,
  filter: TaskFilterValue,
  page: number,
  _force: boolean,
): Promise<TaskListResult> {
  const key = listKey(userId, brokerId, filter, page);
  const pending = taskRequests.get(key);
  if (pending) return pending;

  const request = listTasks({ filter, page, limit: PAGE_SIZE, broker_id: brokerId })
    .then((result) => result)
    .finally(() => { taskRequests.delete(key); });
  taskRequests.set(key, request);
  return request;
}

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
  refresh: (options?: { force?: boolean }) => Promise<void>;
  create: (input: Record<string, unknown>) => Promise<any>;
  update: (taskId: string, changes: Record<string, unknown>) => Promise<any>;
  remove: (taskId: string) => Promise<any>;
}

export interface UsePlanipretTasksOptions {
  /** Admin only: scope the list to another broker's Maestro id (read-only). */
  brokerId?: string | null;
  /** First filter rendered by an embedded read-only task view. */
  initialFilter?: TaskFilterValue;
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
  const [filter, setFilterState] = useState<TaskFilterValue>(options.initialFilter ?? "open");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState({ overdue: 0, today: 0, upcoming: 0, open: 0, all: 0 });
  const generation = useRef(0);
  const activeRefresh = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const realtimeTimer = useRef<number | null>(null);
  /** Tasks created locally in the last 5 min — merged in until the server list catches up. */
  const pending = useRef<Map<string, { task: NormalizedTask; at: number }>>(new Map());

  const mergePending = useCallback((list: NormalizedTask[]): NormalizedTask[] => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [id, value] of pending.current) if (value.at < cutoff) pending.current.delete(id);
    if (!pending.current.size) return list;
    const seen = new Set<string>();
    const merged = list.map((task) => {
      const local = pending.current.get(String(task.id));
      if (!local) return task;
      seen.add(String(task.id));
      return local.task;
    });
    for (const [id, value] of pending.current) if (!seen.has(id)) merged.push(value.task);
    return merged;
  }, []);

  const applyResult = useCallback((result: TaskListResult, currentUserId: string, currentBrokerId: string | null) => {
    if (result.success && result.source !== "unavailable") {
      setSource(result.source);
      setError(null);
      setMessage(null);
      setPage(result.page);
      setCounts(result.counts);
      setTotal(result.total);
      setHasMore(result.has_more);
      setLastSyncAt(new Date().toISOString());
      setTasks((current) => {
        // A successful-but-incomplete response must not briefly erase known
        // tasks while Maestro still reports that tasks exist.
        const next = result.tasks.length === 0 && result.counts.all > 0 && current.length > 0
          ? current
          : result.tasks;
        const merged = mergePending(next);
        if (!currentBrokerId) saveTaskCache(currentUserId, merged);
        return merged;
      });
      return;
    }

    // Never hide visible tasks because a refresh failed. This is essential on
    // iOS when switching tabs wakes the radio and one request is dropped.
    setSource(result.source ?? "unavailable");
    setError(result.error ?? "tasks_unavailable");
    setMessage(result.message ?? "Liste des tâches Maestro indisponible pour le moment.");
  }, [mergePending]);

  // Paint the per-user cache immediately, including a cached empty list. The
  // latter prevents the page from waiting forever on a slow auth/profile path.
  useEffect(() => {
    if (!userId || brokerId) return;
    const cached = loadTaskCache(userId);
    setTasks(cached);
    setLoading(false);
  }, [userId, brokerId]);

  useEffect(() => {
    if (userId) return;
    setLoading(false);
    setRefreshing(false);
    setError("task_identity_unavailable");
    setMessage("Session de tâches en cours de préparation.");
  }, [userId]);

  const refresh = useCallback(async (options: { force?: boolean } = {}) => {
    if (!userId) return;
    const force = !!options.force;
    const key = listKey(userId, brokerId, filter, 1);
    if (activeRefresh.current?.key === key) return activeRefresh.current.promise;

    const hasVisibleData = tasks.length > 0 || (!brokerId && loadTaskCache(userId).length > 0);
    const gen = ++generation.current;
    if (hasVisibleData) setRefreshing(true); else setLoading(true);

    const promise = (async () => {
      try {
        const result = await readTasks(userId, brokerId, filter, 1, force);
        if (gen !== generation.current) return;
        applyResult(result, userId, brokerId);
      } catch {
        if (gen !== generation.current) return;
        setSource("unavailable");
        setError("tasks_unavailable");
        setMessage("Liste des tâches Maestro indisponible pour le moment.");
      } finally {
        if (gen === generation.current) {
          setRefreshing(false);
          setLoading(false);
        }
        if (activeRefresh.current?.key === key) activeRefresh.current = null;
      }
    })();
    activeRefresh.current = { key, promise };
    return promise;
  }, [userId, brokerId, filter, tasks.length, applyResult]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    const next = page + 1;
    try {
      const result = await readTasks(userId, brokerId, filter, next, false);
      if (gen !== generation.current || !result.success) return;
      setPage(result.page);
      setTotal(result.total);
      setHasMore(result.has_more);
      setCounts(result.counts);
      setTasks((current) => {
        const seen = new Set(current.map((task) => task.id));
        return [...current, ...result.tasks.filter((task) => !seen.has(task.id))];
      });
    } finally {
      setLoadingMore(false);
    }
  }, [userId, brokerId, filter, page, hasMore, loadingMore]);

  const setFilter = useCallback((value: TaskFilterValue) => {
    setFilterState(value);
    setPage(1);
  }, []);

  useEffect(() => { if (userId) void refresh(); }, [userId, refresh]);

  // Screen focus must be passive: cached data is shown immediately and the
  // request is skipped for 45 seconds. It cannot create a request storm while
  // the user switches between Home, Messages, Tasks and Commissions.
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

  // Coalesce realtime bursts produced by a mutation/audit write into one live
  // read, rather than three overlapping reads of the same Maestro list.
  useEffect(() => {
    if (!userId) return;
    const scheduleRealtimeRefresh = () => {
      if (realtimeTimer.current !== null) return;
      realtimeTimer.current = window.setTimeout(() => {
        realtimeTimer.current = null;
        void refresh({ force: true });
      }, 250);
    };
    const channel = supabase.channel(`pp-tasks:${userId}`)
      .on("broadcast", { event: "tasks" }, scheduleRealtimeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_tasks_projection" }, scheduleRealtimeRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_task_mutations" }, scheduleRealtimeRefresh)
      .subscribe();
    return () => {
      if (realtimeTimer.current !== null) window.clearTimeout(realtimeTimer.current);
      realtimeTimer.current = null;
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const create = useCallback(async (input: Record<string, unknown>) => {
    const result = await apiCreate(input);
    if (result?.success) {
      if (result.task?.id) {
        const id = String(result.task.id);
        pending.current.set(id, { task: result.task, at: Date.now() });
        setTasks((current) => (current.some((task) => String(task.id) === id) ? current : [...current, result.task]));
        setCounts((current) => ({ ...current, open: current.open + 1, all: current.all + 1 }));
      }
      // The write response is the authoritative immediate result. Do not keep
      // the form busy waiting for an eventually-consistent list refresh.
      void refresh({ force: true });
    }
    return result;
  }, [refresh]);

  const update = useCallback(async (taskId: string, changes: Record<string, unknown>) => {
    const previous = tasks;
    const id = String(taskId);
    const patch = (task: NormalizedTask): NormalizedTask => {
      const next: NormalizedTask = { ...task };
      const due = changes.date ?? changes.due_at;
      if (due) {
        const date = new Date(String(due));
        if (!Number.isNaN(date.getTime())) next.due_at = date.toISOString();
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
    setTasks((current) => current.map((task) => (String(task.id) === id ? patch(task) : task)));
    const result = await apiUpdate(taskId, changes);
    if (!result?.success) { setTasks(previous); return result; }

    const base = previous.find((task) => String(task.id) === id);
    const edited: NormalizedTask | null = result.task?.id
      ? { ...(base ?? ({} as NormalizedTask)), ...result.task }
      : base ? patch(base) : null;
    if (edited) {
      pending.current.set(id, { task: edited, at: Date.now() });
      setTasks((current) => {
        const merged = current.map((task) => (String(task.id) === id ? edited : task));
        if (userId) saveTaskCache(userId, merged);
        return merged;
      });
    }
    void refresh({ force: true });
    return result;
  }, [tasks, refresh, userId]);

  const remove = useCallback(async (taskId: string) => {
    const previous = tasks;
    setTasks((current) => current.filter((task) => task.id !== taskId));
    pending.current.delete(String(taskId));
    const result = await apiDelete(taskId);
    if (!result?.success) setTasks(previous); else void refresh({ force: true });
    return result;
  }, [tasks, refresh]);

  const buckets = useMemo(() => bucketTasks(tasks), [tasks]);
  const openCount = counts.open || (buckets.overdue.length + buckets.today.length + buckets.upcoming.length);
  const visibleCounts = useMemo(() => ({
    overdue: counts.overdue || buckets.overdue.length,
    today: counts.today || buckets.today.length,
    upcoming: counts.upcoming || buckets.upcoming.length,
    open: openCount,
    all: counts.all || total || tasks.length,
  }), [counts, buckets, openCount, total, tasks.length]);

  return {
    tasks, buckets, counts: visibleCounts, openCount, filter, setFilter, page, total, hasMore,
    loadMore, loadingMore, loading, refreshing, lastSyncAt, source, error, message,
    refresh, create, update, remove,
  };
}
