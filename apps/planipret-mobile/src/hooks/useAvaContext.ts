import { useLocation, useParams } from "react-router-dom";
import { useMemo } from "react";

export type AvaContext = {
  current_route: string;
  query: Record<string, string>;
  active_item?: {
    kind: string;
    id?: string;
  } | null;
};

/**
 * Lightweight hook that snapshots the currently active mobile route
 * + relevant query/params so AVA (pp-ava-chat + ava-tool-executor)
 * knows what the courtier is looking at.
 *
 * Consumed by MAvaChat / AvaChatSheet and forwarded as `context` in the
 * request body to pp-ava-chat.
 */
export function useAvaContext(): AvaContext {
  const loc = useLocation();
  const params = useParams();
  return useMemo(() => {
    const q: Record<string, string> = {};
    const search = new URLSearchParams(loc.search);
    search.forEach((v, k) => { q[k] = v; });

    const path = loc.pathname;
    let active: AvaContext["active_item"] = null;

    // Heuristics per mobile route
    if (path.includes("/pipeline")) active = { kind: "pipeline_item", id: q.deal_id || (params as any).id };
    else if (path.includes("/contacts")) active = { kind: "contact", id: q.client_id || (params as any).id };
    else if (path.includes("/voicemail")) active = { kind: "voicemail", id: q.vm };
    else if (path.includes("/calls")) active = { kind: "call", id: q.call };
    else if (path.includes("/messages")) active = { kind: "thread", id: q.thread_id || q.thread };
    else if (path.includes("/notifications")) active = { kind: "notifications" };
    else if (path.includes("/stats")) active = { kind: "stats" };

    return { current_route: path, query: q, active_item: active };
  }, [loc.pathname, loc.search, params]);
}
