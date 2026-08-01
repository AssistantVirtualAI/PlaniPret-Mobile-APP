// Restore a standard voicemail greeting (index 1) on NetSapiens users.
// Uploads the generic "boîte vocale" WAV from Supabase Storage via NS-API v2 Media/Greetings.
// Media writes only — never touches phonenumbers/DID routing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { nsFetch, getEnv } from "../_shared/planipret-ns.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_BUCKET = "pbx-audio";
const DEFAULT_OBJECT = "voicemail-standard.wav";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

async function listUsers(domain: string): Promise<string[]> {
  const out: string[] = [];
  const limit = 100;
  for (let start = 1; start < 5000; start += limit) {
    const res = await nsFetch(
      `/domains/${encodeURIComponent(domain)}/users?limit=${limit}&start=${start}`,
      {},
      { functionName: "pp-ns-restore-greetings" },
    );
    if (!res.ok) break;
    const json = await res.json().catch(() => []);
    const list: Record<string, unknown>[] = Array.isArray(json) ? json : (json?.data ?? []);
    if (!list.length) break;
    for (const u of list) {
      const ext = String(u?.user ?? u?.["user-id"] ?? "");
      if (/^\d{2,6}$/.test(ext)) out.push(ext);
    }
    if (list.length < limit) break;
  }
  return [...new Set(out)];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      user: nsUser,
      domain: nsDomain,
      allUsers = false,
      index = "1",
      bucket = DEFAULT_BUCKET,
      object = DEFAULT_OBJECT,
      description = "Boîte vocale standard",
      dryRun = false,
      batchStart = 0,
      batchSize = 1000,
    } = body ?? {};

    const { NS_DEFAULT_DOMAIN } = getEnv();
    const domain = nsDomain || NS_DEFAULT_DOMAIN;

    let targets: string[] = [];
    if (allUsers) targets = await listUsers(domain);
    else if (nsUser) targets = [String(nsUser)];
    else {
      return new Response(JSON.stringify({ error: "missing_target", hint: "Provide { user } or { allUsers: true }" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const total = targets.length;
    targets = targets.slice(Number(batchStart), Number(batchStart) + Number(batchSize));

    if (dryRun) {
      return new Response(JSON.stringify({ ok: true, dryRun: true, domain, index, total, batch: targets.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const dl = await admin.storage.from(bucket).download(object);
    if (dl.error || !dl.data) {
      return new Response(JSON.stringify({ error: "audio_not_found", details: dl.error?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const base64 = toBase64(new Uint8Array(await dl.data.arrayBuffer()));

    const results: Array<{ user: string; status: number; ok: boolean; body?: string }> = [];
    for (const t of targets) {
      const res = await nsFetch(
        `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(t)}/greetings`,
        {
          method: "POST",
          body: JSON.stringify({
            synchronous: "yes",
            convert: "yes",
            index: String(index),
            description,
            filename: object,
            file: base64,
          }),
        },
        { functionName: "pp-ns-restore-greetings" },
      );
      const text = await res.text();
      results.push({ user: t, status: res.status, ok: res.ok, body: res.ok ? undefined : text.slice(0, 200) });
    }

    const failed = results.filter((r) => !r.ok);
    return new Response(
      JSON.stringify({
        ok: failed.length === 0,
        domain,
        index,
        total,
        processed: results.length,
        batchStart: Number(batchStart),
        nextBatchStart: Number(batchStart) + results.length,
        failed: failed.length,
        failures: failed.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[pp-ns-restore-greetings] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
