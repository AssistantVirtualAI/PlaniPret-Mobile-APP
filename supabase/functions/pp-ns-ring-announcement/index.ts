// Play the "this call is recorded" notice to the CALLER while the phone rings.
// NetSapiens NS-API v2: upload the WAV as domain MOH media, then enable
// `music-on-ring-enabled` on the domain (early media during ringing).
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
      return json({ probe, status: pr.status, body: (await pr.text()).slice(0, 1500) });
    }

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

    if (action === "status") return json({ ok: true, ...(await readState()) });

    if (action === "disable") {
      const res = await nsFetch(base, {
        method: "PUT",
        body: JSON.stringify({ synchronous: "yes", "music-on-ring-enabled": "no" }),
      }, { functionName: "pp-ns-ring-announcement" });
      const txt = await res.text();
      return json({ ok: res.ok, status: res.status, body: txt.slice(0, 400), state: await readState() });
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

      // 2) enable early media (music) while ringing
      const dom = await nsFetch(base, {
        method: "PUT",
        body: JSON.stringify({
          synchronous: "yes",
          "music-on-ring-enabled": "yes",
          "music-on-hold-enabled": "yes",
          "music-on-hold-randomized-enabled": "no",
        }),
      }, { functionName: "pp-ns-ring-announcement" });
      const domText = await dom.text();

      return json({
        ok: up.ok && dom.ok,
        upload: { status: up.status, body: upText.slice(0, 400) },
        domain: { status: dom.status, body: domText.slice(0, 400) },
        state: await readState(),
      });
    }

    return json({ error: "unknown_action", hint: "status | enable | disable" }, 400);
  } catch (e) {
    console.error("[pp-ns-ring-announcement] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
