/**
 * Typed client for the Maestro Telecom REST API, routed through the
 * `maestro-telecom` edge function so the Bearer token and the broker's
 * Maestro user id stay server-side.
 *
 * The literal `{me}` in a path is replaced by the current authenticated
 * broker's `maestro_broker_id` on the server.
 */
import { supabase } from "@/integrations/supabase/client";

type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

async function call<T = any>(
  path: string,
  opts: { method?: Method; body?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const query = opts.query
    ? Object.fromEntries(
        Object.entries(opts.query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
      )
    : undefined;

  const { data, error } = await supabase.functions.invoke("maestro-telecom", {
    body: { path, method: opts.method ?? "GET", body: opts.body, query },
  });
  if (error) throw new Error(error.message || "maestro-telecom failed");
  if (data?.error) throw new Error(data.error + (data.status ? ` (${data.status})` : ""));
  return (data?.data ?? data) as T;
}

// --- Users ---------------------------------------------------------------
export const getSip = () => call("/users/{me}/sip");
export const lookupByPhone = (phone: string) =>
  call("/users/{me}/lookup-by-phone", { method: "POST", body: { phone } });

// --- Calls ---------------------------------------------------------------
export interface MaestroCallCreate {
  provider_call_id: string;
  to_user_id?: string;
  to_user_number?: string;
  status?: "created" | "dialing" | "connected" | "ended";
  direction?: "inbound" | "outbound";
}
export const createCall = (body: MaestroCallCreate) =>
  call("/users/{me}/calls", { method: "POST", body });

export const listCalls = () => call("/users/{me}/calls");
export const listCallsWithContact = (contact: string) =>
  call(`/users/{me}/calls/with/${encodeURIComponent(contact)}`);

export interface MaestroCallUpdate {
  status?: "created" | "dialing" | "connected" | "ended";
  ended_reason?: "rejected" | "completed" | "cancelled" | "no_answer" | "failed";
}
export const updateCall = (callId: string, body: MaestroCallUpdate) =>
  call(`/users/{me}/calls/${encodeURIComponent(callId)}`, { method: "PUT", body });

export const getRecording = (callId: string) =>
  call(`/users/{me}/call/${encodeURIComponent(callId)}/recording`);
export const getTranscription = (callId: string) =>
  call(`/users/{me}/call/${encodeURIComponent(callId)}/transcription`);
export const getVoicemail = (callId: string) =>
  call(`/users/{me}/call/${encodeURIComponent(callId)}/voicemail`);
export const markCallRead = (callId: string) =>
  call(`/users/{me}/call/${encodeURIComponent(callId)}/read`, { method: "POST" });

// --- Messages ------------------------------------------------------------
export interface MaestroSendMessage {
  to_user_id?: string;
  to_user_number?: string;
  message: string;
}
export const sendMessage = (body: MaestroSendMessage) =>
  call("/users/{me}/messages", { method: "POST", body });

export const getInbox = () => call("/users/{me}/inbox");
export const getMessagesWith = (phoneNumber: string) =>
  call(`/users/{me}/messages/with/${encodeURIComponent(phoneNumber)}`);
export const markMessagesRead = (phoneNumber: string) =>
  call(`/users/{me}/read-messages/${encodeURIComponent(phoneNumber)}`, { method: "POST" });

// --- Communications ------------------------------------------------------
export const getRecentCommunications = () => call("/users/{me}/communications/recent");
export const getAllCommunications = () => call("/users/{me}/communications/all");
export const getUserCommunications = (userId: string) =>
  call(`/users/{me}/user-communications/${encodeURIComponent(userId)}`);
export const getUserMessagesWith = (userId: string, phoneNumber: string) =>
  call(`/users/{me}/user-messages/${encodeURIComponent(userId)}/with/${encodeURIComponent(phoneNumber)}`);

export const maestroTelecom = {
  getSip, lookupByPhone,
  createCall, listCalls, listCallsWithContact, updateCall,
  getRecording, getTranscription, getVoicemail, markCallRead,
  sendMessage, getInbox, getMessagesWith, markMessagesRead,
  getRecentCommunications, getAllCommunications, getUserCommunications, getUserMessagesWith,
};
