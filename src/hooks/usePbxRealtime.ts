import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Subscribe to one or more PBX mirror tables and invalidate React Query on any change. */
export function usePbxRealtime(
  tables: string[],
  queryKey: unknown[] = ["pbx"],
  opts?: { throttleMs?: number; shouldInvalidate?: (payload: unknown) => boolean },
) {
  const qc = useQueryClient();
  const lastInvalidatedAt = useRef(0);
  const tablesKey = tables.join("|");
  const queryKeyHash = JSON.stringify(queryKey);
  const throttleMs = opts?.throttleMs ?? 10_000;
  const shouldInvalidate = opts?.shouldInvalidate;

  useEffect(() => {
    const tableList = tablesKey.split("|").filter(Boolean);
    const parsedQueryKey = JSON.parse(queryKeyHash) as unknown[];
    const ch = supabase.channel(`pbx-rt-${tableList.join("-")}`);
    tableList.forEach((t) => {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, (payload) => {
        if (shouldInvalidate && !shouldInvalidate(payload)) return;
        const now = Date.now();
        if (now - lastInvalidatedAt.current < throttleMs) return;
        lastInvalidatedAt.current = now;
        qc.invalidateQueries({ queryKey: parsedQueryKey });
      });
    });
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tablesKey, queryKeyHash, qc, throttleMs, shouldInvalidate]);
}
