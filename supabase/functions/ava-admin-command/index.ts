// AVA admin chat command pipeline.
// Hardened: zod-validated body, structured logging, latency tracking,
// strict super_admin/lemtel_admin gate, audit log on every tool exec.
import { streamText, tool, stepCountIs, convertToModelMessages, type UIMessage } from "npm:ai";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { z } from "npm:zod";
import { corsHeaders, jsonResponse, requireUser, getServiceClient } from "../_shared/auth.ts";

const FN = "ava-admin-command";
const log = (rid: string, lvl: "info" | "warn" | "error", msg: string, extra?: any) =>
  console.log(JSON.stringify({ fn: FN, rid, lvl, msg, ...(extra || {}), t: Date.now() }));

const BodySchema = z.object({
  messages: z.array(z.object({
    id: z.string().optional(),
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(z.any()).optional(),
    content: z.any().optional(),
  })).min(1).max(50),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const rid = crypto.randomUUID().slice(0, 8);
  const t0 = Date.now();

  try {
    const auth = await requireUser(req);
    if ("error" in auth) { log(rid, "warn", "unauthenticated"); return auth.error; }

    const admin = getServiceClient();
    const [{ data: isSuper }, { data: isLemtel }] = await Promise.all([
      admin.rpc("is_super_admin", { _user_id: auth.user.id }),
      admin.rpc("is_lemtel_admin", { _user_id: auth.user.id }),
    ]);
    const isAdmin = !!isSuper || !!isLemtel;

    // Resolve caller's softphone org/extension (used for read-only scoping)
    const { data: spu } = await admin
      .from("pbx_softphone_users")
      .select("organization_id, extension, display_name")
      .eq("portal_user_id", auth.user.id)
      .maybeSingle();

    if (!isAdmin && !spu) {
      log(rid, "warn", "forbidden_no_softphone", { uid: auth.user.id });
      return jsonResponse(403, { error: "No softphone account linked to this user" });
    }
    const callerOrgId: string | null = spu?.organization_id ?? null;
    const callerExt: string | null = spu?.extension ?? null;


    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) { log(rid, "error", "missing_api_key"); return jsonResponse(500, { error: "Missing LOVABLE_API_KEY" }); }

    let rawBody: unknown;
    try { rawBody = await req.json(); } catch { return jsonResponse(400, { error: "Invalid JSON" }); }
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      log(rid, "warn", "validation_failed", { issues: parsed.error.flatten() });
      return jsonResponse(400, { error: "Invalid body", details: parsed.error.flatten() });
    }
    const messages = parsed.data.messages as UIMessage[];

    const gateway = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const audit = async (action: string, payload: any, result: any, ok = true) => {
      await admin.from("telecom_admin_ai_actions").insert({
        user_id: auth.user.id,
        action,
        payload,
        result,
        status: ok ? "completed" : "failed",
      }).then(() => {}, (e) => log(rid, "warn", "audit_insert_failed", { err: e?.message }));
    };

    const tools: Record<string, any> = {
      // ---- READ-ONLY: available to every authenticated softphone user ----
      my_call_stats: tool({
        description: "Counts of inbound/outbound/answered/missed calls for the current user's extension within a date range (defaults to yesterday).",
        inputSchema: z.object({
          range: z.enum(["today", "yesterday", "7d", "30d"]).default("yesterday"),
        }),
        execute: async ({ range }) => {
          if (!callerOrgId) return { error: "No organization" };
          const now = new Date();
          const start = new Date(now);
          const end = new Date(now);
          if (range === "today") { start.setHours(0,0,0,0); }
          else if (range === "yesterday") { start.setDate(start.getDate()-1); start.setHours(0,0,0,0); end.setHours(0,0,0,0); }
          else if (range === "7d") { start.setDate(start.getDate()-7); }
          else if (range === "30d") { start.setDate(start.getDate()-30); }
          let q = admin.from("pbx_call_records")
            .select("id,direction,missed_call,call_status,start_at,caller_number,destination_number,extension", { count: "exact" })
            .eq("organization_id", callerOrgId)
            .gte("start_at", start.toISOString())
            .lt("start_at", end.toISOString());
          if (callerExt) {
            q = q.or(`extension.eq.${callerExt},caller_number.eq.${callerExt},destination_number.eq.${callerExt}`);
          }
          const { data, error } = await q.order("start_at", { ascending: false }).limit(500);
          if (error) return { error: error.message };
          const rows = data ?? [];
          const total = rows.length;
          const missed = rows.filter(r => r.missed_call).length;
          const answered = rows.filter(r => !r.missed_call && r.call_status !== "voicemail").length;
          const inbound = rows.filter(r => r.direction === "inbound" || r.direction === "in").length;
          const outbound = rows.filter(r => r.direction === "outbound" || r.direction === "out").length;
          return { range, extension: callerExt, total, missed, answered, inbound, outbound };
        },
      }),
      list_my_recent_calls: tool({
        description: "List the caller's recent calls (defaults to last 20).",
        inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
        execute: async ({ limit }) => {
          if (!callerOrgId) return { error: "No organization" };
          let q = admin.from("pbx_call_records")
            .select("id,direction,call_status,missed_call,caller_number,destination_number,start_at,duration_seconds,has_recording")
            .eq("organization_id", callerOrgId);
          if (callerExt) q = q.or(`extension.eq.${callerExt},caller_number.eq.${callerExt},destination_number.eq.${callerExt}`);
          const { data, error } = await q.order("start_at", { ascending: false }).limit(limit);
          return error ? { error: error.message } : { calls: data ?? [] };
        },
      }),
    };

    // ---- ADMIN-ONLY tools ----
    if (isAdmin) {
      Object.assign(tools, {
        list_outages: tool({
          description: "List active telecom sync failures and outages across all orgs.",
          inputSchema: z.object({}),
          execute: async () => {
            const { data, error } = await admin
              .from("telecom_sync_health")
              .select("organization_id, kind, status, last_error, updated_at")
              .neq("status", "healthy").order("updated_at", { ascending: false }).limit(20);
            await audit("list_outages", {}, { count: data?.length ?? 0, error: error?.message }, !error);
            return error ? { error: error.message } : { outages: data ?? [] };
          },
        }),
        extension_status: tool({
          description: "Get registration + presence status for an extension number.",
          inputSchema: z.object({ extension: z.string().min(1).max(20) }),
          execute: async ({ extension }) => {
            const { data, error } = await admin
              .from("pbx_extensions")
              .select("extension, display_name, registered, last_registered_at, organization_id")
              .eq("extension", extension).maybeSingle();
            await audit("extension_status", { extension }, data ?? { error: error?.message }, !error);
            return error ? { error: error.message } : (data ?? { error: "Extension not found" });
          },
        }),
        block_extension: tool({
          description: "Disable an extension in the caller's organization. Requires reason. Destructive.",
          inputSchema: z.object({ extension: z.string().min(1).max(20), reason: z.string().min(3).max(500) }),
          execute: async ({ extension, reason }) => {
            if (!callerOrgId) return { error: "No organization" };
            const { error } = await admin.from("pbx_extensions")
              .update({ enabled: false })
              .eq("extension", extension)
              .eq("organization_id", callerOrgId);
            await audit("block_extension", { extension, reason, organization_id: callerOrgId }, { ok: !error, error: error?.message }, !error);
            return { ok: !error, error: error?.message };
          },
        }),
        force_sync: tool({
          description: "Trigger a PBX sync for an organization slug.",
          inputSchema: z.object({
            org_slug: z.string().min(1).max(100),
            kind: z.enum(["cdr", "config", "devices", "ivr-queues"]),
          }),
          execute: async ({ org_slug, kind }) => {
            const { data: org } = await admin.from("organizations").select("id").eq("slug", org_slug).maybeSingle();
            if (!org) { await audit("force_sync", { org_slug, kind }, { error: "org not found" }, false); return { error: "Organization not found" }; }
            const { data, error } = await admin.functions.invoke(`pbx-sync-${kind}`, { body: { organization_id: org.id } });
            await audit("force_sync", { org_slug, kind }, { ok: !error, data, err: error?.message }, !error);
            return { ok: !error, data, error: error?.message };
          },
        }),
        recent_voicemails: tool({
          description: "List recent voicemails for an organization.",
          inputSchema: z.object({ org_slug: z.string().min(1).max(100), limit: z.number().int().min(1).max(50).default(10) }),
          execute: async ({ org_slug, limit }) => {
            const { data: org } = await admin.from("organizations").select("id").eq("slug", org_slug).maybeSingle();
            if (!org) return { error: "Organization not found" };
            const { data, error } = await admin
              .from("pbx_voicemails")
              .select("id, caller_id, extension, duration, created_at, is_read")
              .eq("organization_id", org.id).order("created_at", { ascending: false }).limit(limit);
            await audit("recent_voicemails", { org_slug, limit }, { count: data?.length ?? 0 }, !error);
            return error ? { error: error.message } : { voicemails: data ?? [] };
          },
        }),
        verify_isolation: tool({
          description: "Run tenant isolation verification for an organization slug.",
          inputSchema: z.object({ org_slug: z.string().min(1).max(100) }),
          execute: async ({ org_slug }) => {
            const { data: org } = await admin.from("organizations").select("id").eq("slug", org_slug).maybeSingle();
            if (!org) return { error: "Organization not found" };
            const { data, error } = await admin.rpc("verify_tenant_isolation", { _org_id: org.id });
            await audit("verify_isolation", { org_slug }, { ok: !error, data }, !error);
            return { ok: !error, report: data, error: error?.message };
          },
        }),
      });
    }

    log(rid, "info", "stream_start", { uid: auth.user.id, msgs: messages.length, admin: isAdmin });

    const result = streamText({
      model: gateway("google/gemini-3-flash-preview"),
      system: isAdmin
        ? `You are AVA, the Lemtel telecom operations assistant. You have admin tools to inspect and remediate the platform. Be terse. Confirm destructive actions and explain results in one or two sentences.`
        : `You are AVA, the user's personal telecom assistant. Use tools (my_call_stats, list_my_recent_calls) to answer questions about the user's own calls, missed calls and voicemails. Be terse. You do not have admin powers.`,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(50),
      onFinish: ({ usage }) => log(rid, "info", "stream_done", { uid: auth.user.id, ms: Date.now() - t0, usage }),
      onError: ({ error }) => log(rid, "error", "stream_error", { uid: auth.user.id, err: String(error) }),
    });


    return result.toUIMessageStreamResponse({ headers: corsHeaders });
  } catch (e: any) {
    log(rid, "error", "unhandled", { err: e?.message, ms: Date.now() - t0 });
    return jsonResponse(500, { error: e?.message || "Internal error" });
  }
});
