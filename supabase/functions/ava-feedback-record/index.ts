// AVA — enregistre le feedback courtier sur une action proposée
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return j({ success: false, error: "Unauthorized" }, 401);

    const body = await req.json();
    const { analysis_id, action_id, action_type, rating, comment, original_draft, final_content } = body ?? {};
    if (!rating || !["up", "down", "skipped", "modified"].includes(rating)) {
      return j({ success: false, error: "invalid rating" }, 400);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin
      .from("planipret_ava_feedback")
      .insert({
        broker_user_id: userId,
        analysis_id: analysis_id ?? null,
        action_id: action_id ?? null,
        action_type: action_type ?? null,
        rating,
        comment: comment ?? null,
        original_draft: original_draft ?? null,
        final_content: final_content ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return j({ success: true, feedback: data });
  } catch (e: any) {
    console.error("[ava-feedback-record]", e);
    return j({ success: false, error: e?.message ?? "Erreur" }, 500);
  }
});
