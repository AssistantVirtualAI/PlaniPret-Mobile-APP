import { useEffect, useState } from "react";

// Presentation-only SMS thread state (per user, this device). Never deletes SMS or writes telephony records.
export type SmsThreadState = { read: Record<string, string>; unread: Record<string, string>; hidden: Record<string, string> };
export const smsThreadKey = (id: string, peer: string) => (peer || id || "").replace(/[^\d+a-z0-9]/gi, "").toLowerCase();
export const smsStorageKey = (userId: string) => `pp:sms-thread:v1:${userId}`;
const empty = (): SmsThreadState => ({ read: {}, unread: {}, hidden: {} });
const ts = (v: string) => { const n = Date.parse(v); return Number.isFinite(n) ? n : 0; };

export function loadSmsThreadState(userId: string): SmsThreadState {
  try {
    const v = JSON.parse(localStorage.getItem(smsStorageKey(userId)) || "{}");
    const pick = (o: unknown) => (o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([, x]) => typeof x === "string")) : {});
    return { read: pick(v.read), unread: pick(v.unread), hidden: pick(v.hidden) };
  } catch { return empty(); }
}

/** Unread unless marked read at/after the last message; manual "unread" forces unread until a newer read. */
export function effectiveUnread(s: SmsThreadState, key: string, lastAt: string, serverUnread: number): number {
  const last = ts(lastAt);
  const read = s.read[key] ? ts(s.read[key]) : -1;
  const forced = s.unread[key] ? ts(s.unread[key]) : -1;
  if (forced >= 0 && forced >= read) return Math.max(serverUnread, 1);
  if (read >= 0 && read >= last) return 0;
  return serverUnread;
}
/** Hidden until a message newer than the hide time arrives. */
export const isHidden = (s: SmsThreadState, key: string, lastAt: string) => !!s.hidden[key] && ts(lastAt) <= ts(s.hidden[key]);

export function applySms(s: SmsThreadState, keys: string[], action: "read" | "unread" | "hide", now: string, lastAt: Record<string, string> = {}): SmsThreadState {
  const n: SmsThreadState = { read: { ...s.read }, unread: { ...s.unread }, hidden: { ...s.hidden } };
  for (const k of keys) {
    const at = new Date(Math.max(ts(now), ts(lastAt[k] ?? ""))).toISOString();
    if (action === "read") { n.read[k] = at; delete n.unread[k]; }
    else if (action === "unread") { n.unread[k] = at; }
    else { n.hidden[k] = at; n.read[k] = at; delete n.unread[k]; }
  }
  return n;
}

export function useSmsThreadState(userId?: string) {
  const [s, setS] = useState<SmsThreadState>(() => (userId ? loadSmsThreadState(userId) : empty()));
  useEffect(() => {
    setS(userId ? loadSmsThreadState(userId) : empty());
    const sync = (e: StorageEvent) => { if (userId && e.key === smsStorageKey(userId)) setS(loadSmsThreadState(userId)); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [userId]);
  const act = (keys: string[], action: "read" | "unread" | "hide", lastAt: Record<string, string> = {}) => {
    if (!userId) return false;
    try {
      const next = applySms(loadSmsThreadState(userId), keys, action, new Date().toISOString(), lastAt);
      localStorage.setItem(smsStorageKey(userId), JSON.stringify(next));
      setS(next);
      return true;
    } catch { return false; }
  };
  return { state: s, act };
}
