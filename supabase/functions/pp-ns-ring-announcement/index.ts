// Play the "this call is recorded" notice to the CALLER while the phone rings.
// IMPORTANT: the notice must be scoped to the USERS (callees), never to the
// domain. Domain-level `music-on-ring-enabled` also applies to OUTBOUND legs,
// so brokers heard the notice on their own outgoing calls.
// NetSapiens NS-API v2: upload the WAV as domain MOH media, then enable
// `music-on-ring-enabled` per user (early media during ringing of that user).
// Explicitly authorized by the user. NO DID / phonenumber writes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { nsFetch, getEnv } from "../_shared/planipret-ns.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_BUCKET = "pbx-audio";
const DEFAULT_OBJECT = "call-recording-notice.wav";
const MOH_NAME = "ava-recording-notice";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Parse minimal d'un WAV PCM : renvoie params + données brutes. */
function parseWav(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF") throw new Error("not_a_wav");
  let pos = 12;
  let fmt: { channels: number; rate: number; bits: number; format: number } | null = null;
  let data: Uint8Array | null = null;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(pos, pos + 4));
    const size = dv.getUint32(pos + 4, true);
    const body = bytes.subarray(pos + 8, pos + 8 + size);
    if (id === "fmt ") {
      const b = new DataView(body.buffer, body.byteOffset, body.byteLength);
      fmt = { format: b.getUint16(0, true), channels: b.getUint16(2, true), rate: b.getUint32(4, true), bits: b.getUint16(14, true) };
    } else if (id === "data") {
      data = body;
    }
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("wav_missing_chunks");
  if (fmt.format !== 1 || fmt.bits !== 16) throw new Error(`unsupported_wav format=${fmt.format} bits=${fmt.bits}`);
  return { ...fmt, data };
}

/** Tonalité de retour d'appel nord-américaine : 440+480 Hz, 2 s ON / 4 s OFF. */
function ringbackPcm(rate: number, channels: number, seconds: number): Uint8Array {
  const frames = Math.floor(rate * seconds);
  const out = new Uint8Array(frames * channels * 2);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    const on = t % 6 < 2;
    const s = on
      ? Math.round(8000 * (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)))
      : 0;
    for (let c = 0; c < channels; c++) dv.setInt16((i * channels + c) * 2, s, true);
  }
  return out;
}

function buildWav(rate: number, channels: number, pcm: Uint8Array): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const dv = new DataView(out.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  w(0, "RIFF"); dv.setUint32(4, 36 + pcm.length, true); w(8, "WAVEfmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, channels, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * channels * 2, true);
  dv.setUint16(32, channels * 2, true); dv.setUint16(34, 16, true);
  w(36, "data"); dv.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      action = "status",
      domain: nsDomain,
      bucket = DEFAULT_BUCKET,
      object = DEFAULT_OBJECT,
      name = MOH_NAME,
      probe,
    } = body ?? {};

    const { NS_DEFAULT_DOMAIN } = getEnv();
    const domain = nsDomain || NS_DEFAULT_DOMAIN;
    const base = `/domains/${encodeURIComponent(domain)}`;

    if (probe) {
      const pr = await nsFetch(String(probe), {}, { functionName: "pp-ns-ring-announcement" });
      return json({ probe, status: pr.status, body: (await pr.text()).slice(0, 8000) });
    }

    // NS renvoie au maximum 100 objets par page : on pagine jusqu'à épuisement.
    const listUsers = async (): Promise<string[]> => {
      const out: string[] = [];
      const limit = 100;
      for (let start = 1; start < 3000; start += limit) {
        const res = await nsFetch(
          `${base}/users?limit=${limit}&start=${start}`,
          {},
          { functionName: "pp-ns-ring-announcement" },
        );
        const arr = await res.json().catch(() => []);
        if (!Array.isArray(arr) || arr.length === 0) break;
        const page = arr
          .map((u: Record<string, unknown>) => String(u?.user ?? ""))
          .filter((u: string) => u && /^\d+$/.test(u));
        const before = out.length;
        for (const u of page) if (!out.includes(u)) out.push(u);
        if (out.length === before) break; // page identique = pagination non supportée
        if (arr.length < limit) break;
      }
      return out;
    };


    const setUserRing = async (user: string, enabled: boolean) => {
      const res = await nsFetch(`${base}/users/${encodeURIComponent(user)}`, {
        method: "PUT",
        body: JSON.stringify({
          synchronous: "yes",
          "music-on-ring-enabled": enabled ? "yes" : "no",
        }),
      }, { functionName: "pp-ns-ring-announcement" });
      return { user, status: res.status, ok: res.ok, body: (await res.text()).slice(0, 200) };
    };

    const setDomainRing = async (enabled: boolean) => {
      const res = await nsFetch(base, {
        method: "PUT",
        body: JSON.stringify({
          synchronous: "yes",
          "music-on-ring-enabled": enabled ? "yes" : "no",
        }),
      }, { functionName: "pp-ns-ring-announcement" });
      return { status: res.status, ok: res.ok, body: (await res.text()).slice(0, 300) };
    };

    const readState = async () => {
      const [dRes, mRes] = await Promise.all([
        nsFetch(base, {}, { functionName: "pp-ns-ring-announcement" }),
        nsFetch(`${base}/moh`, {}, { functionName: "pp-ns-ring-announcement" }),
      ]);
      const dom = await dRes.json().catch(() => ({}));
      const moh = await mRes.json().catch(() => []);
      return {
        domain,
        musicOnRingEnabled: dom?.["music-on-ring-enabled"] ?? null,
        musicOnHoldEnabled: dom?.["music-on-hold-enabled"] ?? null,
        moh: Array.isArray(moh) ? moh : moh,
      };
    };

    if (action === "status") {
      const uRes = await nsFetch(`${base}/users`, {}, { functionName: "pp-ns-ring-announcement" });
      const users = await uRes.json().catch(() => []);
      const perUser = Array.isArray(users)
        ? users.map((u: Record<string, unknown>) => ({
            user: u?.user ?? null,
            musicOnRingEnabled: u?.["music-on-ring-enabled"] ?? null,
          }))
        : [];
      return json({ ok: true, ...(await readState()), perUser });
    }

    if (action === "disable") {
      const dom = await setDomainRing(false);
      const users = await listUsers();
      const results = [];
      for (const u of users) results.push(await setUserRing(u, false));
      return json({ ok: dom.ok, domain: dom, users: results, state: await readState() });
    }

    // Scope the notice to inbound only: OFF at the domain, ON per user.
    // MESURÉ le 2026-08-04 sur planipret.ca : le PUT utilisateur renvoie bien
    // 202 Accepted mais NetSapiens NE PERSISTE PAS `music-on-ring-enabled` sur
    // l'objet user (relecture = null). Conséquence : cette action coupe l'avis
    // en early media pour TOUT LE MONDE. C'est le comportement voulu côté
    // sortant ; pour le rejouer aux appelants entrants il faut passer par le
    // routage entrant (dial-rule / DID), pas par l'objet user.
    if (action === "scope_users" || action === "fix") {
      const dom = await setDomainRing(false);
      const targets: string[] = Array.isArray(body?.users) && body.users.length
        ? body.users.map(String)
        : await listUsers();
      const results = [];
      for (const u of targets) results.push(await setUserRing(u, true));
      return json({
        ok: dom.ok && results.every((r) => r.ok),
        note: "domain music-on-ring disabled (no notice on outbound)",
        warning: "NetSapiens ignore music-on-ring-enabled sur l'objet user : l'avis en early media est donc coupé aussi pour les entrants",
        domain: dom,
        users: results,
        state: await readState(),
      });
    }


    // DÉPANNAGE UNIQUEMENT — remet `music-on-ring-enabled` au niveau du
    // DOMAINE. Cela rejoue l'avis sur TOUTES les jambes qui sonnent, y compris
    // les appels SORTANTS des courtiers. Ne pas utiliser en configuration
    // normale : utiliser `scope_users` à la place.
    if (action === "restore" || action === "enable_domain") {
      const dom = await setDomainRing(true);
      return json({
        ok: dom.ok,
        warning: "DÉPANNAGE : le domaine rejoue l'avis aussi sur les appels sortants des courtiers",
        note: "domain music-on-ring enabled — notice plays on ringing legs (iOS + Android)",
        domain: dom,
        state: await readState(),
      });
    }


    // Remplace UNIQUEMENT le média d'attente (l'avis d'enregistrement).
    // Aucune écriture sur le domaine, les users ou les DID.
    if (action === "upload" || action === "replace_media") {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const dl = await admin.storage.from(bucket).download(object);
      if (dl.error || !dl.data) return json({ error: "audio_not_found", details: dl.error?.message }, 404);
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      const base64 = toBase64(bytes);

      const up = await nsFetch(`${base}/moh`, {
        method: "POST",
        body: JSON.stringify({
          synchronous: "yes",
          convert: "yes",
          name,
          description: "Avis d'enregistrement d'appel (AVA)",
          index: 1,
          script: "Avis d'enregistrement d'appel (AVA)",
          encoding: "audio/wav",
          base64_file: base64,
        }),
      }, { functionName: "pp-ns-ring-announcement" });
      const upText = await up.text();
      return json({
        ok: up.ok,
        name,
        bytes: bytes.length,
        upload: { status: up.status, body: upText.slice(0, 400) },
        state: await readState(),
      });
    }

    if (action === "enable") {
      // 1) upload the notice as domain MOH media
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const dl = await admin.storage.from(bucket).download(object);
      if (dl.error || !dl.data) return json({ error: "audio_not_found", details: dl.error?.message }, 404);
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      const base64 = toBase64(bytes);

      const up = await nsFetch(`${base}/moh`, {
        method: "POST",
        body: JSON.stringify({
          synchronous: "yes",
          convert: "yes",
          name,
          description: "Avis d'enregistrement d'appel (AVA)",
          index: 1,
          script: "Avis d'enregistrement d'appel (AVA)",
          encoding: "audio/wav",
          base64_file: base64,
        }),
      }, { functionName: "pp-ns-ring-announcement" });
      const upText = await up.text();

      // 2) keep MOH at the domain but NEVER music-on-ring at the domain level
      //    (that plays the notice on the broker's OUTBOUND calls too — this is
      //    exactly the regression reported on 2026-08-04).
      const dom = await nsFetch(base, {
        method: "PUT",
        body: JSON.stringify({
          synchronous: "yes",
          "music-on-ring-enabled": "no",
          "music-on-hold-enabled": "yes",
          "music-on-hold-randomized-enabled": "no",
        }),
      }, { functionName: "pp-ns-ring-announcement" });
      const domText = await dom.text();


      // 3) enable early media while ringing, per user (callee side only)
      const targets: string[] = Array.isArray(body?.users) && body.users.length
        ? body.users.map(String)
        : await listUsers();
      const userResults = [];
      for (const u of targets) userResults.push(await setUserRing(u, true));

      return json({
        ok: up.ok && dom.ok,
        upload: { status: up.status, body: upText.slice(0, 400) },
        domain: { status: dom.status, body: domText.slice(0, 400) },
        users: userResults,
        state: await readState(),
      });
    }

    // Média « avis 4 s puis sonnerie » : l'avis est joué en média précoce
    // AVANT la sonnerie, puis une vraie tonalité de retour d'appel prend le
    // relais jusqu'au renvoi vers la boîte vocale. Aucune file d'attente.
    if (action === "build_ringback") {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const dl = await admin.storage.from(bucket).download(object);
      if (dl.error || !dl.data) return json({ error: "audio_not_found", details: dl.error?.message }, 404);
      const src = parseWav(new Uint8Array(await dl.data.arrayBuffer()));
      const tail = Number(body?.ringback_seconds ?? 40);
      const noticeSeconds = src.data.length / (src.rate * src.channels * 2);
      const pcm = new Uint8Array(src.data.length + ringbackPcm(src.rate, src.channels, tail).length);
      pcm.set(src.data, 0);
      pcm.set(ringbackPcm(src.rate, src.channels, tail), src.data.length);
      const wav = buildWav(src.rate, src.channels, pcm);

      await admin.storage.from(bucket).upload("call-recording-notice-ringback.wav", wav, {
        contentType: "audio/wav", upsert: true,
      });

      const up = await nsFetch(`${base}/moh`, {
        method: "POST",
        body: JSON.stringify({
          synchronous: "yes",
          convert: "yes",
          name,
          description: "Avis d'enregistrement + tonalité de sonnerie (AVA)",
          index: 1,
          script: "Avis d'enregistrement d'appel (AVA)",
          encoding: "audio/wav",
          base64_file: toBase64(wav),
        }),
      }, { functionName: "pp-ns-ring-announcement" });

      return json({
        ok: up.ok,
        notice_seconds: Math.round(noticeSeconds * 10) / 10,
        ringback_seconds: tail,
        sample_rate: src.rate,
        channels: src.channels,
        upload: { status: up.status, body: (await up.text()).slice(0, 400) },
      });
    }

    // Durée de sonnerie avant boîte vocale (avis 4 s inclus).
    if (action === "set_ring_timeout") {
      const secs = Number(body?.seconds ?? 29);
      const targets: string[] = Array.isArray(body?.users) && body.users.length
        ? body.users.map(String)
        : await listUsers();
      const results = [];
      for (const u of targets) {
        const r = await nsFetch(`${base}/users/${encodeURIComponent(u)}`, {
          method: "PUT",
          body: JSON.stringify({ synchronous: "yes", "ring-no-answer-timeout-seconds": secs }),
        }, { functionName: "pp-ns-ring-announcement" });
        results.push({ user: u, status: r.status, ok: r.ok });
      }
      return json({ ok: results.every((r) => r.ok), seconds: secs, count: results.length, results });
    }

    return json({ error: "unknown_action", hint: "status | enable | disable | restore | scope_users | build_ringback | set_ring_timeout" }, 400);


  } catch (e) {
    console.error("[pp-ns-ring-announcement] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
