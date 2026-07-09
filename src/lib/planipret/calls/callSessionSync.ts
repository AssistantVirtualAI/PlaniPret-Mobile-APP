// Cross-device call session sync for Planipret.
//
// The mobile app and the Maestro web widget share the same SIP Call-ID for a
// given call (both devices receive the same INVITE from NetSapiens). We use
// that Call-ID as the primary key of `planipret_call_sessions` so the two
// clients coordinate through the database:
//
//   1. On ring, whichever client sees the INVITE first inserts a row with
//      state='ringing' (idempotent — the unique call_id makes duplicate
//      inserts no-ops).
//   2. When a device answers, it calls the `pp_claim_call` RPC which
//      atomically flips state to 'active' with WHERE state='ringing'. Only
//      one client wins that race. The other one observes the update via
//      Supabase Realtime and knows to stop ringing locally.
//   3. On hangup, the winning client marks the row as ended.
//
// This module is a thin, framework-free helper — the hook wires it up.

import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type AnsweredBy = "mobile" | "widget";
export type SessionState = "ringing" | "active" | "ended";

export interface CallSessionRow {
  call_id: string;
  broker_id: string;
  direction: "inbound" | "outbound";
  remote_number: string | null;
  state: SessionState;
  answered_by: AnsweredBy | null;
  answered_at: string | null;
  ended_reason: string | null;
}

export async function upsertRingingSession(args: {
  callId: string;
  brokerId: string;
  direction: "inbound" | "outbound";
  remoteNumber?: string;
}): Promise<void> {
  if (!args.callId || !args.brokerId) return;
  try {
    await supabase.from("planipret_call_sessions").upsert(
      {
        call_id: args.callId,
        broker_id: args.brokerId,
        direction: args.direction,
        remote_number: args.remoteNumber ?? null,
        state: "ringing",
      },
      { onConflict: "call_id", ignoreDuplicates: true },
    );
  } catch { /* best-effort */ }
}

/** Atomically try to claim the call for this client. Returns true if we won. */
export async function claimCall(callId: string, answeredBy: AnsweredBy): Promise<boolean> {
  if (!callId) return true; // no-id calls can't be coordinated; let them proceed
  try {
    const { data, error } = await supabase.rpc("pp_claim_call", {
      _call_id: callId,
      _answered_by: answeredBy,
    });
    if (error) return true; // fail open — better to answer than to drop
    return Boolean(data);
  } catch {
    return true;
  }
}

export async function endSession(callId: string, reason: string): Promise<void> {
  if (!callId) return;
  try {
    await supabase.from("planipret_call_sessions")
      .update({ state: "ended", ended_reason: reason, ended_at: new Date().toISOString() })
      .eq("call_id", callId)
      .neq("state", "ended");
  } catch { /* best-effort */ }
}

/** Subscribe to updates on a specific call_id. Invokes `onUpdate` with the
 *  new row whenever the row changes. Returns an unsubscribe function. */
export function subscribeToCall(
  callId: string,
  onUpdate: (row: CallSessionRow) => void,
): () => void {
  if (!callId) return () => {};
  const channel: RealtimeChannel = supabase
    .channel(`pp-call-${callId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "planipret_call_sessions",
        filter: `call_id=eq.${callId}`,
      },
      (payload) => {
        try { onUpdate(payload.new as CallSessionRow); } catch {}
      },
    )
    .subscribe();
  return () => { try { supabase.removeChannel(channel); } catch {} };
}
