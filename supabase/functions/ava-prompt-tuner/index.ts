// AVA — Distille les préférences apprises par courtier à partir du feedback des 14 derniers jours
// Trigger : cron quotidien (x-ava-service). Aussi appelable manuellement par un courtier pour son propre profil.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SYSTEM = `Tu es un analyste. À partir des retours (up/down/modified/skipped) d'un courtier hypothécaire sur des actions IA proposées par AVA, distille en FRANÇAIS 4 à 8 règles courtes que la prochaine génération de brouillons doit respecter pour ce courtier précis. Format : liste à puces "- règle". Aucune intro. Pas plus de 800 caractères.`;

async function distill(samples: any[]): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const userMsg = samples.map((s, i) =>
    `#${i + 1} [${s.rating}${s.action_type ? " · " + s.action_type : ""}]
${s.comment ? "Commentaire: " + s.comment + "\n" : ""}${
      s.original_draft ? "Brouillon AVA:\n" + s.original_draft.slice(0, 500) + "\n" : ""
    }${s.final_content && s.final_content !== s.original_draft ? "Version envoyée:\n" + s.final_content.slice(0, 500) : ""}`
  ).join("\n---\n");

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg.slice(0, 12000) },
      ],
    }),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return (d.choices?.[0]?.message?.content ?? "").trim();
}

async function tuneOne(admin: any, brokerUserId: string) {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const { data: fb } = await admin
    .from("planipret_ava_feedback")
    .select("rating, action_type, comment, original_draft, final_content")
    .eq("broker_user_id", brokerUserId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(60);
  const samples = (fb ?? []) as any[];
  if (samples.length < 3) return { brokerUserId, skipped: true, sample_size: samples.length };

  const preferences = await distill(samples);
  if (!preferences) return { brokerUserId, skipped: true, reason: "empty" };

  // Deactivate previous versions
  await admin.from("planipret_ava_prompt_versions").update({ active: false }).eq("broker_user_id", brokerUserId).eq("active", true);
  const { data: latest } = await admin
    .from("planipret_ava_prompt_versions")
    .select("version")
    .eq("broker_user_id", brokerUserId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (latest?.version ?? 0) + 1;

  await admin.from("planipret_ava_prompt_versions").insert({
    broker_user_id: brokerUserId,
    version: nextVersion,
    preferences_text: preferences,
    sample_size: samples.length,
    active: true,
  });
  await admin.from("planipret_profiles").update({
    ava_learned_preferences: preferences,
    ava_learned_updated_at: new Date().toISOString(),
  }).eq("user_id", brokerUserId);

  return { brokerUserId, version: nextVersion, sample_size: samples.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const svc = req.headers.get("x-ava-service") ?? "";
    const isService = svc && svc === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const body = await req.json().catch(() => ({}));

    let brokerIds: string[] = [];
    if (isService && body.all) {
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
      const { data } = await admin
        .from("planipret_ava_feedback")
        .select("broker_user_id")
        .gte("created_at", since);
      brokerIds = Array.from(new Set((data ?? []).map((r: any) => r.broker_user_id)));
    } else if (isService && body.broker_user_id) {
      brokerIds = [body.broker_user_id];
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
      const uid = claims?.claims?.sub as string | undefined;
      if (!uid) return j({ success: false, error: "Unauthorized" }, 401);
      brokerIds = [uid];
    }

    const results: any[] = [];
    for (const id of brokerIds) {
      try { results.push(await tuneOne(admin, id)); }
      catch (e: any) { results.push({ brokerUserId: id, error: e?.message ?? "err" }); }
    }
    return j({ success: true, count: results.length, results });
  } catch (e: any) {
    console.error("[ava-prompt-tuner]", e);
    return j({ success: false, error: e?.message ?? "Erreur" }, 500);
  }
});
