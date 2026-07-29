// Livekit-client shim for planipret-mobile.
// @elevenlabs/client statically imports `livekit-client` at the top of its
// bundle (Room, RoomEvent, ConnectionState, Track, createLocalAudioTrack) to
// support its WebRTC transport. We only use the WebSocket transport
// (connectionType: "websocket") in the mobile app, so the WebRTC code path
// (VoiceConversation) never executes. Aliasing `livekit-client` to this shim
// removes ~1.17 MB of raw JS from the mobile bundle without changing runtime
// behavior. If any WebRTC path is accidentally taken, it throws loudly.
const notSupported = () => {
  throw new Error("livekit-client is stubbed out on mobile — use WebSocket transport");
};

export class Room {
  constructor() { /* no-op */ }
  connect = notSupported;
  disconnect = notSupported;
  on = () => this;
  off = () => this;
  localParticipant = { publishTrack: notSupported, setMicrophoneEnabled: notSupported };
}

export const RoomEvent = {
  Connected: "connected",
  Disconnected: "disconnected",
  ConnectionStateChanged: "connectionStateChanged",
  DataReceived: "dataReceived",
  TrackSubscribed: "trackSubscribed",
  TrackUnsubscribed: "trackUnsubscribed",
} as const;

export const ConnectionState = {
  Disconnected: "disconnected",
  Connecting: "connecting",
  Connected: "connected",
  Reconnecting: "reconnecting",
} as const;

export const Track = {
  Source: { Microphone: "microphone" },
  Kind: { Audio: "audio" },
} as const;

export const createLocalAudioTrack = notSupported;

export default { Room, RoomEvent, ConnectionState, Track, createLocalAudioTrack };
