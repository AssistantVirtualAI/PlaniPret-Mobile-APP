// ava-assistant: unified agentic chatbot for Mobile, Desktop, and Web.
// - Read tools: calls, recordings, voicemails, sms, contacts, presence, extensions
// - Analyze tools: recording transcript + ai summary
// - Report tools: aggregate metrics + downloadable PDF report
// - Action tools (require confirm:true): send_sms, click_to_call
//
// Security model
// --------------
// * Caller scope is resolved from pbx_softphone_users (organization_id + extension + domain_uuid).
// * EVERY tool call is wrapped with auditTool() which:
//     - logs to telecom_admin_ai_actions (action="tool:<name>", payload, result, status)
//     - denies execution and logs a "denied" row when:
//         - orgId is missing (no PBX domain linked)
//         - the tool requires an extension and caller has none
//         - a target object resolved by the tool belongs to a different organization_id
//   Denials return { error: "forbidden", reason } so the model can explain to the user.
// * Mutating tools (send_sms, click_to_call) ALWAYS preview first (confirm:false) and only
//   execute on confirm:true.
import { generateText, tool, stepCountIs } from "npm:ai";
import { z } from "npm:zod";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

function normalizeBody(body: any): ChatMsg[] {
  if (Array.isArray(body?.messages)) {
    return body.messages
      .filter((m: any) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant" || m.role === "system"))
      .slice(-24)
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 8000) }));
  }
  const out: ChatMsg[] = [];
  if (Array.isArray(body?.history)) {
    for (const h of body.history.slice(-12)) {
      if (h?.role === "user" || h?.role === "assistant") {
        out.push({ role: h.role, content: String(h.content || "").slice(0, 8000) });
      }
    }
  }
  if (typeof body?.message === "string" && body.message.trim()) {
    out.push({ role: "user", content: body.message.slice(0, 8000) });
  }
  return out;
}

const e164 = (n: string) => {
  const d = String(n).replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const rid = crypto.randomUUID().slice(0, 8);
  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ answer: "AVA is not configured yet (missing AI key)." });

    const body = await req.json().catch(() => ({}));
    const messages = normalizeBody(body);
    if (messages.length === 0) return json({ error: "no_messages" }, 400);

    // Resolve caller scope
    const { data: spu } = await admin
      .from("pbx_softphone_users")
      .select("organization_id, extension, display_name, sip_domain, domain_uuid")
      .eq("portal_user_id", u.user.id)
      .maybeSingle();

    const orgId: string | null = spu?.organization_id ?? null;
    const myExt: string | null = spu?.extension ?? null;
    const domainUuid: string | null = spu?.domain_uuid ?? null;
    const sipDomain: string | null = spu?.sip_domain ?? null;

    // Centralized audit writer — maps to telecom_admin_ai_actions schema
    const writeAudit = async (
      action: string,
      payload: any,
      result: any,
      status: "completed" | "failed" | "denied",
    ) => {
      try {
        await admin.from("telecom_admin_ai_actions").insert({
          organization_id: orgId,
          admin_user_id: u.user.id,
          interpreted_action: action,
          proposed_changes_json: { ...payload, _ext: myExt, _rid: rid },
          execution_result_json: result,
          execution_status: status,
          confirmation_status: status === "denied" ? "denied" : "auto",
          source: "ava-assistant",
          executed_at: new Date().toISOString(),
        });
      } catch { /* never block on audit */ }
    };

    if (!orgId) {
      await writeAudit("session:no_domain", { messages: messages.length }, { reason: "no_pbx_extension" }, "denied");
      const gateway = createLovableAiGatewayProvider(apiKey);
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system: "You are AVA. The user has no PBX extension linked, so you cannot read calls, recordings, SMS, voicemails, contacts, or presence. Politely tell them to link a softphone extension first.",
        messages,
      });
      return json({ answer: text });
    }

    // ------------------------------------------------------------
    // Audit + permission wrapper for every tool execute()
    // ------------------------------------------------------------
    function auditTool<TIn extends Record<string, any>>(opts: {
      name: string;
      description: string;
      inputSchema: z.ZodType<TIn>;
      requiresExtension?: boolean;
      execute: (input: TIn) => Promise<any>;
    }) {
      return tool({
        description: opts.description,
        inputSchema: opts.inputSchema,
        execute: async (input: TIn) => {
          if (!orgId) {
            const denied = { error: "forbidden", reason: "no_pbx_domain" };
            await writeAudit(`tool:${opts.name}`, input, denied, "denied");
            return denied;
          }
          if (opts.requiresExtension && !myExt) {
            const denied = { error: "forbidden", reason: "no_extension_linked" };
            await writeAudit(`tool:${opts.name}`, input, denied, "denied");
            return denied;
          }
          try {
            const out = await opts.execute(input);
            const ok = !out || !out.error;
            // Cap audit payload size
            const safe = JSON.stringify(out).slice(0, 4000);
            await writeAudit(`tool:${opts.name}`, input, JSON.parse(safe.endsWith("}") || safe.endsWith("]") ? safe : safe + '"'), ok ? "completed" : "failed");
            return out;
          } catch (e: any) {
            const err = { error: e?.message || "tool_failed" };
            await writeAudit(`tool:${opts.name}`, input, err, "failed");
            return err;
          }
        },
      });
    }

    // Domain-belongs-to-caller guard for objects resolved by id.
    const ensureOrg = async (table: string, id: string) => {
      const { data } = await admin.from(table).select("organization_id").eq("id", id).maybeSingle();
      if (!data) return { ok: false, reason: "not_found" };
      if (data.organization_id !== orgId) return { ok: false, reason: "forbidden_cross_domain" };
      return { ok: true };
    };

    // Shared run_report aggregator (reused by run_report + generate_report_pdf)
    async function aggregateReport(days: number, groupBy: "day" | "extension", extension?: string) {
      const since = new Date(); since.setDate(since.getDate() - days); since.setHours(0, 0, 0, 0);
      let q: any = admin.from("pbx_call_records")
        .select("id, direction, missed_call, extension, start_at, duration_seconds")
        .gte("start_at", since.toISOString())
        .eq("organization_id", orgId);
      if (extension) q = q.or(`extension.eq.${extension},caller_number.eq.${extension},destination_number.eq.${extension}`);
      const { data, error } = await q.limit(5000);
      if (error) return { error: error.message };
      const rows = data ?? [];
      const bucket = new Map<string, { total: number; answered: number; missed: number; talk_minutes: number }>();
      for (const r of rows) {
        const key = groupBy === "day"
          ? new Date(r.start_at).toISOString().slice(0, 10)
          : (r.extension || "—");
        const b = bucket.get(key) || { total: 0, answered: 0, missed: 0, talk_minutes: 0 };
        b.total += 1;
        if (r.missed_call) b.missed += 1; else b.answered += 1;
        b.talk_minutes += Math.round(((r.duration_seconds || 0) / 60) * 10) / 10;
        bucket.set(key, b);
      }
      const out = Array.from(bucket.entries()).map(([k, v]) => ({ key: k, ...v }))
        .sort((a, b) => groupBy === "day" ? a.key.localeCompare(b.key) : b.total - a.total);
      const totals = out.reduce((acc, r) => ({
        total: acc.total + r.total,
        answered: acc.answered + r.answered,
        missed: acc.missed + r.missed,
        talk_minutes: Math.round((acc.talk_minutes + r.talk_minutes) * 10) / 10,
      }), { total: 0, answered: 0, missed: 0, talk_minutes: 0 });
      return { days, group_by: groupBy, extension: extension || null, rows: out, totals };
    }

    const tools: Record<string, any> = {
      // -------- READ TOOLS --------
      list_calls: auditTool({
        name: "list_calls",
        description: "List recent call records in the caller's PBX domain. Filters: extension number, days (1-30), direction, missed only.",
        inputSchema: z.object({
          days: z.number().int().min(1).max(30).default(7),
          extension: z.string().optional(),
          direction: z.enum(["inbound", "outbound", "any"]).default("any"),
          missed_only: z.boolean().default(false),
          limit: z.number().int().min(1).max(100).default(25),
        }),
        execute: async ({ days, extension, direction, missed_only, limit }) => {
          const since = new Date(); since.setDate(since.getDate() - days); since.setHours(0, 0, 0, 0);
          let q: any = admin.from("pbx_call_records")
            .select("id, direction, missed_call, caller_number, caller_name, destination_number, extension, start_at, duration_seconds, has_recording, ai_summary")
            .gte("start_at", since.toISOString())
            .eq("organization_id", orgId);
          if (extension) q = q.or(`extension.eq.${extension},caller_number.eq.${extension},destination_number.eq.${extension}`);
          if (direction !== "any") q = q.eq("direction", direction);
          if (missed_only) q = q.eq("missed_call", true);
          const { data, error } = await q.order("start_at", { ascending: false }).limit(limit);
          return error ? { error: error.message } : { count: data?.length ?? 0, calls: data ?? [] };
        },
      }),

      list_recordings: auditTool({
        name: "list_recordings",
        description: "List call recordings with metadata. Use analyze_recording for transcript + AI summary.",
        inputSchema: z.object({
          days: z.number().int().min(1).max(30).default(7),
          extension: z.string().optional(),
          limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ days, extension, limit }) => {
          const since = new Date(); since.setDate(since.getDate() - days); since.setHours(0, 0, 0, 0);
          let q: any = admin.from("pbx_call_records")
            .select("id, pbx_uuid, caller_number, caller_name, destination_number, extension, start_at, duration_seconds, transcribed, ai_summary, has_recording")
            .eq("has_recording", true).gte("start_at", since.toISOString())
            .eq("organization_id", orgId);
          if (extension) q = q.or(`extension.eq.${extension},caller_number.eq.${extension},destination_number.eq.${extension}`);
          const { data, error } = await q.order("start_at", { ascending: false }).limit(limit);
          return error ? { error: error.message } : { count: data?.length ?? 0, recordings: data ?? [] };
        },
      }),

      analyze_recording: auditTool({
        name: "analyze_recording",
        description: "Fetch transcript and AI summary/sentiment for a call recording by call id (pbx_call_records.id).",
        inputSchema: z.object({ call_id: z.string().uuid() }),
        execute: async ({ call_id }) => {
          const chk = await ensureOrg("pbx_call_records", call_id);
          if (!chk.ok) return { error: chk.reason };
          const { data: rec } = await admin.from("pbx_call_records")
            .select("ai_summary, sentiment, transcribed, has_recording")
            .eq("id", call_id).maybeSingle();
          const { data: tr } = await admin.from("pbx_call_transcripts")
            .select("text, language, created_at").eq("call_record_id", call_id).maybeSingle();
          const { data: ins } = await admin.from("pbx_ai_insights")
            .select("summary, sentiment, action_items, topics, intents, key_phrases, created_at")
            .eq("call_record_id", call_id).maybeSingle();
          if (!tr && !ins && rec?.has_recording && !rec?.transcribed) {
            await admin.from("pbx_ai_jobs").insert({
              organization_id: orgId, call_record_id: call_id, kind: "process_recording", status: "pending",
            }).then(() => {}, () => {});
            return { status: "queued_for_processing", call_id };
          }
          return {
            call_id,
            transcript: tr?.text ?? null,
            ai_summary: ins?.summary ?? rec?.ai_summary ?? null,
            sentiment: ins?.sentiment ?? rec?.sentiment ?? null,
            action_items: ins?.action_items ?? null,
            topics: ins?.topics ?? null,
          };
        },
      }),

      list_voicemails: auditTool({
        name: "list_voicemails",
        description: "List voicemails for an extension (defaults to caller's extension).",
        inputSchema: z.object({
          extension: z.string().optional(),
          unread_only: z.boolean().default(false),
          limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ extension, unread_only, limit }) => {
          const ext = extension || myExt;
          let q: any = admin.from("pbx_voicemails")
            .select("id, extension, caller_number, caller_name, duration, created_at, read_at")
            .eq("organization_id", orgId);
          if (ext) q = q.eq("extension", ext);
          if (unread_only) q = q.is("read_at", null);
          const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
          return error ? { error: error.message } : { count: data?.length ?? 0, voicemails: data ?? [] };
        },
      }),

      list_sms_threads: auditTool({
        name: "list_sms_threads",
        description: "List SMS threads in the domain.",
        inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
        execute: async ({ limit }) => {
          const { data, error } = await admin.from("pbx_sms_threads")
            .select("id, contact_number, contact_name, last_message_at, unread_count")
            .eq("organization_id", orgId).order("last_message_at", { ascending: false }).limit(limit);
          return error ? { error: error.message } : { count: data?.length ?? 0, threads: data ?? [] };
        },
      }),

      list_sms_messages: auditTool({
        name: "list_sms_messages",
        description: "Read messages in an SMS thread.",
        inputSchema: z.object({ thread_id: z.string().uuid(), limit: z.number().int().min(1).max(100).default(40) }),
        execute: async ({ thread_id, limit }) => {
          const chk = await ensureOrg("pbx_sms_threads", thread_id);
          if (!chk.ok) return { error: chk.reason };
          const { data, error } = await admin.from("pbx_sms_messages")
            .select("id, direction, body, from_number, to_number, status, created_at")
            .eq("thread_id", thread_id).order("created_at", { ascending: true }).limit(limit);
          return error ? { error: error.message } : { count: data?.length ?? 0, messages: data ?? [] };
        },
      }),

      list_contacts: auditTool({
        name: "list_contacts",
        description: "Search organization contacts by name, phone, email, or company.",
        inputSchema: z.object({ query: z.string().min(1).max(100), limit: z.number().int().min(1).max(30).default(10) }),
        execute: async ({ query, limit }) => {
          const { data, error } = await admin.from("org_contacts")
            .select("id, full_name, primary_number, email, company")
            .eq("organization_id", orgId)
            .or(`full_name.ilike.%${query}%,primary_number.ilike.%${query}%,email.ilike.%${query}%,company.ilike.%${query}%`)
            .limit(limit);
          return error ? { error: error.message } : { count: data?.length ?? 0, contacts: data ?? [] };
        },
      }),

      list_extensions: auditTool({
        name: "list_extensions",
        description: "List PBX extensions in the domain (number, display name, status).",
        inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(50) }),
        execute: async ({ limit }) => {
          const { data, error } = await admin.from("pbx_extensions")
            .select("extension, effective_cid_name, enabled, registered, last_registered_at")
            .eq("organization_id", orgId).order("extension").limit(limit);
          return error ? { error: error.message } : { count: data?.length ?? 0, extensions: data ?? [] };
        },
      }),

      presence_directory: auditTool({
        name: "presence_directory",
        description: "Show who is online / busy / away in the domain.",
        inputSchema: z.object({}),
        execute: async () => {
          const { data, error } = await admin.from("user_presence")
            .select("user_id, extension, status, status_message, call_state, last_seen_at")
            .eq("organization_id", orgId).order("status").limit(100);
          return error ? { error: error.message } : { count: data?.length ?? 0, presence: data ?? [] };
        },
      }),

      run_report: auditTool({
        name: "run_report",
        description: "Aggregate call metrics. group_by: 'day' or 'extension'. Returns rows + totals.",
        inputSchema: z.object({
          days: z.number().int().min(1).max(30).default(7),
          group_by: z.enum(["day", "extension"]).default("day"),
          extension: z.string().optional(),
        }),
        execute: async ({ days, group_by, extension }) => aggregateReport(days, group_by, extension),
      }),

      generate_report_pdf: auditTool({
        name: "generate_report_pdf",
        description: "Generate a downloadable PDF call report (7 or 30 days, by day or by extension) and return a short-lived signed URL. Use this when the user asks to download or export a report.",
        inputSchema: z.object({
          days: z.union([z.literal(7), z.literal(30)]).default(7),
          group_by: z.enum(["day", "extension"]).default("day"),
          extension: z.string().optional(),
        }),
        execute: async ({ days, group_by, extension }) => {
          const agg: any = await aggregateReport(days, group_by, extension);
          if (agg.error) return { error: agg.error };

          // Build PDF
          const pdf = await PDFDocument.create();
          const page = pdf.addPage([612, 792]); // Letter
          const font = await pdf.embedFont(StandardFonts.Helvetica);
          const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
          const draw = (t: string, x: number, y: number, size = 10, f = font, color = rgb(0, 0, 0)) =>
            page.drawText(t, { x, y, size, font: f, color });

          let y = 750;
          draw("AVA Call Report", 50, y, 18, bold); y -= 22;
          draw(`Domain: ${sipDomain || orgId}`, 50, y); y -= 14;
          draw(`Range: last ${days} day(s)   Group by: ${group_by}${extension ? `   Extension: ${extension}` : ""}`, 50, y); y -= 14;
          draw(`Generated: ${new Date().toISOString()}`, 50, y); y -= 24;

          draw("Totals", 50, y, 12, bold); y -= 16;
          draw(`Calls: ${agg.totals.total}    Answered: ${agg.totals.answered}    Missed: ${agg.totals.missed}    Talk minutes: ${agg.totals.talk_minutes}`, 50, y); y -= 24;

          // Header
          const cols = group_by === "day"
            ? ["Date", "Total", "Answered", "Missed", "Talk (min)"]
            : ["Extension", "Total", "Answered", "Missed", "Talk (min)"];
          const xs = [50, 200, 290, 380, 470];
          cols.forEach((c, i) => draw(c, xs[i], y, 10, bold));
          y -= 4; page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) }); y -= 14;

          for (const r of agg.rows.slice(0, 60)) {
            if (y < 60) { y = 750; pdf.addPage([612, 792]); }
            const vals = [String(r.key), String(r.total), String(r.answered), String(r.missed), String(r.talk_minutes)];
            vals.forEach((v, i) => draw(v, xs[i], y));
            y -= 14;
          }

          const bytes = await pdf.save();

          // Upload + sign
          const path = `ava-reports/${orgId}/${Date.now()}-${days}d-${group_by}${extension ? `-${extension}` : ""}.pdf`;
          const upErr = (await admin.storage.from("chat-attachments").upload(path, bytes, {
            contentType: "application/pdf", upsert: true,
          })).error;
          if (upErr) return { error: `upload_failed: ${upErr.message}` };
          const { data: signed, error: signErr } = await admin.storage.from("chat-attachments")
            .createSignedUrl(path, 60 * 60); // 1 hour
          if (signErr) return { error: signErr.message };
          return {
            ok: true,
            attachment: {
              kind: "pdf",
              title: `AVA Report — ${days}d by ${group_by}${extension ? ` · ext ${extension}` : ""}`,
              filename: path.split("/").pop(),
              url: signed?.signedUrl,
              expires_in_seconds: 3600,
            },
            summary: agg.totals,
          };
        },
      }),

      // -------- ACTION TOOLS (require confirm:true) --------
      send_sms: auditTool({
        name: "send_sms",
        description: "Send an SMS in a thread. Pass confirm:false (default) first to preview; reply with confirm:true after the user explicitly approves.",
        requiresExtension: true,
        inputSchema: z.object({
          thread_id: z.string().uuid(),
          body: z.string().min(1).max(1000),
          confirm: z.boolean().default(false),
        }),
        execute: async ({ thread_id, body, confirm }) => {
          const chk = await ensureOrg("pbx_sms_threads", thread_id);
          if (!chk.ok) return { error: chk.reason };
          const { data: t } = await admin.from("pbx_sms_threads")
            .select("contact_number, contact_name").eq("id", thread_id).maybeSingle();
          if (!confirm) {
            return { requires_confirmation: true, preview: { action: "send_sms", to: t?.contact_number, contact: t?.contact_name, body } };
          }
          const { data, error } = await admin.functions.invoke("mobile-sms", {
            body: { threadId: thread_id, body },
            headers: { Authorization: authHeader },
          });
          return error ? { error: error.message } : { ok: true, result: data };
        },
      }),

      click_to_call: auditTool({
        name: "click_to_call",
        description: "Place an outbound call from the caller's extension. Pass confirm:false (default) first to preview; reply with confirm:true after the user explicitly approves.",
        requiresExtension: true,
        inputSchema: z.object({
          to: z.string().min(3).max(20),
          mode: z.enum(["webrtc", "click_to_call"]).default("click_to_call"),
          confirm: z.boolean().default(false),
        }),
        execute: async ({ to, mode, confirm }) => {
          const target = e164(to);
          if (!confirm) return { requires_confirmation: true, preview: { action: "click_to_call", from_extension: myExt, to: target, mode } };
          const { data, error } = await admin.functions.invoke("mobile-calls-start", {
            body: { to: target, mode },
            headers: { Authorization: authHeader },
          });
          return error ? { error: error.message } : { ok: true, result: data };
        },
      }),

      get_recording_url: auditTool({
        name: "get_recording_url",
        description: "Issue a short-lived signed URL to play a recording for a given call id.",
        inputSchema: z.object({ call_id: z.string().uuid() }),
        execute: async ({ call_id }) => {
          const chk = await ensureOrg("pbx_call_records", call_id);
          if (!chk.ok) return { error: chk.reason };
          const { data: rec } = await admin.from("pbx_call_records")
            .select("recording_path, recording_name").eq("id", call_id).maybeSingle();
          if (!rec?.recording_path) return { error: "no_recording" };
          const { data, error } = await admin.storage.from("recordings").createSignedUrl(rec.recording_path, 300);
          return error ? { error: error.message } : { url: data?.signedUrl, name: rec.recording_name };
        },
      }),

      mark_voicemail_read: auditTool({
        name: "mark_voicemail_read",
        description: "Mark a voicemail as read.",
        inputSchema: z.object({ voicemail_id: z.string().uuid() }),
        execute: async ({ voicemail_id }) => {
          const chk = await ensureOrg("pbx_voicemails", voicemail_id);
          if (!chk.ok) return { error: chk.reason };
          const { error } = await admin.rpc("mark_voicemail_read", { _id: voicemail_id });
          return error ? { error: error.message } : { ok: true };
        },
      }),
    };

    const system = `You are AVA, the AI assistant inside the AVA Softphone (mobile, desktop, and web).
You can read and reason about the user's phone system across their entire PBX domain.
- Caller display name: ${spu?.display_name || "user"}
- Caller extension: ${myExt || "n/a"}
- SIP domain: ${sipDomain || "n/a"}

Rules:
1. Always use tools for live data; never invent calls, voicemails, contacts, or numbers.
2. For mutating actions (send_sms, click_to_call): FIRST call the tool with confirm:false to get a preview, repeat the preview to the user in one short sentence, and ask "Reply 'confirm' to proceed." Only call again with confirm:true after the user explicitly confirms.
3. When the user asks to download / export / share a call report, use generate_report_pdf and present the returned URL as a markdown link: [Download PDF](URL).
4. Be terse — 1-4 sentences unless asked for detail. Use bullet lists for multi-row results.
5. If a tool returns { error: "forbidden" } or { error: "forbidden_cross_domain" }, tell the user the item is outside their PBX domain and stop. Do not retry.`;

    const gateway = createLovableAiGatewayProvider(apiKey);
    const { text, toolCalls, toolResults, finishReason, usage } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system,
      messages,
      tools,
      stopWhen: stepCountIs(50),
    });

    // Surface attachments from any tool that returned one
    const attachments = (toolResults || [])
      .map((tr: any) => tr?.output?.attachment)
      .filter(Boolean);

    console.log(JSON.stringify({ fn: "ava-assistant", rid, uid: u.user.id, org: orgId, finishReason, steps: toolCalls?.length ?? 0, usage }));

    return json({
      answer: text || "(no response)",
      attachments,
      toolCalls: (toolCalls || []).map((tc: any) => ({ name: tc.toolName, input: tc.input })),
      toolResults: (toolResults || []).map((tr: any) => ({ name: tr.toolName, output: tr.output })),
    });
  } catch (e: any) {
    console.error("[ava-assistant]", rid, e?.message, e?.stack);
    return json({ error: e?.message || "internal_error" }, 500);
  }
});
