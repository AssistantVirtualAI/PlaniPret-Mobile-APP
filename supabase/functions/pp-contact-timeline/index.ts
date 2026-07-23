import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const number = (url.searchParams.get("number") ?? "").trim();
    if (!number) return json({ items: [] });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supa.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const { data: lemtelOnly } = await supa.rpc("is_lemtel_only", { _user_id: userId });
    if (lemtelOnly === true) return json({ error: "forbidden_wrong_app", app: "lemtel" }, 403);

    const norm = number.replace(/\D/g, "");
    const like = `%${norm.slice(-10)}%`;

    const [calls, messages, voicemails] = await Promise.all([
      supa.from("planipret_phone_calls").select("id,direction,caller_number,callee_number,from_name,to_name,duration_seconds,lead_score,started_at,created_at")
        .eq("user_id", userId)
        .or(`caller_number.ilike.${like},callee_number.ilike.${like}`)
        .order("created_at", { ascending: false }).limit(200),
      supa.from("planipret_phone_messages").select("id,direction,from_number,to_number,body,created_at")
        .eq("user_id", userId)
        .or(`from_number.ilike.${like},to_number.ilike.${like}`)
        .order("created_at", { ascending: false }).limit(200),
      supa.from("planipret_voicemails").select("id,from_number,duration_seconds,transcript,created_at")
        .eq("user_id", userId)
        .ilike("from_number", like)
        .order("created_at", { ascending: false }).limit(100),
    ]);

    const items: any[] = [];
    for (const c of calls.data ?? []) items.push({ type: "call", at: c.started_at ?? c.created_at, data: c });
    for (const m of messages.data ?? []) items.push({ type: "sms", at: m.created_at, data: m });
    for (const v of voicemails.data ?? []) items.push({ type: "voicemail", at: v.created_at, data: v });

    try {
      const { data: emailData } = await supa.functions.invoke("ms365-actions", { body: { action: "read_emails", q: number } });
      for (const e of (emailData?.emails ?? []) as any[]) items.push({ type: "email", at: e.received_at ?? e.date ?? new Date().toISOString(), data: e });
    } catch { /* ignore */ }
    try {
      const { data: contactData } = await supa.functions.invoke("maestro-actions", { body: { action: "list_contacts", q: number } });
      const contact = (contactData?.contacts ?? [])[0] ?? null;
      if (contact) items.push({ type: "contact", at: contact.updated_at ?? new Date().toISOString(), data: contact });
    } catch { /* ignore */ }

    items.sort((a, b) => +new Date(b.at) - +new Date(a.at));
    return json({ items, total: items.length, first_at: items.length ? items[items.length - 1].at : null });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
