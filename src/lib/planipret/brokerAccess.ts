/**
 * Broker portal access control.
 *
 * Rule: a broker may ONLY ever read rows whose `user_id` equals their own
 * auth uid. The database already enforces this (RLS `pp_calls_self`,
 * `pp_msg_self`, `pp_vm_self`, `planipret_recording_uploads`), but every
 * client query MUST also scope explicitly so a crafted URL can never widen
 * the result set (no broker id ever comes from the URL / query string).
 */
import { supabase } from "@/integrations/supabase/client";

export type BrokerAccess =
  | { state: "anon" }
  | { state: "denied"; reason: "lemtel" | "no-profile" }
  | { state: "ready"; userId: string; profile: any };

const PROFILE_FIELDS =
  "user_id, full_name, email, extension, role, language, mobile_app_enabled, maestro_broker_id";

export async function resolveBrokerAccess(): Promise<BrokerAccess> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return { state: "anon" };

  // Never trust the URL: the identity always comes from the verified session.
  const { data: profile } = await supabase
    .from("planipret_profiles")
    .select(PROFILE_FIELDS)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    // A Lemtel-only account must never land inside the Planiprêt portal.
    const { data: lemtelOnly } = await supabase.rpc("is_lemtel_only", { _user_id: user.id });
    if (lemtelOnly) return { state: "denied", reason: "lemtel" };

    const { data: isMember } = await supabase.rpc("is_planipret_member", { _user_id: user.id });
    if (!isMember) return { state: "denied", reason: "no-profile" };

    return { state: "ready", userId: user.id, profile: { user_id: user.id, email: user.email, full_name: user.email, role: "broker" } };
  }

  return { state: "ready", userId: user.id, profile };
}

/**
 * Scoped SELECT builder — the single entry point every broker page must use.
 * Throws instead of querying when the session id is missing, so a render race
 * can never issue an unscoped (all-brokers) request.
 */
export function brokerSelect(
  table: "planipret_phone_calls" | "planipret_phone_messages" | "planipret_voicemails",
  userId: string,
  columns = "*",
  opts?: { count?: "exact" },
): any {
  if (!userId) throw new Error("brokerSelect called without an authenticated broker id");
  return (supabase.from(table) as any).select(columns, opts as any).eq("user_id", userId);
}

/** Guard used before mutating a row loaded in a detail view. */
export function assertOwnRow(row: any, userId: string): boolean {
  return Boolean(row) && Boolean(userId) && row.user_id === userId;
}

/** Shared PostgREST `or()` search fragment per table. */
export function searchFilter(table: string, term: string): string {
  const t = term.replace(/[%,()]/g, "").trim();
  if (!t) return "";
  if (table === "planipret_phone_messages") {
    return `from_number.ilike.%${t}%,to_number.ilike.%${t}%,body.ilike.%${t}%`;
  }
  if (table === "planipret_voicemails") {
    return `from_number.ilike.%${t}%,from_name.ilike.%${t}%,transcript.ilike.%${t}%`;
  }
  return `from_number.ilike.%${t}%,to_number.ilike.%${t}%,from_name.ilike.%${t}%,to_name.ilike.%${t}%,ai_summary.ilike.%${t}%`;
}

/** Period presets shared by every broker list page. */
export type BrokerPeriod = "" | "today" | "7d" | "30d" | "90d";

export function periodStartISO(period: BrokerPeriod): string | null {
  if (!period) return null;
  const d = new Date();
  if (period === "today") { d.setHours(0, 0, 0, 0); return d.toISOString(); }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export const PERIOD_OPTIONS: { value: BrokerPeriod; fr: string; en: string }[] = [
  { value: "", fr: "Toute la période", en: "All time" },
  { value: "today", fr: "Aujourd'hui", en: "Today" },
  { value: "7d", fr: "7 derniers jours", en: "Last 7 days" },
  { value: "30d", fr: "30 derniers jours", en: "Last 30 days" },
  { value: "90d", fr: "90 derniers jours", en: "Last 90 days" },
];
