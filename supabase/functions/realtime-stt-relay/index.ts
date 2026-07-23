// Realtime STT relay: mobile WebSocket → OpenAI Realtime Transcription API.
// Mobile sends base64 PCM16 mono 16kHz chunks; OpenAI returns partial/final
// transcript events that we persist to pbx_call_live_transcripts so the UI
// receives them over Supabase Realtime. Two independent OpenAI sessions are
// opened in parallel (inbound = client, outbound = agent) so segments arrive
// pre-diarized without speaker guessing.
//
// Client -> us (JSON over WS):
//   { type: "init", call_record_id, organization_id, jwt }
//   { type: "pcm",  source: "inbound"|"outbound", b64: "<base64 PCM16LE 16k>" }
//   { type: "commit", source }                    // optional: force segment end
//   { type: "close" }
//
// us -> client (JSON over WS):
//   { type: "ready" }
//   { type: "segment", source, text, status: "partial"|"final", segment_idx }
//   { type: "error", message }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");

const REALTIME_URL = "wss://api.openai.com/v1/realtime?intent=transcription";

Deno.serve(async (req) => {
  const { headers } = req;
  if (headers.get("upgrade") !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }
  if (!OPENAI_KEY) return new Response("OPENAI_API_KEY missing", { status: 500 });

  const { socket, response } = Deno.upgradeWebSocket(req);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  type Side = "inbound" | "outbound";
  type Channel = { ws: WebSocket; segmentIdx: number; partial: string; ready: boolean };
  const channels: Record<Side, Channel | null> = { inbound: null, outbound: null };
  let callRecordId: string | null = null;
  let organizationId: string | null = null;
  let userId: string | null = null;
  let initialized = false;

  const speakerOf = (s: Side): "agent" | "client" => (s === "outbound" ? "agent" : "client");

  const persist = async (s: Side, idx: number, text: string, status: "partial" | "final") => {
    if (!organizationId || !callRecordId) return;
    try {
      await admin.from("pbx_call_live_transcripts").upsert({
        organization_id: organizationId,
        call_record_id: callRecordId,
        segment_idx: idx,
        speaker: speakerOf(s),
        source: s,
        text,
        status,
        updated_at: new Date().toISOString(),
      }, { onConflict: "call_record_id,segment_idx" } as any).then(() => {}, () => {});
    } catch (e) {
      console.error("[relay] persist err", e);
    }
  };

  const openChannel = (s: Side): Channel => {
    const ws = new WebSocket(REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    } as any);
    const ch: Channel = { ws, segmentIdx: 0, partial: "", ready: false };

    ws.onopen = () => {
      ch.ready = true;
      ws.send(JSON.stringify({
        type: "transcription_session.update",
        session: {
          input_audio_format: "pcm16",
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "fr",
            prompt: "Transcription d'un appel téléphonique en français canadien.",
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 200,
            silence_duration_ms: 500,
          },
        },
      }));
    };

    ws.onmessage = async (ev) => {
      try {
        const data = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        const type = data?.type;
        if (type === "conversation.item.input_audio_transcription.delta") {
          const delta = String(data?.delta || "");
          ch.partial += delta;
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: "segment", source: s, text: ch.partial,
              status: "partial", segment_idx: ch.segmentIdx,
            }));
          }
          await persist(s, ch.segmentIdx, ch.partial, "partial");
        } else if (type === "conversation.item.input_audio_transcription.completed") {
          const text = String(data?.transcript || ch.partial || "").trim();
          if (text) {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({
                type: "segment", source: s, text,
                status: "final", segment_idx: ch.segmentIdx,
              }));
            }
            await persist(s, ch.segmentIdx, text, "final");
          }
          ch.segmentIdx += 1;
          ch.partial = "";
        } else if (type === "error") {
          console.error(`[relay/${s}] openai error`, JSON.stringify(data).slice(0, 300));
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "error", source: s, message: data?.error?.message || "openai error" }));
          }
        }
      } catch (e) {
        console.error(`[relay/${s}] msg parse`, e);
      }
    };

    ws.onerror = (e) => console.error(`[relay/${s}] ws error`, e);
    ws.onclose = () => { ch.ready = false; console.log(`[relay/${s}] closed`); };
    return ch;
  };

  const closeAll = () => {
    for (const side of ["inbound", "outbound"] as Side[]) {
      try { channels[side]?.ws.close(); } catch (_) {}
      channels[side] = null;
    }
  };

  socket.onmessage = async (event) => {
    if (typeof event.data !== "string") return;
    let msg: any;
    try { msg = JSON.parse(event.data); } catch { return; }

    if (msg.type === "init") {
      if (initialized) return;
      callRecordId = String(msg.call_record_id || "").trim();
      organizationId = String(msg.organization_id || "").trim();
      const jwt = String(msg.jwt || "").trim();
      if (!callRecordId || !organizationId || !jwt) {
        socket.send(JSON.stringify({ type: "error", message: "missing init fields" }));
        socket.close();
        return;
      }
      // Verify JWT belongs to a member of the org.
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        socket.send(JSON.stringify({ type: "error", message: "unauthorized" }));
        socket.close();
        return;
      }
      userId = user.id;
      const checks = await Promise.all([
        admin.from("organization_members").select("organization_id").eq("user_id", userId).eq("organization_id", organizationId).maybeSingle(),
        admin.from("org_members").select("org_id").eq("user_id", userId).eq("org_id", organizationId).maybeSingle(),
        admin.from("pbx_softphone_users").select("organization_id").eq("portal_user_id", userId).eq("organization_id", organizationId).maybeSingle(),
      ]);
      if (!checks.some((c) => c.data)) {
        socket.send(JSON.stringify({ type: "error", message: "forbidden" }));
        socket.close();
        return;
      }
      channels.inbound = openChannel("inbound");
      channels.outbound = openChannel("outbound");
      initialized = true;
      socket.send(JSON.stringify({ type: "ready" }));
      return;
    }

    if (!initialized) return;

    if (msg.type === "pcm") {
      const side: Side = msg.source === "outbound" ? "outbound" : "inbound";
      const ch = channels[side];
      const b64 = String(msg.b64 || "");
      if (!ch || !ch.ready || !b64) return;
      try {
        ch.ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: b64 }));
      } catch (e) {
        console.error(`[relay/${side}] forward err`, e);
      }
      return;
    }

    if (msg.type === "commit") {
      const side: Side = msg.source === "outbound" ? "outbound" : "inbound";
      const ch = channels[side];
      try { ch?.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" })); } catch (_) {}
      return;
    }

    if (msg.type === "close") {
      closeAll();
      socket.close();
    }
  };

  socket.onclose = () => closeAll();
  socket.onerror = () => closeAll();

  return response;
});
