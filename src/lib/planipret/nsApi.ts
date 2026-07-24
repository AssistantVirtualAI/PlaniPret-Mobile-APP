/**
 * Planiprêt NS-API client service layer.
 *
 * Centralised wrapper around the Supabase Edge Functions that proxy NetSapiens
 * NS-API v2. Every call is scoped to the authenticated user's extension on the
 * server side (`requirePlanipretBroker` / `authBroker` resolves the broker's
 * `extension` + `ns_domain` from `planipret_profiles` and injects them into
 * every NS path), so the client never has to pass — or be trusted with — an
 * extension parameter.
 *
 * Usage:
 *   import { nsApi } from "@/lib/planipret/nsApi";
 *   const { items } = await nsApi.cdrs.list({ start, end });
 *   await nsApi.calls.start("5145551234");
 *   const blob = await nsApi.recordings.fetchAudio(callId);
 */
import { supabase } from "@/integrations/supabase/client";

type Json = Record<string, unknown>;

async function invokeJson<T = any>(
  fn: string,
  opts: { method?: "GET" | "POST" | "PATCH" | "DELETE"; query?: Record<string, string | number | undefined>; body?: Json } = {},
): Promise<T> {
  const qs = opts.query
    ? "?" + new URLSearchParams(
        Object.entries(opts.query)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  const { data, error } = await supabase.functions.invoke(`${fn}${qs}`, {
    method: opts.method ?? "GET",
    body: opts.body,
  });
  if (error) throw new Error(error.message || `${fn} failed`);
  return data as T;
}

/* ============================================================
 * CDRs  — pp-ns-cdr
 * Server enforces /users/{extension}/cdrs scoping.
 * ============================================================ */
export const cdrsApi = {
  list: (params: { start?: string; end?: string; limit?: number; offset?: number } = {}) =>
    invokeJson<{ ok: boolean; count: number; items: any[]; degraded?: boolean; reason?: string; next_offset?: number | null; breaker_open?: boolean }>("pp-ns-cdr", {
      method: "GET",
      query: {
        action: "list",
        start: params.start,
        end: params.end,
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    }),
  sync: (params: { start?: string; end?: string; limit?: number } = {}) =>
    invokeJson<{ ok: boolean; count: number }>("pp-ns-cdr", {
      method: "POST",
      query: { action: "sync" },
      body: { ...params, limit: params.limit ?? 50 },
    }),
};

/* ============================================================
 * Active calls — pp-ns-calls
 * Server enforces /users/{extension}/calls scoping.
 * ============================================================ */
export const callsApi = {
  list: () =>
    invokeJson<{ items?: any[] }>("pp-ns-calls", {
      method: "GET",
      query: { action: "list" },
    }),
  start: (toNumber: string, opts: { callerIdNumber?: string; callerIdName?: string } = {}) =>
    invokeJson<{ call_id?: string }>("pp-ns-calls", {
      method: "POST",
      query: { action: "start" },
      body: {
        to_number: toNumber,
        caller_id_number: opts.callerIdNumber,
        caller_id_name: opts.callerIdName,
      },
    }),
  answer:     (callId: string) => callPatch("answer", callId),
  hold:       (callId: string) => callPatch("hold", callId),
  unhold:     (callId: string) => callPatch("unhold", callId),
  reject:     (callId: string) => callPatch("reject", callId),
  disconnect: (callId: string) => callPatch("disconnect", callId),
  transfer:   (callId: string, destination: string) =>
    invokeJson("pp-ns-calls", {
      method: "PATCH",
      query: { action: "transfer" },
      body: { call_id: callId, destination },
    }),
};

function callPatch(action: string, callId: string) {
  return invokeJson("pp-ns-calls", {
    method: "PATCH",
    query: { action },
    body: { call_id: callId },
  });
}

/* ============================================================
 * Recordings — ns-recordings (audio bytes, returns ArrayBuffer)
 * Server enforces extension on the recording lookup.
 * ============================================================ */
export const recordingsApi = {
  async fetchAudio(callId: string): Promise<Blob> {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = projectId
      ? `https://${projectId}.supabase.co/functions/v1/ns-get-recording`
      : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ns-get-recording`;
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      },
      body: JSON.stringify({ call_db_id: callId, ns_callid: callId }),
    });
    const ct = res.headers.get("content-type") ?? "";
    // Edge function returns 200 + JSON when NS reports the recording is missing/forbidden.
    if (ct.includes("application/json")) {
      const err = await res.json().catch(() => ({} as any));
      if (err?.attempts) console.warn("Recording fetch attempts:", err.attempts);
      const msg = err?.error ?? "Enregistrement indisponible";
      const hint = err?.hint ?? (err?.ns_status ? `NS-API HTTP ${err.ns_status}` : "");
      throw new Error(hint ? `${msg} — ${hint}` : msg);
    }
    if (!res.ok) throw new Error(`Recording fetch failed (HTTP ${res.status})`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 128) throw new Error("Fichier audio vide reçu");
    return new Blob([buf], { type: ct.startsWith("audio/") ? ct : "audio/wav" });
  },
  async fetchAudioUrl(callId: string): Promise<string> {
    const blob = await this.fetchAudio(callId);
    return URL.createObjectURL(blob);
  },
};


/* ============================================================
 * Voicemails — ns-voicemail
 * Server enforces /users/{extension}/voicemails scoping.
 * ============================================================ */
export type VmFolder = "inbox" | "saved" | "deleted";

export const voicemailApi = {
  list: (folder: VmFolder = "inbox") =>
    invokeJson<{ success: boolean; data: any[] }>("pp-ns-voicemail", {
      method: "GET",
      query: { action: "list", folder },
    }),
  delete: (vmId: string) =>
    invokeJson<{ success: boolean }>("pp-ns-voicemail", {
      method: "DELETE",
      query: { vm_id: vmId },
    }),
  forward: (vmId: string, toUser: string) =>
    invokeJson<{ success: boolean }>("pp-ns-voicemail", {
      method: "POST",
      query: { action: "forward" },
      body: { vm_id: vmId, to_user: toUser },
    }),
};

/* ============================================================
 * SMS — pp-ns-sms (extension-scoped on the server)
 * ============================================================ */
export const smsApi = {
  listThreads: () =>
    invokeJson<{ threads: any[] }>("pp-ns-sms", { method: "GET", query: { action: "threads" } }),
  listMessages: (threadId: string) =>
    invokeJson<{ messages: any[] }>("pp-ns-sms", { method: "GET", query: { action: "messages", thread_id: threadId } }),
  send: (toNumber: string, text: string) =>
    invokeJson("pp-ns-sms", { method: "POST", query: { action: "send" }, body: { to: toNumber, message: text } }),
};

/* Single namespaced export consumed by /mplanipret screens. */
export const nsApi = {
  cdrs: cdrsApi,
  calls: callsApi,
  recordings: recordingsApi,
  voicemail: voicemailApi,
  sms: smsApi,
};

export default nsApi;
