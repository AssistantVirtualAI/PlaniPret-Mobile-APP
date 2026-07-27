// Shared Planiprêt admin auth + audio helpers (hold music, announcements).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export { corsHeaders };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export type AdminCtx = { admin: ReturnType<typeof createClient>; userId: string };

/** Require a signed-in Planiprêt admin. Returns `{ error }` on failure. */
export async function requirePlanipretAdmin(req: Request): Promise<AdminCtx | { error: Response }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { error: json({ error: "unauthorized" }, 401) };
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userRes } = await anon.auth.getUser(authHeader.slice(7));
  if (!userRes?.user) return { error: json({ error: "unauthorized" }, 401) };
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: prof } = await admin
    .from("planipret_profiles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .maybeSingle();
  if ((prof as { role?: string } | null)?.role !== "admin") {
    return { error: json({ error: "forbidden" }, 403) };
  }
  return { admin, userId: userRes.user.id };
}

export function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

// ---------------------------------------------------------------- audio utils

/** Raw little-endian 16-bit PCM bytes → Int16Array. */
export function pcmBytesToInt16(bytes: Uint8Array): Int16Array {
  const usable = bytes.byteLength - (bytes.byteLength % 2);
  const out = new Int16Array(usable / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, usable);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

/** Linear resample of mono 16-bit PCM. */
export function resample(input: Int16Array, from: number, to: number): Int16Array {
  if (from === to) return input;
  const ratio = from / to;
  const len = Math.floor(input.length / ratio);
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = (input[i0] * (1 - frac) + input[i1] * frac) | 0;
  }
  return out;
}

/**
 * Mix a spoken track over a looped music bed.
 * Both tracks must already share the same sample rate.
 */
export function mixVoiceOverMusic(
  voice: Int16Array,
  music: Int16Array | null,
  musicVolume: number,
  sampleRate: number,
  tailSeconds = 2,
): Int16Array {
  const tail = Math.floor(sampleRate * tailSeconds);
  const total = voice.length + tail;
  const out = new Int16Array(total);
  const vol = Math.max(0, Math.min(1, musicVolume));
  for (let i = 0; i < total; i++) {
    let s = i < voice.length ? voice[i] : 0;
    if (music && music.length > 0) {
      // Fade the bed in/out over 0.5s to avoid clicks at loop points.
      const bed = music[i % music.length] * vol;
      s += bed;
    }
    out[i] = Math.max(-32768, Math.min(32767, s | 0));
  }
  return out;
}

/** Wrap mono 16-bit PCM samples into a RIFF/WAVE file. */
export function encodeWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataSize, true);
  new Int16Array(buf, 44).set(samples);
  return new Uint8Array(buf);
}
