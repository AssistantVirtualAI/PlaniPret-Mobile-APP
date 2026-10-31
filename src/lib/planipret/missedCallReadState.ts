import { useEffect, useState } from "react";

export type MissedCallIdentity = { id: string; ns_call_id?: string | null; started_at: string };
export const missedCallReadKey = (call: MissedCallIdentity) => JSON.stringify([call.ns_call_id || call.id, call.started_at]);
export const missedCallStorageKey = (userId: string) => `pp:missed-read:v1:${userId}`;

export function loadMissedCallReadState(userId: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(missedCallStorageKey(userId)) || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

export function updateMissedCallReadState(current: string[], keys: string[], read: boolean): string[] {
  const next = new Set(current);
  for (const key of keys) { if (read) next.add(key); else next.delete(key); }
  return [...next];
}

// Presentation state only: never writes call records or notification rows.
export function useMissedCallReadState(userId?: string) {
  const [state, setState] = useState<{ userId?: string; keys: string[] }>(() => ({ userId, keys: userId ? loadMissedCallReadState(userId) : [] }));
  useEffect(() => {
    setState({ userId, keys: userId ? loadMissedCallReadState(userId) : [] });
    const sync = (event: StorageEvent) => {
      if (userId && event.key === missedCallStorageKey(userId)) setState({ userId, keys: loadMissedCallReadState(userId) });
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [userId]);
  const keys = state.userId === userId ? state.keys : [];
  const setRead = (calls: MissedCallIdentity[], read = true) => {
    if (!userId) return false;
    try {
      const next = updateMissedCallReadState(loadMissedCallReadState(userId), calls.map(missedCallReadKey), read);
      localStorage.setItem(missedCallStorageKey(userId), JSON.stringify(next));
      setState({ userId, keys: next });
      return true;
    } catch { return false; }
  };
  return { isRead: (call: MissedCallIdentity) => keys.includes(missedCallReadKey(call)), setRead };
}