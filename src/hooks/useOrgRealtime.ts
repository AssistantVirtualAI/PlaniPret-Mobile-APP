import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to postgres_changes on a public table scoped by organization_id.
 * Debounces React-Query invalidations so a burst of inserts triggers a single refetch.
 */
export function useOrgRealtime(opts: {
  table: string;
  orgId?: string | null;
  invalidateKeys: (string | (string | undefined)[])[];
  debounceMs?: number;
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
}) {
  const { table, orgId, invalidateKeys, debounceMs = 350, event = "*" } = opts;
  const qc = useQueryClient();

  useEffect(() => {
    if (!orgId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      invalidateKeys.forEach((k) => {
        const key = Array.isArray(k) ? k.filter(Boolean) : [k];
        qc.invalidateQueries({ queryKey: key });
      });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    };
    const channel = supabase
      .channel(`rt:${table}:${orgId}`)
      .on(
        "postgres_changes",
        { event, schema: "public", table, filter: `organization_id=eq.${orgId}` },
        () => schedule()
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, orgId, event, debounceMs]);
}
