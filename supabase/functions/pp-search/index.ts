import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Scope = "all" | "calls" | "messages" | "voicemails" | "insights" | "contacts" | "emails";

const EMPTY = { calls: [], messages: [], voicemails: [], insights: [], contacts: [], emails: [] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = clamp(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1, 50);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
    const scope = (url.searchParams.get("scope") ?? "all") as Scope;
    if (!q) return json({ ...EMPTY, has_more: emptyHasMore() });

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

    const like = `%${q}%`;
    const want = (s: Scope) => scope === "all" || scope === s;

    const from = offset;
    const to = offset + limit - 1;

    const [calls, messages, voicemails, insights] = await Promise.all([
      want("calls")
        ? supa.from("planipret_phone_calls").select("id,direction,caller_number,callee_number,from_name,to_name,duration_seconds,lead_score,lead_temperature,started_at,created_at")
            .eq("user_id", userId)
            .or(`caller_number.ilike.${like},callee_number.ilike.${like},from_name.ilike.${like},to_name.ilike.${like}`)
            .order("created_at", { ascending: false }).range(from, to)
        : Promise.resolve({ data: [] as any[] }),
      want("messages")
        ? supa.from("planipret_phone_messages").select("id,direction,from_number,to_number,body,created_at")
            .eq("user_id", userId)
            .or(`from_number.ilike.${like},to_number.ilike.${like},body.ilike.${like}`)
            .order("created_at", { ascending: false }).range(from, to)
        : Promise.resolve({ data: [] as any[] }),
      want("voicemails")
        ? supa.from("planipret_voicemails").select("id,from_number,duration_seconds,transcript,created_at")
            .eq("user_id", userId)
            .or(`from_number.ilike.${like},transcript.ilike.${like}`)
            .order("created_at", { ascending: false }).range(from, to)
        : Promise.resolve({ data: [] as any[] }),
      want("insights")
        ? supa.from("planipret_ai_insights").select("id,call_id,summary,created_at")
            .ilike("summary", like).order("created_at", { ascending: false }).range(from, to)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const [contactsAll, emailsAll] = await Promise.all([
      want("contacts") ? tryInvoke(supa, "maestro-actions", { action: "list_contacts", payload: { query: q } }, "contacts") : Promise.resolve([]),
      want("emails") ? tryInvoke(supa, "ms365-actions", { action: "read_emails", q }, "emails") : Promise.resolve([]),
    ]);

    // For invoked functions we paginate client-side (they don't accept range).
    const contactsPage = contactsAll.slice(from, from + limit);
    const emailsPage = emailsAll.slice(from, from + limit);

    const callsData = calls.data ?? [];
    const messagesData = messages.data ?? [];
    const voicemailsData = voicemails.data ?? [];
    const insightsData = insights.data ?? [];

    return json({
      calls: callsData,
      messages: messagesData,
      voicemails: voicemailsData,
      insights: insightsData,
      contacts: contactsPage,
      emails: emailsPage,
      offset,
      limit,
      has_more: {
        calls: want("calls") && callsData.length === limit,
        messages: want("messages") && messagesData.length === limit,
        voicemails: want("voicemails") && voicemailsData.length === limit,
        insights: want("insights") && insightsData.length === limit,
        contacts: want("contacts") && from + contactsPage.length < contactsAll.length,
        emails: want("emails") && from + emailsPage.length < emailsAll.length,
      },
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function emptyHasMore() {
  return { calls: false, messages: false, voicemails: false, insights: false, contacts: false, emails: false };
}
function clamp(n: number, lo: number, hi: number) { return Math.min(Math.max(n, lo), hi); }

async function tryInvoke(supa: any, fn: string, body: any, key: string): Promise<any[]> {
  try {
    const { data } = await supa.functions.invoke(fn, { body });
    const arr = Array.isArray(data?.[key]) ? data[key] : Array.isArray(data) ? data : [];
    return arr;
  } catch { return []; }
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
