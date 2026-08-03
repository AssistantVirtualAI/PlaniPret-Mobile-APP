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

    const listUsers = async (): Promise<string[]> => {
      const res = await nsFetch(`${base}/users`, {}, { functionName: "pp-ns-ring-announcement" });
      const arr = await res.json().catch(() => []);
      if (!Array.isArray(arr)) return [];
      return arr
        .map((u: Record<string, unknown>) => String(u?.user ?? u?.["user"] ?? ""))
        .filter((u: string) => u && /^\d+$/.test(u));
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
    if (action === "scope_users" || action === "fix") {
      const dom = await setDomainRing(false);
      const targets: string[] = Array.isArray(body?.users) && body.users.length
        ? body.users.map(String)
        : await listUsers();
      const results = [];
      for (const u of targets) results.push(await setUserRing(u, true));
      return json({
        ok: dom.ok && results.every((r) => r.ok),
        note: "domain music-on-ring disabled (no notice on outbound), enabled per user (inbound only)",
        domain: dom,
        users: results,
        state: await readState(),
      });
    }

    // Restore the notice for ringing legs. NetSapiens only honours
    // `music-on-ring-enabled` at the DOMAIN level (the user object ignores it),
    // so this is the only configuration that actually plays the notice.
    if (action === "restore" || action === "enable_domain") {
      const dom = await setDomainRing(true);
      return json({
        ok: dom.ok,
        note: "domain music-on-ring enabled — notice plays on ringing legs (iOS + Android)",
        domain: dom,
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
      //    (that would play the notice on the broker's outbound calls too).
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

    return json({ error: "unknown_action", hint: "status | enable | disable | restore | scope_users" }, 400);

  } catch (e) {
    console.error("[pp-ns-ring-announcement] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
