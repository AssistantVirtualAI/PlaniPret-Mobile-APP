/**
 * Regroupe les données Maestro par client : tâches (avec alertes d'échéance),
 * dossiers locaux et dépôts de commission. Utilisé par la vue admin « Clients
 * Maestro » et par le suivi client de l'app mobile.
 */
import { supabase } from "@/integrations/supabase/client";
import type { NormalizedTask } from "@/lib/planipret/tasks";

export interface ClientDeposit {
  id?: string | number;
  target_name?: string | null;
  amount?: number | null;
  date_trans?: string | null;
  number?: string | null;
  institution?: string | null;
  commission_type?: string | null;
}

export interface ClientDeal {
  id: string;
  user_id?: string | null;
  contact_name: string | null;
  contact_number: string | null;
  stage: string | null;
  value_estimate: number | null;
  maestro_contact_id: string | null;
  updated_at: string | null;
}

export interface ClientCall {
  id: string;
  user_id?: string | null;
  direction: string | null;
  status: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  from_number: string | null;
  to_number: string | null;
  from_name: string | null;
  to_name: string | null;
  ai_summary: string | null;
  recording_url: string | null;
  /** Heure exacte de fin d'appel et réponse du courtier à la feuille de fin d'appel. */
  ended_at?: string | null;
  save_consent?: string | null;
  save_consent_at?: string | null;
  save_consent_channel?: string | null;
  /** Client Maestro rattaché manuellement ou par la synchro. */
  maestro_client_name?: string | null;
  maestro_client_id?: string | null;
}

export interface ClientMessage {
  id: string;
  user_id?: string | null;
  direction: string | null;
  body: string | null;
  created_at: string | null;
  from_number: string | null;
  to_number: string | null;
}

export interface ClientBundle {
  key: string;
  name: string;
  tasks: NormalizedTask[];
  overdue: number;
  today: number;
  upcoming: number;
  nextDue: string | null;
  deals: ClientDeal[];
  deposits: ClientDeposit[];
  depositTotal: number;
  calls: ClientCall[];
  messages: ClientMessage[];
  /** Courtiers (user_id) ayant une activité avec ce client. */
  brokerIds: string[];
}

/** Derniers 10 chiffres d'un numéro, pour comparer des formats différents. */
export const digits10 = (v: string | null | undefined) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

export const clientKey = (name: string | null | undefined) =>
  String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const DONE = new Set(["done", "completed", "complete", "closed", "termine", "terminé", "3", "4"]);

const dayBounds = () => {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
};

/** Assemble un bundle par client à partir des tâches, dossiers et dépôts. */
export function buildClientBundles(
  tasks: NormalizedTask[],
  deals: ClientDeal[] = [],
  deposits: ClientDeposit[] = [],
  calls: ClientCall[] = [],
  messages: ClientMessage[] = [],
  contacts: { name: string; phone?: string | null }[] = [],
): ClientBundle[] {
  const { start, end } = dayBounds();
  const map = new Map<string, ClientBundle>();

  const ensure = (name: string | null | undefined): ClientBundle | null => {
    const label = String(name ?? "").trim();
    if (!label) return null;
    const key = clientKey(label);
    let b = map.get(key);
    if (!b) {
      b = { key, name: label, tasks: [], overdue: 0, today: 0, upcoming: 0, nextDue: null, deals: [], deposits: [], depositTotal: 0, calls: [], messages: [], brokerIds: [] };
      map.set(key, b);
    }
    return b;
  };

  for (const t of tasks) {
    const b = ensure(t.target_name ?? (t as any)?.raw?.client_name);
    if (!b) continue;
    b.tasks.push(t);
    const closed = DONE.has(String(t.status ?? "").toLowerCase());
    const at = t.due_at ? new Date(t.due_at).getTime() : NaN;
    if (!closed && Number.isFinite(at)) {
      if (at < start) b.overdue += 1;
      else if (at <= end) b.today += 1;
      else b.upcoming += 1;
      if (!b.nextDue || at < new Date(b.nextDue).getTime()) b.nextDue = t.due_at;
    }
  }

  for (const c of contacts) ensure(c.name);

  for (const d of deals) {
    const b = ensure(d.contact_name);
    if (b) b.deals.push(d);
  }

  for (const dep of deposits) {
    const b = ensure(dep.target_name);
    if (!b) continue;
    b.deposits.push(dep);
    b.depositTotal += Number(dep.amount ?? 0);
  }

  // Appels : rattachés par nom d'appelant, sinon par numéro d'un dossier.
  const byPhone = new Map<string, ClientBundle>();
  for (const b of map.values()) {
    for (const d of b.deals) {
      const k = digits10(d.contact_number);
      if (k && !byPhone.has(k)) byPhone.set(k, b);
    }
  }
  for (const c of calls) {
    // Un rattachement explicite (maestro_client_name) crée le client au besoin.
    if (c.maestro_client_name) {
      const forced = ensure(c.maestro_client_name);
      if (forced) { forced.calls.push(c); continue; }
    }
    const named = [c.from_name, c.to_name].map((n) => clientKey(n)).find((k) => k && map.has(k));
    let b = named ? map.get(named)! : undefined;
    if (!b) {
      const k = [c.from_number, c.to_number].map(digits10).find((x) => x && byPhone.has(x));
      if (k) b = byPhone.get(k);
    }
    if (b) b.calls.push(c);
  }
  // Textos : rattachés par numéro (dossier, contact ou appel déjà rattaché).
  for (const b of map.values()) {
    for (const c of b.calls) {
      for (const k of [digits10(c.from_number), digits10(c.to_number)]) {
        if (k && !byPhone.has(k)) byPhone.set(k, b);
      }
    }
  }
  for (const m of messages) {
    const k = [m.from_number, m.to_number].map(digits10).find((x) => x && byPhone.has(x));
    if (k) byPhone.get(k)!.messages.push(m);
  }

  for (const b of map.values()) {
    const owners = new Set<string>();
    for (const x of [...b.calls, ...b.messages, ...b.deals] as any[]) {
      if (x?.user_id) owners.add(String(x.user_id));
    }
    b.brokerIds = [...owners];
    b.messages.sort((x, y) => new Date(y.created_at ?? 0).getTime() - new Date(x.created_at ?? 0).getTime());
    b.calls.sort((x, y) => new Date(y.started_at ?? 0).getTime() - new Date(x.started_at ?? 0).getTime());
  }

  return [...map.values()].sort((a, b) => {
    const w = (x: ClientBundle) => x.overdue * 100 + x.today * 10 + x.upcoming;
    return w(b) - w(a) || a.name.localeCompare(b.name);
  });
}

/** Dépôts de commission des `months` derniers mois (source Maestro officielle). */
export async function fetchClientDeposits(months = 24): Promise<ClientDeposit[]> {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth() - months, 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  try {
    const { data, error } = await supabase.functions.invoke("planipret-commission-reports", {
      body: {
        action: "deposits",
        filters: { date_from: iso(from), date_to: iso(to), commission_type: "base", order_by: "date_trans", sort: "desc", page: 1, per_page: 500 },
      },
    });
    if (error || (data as any)?.error) return [];
    return (((data as any)?.rows ?? []) as ClientDeposit[]);
  } catch {
    return [];
  }
}

/** Dossiers locaux (pipeline) pour un ou plusieurs propriétaires. */
export async function fetchClientDeals(userIds: string[]): Promise<ClientDeal[]> {
  const ids = userIds.filter(Boolean);
  if (!ids.length) return [];
  const { data } = await supabase
    .from("planipret_pipeline")
    .select("id, user_id, contact_name, contact_number, stage, value_estimate, maestro_contact_id, updated_at")
    .in("user_id", ids)
    .order("updated_at", { ascending: false })
    .limit(300);
  return ((data ?? []) as ClientDeal[]);
}

/** Historique d'appels local pour un ou plusieurs propriétaires. */
export async function fetchClientCalls(userIds: string[], limit = 500): Promise<ClientCall[]> {
  const ids = userIds.filter(Boolean);
  if (!ids.length) return [];
  const { data } = await supabase
    .from("planipret_phone_calls")
    .select("id, user_id, direction, status, started_at, duration_seconds, from_number, to_number, from_name, to_name, ai_summary, recording_url, maestro_client_name, maestro_client_id, ended_at, save_consent, save_consent_at, save_consent_channel")
    .in("user_id", ids)
    .order("started_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as ClientCall[]);
}

/** Textos locaux pour un ou plusieurs propriétaires. */
export async function fetchClientMessages(userIds: string[], limit = 500): Promise<ClientMessage[]> {
  const ids = userIds.filter(Boolean);
  if (!ids.length) return [];
  const { data } = await supabase
    .from("planipret_phone_messages")
    .select("id, user_id, direction, body, created_at, from_number, to_number")
    .in("user_id", ids)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as ClientMessage[]);
}

/** Clients Maestro en direct (API officielle) — utilisé en secours du cache local. */
export async function fetchMaestroClientsLive(
  search?: string,
  limit = 200,
): Promise<{ name: string; phone: string | null }[]> {
  try {
    const { data, error } = await supabase.functions.invoke("maestro-actions", {
      body: { action: "list_clients", payload: { limit, search: search || undefined } },
    });
    if (error) return [];
    const rows: any[] = Array.isArray((data as any)?.clients) ? (data as any).clients : [];
    return rows
      .map((c) => ({
        name: String(
          c.full_name ?? c.display_name ??
          [c.first_name ?? c.firstname, c.last_name ?? c.lastname].filter(Boolean).join(" ") ??
          c.name ?? "",
        ).trim(),
        phone: (c.phone ?? c.mobile ?? c.cell_phone ?? c.phone_number ?? null) as string | null,
      }))
      .filter((c) => c.name);
  } catch {
    return [];
  }
}

/** Contacts Maestro du courtier — base de la liste « clients ». */
export async function fetchClientContacts(
  userIds: string[],
  opts: { search?: string; limit?: number } = {},
): Promise<{ name: string; phone: string | null }[]> {
  const ids = userIds.filter(Boolean);
  const term = String(opts.search ?? "").trim();
  let local: { name: string; phone: string | null }[] = [];
  if (ids.length) {
    let q = supabase
      .from("planipret_contacts")
      .select("full_name, first_name, last_name, phone, mobile, updated_at")
      .in("user_id", ids)
      .order("updated_at", { ascending: false })
      .limit(opts.limit ?? (term ? 100 : 200));
    if (term) {
      const esc = term.replace(/[%,]/g, " ");
      q = q.or(`full_name.ilike.%${esc}%,first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,phone.ilike.%${esc}%,mobile.ilike.%${esc}%`);
    }
    const { data } = await q;
    local = ((data ?? []) as any[])
      .map((c) => ({
        name: String(c.full_name ?? [c.first_name, c.last_name].filter(Boolean).join(" ") ?? "").trim(),
        phone: (c.phone ?? c.mobile ?? null) as string | null,
      }))
      .filter((c) => c.name);
  }
  if (local.length) return local;
  // Secours : interroger Maestro en direct (cache local vide ou pas encore synchronisé).
  return await fetchMaestroClientsLive(term, opts.limit ?? 200);
}
