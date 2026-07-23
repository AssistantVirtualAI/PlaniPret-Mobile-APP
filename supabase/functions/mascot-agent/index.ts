// Lemtel Mascot agent — tool-calling AI orchestrator across the AVA Statistic admin.
// Streams via AI SDK + Lovable Gateway. Tools fan out to existing edge functions / RPCs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "npm:ai";
import { z } from "npm:zod";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEMTEL_ORG = "71755d33-ed64-4ad5-a828-61c9d2029eb7";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_KEY) {
    return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Identify caller
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userSupa = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userSupa.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { messages, context }: { messages: UIMessage[]; context?: any } = await req.json();

  // Helper to call internal edge functions while preserving the user JWT (so RLS + role checks still apply)
  async function callFn(name: string, body: any) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: r.ok, status: r.status, data };
  }

  // ---------- Tools ----------
  const tools = {
    // ===== Read =====
    list_organization_members: tool({
      description: "List members of the current organization.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await admin
          .from("organization_members")
          .select("user_id, accepted_at, profiles:user_id(email, full_name)")
          .eq("organization_id", context?.organizationId || LEMTEL_ORG);
        return error ? { error: error.message } : { members: data };
      },
    }),

    list_clients: tool({
      description: "List clients/customers in the current organization.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
      execute: async ({ limit }) => {
        const { data, error } = await admin
          .from("clients")
          .select("id, name, username, contact_email, status, created_at")
          .eq("organization_id", context?.organizationId || LEMTEL_ORG)
          .order("created_at", { ascending: false })
          .limit(limit);
        return error ? { error: error.message } : { clients: data };
      },
    }),

    list_extensions: tool({
      description: "List PBX extensions for a FusionPBX domain (defaults to the org's domain).",
      inputSchema: z.object({ domain_uuid: z.string().optional() }),
      execute: async ({ domain_uuid }) => callFn("fusionpbx-proxy", {
        action: "list-extensions", domain_uuid,
      }).then(r => r.data),
    }),

    list_queues: tool({
      description: "List call-center queues.",
      inputSchema: z.object({ domain_uuid: z.string().optional() }),
      execute: async ({ domain_uuid }) => callFn("fusionpbx-proxy", {
        action: "list-queues", domain_uuid,
      }).then(r => r.data),
    }),

    list_ivrs: tool({
      description: "List IVR menus.",
      inputSchema: z.object({ domain_uuid: z.string().optional() }),
      execute: async ({ domain_uuid }) => callFn("fusionpbx-proxy", {
        action: "list-ivrs", domain_uuid,
      }).then(r => r.data),
    }),

    list_gateways: tool({
      description: "List SIP gateways/trunks across all FusionPBX domains.",
      inputSchema: z.object({}),
      execute: async () => callFn("fusionpbx-proxy", { action: "list-gateways-all-domains" }).then(r => r.data),
    }),

    list_domains: tool({
      description: "List FusionPBX tenant domains (each domain = one client PBX).",
      inputSchema: z.object({}),
      execute: async () => callFn("fusionpbx-proxy", { action: "list-domains" }).then(r => r.data),
    }),

    list_voice_agents: tool({
      description: "List voice agents (ElevenLabs/Vapi/Retell) in the org.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await admin
          .from("agents")
          .select("id, name, platform, status, created_at")
          .eq("organization_id", context?.organizationId || LEMTEL_ORG)
          .order("created_at", { ascending: false });
        return error ? { error: error.message } : { agents: data };
      },
    }),

    get_call_stats: tool({
      description: "Get call statistics for the current org over the last N days.",
      inputSchema: z.object({ days: z.number().int().min(1).max(90).default(7) }),
      execute: async ({ days }) => {
        const since = new Date(Date.now() - days * 86400_000).toISOString();
        const { data, error } = await admin
          .from("pbx_call_records")
          .select("direction, call_status, duration_seconds")
          .eq("organization_id", context?.organizationId || LEMTEL_ORG)
          .gte("start_at", since);
        if (error) return { error: error.message };
        const total = data?.length || 0;
        const answered = (data || []).filter((c: any) => c.call_status === "answered").length;
        const inbound = (data || []).filter((c: any) => c.direction === "inbound").length;
        const totalSec = (data || []).reduce((a: number, c: any) => a + (c.duration_seconds || 0), 0);
        return { total, answered, inbound, outbound: total - inbound, total_minutes: Math.round(totalSec / 60), since };
      },
    }),

    // ===== Write (require explicit user confirmation in the conversation) =====
    create_client: tool({
      description: "Create a new client/customer in the current org. Only call after the user explicitly confirms with the final name, email and (optional) username.",
      inputSchema: z.object({
        name: z.string().min(1),
        contact_email: z.string().email().optional(),
        username: z.string().optional(),
        phone: z.string().optional(),
      }),
      execute: async (input) => {
        const { data, error } = await admin.from("clients").insert({
          organization_id: context?.organizationId || LEMTEL_ORG,
          name: input.name,
          contact_email: input.contact_email,
          username: input.username,
          phone: input.phone,
          status: "active",
        }).select().single();
        return error ? { error: error.message } : { client: data, message: `Client "${input.name}" created.` };
      },
    }),

    invite_org_member: tool({
      description: "Invite a user (by email) to the current organization with a given role. Only call after explicit confirmation.",
      inputSchema: z.object({
        email: z.string().email(),
        role: z.enum(["org_admin", "manager", "agent", "viewer"]),
        full_name: z.string().optional(),
      }),
      execute: async (input) => callFn("invite-member", {
        organization_id: context?.organizationId || LEMTEL_ORG,
        email: input.email, role: input.role, full_name: input.full_name,
      }).then(r => r.ok ? { ok: true, ...r.data } : { error: r.data?.error || "Invite failed" }),
    }),

    create_extension: tool({
      description: "Create a new PBX extension on a FusionPBX domain. Confirm domain, extension number, display name and password with the user before calling.",
      inputSchema: z.object({
        domain_uuid: z.string(),
        extension: z.string(),
        password: z.string().min(8),
        effective_caller_id_name: z.string().optional(),
      }),
      execute: async (input) => callFn("fusionpbx-proxy", {
        action: "create-extensions",
        domain_uuid: input.domain_uuid,
        params: input,
      }).then(r => r.data),
    }),

    create_voice_agent: tool({
      description: "Create a new voice agent on ElevenLabs/Vapi/Retell. Confirm name, platform, voice and prompt before calling.",
      inputSchema: z.object({
        name: z.string(),
        platform: z.enum(["elevenlabs", "vapi", "retell"]),
        prompt: z.string(),
        voice_id: z.string().optional(),
        first_message: z.string().optional(),
      }),
      execute: async (input) => callFn("create-platform-agent", {
        organization_id: context?.organizationId || LEMTEL_ORG, ...input,
      }).then(r => r.ok ? r.data : { error: r.data?.error || "Create failed" }),
    }),

    navigate: tool({
      description: "Navigate the user's browser to a route in the app. Use to take the user to the page where they will see the result.",
      inputSchema: z.object({ path: z.string().regex(/^\//) }),
      execute: async ({ path }) => ({ navigate_to: path }),
    }),
  };

  const SYSTEM = `You are Lemtel, the AVA Statistic mascot — a friendly, professional cyber-fox who helps administrators run their telephony / voice-AI platform.

CONTEXT (current user session):
- Page route: ${context?.route || "unknown"}
- Organization id: ${context?.organizationId || LEMTEL_ORG} (${context?.organizationName || "Lemtel"})
- User email: ${user.email}
- Locale hint: ${context?.locale || "auto"}

PROTOCOL — for ANY task you must follow these steps:
1. UNDERSTAND — read the request. If anything is missing, ask ONE clarifying question at a time. Do not ask many questions in one message.
2. PLAN — when you have enough info, summarize what you will do as a short plan (3–6 lines).
3. CONFIRM — before any write tool (create_*, invite_*, update_*, delete_*), explicitly write "Confirm? (yes/no)" and WAIT for the user to reply yes/oui/confirm. Never call a write tool without an immediate prior user confirmation.
4. EXECUTE — call the tool. If it fails, explain the error and propose a fix.
5. REPORT — confirm what was done, link/route the user to the result via the navigate tool when relevant.

STYLE:
- Detect the user's language (French or English) and reply in the same language.
- Be warm, concise, slightly playful. Sign off as "🦊 Lemtel" when finishing a task.
- Use markdown. Use lists/tables when summarizing data.
- Never invent UUIDs or credentials — always read them via the list_* tools first.
- Never expose secrets, API keys or passwords in messages.

BUSINESS MODEL primer:
- The platform is a multi-tenant reseller of voice-AI + telephony. Each "client" (in 'clients' table) belongs to one organization. Each client may have voice agents (ElevenLabs/Vapi/Retell), phone numbers (DIDs), and a FusionPBX domain (extensions, IVRs, queues, ring groups, gateways).
- The FusionPBX side handles SIP/voice routing; the voice-AI platforms handle the conversation logic. The two are bound via gateways + phone-number assignments.`;

  const gateway = createLovableAiGatewayProvider(LOVABLE_KEY);
  const model = gateway("google/gemini-3-flash-preview");

  const result = streamText({
    model,
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(50),
  });

  return result.toUIMessageStreamResponse({
    headers: corsHeaders,
    originalMessages: messages,
  });
});
