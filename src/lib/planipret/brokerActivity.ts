import { supabase } from "@/integrations/supabase/client";

export interface ActivityCall {
  id: string;
  at: string | null;
  direction: string | null;
  status: string | null;
  from_number: string | null;
  to_number: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  ai_summary: string | null;
}

export interface ActivityMessage {
  id: string;
  at: string | null;
  direction: string | null;
  status: string | null;
  from_number: string | null;
  to_number: string | null;
  body: string | null;
}

export interface ActivityTask {
  id: string;
  at: string | null;
  title: string;
  client: string;
  status: string;
  overdue: boolean;
}

export interface BrokerActivity {
  calls: ActivityCall[];
  messages: ActivityMessage[];
  tasks: ActivityTask[];
}

const DONE = new Set(["done", "completed", "complete", "closed", "termine", "terminé", "3", "4"]);

export const isTaskDone = (status: unknown) => DONE.has(String(status ?? "").trim().toLowerCase());

const str = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s && s !== "null" && s !== "undefined" ? s : "";
};

/** Client / titre lisibles depuis le payload Maestro d'une tâche projetée. */
function readTask(row: any): ActivityTask {
  const p = (row?.payload ?? {}) as Record<string, any>;
  const raw = (p?.raw ?? {}) as Record<string, any>;
  const client =
    str(p.target_name) || str(p.client_name) || str(p.contact_name) || str(p.full_name) ||
    str(raw.client_name) || str(raw.contact_name) ||
    str(p.client?.full_name) || str(p.contact?.full_name) ||
    [str(p.first_name), str(p.last_name)].filter(Boolean).join(" ");
  const title = str(p.notes) || str(p.description) || str(p.title) || str(p.type) || "—";
  const at = row?.due_at ?? row?.created_at ?? null;
  return {
    id: String(row?.id ?? ""),
    at,
    title,
    client: client || "—",
    status: str(row?.status) || "pending",
    overdue: !isTaskDone(row?.status) && !!at && new Date(at).getTime() < Date.now(),
  };
}

/** Appels, textos et tâches d'un courtier sur `days` jours (le plus récent d'abord). */
export async function fetchBrokerActivity(userId: string, days = 7): Promise<BrokerActivity> {
  if (!userId) return { calls: [], messages: [], tasks: [] };
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [calls, messages, tasks] = await Promise.all([
    supabase.from("planipret_phone_calls")
      .select("id, started_at, created_at, direction, status, from_number, to_number, duration_seconds, recording_url, ai_summary")
      .eq("user_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    supabase.from("planipret_phone_messages")
      .select("id, created_at, direction, status, from_number, to_number, body")
      .eq("user_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    supabase.from("planipret_tasks_projection")
      .select("id, user_id, status, due_at, created_at, payload")
      .eq("user_id", userId).is("deleted_at", null).order("due_at", { ascending: false }).limit(500),
  ]);

  return {
    calls: ((calls.data ?? []) as any[]).map((c) => ({
      id: String(c.id),
      at: c.started_at ?? c.created_at ?? null,
      direction: c.direction ?? null,
      status: c.status ?? null,
      from_number: c.from_number ?? null,
      to_number: c.to_number ?? null,
      duration_seconds: c.duration_seconds ?? null,
      recording_url: c.recording_url ?? null,
      ai_summary: c.ai_summary ?? null,
    })),
    messages: ((messages.data ?? []) as any[]).map((m) => ({
      id: String(m.id),
      at: m.created_at ?? null,
      direction: m.direction ?? null,
      status: m.status ?? null,
      from_number: m.from_number ?? null,
      to_number: m.to_number ?? null,
      body: m.body ?? null,
    })),
    tasks: ((tasks.data ?? []) as any[]).map(readTask),
  };
}

/** Clé de jour locale (America/Toronto) pour regrouper un horodatage. */
export function dayKey(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function formatDayLabel(key: string, lang: "fr" | "en"): string {
  if (key === "—") return key;
  const d = new Date(`${key}T12:00:00`);
  return d.toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", { weekday: "long", day: "numeric", month: "long" });
}

export interface DailyBucket {
  day: string;
  calls: ActivityCall[];
  messages: ActivityMessage[];
  tasks: ActivityTask[];
}

/** Regroupe l'activité par date décroissante. */
export function groupActivityByDay(a: BrokerActivity): DailyBucket[] {
  const map = new Map<string, DailyBucket>();
  const get = (k: string) => {
    let b = map.get(k);
    if (!b) { b = { day: k, calls: [], messages: [], tasks: [] }; map.set(k, b); }
    return b;
  };
  for (const c of a.calls) get(dayKey(c.at)).calls.push(c);
  for (const m of a.messages) get(dayKey(m.at)).messages.push(m);
  for (const t of a.tasks) get(dayKey(t.at)).tasks.push(t);
  return [...map.values()].sort((x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : 0));
}

/** Résumé des tâches d'un courtier : ouvertes, en retard et prochaine échéance. */
export interface TaskSummary {
  open: number;
  overdue: number;
  next: ActivityTask | null;
}

export function summarizeTasks(tasks: ActivityTask[]): TaskSummary {
  const openTasks = tasks.filter((t) => !isTaskDone(t.status));
  const upcoming = openTasks
    .filter((t) => !!t.at)
    .sort((a, b) => new Date(a.at as string).getTime() - new Date(b.at as string).getTime());
  return {
    open: openTasks.length,
    overdue: openTasks.filter((t) => t.overdue).length,
    next: upcoming.find((t) => !t.overdue) ?? upcoming[0] ?? openTasks[0] ?? null,
  };
}
