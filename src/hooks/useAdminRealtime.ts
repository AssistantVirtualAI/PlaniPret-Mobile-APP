import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type AdminEvent = {
  id: string;
  kind: "call" | "message" | "voicemail" | "ava";
  label: string;
  at: number;
  href: string;
  payload?: any;
};

type Status = "idle" | "live" | "down";

// ---- Singleton store ----
const listeners = new Set<() => void>();
let _status: Status = "idle";
let _events: AdminEvent[] = [];
let _channel: ReturnType<typeof supabase.channel> | null = null;
let _unread = 0;

const notify = () => listeners.forEach((l) => l());

const push = (kind: AdminEvent["kind"], label: string, href: string, payload?: any) => {
  const ev: AdminEvent = {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind, label, href, at: Date.now(), payload,
  };
  _events = [ev, ..._events].slice(0, 20);
  _unread += 1;
  toast({ title: label, description: "Nouvelle activité en direct", duration: 2500 });
  notify();
};

const ensureChannel = () => {
  if (_channel) return;
  _channel = supabase
    .channel("admin-realtime")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "planipret_phone_calls" },
      (p) => push("call", "Nouvel appel", "/planipret/admin/calls", p.new))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "planipret_phone_messages" },
      (p) => push("message", "Nouveau message", "/planipret/admin/messages", p.new))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "planipret_voicemails" },
      (p) => push("voicemail", "Nouveau voicemail", "/planipret/admin/voicemails", p.new))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "planipret_ava_conversations" },
      (p) => push("ava", "Nouvelle conversation AVA", "/planipret/admin/overview", p.new))
    .subscribe((s) => {
      if (s === "SUBSCRIBED") _status = "live";
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") _status = "down";
      notify();
    });
};

export const clearAdminUnread = () => { _unread = 0; notify(); };

export function useAdminRealtime() {
  const [, setTick] = useState(0);
  useEffect(() => {
    ensureChannel();
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return { status: _status, events: _events, unread: _unread, eventCount: _events.length };
}
