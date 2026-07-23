import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  message: z.string().min(1).max(2000),
  organization_id: z.string().uuid().optional(),
});

const LEMTEL_ORG = "71755d33-ed64-4ad5-a828-61c9d2029eb7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const admin = createClient(url, service);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const orgId = parsed.data.organization_id || LEMTEL_ORG;
    const [{ data: isSuper }, { data: isLemtelAdmin }, { data: isLemtelMember }, { data: isOrgAdmin }] = await Promise.all([
      admin.rpc("is_super_admin", { _user_id: user.id }),
      admin.rpc("is_lemtel_admin", { _user_id: user.id }),
      admin.rpc("is_lemtel_member", { _user_id: user.id }),
      admin.rpc("has_role", { _user_id: user.id, _org_id: orgId, _role: "org_admin" }),
    ]);
    if (!isSuper && !isLemtelAdmin && !isLemtelMember && !isOrgAdmin) return json({ error: "Forbidden" }, 403);

    const [extensions, users, calls, queues, ivrs, jobs, domain] = await Promise.all([
      admin.from("pbx_extensions_safe").select("extension,effective_cid_name,enabled,voicemail_enabled,last_synced_at,sync_status").eq("organization_id", orgId).order("extension"),
      admin.from("pbx_domain_users").select("username,email,user_enabled,last_synced_at").eq("organization_id", orgId).order("username"),
      admin.from("pbx_call_records").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      admin.from("pbx_call_queues").select("name,extension,strategy,last_synced_at").eq("organization_id", orgId).limit(50),
      admin.from("pbx_ivrs").select("name,extension,last_synced_at").eq("organization_id", orgId).limit(50),
      admin.from("pbx_sync_jobs").select("job_type,status,fetched,upserted,completed_at,error").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(8),
      admin.from("organizations").select("fusionpbx_domain_uuid,name").eq("id", orgId).maybeSingle(),
    ]);

    const context = {
      organization: domain.data,
      counts: {
        extensions: extensions.data?.length ?? 0,
        users: users.data?.length ?? 0,
        calls: calls.count ?? 0,
        queues: queues.data?.length ?? 0,
        ivrs: ivrs.data?.length ?? 0,
      },
      extensions: (extensions.data ?? []).slice(0, 80),
      users: (users.data ?? []).slice(0, 80),
      queues: queues.data ?? [],
      ivrs: ivrs.data ?? [],
      recent_sync_jobs: jobs.data ?? [],
    };

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const fallback = () => {
      const msg = parsed.data.message.toLowerCase();
      const action = msg.includes("sync") || msg.includes("refresh")
        ? { label: "Sync all PBX inventory", action: "sync-all", body: { action: "sync-all", organization_id: orgId }, risk: "low" }
        : null;
      return json({
        answer: `Extensions: ${context.counts.extensions}. Users: ${context.counts.users}. Calls: ${context.counts.calls}.`,
        source: { id: "pbx-admin-chatbot", resolved_domain: domain.data?.fusionpbx_domain_uuid ?? null, tables: ["pbx_extensions_safe", "pbx_domain_users", "pbx_sync_jobs"] },
        proposal: action,
      });
    };
    if (!apiKey) return fallback();

    const prompt = `Return only JSON: {"answer":"short answer","proposal":null|{"label":"button label","action":"sync-extensions|sync-users|sync-devices|sync-ring-groups|sync-call-queues|sync-ivrs|sync-all","body":{},"risk":"low|medium|high"}}.
Only propose sync actions. For destructive or unsupported requests, proposal must be null and answer should say what is missing.
Context: ${JSON.stringify(context).slice(0, 18000)}
User: ${parsed.data.message}`;

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!ai.ok) return fallback();
    const payload = await ai.json();
    const raw = payload.choices?.[0]?.message?.content || "{}";
    let out: any;
    try { out = JSON.parse(raw); } catch { out = { answer: raw, proposal: null }; }
    if (out?.proposal?.body) out.proposal.body = { ...out.proposal.body, action: out.proposal.action, organization_id: orgId };
    return json({
      answer: out.answer || "No answer returned.",
      proposal: out.proposal || null,
      source: { id: "pbx-admin-chatbot", resolved_domain: domain.data?.fusionpbx_domain_uuid ?? null, tables: ["pbx_extensions_safe", "pbx_domain_users", "pbx_sync_jobs"] },
    });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});