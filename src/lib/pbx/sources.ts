/**
 * Phase 0: PBX source-of-truth registry.
 *
 * Centralizes which backend (Supabase table, FusionPBX endpoint, ElevenLabs,
 * Telnyx, live socket) is canonical for each telecom entity. Every consumer
 * should query through here so we can render source + sync chips uniformly
 * and let the AI copilot cite where each number came from.
 */

export type PbxSourceKind =
  | "supabase"
  | "fusionpbx"
  | "fusionpbx_live"
  | "elevenlabs"
  | "telnyx"
  | "twilio"
  | "freeswitch_socket";

export type PbxSourceStatus =
  | "live"      // streamed/realtime
  | "synced"    // recently mirrored
  | "stale"     // older than threshold
  | "unavailable" // upstream offline / not connected
  | "unknown";

export interface PbxSourceDescriptor {
  /** Stable id, e.g. "extensions" */
  id: string;
  /** Human label for badges */
  label: string;
  /** Where the truth lives */
  kind: PbxSourceKind;
  /** Supabase table or view name (when applicable) */
  table?: string;
  /** Edge function name proxying the upstream (when applicable) */
  edgeFunction?: string;
  /** Description for AI copilot */
  description: string;
  /** How old in seconds before we mark as stale */
  staleAfterSeconds?: number;
}

export const PBX_SOURCES = {
  extensions: {
    id: "extensions",
    label: "Extensions",
    kind: "fusionpbx",
    table: "pbx_extensions_safe",
    edgeFunction: "fusionpbx-proxy",
    description: "SIP extensions mirrored from FusionPBX per domain_uuid.",
    staleAfterSeconds: 60 * 60,
  },
  devices: {
    id: "devices",
    label: "Devices",
    kind: "fusionpbx",
    table: "pbx_devices",
    edgeFunction: "fusionpbx-proxy",
    description: "Physical/soft devices registered in FusionPBX.",
    staleAfterSeconds: 60 * 60,
  },
  liveRegistrations: {
    id: "live_registrations",
    label: "Live Registrations",
    kind: "fusionpbx_live",
    edgeFunction: "fusionpbx-proxy",
    description: "Real-time SIP registrations by domain_uuid.",
    staleAfterSeconds: 30,
  },
  activeCalls: {
    id: "active_calls",
    label: "Active Calls",
    kind: "fusionpbx_live",
    edgeFunction: "fusionpbx-proxy",
    description: "Active call channels from FusionPBX / FreeSWITCH.",
    staleAfterSeconds: 10,
  },
  cdr: {
    id: "cdr",
    label: "Call Records",
    kind: "supabase",
    table: "pbx_call_records",
    description: "Synchronized CDR records from FusionPBX.",
    staleAfterSeconds: 60 * 15,
  },
  recordings: {
    id: "recordings",
    label: "Recordings",
    kind: "supabase",
    table: "pbx_call_recordings",
    description: "Recording metadata mirrored from PBX, audio fetched on demand.",
    staleAfterSeconds: 60 * 60,
  },
  voicemail: {
    id: "voicemail",
    label: "Voicemail",
    kind: "supabase",
    table: "pbx_voicemails",
    description: "Voicemail messages synced from PBX.",
    staleAfterSeconds: 60 * 5,
  },
  dids: {
    id: "dids",
    label: "Phone Numbers / DIDs",
    kind: "supabase",
    table: "phone_numbers",
    description: "DIDs from provider + inbound route destinations.",
    staleAfterSeconds: 60 * 60,
  },
  inboundRoutes: {
    id: "inbound_routes",
    label: "Inbound Routes",
    kind: "fusionpbx",
    table: "pbx_destinations",
    edgeFunction: "fusionpbx-proxy",
    description: "Inbound destinations routed to extensions/IVR/ring groups.",
    staleAfterSeconds: 60 * 60,
  },
  ivrs: {
    id: "ivrs",
    label: "IVR Menus",
    kind: "fusionpbx",
    table: "pbx_ivrs",
    edgeFunction: "fusionpbx-proxy",
    description: "IVR menus and options synced from FusionPBX.",
    staleAfterSeconds: 60 * 60,
  },
  ringGroups: {
    id: "ring_groups",
    label: "Ring Groups",
    kind: "fusionpbx",
    table: "pbx_ring_groups",
    edgeFunction: "fusionpbx-proxy",
    description: "Ring groups and members from FusionPBX.",
    staleAfterSeconds: 60 * 60,
  },
  queues: {
    id: "queues",
    label: "Call Queues",
    kind: "fusionpbx",
    table: "pbx_call_queues",
    edgeFunction: "fusionpbx-proxy",
    description: "Call center queues (only if module enabled).",
    staleAfterSeconds: 60 * 60,
  },
  elevenlabsAgents: {
    id: "elevenlabs_agents",
    label: "ElevenLabs Agents",
    kind: "elevenlabs",
    edgeFunction: "elevenlabs-sync",
    description: "Voice agents from ElevenLabs API per workspace.",
    staleAfterSeconds: 60 * 30,
  },
  elevenlabsConversations: {
    id: "elevenlabs_conversations",
    label: "ElevenLabs Conversations",
    kind: "elevenlabs",
    table: "voice_agent_conversations",
    edgeFunction: "elevenlabs-sync",
    description: "Conversations + transcripts + audio per ElevenLabs agent.",
    staleAfterSeconds: 60 * 5,
  },
} as const satisfies Record<string, PbxSourceDescriptor>;

export type PbxSourceId = keyof typeof PBX_SOURCES;

export interface SourcedResult<T> {
  data: T;
  source: PbxSourceDescriptor;
  syncedAt: string | null;
  status: PbxSourceStatus;
  error?: string;
}

export function computeStatus(
  source: PbxSourceDescriptor,
  syncedAt: string | null,
  hasData: boolean,
  upstreamOk = true,
): PbxSourceStatus {
  if (!upstreamOk) return "unavailable";
  if (source.kind === "fusionpbx_live" || source.kind === "freeswitch_socket") {
    return hasData || syncedAt ? "live" : "unavailable";
  }
  if (!syncedAt) return hasData ? "synced" : "unknown";
  const ageSec = (Date.now() - new Date(syncedAt).getTime()) / 1000;
  const threshold = source.staleAfterSeconds ?? 3600;
  return ageSec > threshold ? "stale" : "synced";
}

export function getSource(id: PbxSourceId): PbxSourceDescriptor {
  return PBX_SOURCES[id];
}
