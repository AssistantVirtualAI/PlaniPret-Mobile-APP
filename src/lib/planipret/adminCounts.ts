import { supabase } from "@/integrations/supabase/client";

export type PlanipretCallFilters = {
  broker?: string;
  from?: string;
  to?: string;
  direction?: string;
  status?: string;
  ai?: string;
  search?: string;
};

export function applyPlanipretCallFilters<T extends any>(query: T, filters: PlanipretCallFilters, dateField: "started_at" | "created_at" = "started_at"): T {
  let q: any = query;
  if (filters.broker?.startsWith("ext:")) q = q.eq("extension", filters.broker.slice(4));
  else if (filters.broker?.startsWith("user:")) q = q.eq("user_id", filters.broker.slice(5));
  if (filters.from) q = q.gte(dateField, filters.from);
  if (filters.to) q = q.lte(dateField, filters.to);
  if (filters.direction) q = q.eq("direction", filters.direction);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.ai === "yes") q = q.not("ai_summary", "is", null);
  if (filters.ai === "no") q = q.is("ai_summary", null);
  if (filters.search) q = q.or(`from_number.ilike.%${filters.search}%,to_number.ilike.%${filters.search}%`);
  return q as T;
}

export async function getPlanipretCallCount(filters: PlanipretCallFilters = {}, dateField: "started_at" | "created_at" = "started_at") {
  const q = applyPlanipretCallFilters(
    supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true }),
    filters,
    dateField,
  );
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}