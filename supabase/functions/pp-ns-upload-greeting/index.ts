// Upload an audio announcement (e.g. "cet appel sera enregistré") to NetSapiens
// as a user/domain greeting via NS-API v2 Media/Greetings.
// Explicitly authorized by the user (media upload only — no DID / phonenumber writes).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { nsFetch, getEnv } from "../_shared/planipret-ns.ts";
import { nsFetchAll } from "../_shared/ns-pagination.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_BUCKET = "pbx-audio";
const DEFAULT_OBJECT = "call-recording-notice.wav";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      user: nsUser,
      domain: nsDomain,
      index = "9", // announcement slot — NEVER 1 (voicemail greeting)
      bucket = DEFAULT_BUCKET,
      object = DEFAULT_OBJECT,
      description = "Avis d'enregistrement d'appel (AVA)",
      allUsers = false,
      offset = 0,
      limit = 20,
      dryRun = false,
    } = body ?? {};

    const { NS_DEFAULT_DOMAIN } = getEnv();
    const domain = nsDomain || NS_DEFAULT_DOMAIN;

    // Diagnostic probe: GET an arbitrary NS path to discover the right media route
    if (body?.probe) {
      const pr = await nsFetch(String(body.probe), {}, { functionName: "pp-ns-upload-greeting" });
      const pt = await pr.text();
      return new Response(JSON.stringify({ probe: body.probe, status: pr.status, body: pt.slice(0, 1500) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!nsUser && !allUsers) {
      return new Response(
        JSON.stringify({ error: "missing_user", hint: "Provide { user: '<extension>' } or { allUsers: true }" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const dl = await admin.storage.from(bucket).download(object);
    if (dl.error || !dl.data) {
      return new Response(JSON.stringify({ error: "audio_not_found", details: dl.error?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const base64 = toBase64(bytes);

    // Resolve target users: explicit user, or every user of the domain (allUsers)
    let targets: string[] = [];
    let totalUsers = 0;
    if (allUsers) {
      const all = await nsFetchAll<Record<string, unknown>>(`/domains/${encodeURIComponent(domain)}/users`);
      const everyone = all.items
        .map((u) => String(u?.user ?? u?.["user-id"] ?? ""))
        .filter((u: string) => /^\d{2,6}$/.test(u))
        .sort();
      totalUsers = everyone.length;
      const off = Number(offset) || 0;
      const lim = Math.max(1, Math.min(Number(limit) || 20, 40));
      targets = everyone.slice(off, off + lim);
    } else {
      targets = [String(nsUser)];
      totalUsers = 1;
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          ok: true,
          dryRun: true,
          bytes: bytes.length,
          domain,
          index,
          totalUsers,
          batch: targets.length,
          targets,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    const results: Array<{ user: string; status: number; ok: boolean; body?: string }> = [];
    for (const t of targets) {
      const res = await nsFetch(
        `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(t)}/greetings`,
        {
          method: "POST",
          body: JSON.stringify({
            synchronous: "yes",
            convert: "yes",
            index: Number(index),
            script: description,
            encoding: "audio/wav",
            base64_file: base64,
          }),

        },
        { functionName: "pp-ns-upload-greeting" },
      );
      const text = await res.text();
      console.log(`[pp-ns-upload-greeting] ${t} -> ${res.status} ${text.slice(0, 200)}`);
      results.push({ user: t, status: res.status, ok: res.ok, body: res.ok ? undefined : text.slice(0, 300) });
    }

    const failed = results.filter((r) => !r.ok);
    return new Response(
      JSON.stringify({
        ok: failed.length === 0,
        domain,
        index,
        total: results.length,
        succeeded: results.length - failed.length,
        failed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("[pp-ns-upload-greeting] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
