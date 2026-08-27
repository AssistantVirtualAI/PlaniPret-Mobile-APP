// AVA Planiprêt — secure server-side tool router for the ElevenLabs agent.
// Every tool the agent triggers passes through here. Logs each call into
// planipret_ava_conversations.
import { authBroker, corsHeaders, jsonResponse, nsBrokerFetch } from "../_shared/ns-broker.ts";
import { normalizePhoneE164 } from "../_shared/phone-normalize.ts";
import { linkBrokerIdByEmail, resolveTelecomUserId } from "../_shared/maestro-broker-directory.ts";
import { claudeText } from "../_shared/anthropic.ts";
import {
  getMaestroOAuthEnv,
  getUserMaestroAccessToken,
  fetchMaestroUserProfile,
  extractMaestroBrokerId,
} from "../_shared/maestro-oauth.ts";
import {
  buildDepositQuery,
  commissionGet,
  summarize,
  institutionLabel,
  num,
} from "../_shared/commission-reports.ts";




const DOMAIN = "planipret.ca";

type Ctx = {
  admin: any;
  userId: string;
  profile: any;
};

type ToolResult = Record<string, unknown> & { success?: boolean; message?: string };

// ─── helpers ────────────────────────────────────────────────────────────
async function logTool(ctx: Ctx, sessionId: string, toolName: string, params: any, result: any) {
  await ctx.admin.from("planipret_ava_conversations").insert({
    user_id: ctx.userId,
    role: "tool",
    session_id: sessionId,
    tool_name: toolName,
    tool_params: params ?? {},
    tool_result: result ?? {},
  }).then(() => null).catch(() => null);
}

async function maestroFetch(ctx: Ctx, path: string, init?: RequestInit) {
  const base = (Deno.env.get("MAESTRO_TELECOM_BASE_URL") ?? Deno.env.get("MAESTRO_TELECOM_API_URL") ?? Deno.env.get("MAESTRO_API_URL") ?? "https://client.planipret.com/telecom/api/v1").replace(/\/$/, "");
  if (!base) throw new Error("maestro_not_configured");
  const { data: profileWithToken } = await ctx.admin
    .from("planipret_profiles")
    .select("maestro_broker_token, maestro_broker_id")
    .eq("id", ctx.profile.id)
    .maybeSingle();
  let token = profileWithToken?.maestro_broker_token ?? "";
  let machine = false;
  if (!token) {
    // Fall back to the production machine key stored in the DB (env copies can be stale).
    const { data: cfg } = await ctx.admin
      .from("planipret_integration_secrets")
      .select("config")
      .eq("provider", "maestro_telecom")
      .maybeSingle();
    token = (cfg as any)?.config?.api_key ?? Deno.env.get("MAESTRO_API_KEY") ?? "";
    machine = true;
  }
  if (!token) throw new Error("maestro_not_connected");
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`${base}${path}${machine ? `${sep}machine=1` : ""}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`maestro_${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json().catch(() => ({}));
}

/** Call the maestro-actions edge function with service-role auth (Scott's /users/{id}/... endpoints). */
async function maestroActions(ctx: Ctx, action: string, payload: Record<string, unknown> = {}) {
  const { data: prof } = await ctx.admin
    .from("planipret_profiles")
    .select("id, maestro_broker_id, email, ms365_email, extension, phone")
    .eq("id", ctx.profile.id)
    .maybeSingle();
  let userId = prof?.maestro_broker_id ?? ctx.profile.maestro_broker_id ?? null;
  // Auto-link from the Maestro broker directory (Microsoft email) when the
  // broker has never been matched yet.
  if ((!userId || !/^\d+$/.test(String(userId).trim())) && prof) {
    const linked = await linkBrokerIdByEmail(ctx.admin, prof as any);
    if (linked.ok && linked.maestro_broker_id) userId = linked.maestro_broker_id;
  }
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/maestro-actions`, {

    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    },
    body: JSON.stringify({ action, payload: { ...payload, user_id: userId } }),
  });
  return await r.json().catch(() => ({ success: false, error: "invalid_response" }));
}

/**
 * Resolve the caller's numeric Maestro telecom user id (production API is
 * scoped per user: /users/{id}/...). Auto-links from the broker directory
 * when the profile has never been matched.
 */
async function maestroUserId(ctx: Ctx): Promise<string | null> {
  // /telecom/api/v1 only accepts the TELECOM user id, never the CRM broker id.
  try {
    const res = await resolveTelecomUserId(ctx.admin, ctx.userId ?? ctx.profile.id, {
      candidate: (ctx.profile as any)?.maestro_broker_id ?? null,
    });
    if (res.id && /^\d+$/.test(res.id)) return res.id;
  } catch { /* noop */ }

  const { data: prof } = await ctx.admin
    .from("planipret_profiles")
    .select("id, maestro_broker_id, maestro_telecom_user_id, email, ms365_email, extension, phone, full_name")
    .eq("id", ctx.profile.id)
    .maybeSingle();
  let uid = prof?.maestro_telecom_user_id ?? null;
  if ((!uid || !/^\d+$/.test(String(uid).trim())) && prof) {
    try {
      const linked = await linkBrokerIdByEmail(ctx.admin, prof as any);
      if (linked.ok && linked.maestro_broker_id) uid = linked.maestro_broker_id;
    } catch { /* noop */ }
  }
  uid = uid ? String(uid).trim() : null;
  return uid && /^\d+$/.test(uid) ? uid : null;
}

const MAESTRO_NOT_LINKED = {
  success: false,
  error: "maestro_not_connected",
  message: "Compte Maestro non lié. Connectez Maestro dans Réglages → Maestro.",
};

async function broadcastNav(ctx: Ctx, route: string, extra?: any) {
  // Use Supabase Realtime broadcast so the mobile app can navigate live.
  try {
    const channel = ctx.admin.channel(`ava-nav:${ctx.userId}`);
    await channel.send({ type: "broadcast", event: "navigate", payload: { route, ...extra } });
    await ctx.admin.removeChannel(channel);
  } catch (_) { /* noop */ }
}

/** Tell every open session (MHome, other devices) that tasks changed. */
async function broadcastTasks(ctx: Ctx, event: string, taskId?: string | null) {
  try {
    const channel = ctx.admin.channel(`pp-tasks:${ctx.userId}`);
    await channel.send({ type: "broadcast", event: "tasks", payload: { change: event, task_id: taskId ?? null, at: new Date().toISOString() } });
    await ctx.admin.removeChannel(channel);
  } catch (_) { /* noop */ }
}

/** Single secure gateway for every task read/write (never call Planiprêt directly). */
async function taskApi(ctx: Ctx, body: Record<string, unknown>): Promise<ToolResult> {
  const r = await callPlanipretFunction(ctx, "planipret-task-api", { ...body, source: "ava" });
  const data = (r.data ?? {}) as ToolResult;
  if (!r.httpOk && data.success === undefined) {
    return { success: false, error: "task_api_unreachable", status: r.status };
  }
  return data;
}


// ─── helpers ────────────────────────────────────────────────────────────
async function msAction(ctx: Ctx, action: string, payload: any) {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload, _user_id: ctx.userId }),
  });
  return await r.json().catch(() => ({}));
}

async function callPlanipretFunction(ctx: Ctx, name: string, body: any, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({ ...(body ?? {}), _user_id: ctx.userId }),
  });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { httpOk: res.ok, status: res.status, data, text };
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

/** Unified search across device contacts, company directory, Maestro clients and M365. */
async function unifiedSearch(ctx: Ctx, query: string, opts: { limit?: number; sources?: string[]; company?: string; phone?: string } = {}) {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pp-contact-search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit: opts.limit ?? 10,
      sources: opts.sources,
      company: opts.company,
      phone: opts.phone,
      _caller: "ava_voice",
      _user_id: ctx.userId,
    }),
  });
  const j = await r.json().catch(() => ({}));
  return Array.isArray(j?.contacts) ? j.contacts : [];
}

async function resolveContact(ctx: Ctx, name: string, want: "phone" | "email"): Promise<{ value: string; name: string } | null> {
  if (!name) return null;
  const hits = await unifiedSearch(ctx, name, { limit: 5 });
  for (const c of hits) {
    const v = want === "phone" ? (c.phone || c.extension) : c.email;
    if (v) return { value: String(v), name: c.name || name };
  }
  // Last resort: live Outlook/People search.
  const r = await msAction(ctx, "search_contact", { query: name });
  for (const c of r?.results ?? []) {
    const v = want === "phone" ? c.phone : c.email;
    if (v) return { value: v, name: c.name };
  }
  return null;
}

async function callClaude(system: string, userText: string): Promise<string | null> {
  // Prompt caching: `system` is the static prefix → cached for 5 min at 0.1x.
  const res = await claudeText(system, userText, {
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1200,
    label: "ava-tool-executor",
  });
  if (res) return res;

  // fallback Lovable AI
  const lk = Deno.env.get("LOVABLE_API_KEY");
  if (!lk) return null;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": lk },
    body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "system", content: system }, { role: "user", content: userText }] }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? null;
}

// Telephony rows are written with either the auth user id or the Planiprêt
// profile id depending on the ingest path (webhook vs app). Query both.
function ownerIds(ctx: Ctx): string[] {
  return [...new Set([ctx.userId, (ctx.profile as any)?.id, (ctx.profile as any)?.user_id]
    .filter(Boolean).map(String))];
}

// ─── tool implementations ───────────────────────────────────────────────
const TOOLS: Record<string, (ctx: Ctx, params: any) => Promise<ToolResult>> = {
  // ===== TELEPHONY =====
  async make_call(ctx, p) {
    let to_number = firstText(p?.to_number, p?.to, p?.destination, p?.number, p?.phone_number, p?.phone);
    let { contact_name } = p ?? {};
    if (!to_number && contact_name) {
      const hit = await resolveContact(ctx, contact_name, "phone");
      if (!hit) return { success: false, error: "contact_not_found", message: `Aucun numéro trouvé pour ${contact_name}` };
      to_number = hit.value; contact_name = hit.name;
    }
    if (!to_number) return { success: false, error: "to_number_required" };
    to_number = normalizePhoneE164(to_number) ?? to_number;
    const r = await callPlanipretFunction(ctx, "pp-ns-calls", {
      action: "start",
      to_number,
      destination: to_number,
      caller_id_name: p?.caller_id_name ?? ctx.profile?.full_name ?? "Courtier Planiprêt",
      client_type: p?.client_type ?? "mobile",
    });
    const j = r.data;
    const ok = r.httpOk && j?.success === true;
    // Device not registered → fall back to opening the mobile dialer with the
    // number prefilled so the courtier can trigger the call from the softphone UI.
    if (!ok || j?.device_registered === false) {
      await broadcastNav(ctx, "/mplanipret/calls", { open_dialer: { number: to_number, autoDial: true } });
      return {
        success: true,
        fallback: "open_dialer",
        destination: to_number,
        message: `Aucun softphone Planiprêt enregistré — j'ai ouvert le clavier avec ${contact_name ?? to_number} pré-composé.`,
        raw: j,
      };
    }
    return {
      success: true,
      call_id: j?.call_id,
      destination: j?.destination ?? to_number,
      device_registered: j?.device_registered,
      message: j?.message ?? `Appel lancé vers ${contact_name ?? to_number}`,
      raw: j,
    };
  },

  async open_dialer(ctx, p) {
    let number = firstText(p?.number, p?.to, p?.to_number, p?.phone, p?.phone_number);
    let name = p?.contact_name;
    if (!number && name) {
      const hit = await resolveContact(ctx, name, "phone");
      if (!hit) return { success: false, error: "contact_not_found", message: `Aucun numéro trouvé pour ${name}` };
      number = hit.value; name = hit.name;
    }
    if (!number) return { success: false, error: "number_required" };
    number = normalizePhoneE164(number) ?? number;
    await broadcastNav(ctx, "/mplanipret/calls", { open_dialer: { number, autoDial: !!p?.auto_dial } });
    return { success: true, message: `Clavier ouvert avec ${name ?? number}` };
  },

  async open_sms_composer(ctx, p) {
    let number = firstText(p?.number, p?.to, p?.to_number, p?.phone, p?.phone_number);
    let name = p?.contact_name;
    if (!number && name) {
      const hit = await resolveContact(ctx, name, "phone");
      if (!hit) return { success: false, error: "contact_not_found", message: `Aucun numéro trouvé pour ${name}` };
      number = hit.value; name = hit.name;
    }
    if (!number) return { success: false, error: "number_required" };
    number = normalizePhoneE164(number) ?? number;
    const body = firstText(p?.body, p?.message, p?.text);
    await broadcastNav(ctx, "/mplanipret/messages", { open_sms_composer: { number, body } });
    return { success: true, message: `Composeur SMS ouvert pour ${name ?? number}` };
  },

  async open_email_composer(ctx, p) {
    let to = firstText(p?.to, p?.email, p?.address);
    let name = p?.contact_name;
    if (!to && name) {
      const hit = await resolveContact(ctx, name, "email");
      if (!hit) return { success: false, error: "contact_not_found", message: `Aucun courriel trouvé pour ${name}` };
      to = hit.value; name = hit.name;
    }
    if (!to) return { success: false, error: "to_required" };
    await broadcastNav(ctx, "/mplanipret/messages", {
      open_email_composer: { to, subject: p?.subject, body: firstText(p?.body, p?.message, p?.text) },
    });
    return { success: true, message: `Composeur courriel ouvert pour ${name ?? to}` };
  },

  async get_active_calls(ctx) {
    const ext = encodeURIComponent(ctx.profile.extension);
    const r = await nsBrokerFetch(ctx.admin, ctx.profile, `/domains/${DOMAIN}/users/${ext}/calls/active`);
    const data = r.ok ? await r.json().catch(() => []) : [];
    return { success: true, calls: data, count: Array.isArray(data) ? data.length : 0 };
  },

  async hangup_call(ctx, p) {
    const ext = encodeURIComponent(ctx.profile.extension);
    const r = await nsBrokerFetch(ctx.admin, ctx.profile,
      `/domains/${DOMAIN}/users/${ext}/calls/${encodeURIComponent(p.call_id)}`, { method: "DELETE" });
    return { success: r.ok, message: "Appel terminé" };
  },

  async get_call_history(ctx, p) {
    const limit = Math.min(p?.limit ?? 10, 50);
    const days = p?.days ?? 7;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    let q = ctx.admin.from("planipret_phone_calls").select("*")
      .in("user_id", ownerIds(ctx)).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(limit);
    if (p?.direction) q = q.ilike("direction", `%${p.direction}%`);
    const { data } = await q;
    const calls = (data ?? []).map((c: any) => ({
      contact: c.contact_name ?? c.contact_number ?? c.to_number ?? c.from_number,
      direction: c.direction,
      duration: c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}min` : "—",
      date: c.created_at,
      lead_score: c.lead_score,
      lead_temperature: c.lead_temperature,
      has_recording: !!c.recording_url,
      has_analysis: !!c.ai_coaching,
    }));
    return { success: true, calls, count: calls.length };
  },

  async get_recording(ctx, p) {
    const { data } = await ctx.admin.from("planipret_phone_calls")
      .select("recording_url, duration_seconds").eq("id", p.call_id).maybeSingle();
    return { success: !!data?.recording_url, audio_url: data?.recording_url, duration: data?.duration_seconds };
  },

  async get_transcript(ctx, p) {
    const { data } = await ctx.admin.from("planipret_phone_calls")
      .select("transcript_segments").eq("id", p.call_id).maybeSingle();
    const seg = data?.transcript_segments;
    const transcript = Array.isArray(seg) ? seg.map((s: any) => s.text).join("\n") : "";
    return { success: !!transcript, transcript, language: "fr" };
  },

  async send_sms(ctx, p) {
    let to = firstText(p?.to, p?.to_number, p?.destination, p?.number, p?.phone_number, p?.phone);
    let name = p?.contact_name;
    if (!to && name) {
      const hit = await resolveContact(ctx, name, "phone");
      if (!hit) return { success: false, error: "contact_not_found", message: `Aucun numéro trouvé pour ${name}` };
      to = hit.value; name = hit.name;
    }
    const message = firstText(p?.message, p?.body, p?.text, p?.content);
    if (!to || !message) return { success: false, error: "to_and_message_required", message: "Il manque le numéro ou le contenu du SMS." };
    to = normalizePhoneE164(to) ?? to;
    const r = await callPlanipretFunction(ctx, "pp-ns-sms", {
      action: "send",
      to,
      message,
      type: p?.type ?? "sms",
      thread_id: p?.thread_id,
      from: p?.from,
    });
    const j = r.data;
    const ok = r.httpOk && (j?.ok === true || j?.success === true);
    if (!ok) {
      const reason = j?.error ?? j?.body ?? j?.message ?? `Erreur SMS (${r.status})`;
      // Failure → open the composer with the message prefilled so the
      // courtier can review/retry manually from the SMS screen.
      await broadcastNav(ctx, "/mplanipret/messages", { open_sms_composer: { number: to, body: message } });
      return {
        success: false,
        fallback: "open_sms_composer",
        error: reason,
        message: `SMS NON envoyé à ${name ?? to} : ${reason}. J'ai ouvert le composeur pour que tu puisses renvoyer manuellement.`,
        raw: j,
      };
    }
    // Success → broadcast a navigate event so the mobile app opens the thread
    // and the courtier can see the outbound message immediately.
    await broadcastNav(ctx, `/mplanipret/messages?thread=${encodeURIComponent(j?.thread_id ?? "")}`);
    return {
      success: true,
      message: `SMS envoyé à ${name ?? j?.to ?? to}`,
      to: j?.to ?? to,
      from: j?.from,
      thread_id: j?.thread_id,
      raw: j,
    };
  },

  async get_sms_conversations(ctx, p) {
    const limit = Math.min(p?.limit ?? 10, 30);
    const { data } = await ctx.admin.from("planipret_phone_messages")
      .select("*").in("user_id", ownerIds(ctx)).order("created_at", { ascending: false }).limit(limit);
    return { success: true, messages: data ?? [], count: data?.length ?? 0 };
  },

  async get_voicemails(ctx, p) {
    const { data } = await ctx.admin.from("planipret_voicemails")
      .select("*").in("user_id", ownerIds(ctx)).eq("folder", p?.folder ?? "inbox")
      .order("created_at", { ascending: false }).limit(p?.limit ?? 10);
    const unread = (data ?? []).filter((v: any) => !v.is_read).length;
    return { success: true, voicemails: data ?? [], unread_count: unread };
  },

  async generate_voicemail_greeting(ctx, p) {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pp-greeting-generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: p.text, voice_id: p.voice_id, push_to_ns: false, _user_id: ctx.userId }),
    });
    const j = await r.json().catch(() => ({}));
    return { success: r.ok, preview_url: j.audio_url, message: "Boîte vocale générée. Je l'active ?" };
  },

  // ===== AI =====
  async analyze_call(ctx, p) {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/maestro-ai-analysis`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ call_id: p.call_id }),
    });
    return await r.json().catch(() => ({ success: false }));
  },

  async get_hot_leads(ctx, p) {
    const limit = p?.limit ?? 5;
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data } = await ctx.admin.from("planipret_phone_calls")
      .select("contact_name, contact_number, lead_score, lead_temperature, created_at, ai_client_insights")
      .in("user_id", ownerIds(ctx)).eq("lead_temperature", "hot")
      .gte("created_at", since).order("lead_score", { ascending: false }).limit(limit);
    return { success: true, leads: data ?? [], count: data?.length ?? 0 };
  },

  async get_coaching_summary(ctx, p) {
    const days = p?.period === "month" ? 30 : p?.period === "today" ? 1 : 7;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await ctx.admin.from("planipret_phone_calls")
      .select("ai_coaching").in("user_id", ownerIds(ctx)).gte("created_at", since).not("ai_coaching", "is", null);
    const scores = (data ?? []).map((r: any) => r.ai_coaching?.score).filter((n: any) => typeof n === "number");
    const avg = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
    return { success: true, avg_score: Math.round(avg * 10) / 10, calls_analyzed: scores.length };
  },

  // ===== MAESTRO =====
  async search_client(ctx, p) {
    try {
      const query = String(p?.query ?? "").trim();
      if (!query) return { success: false, error: "query_required" };
      // Cache first
      const { data: cached } = await ctx.admin.from("planipret_maestro_clients")
        .select("*").or(`name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`).limit(5);
      if (cached?.length) return { success: true, found: true, clients: cached, source: "cache" };

      const uid = await maestroUserId(ctx);
      if (!uid) return MAESTRO_NOT_LINKED;

      // Production: phone lookup is a POST, name/email search goes through the
      // per-user client list.
      const digits = query.replace(/[^\d+]/g, "");
      if (digits.length >= 7) {
        try {
          const result = await maestroFetch(ctx, `/users/${uid}/lookup-by-phone`, {
            method: "POST",
            body: JSON.stringify({ phone: digits }),
          });
          const client = result?.client ?? result?.data ?? (Array.isArray(result) ? result[0] : null);
          if (client) return { success: true, found: true, clients: [client], source: "maestro" };
        } catch { /* fall through to list search */ }
      }
      const r = await maestroActions(ctx, "list_clients", { search: query, limit: 5 });
      const clients = r?.clients ?? [];
      return r?.success
        ? { success: true, found: clients.length > 0, clients, source: "maestro" }
        : { success: false, error: r?.error ?? "maestro_search_failed" };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  async get_client_profile(ctx, p) {
    if (!p?.client_id) return { success: false, error: "client_id_required" };
    const r = await maestroActions(ctx, "client_profile", { client_id: p.client_id });
    return r?.success
      ? { success: true, profile: r.profile ?? r.raw ?? r.data ?? null }
      : { success: false, error: r?.error ?? "maestro_client_profile_failed" };
  },

  async get_client_history(ctx, p) {
    try {
      // Résolution souple : client_id, sinon téléphone / nom (AVA reçoit souvent
      // un numéro d'appelant plutôt qu'un identifiant Maestro).
      if (!p?.client_id) {
        const q = firstText(p?.phone, p?.phone_number, p?.number, p?.query, p?.client_name, p?.name);
        if (!q) return { success: false, error: "client_id_or_phone_required" };
        const found: any = await (TOOLS as any).search_client(ctx, { query: q });
        const hit = found?.clients?.[0];
        const cid = hit?.maestro_client_id ?? hit?.id ?? hit?.client_id;
        if (!cid) return { success: false, error: "client_not_found", message: `Aucun client Maestro pour ${q}` };
        p = { ...p, client_id: String(cid) };
      }
      const uid = await maestroUserId(ctx);
      if (!uid) return MAESTRO_NOT_LINKED;
      const limit = p?.limit ?? 20;
      try {
        const result = await maestroFetch(ctx, `/users/${uid}/clients/${encodeURIComponent(p.client_id)}/communications?limit=${limit}`);
        const list = result?.data ?? result?.communications ?? result;
        return { success: true, communications: list, count: Array.isArray(list) ? list.length : 0, source: "maestro" };
      } catch (_) {
        // Maestro n'expose pas encore l'historique en prod → repli sur nos données locales.
        const { data: calls } = await ctx.admin.from("planipret_phone_calls")
          .select("id, direction, created_at, duration_seconds, ai_summary, from_number, to_number")
          .eq("maestro_client_id", String(p.client_id))
          .order("created_at", { ascending: false })
          .limit(limit);
        return {
          success: true,
          communications: calls ?? [],
          count: (calls ?? []).length,
          source: "local",
          message: "Historique Maestro indisponible — données locales Planiprêt utilisées.",
        };
      }
    } catch (e) { return { success: false, error: String(e) }; }
  },

  // ===== MAESTRO — endpoints mobiles (/users/{id}/clients|brokers) =====
  async list_my_clients(ctx, p) {
    const r = await maestroActions(ctx, "list_clients", { search: p?.search, limit: p?.limit ?? 25 });
    return r?.success
      ? { success: true, clients: r.clients ?? [], count: (r.clients ?? []).length }
      : { success: false, error: r?.error ?? "maestro_list_clients_failed" };
  },

  async get_maestro_client_profile(ctx, p) {
    if (!p?.client_id) return { success: false, error: "client_id_required" };
    const r = await maestroActions(ctx, "client_profile", { client_id: p.client_id });
    return r?.success ? { success: true, profile: r.profile ?? r.data ?? null } : { success: false, error: r?.error ?? "maestro_client_profile_failed" };
  },

  async list_my_brokers(ctx, p) {
    const r = await maestroActions(ctx, "list_brokers", { search: p?.search, limit: p?.limit ?? 25 });
    return r?.success
      ? { success: true, brokers: r.brokers ?? [], count: (r.brokers ?? []).length }
      : { success: false, error: r?.error ?? "maestro_list_brokers_failed" };
  },

  async get_maestro_broker_profile(ctx, p) {
    if (!p?.broker_id) return { success: false, error: "broker_id_required" };
    const r = await maestroActions(ctx, "broker_profile", { broker_id: p.broker_id });
    return r?.success ? { success: true, profile: r.profile ?? r.data ?? null } : { success: false, error: r?.error ?? "maestro_broker_profile_failed" };
  },

  // ===== PLANIPRÊT TASK API (POST/PUT/DELETE /api/main/tasks) =====
  async list_tasks(ctx, p) {
    return await taskApi(ctx, {
      action: "list",
      status: p?.status ?? "pending",
      filter: p?.filter ?? "open",
      from: p?.from, to: p?.to,
      page: p?.page ?? 1,
      limit: p?.limit ?? 25,
    });
  },

  async get_task(ctx, p) {
    if (!p?.task_id) return { success: false, error: "task_id_required" };
    return await taskApi(ctx, { action: "get", task_id: String(p.task_id) });
  },

  async list_task_targets(ctx, p) {
    return await taskApi(ctx, { action: "client_targets", search: p?.search ? String(p.search) : undefined });
  },

  async create_task(ctx, p) {
    const target = p?.target ?? p?.xid ?? p?.client_id;
    const target_type = String(p?.target_type ?? p?.type ?? "user").toLowerCase();
    const notes = p?.notes ?? p?.title;
    const due_at = p?.due_at ?? p?.date ?? p?.due_date;
    if (target_type !== "user" && target_type !== "contract") {
      return { success: false, error: "clarification_needed", message: "Le type de cible doit être « user » ou « contract »." };
    }
    if (target_type === "contract" && !target) {
      return { success: false, error: "clarification_needed", message: "Quel contrat (xid) veux-tu cibler ?" };
    }
    if (!notes) return { success: false, error: "clarification_needed", message: "Quelle note veux-tu inscrire sur la tâche ?" };
    if (!due_at) return { success: false, error: "clarification_needed", message: "Pour quelle date et heure (fuseau America/Toronto) ?" };
    const r = await taskApi(ctx, {
      // No target → the gateway auto-targets and auto-assigns the broker.
      action: "create", target, target_type, notes, due_at,
      description: p?.description, assignee_id: p?.assignee_id ?? p?.users_id, status: p?.status,
      sync_calendar: p?.sync_calendar === true, notification: p?.notification === true,
      recurrence: p?.recurrence ?? null,
    });
    if ((r as any)?.success) await broadcastTasks(ctx, "created", (r as any).task_id);
    return r;
  },


  async update_task(ctx, p) {
    if (!p?.task_id) return { success: false, error: "task_id_required" };
    const changes = p?.changes ?? {};
    if (!changes || typeof changes !== "object" || !Object.keys(changes).length) {
      return { success: false, error: "clarification_needed", message: "Que dois-je modifier sur cette tâche ?" };
    }
    const r = await taskApi(ctx, { action: "update", task_id: String(p.task_id), changes });
    if ((r as any)?.success) await broadcastTasks(ctx, "updated", String(p.task_id));
    return r;
  },

  async delete_task(ctx, p) {
    if (!p?.task_id) return { success: false, error: "task_id_required" };
    // Deletion ALWAYS requires an explicit confirmation, even in autonomous mode.
    if (p?.confirmed !== true) {
      return {
        success: false,
        needs_confirmation: true,
        error: "confirmation_required",
        message: `Je vais supprimer la tâche ${p.task_id}. Confirme-tu la suppression ? Rappelle delete_task avec confirmed=true.`,
      };
    }
    const r = await taskApi(ctx, { action: "delete", task_id: String(p.task_id) });
    if ((r as any)?.success) await broadcastTasks(ctx, "deleted", String(p.task_id));
    return r;
  },


  async create_appointment(ctx, p) {
    const duration = p.duration_minutes ?? 60;
    const startAt = new Date(p.start_datetime);
    const endAt = new Date(startAt.getTime() + duration * 60000);
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/maestro-appointment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        maestro_client_id: p.client_id,
        title: p.title,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        type: p.type ?? "consultation",
        notes: p.notes,
        _user_id: ctx.userId,
      }),
    });
    const j = await r.json().catch(() => ({}));

    // Miroir Outlook si MS365 connecté (sauf explicitement désactivé)
    let outlook_synced = false;
    let outlook_event_id: string | undefined;
    let outlook_error: string | undefined;
    if (p.sync_outlook !== false) {
      const { data: prof } = await ctx.admin.from("planipret_profiles")
        .select("ms365_access_token").eq("id", ctx.profile.id).maybeSingle();
      if (prof?.ms365_access_token) {
        const mirror = await TOOLS.create_calendar_event(ctx, {
          subject: p.title,
          start_datetime: startAt.toISOString(),
          end_datetime: endAt.toISOString(),
          attendees: p.attendees,
          contact_name: p.contact_name,
          contact_email: p.contact_email,
          body: p.notes,
          timezone: p.timezone ?? "America/Toronto",
          is_online: p.is_online ?? true,
        });
        outlook_synced = !!mirror.success;
        outlook_event_id = mirror.event_id as string | undefined;
        if (!mirror.success) outlook_error = String(mirror.error ?? mirror.message ?? "");
      }
    }
    return {
      success: r.ok,
      appointment_id: j.appointment_id,
      outlook_synced,
      outlook_event_id,
      outlook_error,
      message: `RDV "${p.title}" créé dans Maestro${outlook_synced ? " et synchronisé dans Outlook" : (outlook_error ? ` (Outlook a échoué : ${outlook_error})` : "")}.`,
    };
  },

  async get_pending_tasks(ctx, p) {
    // Legacy alias — the Planiprêt Task API gateway is now the single source.
    return await TOOLS.list_tasks(ctx, { status: "pending", limit: p?.limit ?? 10 });
  },


  async get_upcoming_appointments(ctx, p) {
    try {
      const uid = await maestroUserId(ctx);
      if (!uid) return MAESTRO_NOT_LINKED;
      const days = p?.days ?? 7;
      const from = new Date().toISOString();
      const to = new Date(Date.now() + days * 86400000).toISOString();
      try {
        const result = await maestroFetch(ctx, `/users/${uid}/appointments?from=${from}&to=${to}`);
        return { success: true, appointments: result?.data ?? result?.appointments ?? result ?? [], source: "maestro" };
      } catch (_) {
        // Repli sur le calendrier Microsoft 365 du courtier.
        const cal = await TOOLS.get_calendar_week(ctx, {});
        return { success: true, appointments: (cal as any)?.events ?? [], source: "m365", message: "Agenda Maestro indisponible — calendrier Microsoft 365 utilisé." };
      }
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async update_client(ctx, p) {
    try {
      if (!p?.client_id) return { success: false, error: "client_id_required" };
      const uid = await maestroUserId(ctx);
      if (!uid) return MAESTRO_NOT_LINKED;
      const result = await maestroFetch(ctx, `/users/${uid}/clients/${encodeURIComponent(p.client_id)}`, {
        method: "PATCH", body: JSON.stringify(p.updates ?? {}),
      });
      return { success: true, message: "Profil mis à jour", result };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async create_client(ctx, p) {
    try {
      const uid = await maestroUserId(ctx);
      if (!uid) return MAESTRO_NOT_LINKED;
      const result = await maestroFetch(ctx, `/users/${uid}/clients`, {
        method: "POST",
        body: JSON.stringify({
          phone: p.phone, first_name: p.first_name, last_name: p.last_name,
          notes: p.notes,
        }),
      });
      return { success: true, client_id: result?.id ?? result?.client?.id, message: "Nouveau prospect créé" };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  // ===== M365 =====
  async read_emails(ctx, p) {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "read_emails", payload: p ?? {}, _user_id: ctx.userId }),
    });
    return await r.json().catch(() => ({ success: false }));
  },

  async send_email(ctx, p) {
    const payload = { ...p };
    if (!payload.to && !payload.to_email && payload.contact_name) {
      const hit = await resolveContact(ctx, payload.contact_name, "email");
      if (!hit) return { success: false, error: "contact_not_found", message: `Aucun courriel trouvé pour ${payload.contact_name}` };
      payload.to = hit.value; payload.to_name = hit.name;
    }
    const j = await msAction(ctx, "send_email", payload);
    return { success: !!j?.success, message: `Courriel envoyé à ${payload.to_name ?? payload.to ?? payload.to_email}`, ...j };
  },

  async propose_email_reply(ctx, p) {
    // p: { message_id, tone?, language? }
    if (!p?.message_id) return { success: false, error: "message_id_required" };
    const detail = await msAction(ctx, "read_email_detail", { message_id: p.message_id });
    const em = detail?.email;
    if (!em) return { success: false, error: "email_not_found" };
    const raw = em?.body?.content ?? em?.bodyPreview ?? "";
    const bodyText = String(raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
    const from = em?.from?.emailAddress?.address ?? em?.sender?.emailAddress?.address ?? "";
    const fromName = em?.from?.emailAddress?.name ?? "";
    const tone = p.tone ?? "professionnel et chaleureux";
    const lang = p.language ?? "français québécois";
    const system = `Tu es AVA, assistante d'un courtier hypothécaire au Québec. Réponds en JSON strict: {"summary": "3-4 phrases", "draft_reply": "corps de courriel complet avec salutation et signature", "subject_suggested": "Re: ..."}. Ton: ${tone}. Langue: ${lang}.`;
    const user = `Expéditeur: ${fromName} <${from}>\nSujet: ${em.subject}\n\nCorps:\n${bodyText}`;
    const out = await callClaude(system, user);
    if (!out) return { success: false, error: "ai_unavailable" };
    let parsed: any = {};
    try { parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? out); } catch { parsed = { draft_reply: out, summary: out.slice(0, 300), subject_suggested: `Re: ${em.subject}` }; }
    return {
      success: true,
      summary: parsed.summary,
      draft_reply: parsed.draft_reply,
      to: from,
      to_name: fromName,
      subject_suggested: parsed.subject_suggested ?? `Re: ${em.subject}`,
      message: "Brouillon prêt. Veux-tu que je l'envoie ?",
    };
  },

  async summarize_inbox(ctx, p) {
    const limit = Math.min(Number(p?.limit ?? 10), 25);
    const j = await msAction(ctx, "read_emails", { folder: p?.folder ?? "inbox", top: limit });
    const emails = (j?.emails ?? j?.value ?? []).map((e: any) => ({
      id: e.id, from: e?.from?.emailAddress?.address, name: e?.from?.emailAddress?.name,
      subject: e.subject, preview: (e.bodyPreview ?? "").slice(0, 300), received: e.receivedDateTime, unread: !e.isRead,
    }));
    if (!emails.length) return { success: true, digest: "Aucun courriel récent.", emails: [] };
    const system = "Tu es AVA. Résume la boîte de réception d'un courtier hypothécaire québécois en 5-8 puces en français : priorité, expéditeur, sujet, action requise. Marque les urgences avec 🔥.";
    const digest = await callClaude(system, JSON.stringify(emails)) ?? emails.map((e: any) => `• ${e.name}: ${e.subject}`).join("\n");
    return { success: true, digest, emails, count: emails.length };
  },



  async get_calendar_today(ctx) {
    const today = new Date();
    const start = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const end = new Date(today.setHours(23, 59, 59, 999)).toISOString();
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "list_calendar_events", payload: { start, end }, _user_id: ctx.userId }),
    });
    return await r.json().catch(() => ({ success: false }));
  },

  async get_calendar_week(ctx) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 86400000);
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "list_calendar_events", payload: { start: start.toISOString(), end: end.toISOString() }, _user_id: ctx.userId }),
    });
    return await r.json().catch(() => ({ success: false }));
  },

  async create_calendar_event(ctx, p) {
    // p: { subject, start_datetime, end_datetime OR duration_minutes, attendees?, body?, location?, is_online?, contact_name?, contact_email? }
    // Auto-resolve attendee by contact_name if not provided.
    let attendees: string[] = Array.isArray(p.attendees) ? p.attendees.slice() : [];
    if (p.attendee_email) attendees.push(p.attendee_email);
    if (p.contact_email) attendees.push(p.contact_email);
    if (!attendees.length && p.contact_name) {
      const hit = await resolveContact(ctx, p.contact_name, "email");
      if (hit?.value) attendees.push(hit.value);
    }
    attendees = Array.from(new Set(attendees.filter(Boolean)));

    const startAt = new Date(p.start_datetime ?? p.start);
    const endAt = p.end_datetime
      ? new Date(p.end_datetime)
      : new Date(startAt.getTime() + (Number(p.duration_minutes ?? 30)) * 60000);
    const subject = p.subject ?? p.title ?? "Rendez-vous";
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_calendar_event",
        _user_id: ctx.userId,
        payload: {
          subject,
          start: { dateTime: startAt.toISOString(), timeZone: p.timezone ?? "America/Toronto" },
          end: { dateTime: endAt.toISOString(), timeZone: p.timezone ?? "America/Toronto" },
          body: p.body ?? p.notes,
          attendees,
          isOnlineMeeting: p.is_online ?? true,
        },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j?.success) {
      const reason = j?.error || j?.details?.message || `HTTP ${j?.code ?? r.status}`;
      return {
        success: false,
        error: reason,
        message: `Le rendez-vous "${subject}" n'a PAS été créé dans Outlook. Raison : ${reason}. Vérifie que Microsoft 365 est bien connecté.`,
        raw: j,
      };
    }
    return {
      success: true,
      event_id: j?.event_id,
      web_link: j?.event?.webLink,
      attendees,
      message: `RDV "${subject}" créé dans Outlook${attendees.length ? ` avec ${attendees.join(", ")}` : ""}.`,
    };
  },

  async move_calendar_event(ctx, p) {
    // p: { event_id, new_start (ISO), new_end? OR duration_minutes?, timezone (IANA, REQUIS), subject?, confirmed? }
    if (!p.event_id) return { success: false, error: "event_id_required", message: "Il me faut l'ID du meeting. Utilise get_upcoming_meetings pour le retrouver." };
    if (!p.new_start) return { success: false, error: "new_start_required" };
    if (!p.timezone) {
      return {
        success: false,
        error: "timezone_required",
        message: "Dans quel fuseau horaire dois-je déplacer ce meeting ? (ex: America/Toronto, America/Vancouver, Europe/Paris)",
      };
    }
    if (!p.confirmed) {
      const startAt = new Date(p.new_start);
      const endAt = p.new_end ? new Date(p.new_end) : new Date(startAt.getTime() + Number(p.duration_minutes ?? 30) * 60000);
      const fmt = new Intl.DateTimeFormat("fr-CA", {
        timeZone: p.timezone, weekday: "long", day: "numeric", month: "long",
        hour: "2-digit", minute: "2-digit", timeZoneName: "short",
      });
      return {
        success: false,
        needs_confirmation: true,
        reformulation: `Je vais déplacer le meeting au ${fmt.format(startAt)} → ${fmt.format(endAt)} (${p.timezone}). Je confirme ?`,
        message: "Reformule au courtier puis rappelle move_calendar_event avec confirmed=true.",
      };
    }
    const startAt = new Date(p.new_start);
    const endAt = p.new_end
      ? new Date(p.new_end)
      : new Date(startAt.getTime() + Number(p.duration_minutes ?? 30) * 60000);
    const patch: any = {
      event_id: p.event_id,
      start: { dateTime: startAt.toISOString(), timeZone: p.timezone },
      end: { dateTime: endAt.toISOString(), timeZone: p.timezone },
    };
    if (p.subject) patch.subject = p.subject;
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_calendar_event", _user_id: ctx.userId, payload: patch }),
    });
    const j = await r.json().catch(() => ({}));
    return { success: !!j?.success, message: "RDV déplacé", raw: j };
  },

  async cancel_calendar_event(ctx, p) {
    if (!p.event_id) return { success: false, error: "event_id_required", message: "Il me faut l'ID du meeting. Utilise get_upcoming_meetings pour le retrouver." };
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_calendar_event", _user_id: ctx.userId, payload: { event_id: p.event_id } }),
    });
    const j = await r.json().catch(() => ({}));
    return { success: !!j?.success, message: "RDV annulé", raw: j };
  },

  // ===== EMAIL DISCOVERY (précède summarize_email) =====
  async get_unread_emails(ctx, p) {
    const top = Math.min(Number(p?.limit ?? 10), 25);
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_emails", _user_id: ctx.userId, payload: { folder: "unread", top } }),
    });
    const j = await r.json().catch(() => ({}));
    const emails = (j?.emails ?? []).map((e: any) => ({
      message_id: e.id,
      subject: e.subject,
      from: e.from?.emailAddress?.name ?? e.from?.emailAddress?.address,
      received_at: e.receivedDateTime,
      preview: e.bodyPreview,
    }));
    return { success: !!j?.success, count: emails.length, emails, message: `${emails.length} courriel(s) non lu(s). Lequel je te résume ?` };
  },

  async get_recent_emails(ctx, p) {
    const top = Math.min(Number(p?.limit ?? 10), 25);
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_emails", _user_id: ctx.userId, payload: { top } }),
    });
    const j = await r.json().catch(() => ({}));
    const emails = (j?.emails ?? []).map((e: any) => ({
      message_id: e.id,
      subject: e.subject,
      from: e.from?.emailAddress?.name ?? e.from?.emailAddress?.address,
      received_at: e.receivedDateTime,
      is_read: e.isRead,
      preview: e.bodyPreview,
    }));
    return { success: !!j?.success, count: emails.length, emails, message: `Voici tes ${emails.length} derniers courriels.` };
  },

  // ===== CALENDAR DISCOVERY (précède move/cancel) =====
  async get_upcoming_meetings(ctx, p) {
    const days = Number(p?.days ?? 7);
    const start = new Date().toISOString();
    const end = new Date(Date.now() + days * 86400000).toISOString();
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list_calendar_events", _user_id: ctx.userId, payload: { start, end, top: Number(p?.limit ?? 15) } }),
    });
    const j = await r.json().catch(() => ({}));
    const events = (j?.events ?? []).map((e: any) => ({
      event_id: e.id,
      subject: e.subject,
      start: e.start?.dateTime,
      end: e.end?.dateTime,
      timezone: e.start?.timeZone ?? "UTC",
      organizer: e.organizer?.emailAddress?.name ?? e.organizer?.emailAddress?.address,
      attendees: (e.attendees ?? []).map((a: any) => a.emailAddress?.address).filter(Boolean),
      is_online: e.isOnlineMeeting,
      web_link: e.webLink,
    }));
    return {
      success: !!j?.success,
      count: events.length,
      events,
      message: events.length
        ? `Tu as ${events.length} meeting(s) à venir. Lequel dois-je déplacer ou annuler ?`
        : "Aucun meeting à venir dans cette période.",
    };
  },

  async summarize_email(ctx, p) {
    // p: { message_id }  or  { subject, body }
    let subject = p.subject ?? "";
    let bodyText = p.body ?? "";
    if (p.message_id && !bodyText) {
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read_email_detail", _user_id: ctx.userId, payload: { message_id: p.message_id } }),
      });
      const j = await r.json().catch(() => ({}));
      subject = j?.email?.subject ?? subject;
      const raw = j?.email?.body?.content ?? j?.email?.bodyPreview ?? "";
      bodyText = String(raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
    }
    if (!bodyText) return { success: false, error: "no_content_to_summarize" };

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return { success: true, summary: bodyText.slice(0, 400), message: "Résumé indisponible (LOVABLE_API_KEY manquant)" };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Tu es AVA, assistante d'un courtier hypothécaire. Résume ce courriel en 3-4 phrases courtes en français québécois. Mentionne l'expéditeur, le sujet, et l'action requise si applicable." },
          { role: "user", content: `Sujet: ${subject}\n\n${bodyText}` },
        ],
      }),
    });
    const aj = await aiRes.json().catch(() => ({}));
    const summary = aj?.choices?.[0]?.message?.content ?? "";
    return { success: !!summary, summary, subject, message: "Résumé du courriel prêt" };
  },

  // ===== NAVIGATION =====
  async navigate_to(ctx, p) {
    const ALLOWED = new Set([
      "/mplanipret/home", "/mplanipret/calls", "/mplanipret/messages",
      "/mplanipret/contacts", "/mplanipret/voicemail", "/mplanipret/more",
      "/mplanipret/stats", "/mplanipret/pipeline", "/mplanipret/search",
      "/mplanipret/notifications", "/mplanipret/extension-sync",
    ]);
    const base = (p.route ?? "").split("?")[0];
    if (!ALLOWED.has(base)) return { success: false, error: "route_not_allowed" };
    await broadcastNav(ctx, p.route, { context: p.context });
    return { success: true, message: `Navigation vers ${p.route}` };
  },

  async show_client_in_app(ctx, p) {
    await broadcastNav(ctx, "/mplanipret/contacts", { client_id: p.client_id, open_tab: p.open_tab });
    return { success: true };
  },

  async open_call_detail(ctx, p) {
    await broadcastNav(ctx, "/mplanipret/calls?tab=recordings", { call_id: p.call_id, open_tab: p.open_tab });
    return { success: true };
  },

  // ===== RECHERCHE UNIFIÉE DE CONTACTS =====
  async find_contact(ctx, p) {
    const query = String(p?.query ?? p?.name ?? "").trim();
    if (!query) return { success: false, error: "query_required" };
    const limit = Math.min(Number(p?.limit ?? 10) || 10, 25);
    const contacts = await unifiedSearch(ctx, query, { limit });
    if (!contacts.length) {
      return { success: true, count: 0, contacts: [], message: `Aucun contact trouvé pour "${query}" dans vos contacts, l'annuaire de l'entreprise, Maestro ou Outlook.` };
    }
    const label = (c: any) => [c.name, c.company, c.extension ? `poste ${c.extension}` : null, c.source].filter(Boolean).join(" — ");
    return {
      success: true,
      count: contacts.length,
      contacts,
      ambiguous: contacts.length > 1,
      message: contacts.length === 1
        ? `1 contact trouvé : ${label(contacts[0])}`
        : `${contacts.length} correspondances pour "${query}" : ${contacts.slice(0, 5).map(label).join(" ; ")}. Demande laquelle avant d'agir.`,
    };
  },

  async search_directory(ctx, p) {
    const query = String(p?.query ?? p?.name ?? "").trim();
    if (!query) return { success: false, error: "query_required" };
    const sources = typeof p?.sources === "string"
      ? p.sources.split(",").map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(p?.sources) ? p.sources : undefined;
    const contacts = await unifiedSearch(ctx, query, { limit: Math.min(Number(p?.limit ?? 10) || 10, 25), sources });
    return { success: true, count: contacts.length, contacts, message: `${contacts.length} résultat(s) pour "${query}"` };
  },

  async list_company_directory(ctx, p) {
    const contacts = await unifiedSearch(ctx, "", { limit: Math.min(Number(p?.limit ?? 50) || 50, 200), sources: ["directory"] });
    return { success: true, count: contacts.length, contacts, message: `${contacts.length} entrée(s) dans l'annuaire de l'entreprise` };
  },


  // ===== M365 TEAMS =====
  async list_teams_chats(ctx, _p) {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-teams-list`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json", "X-Ava-User-Id": ctx.userId },
      body: JSON.stringify({ _user_id: ctx.userId }),
    });
    const j = await r.json().catch(() => ({}));
    const chats = (j?.chats ?? []).slice(0, 20).map((c: any) => ({
      chat_id: c.id, topic: c.topic ?? null, type: c.chatType,
      members: (c.members ?? []).map((m: any) => m.displayName ?? m.email).filter(Boolean),
      last_message_at: c.lastMessagePreview?.createdDateTime,
    }));
    const teams = (j?.teams ?? []).map((t: any) => ({
      team_id: t.team?.id, team_name: t.team?.displayName,
      channels: (t.channels ?? []).map((ch: any) => ({ channel_id: ch.id, name: ch.displayName })),
    }));
    return { success: !j?.error, chats, teams, count_chats: chats.length, count_teams: teams.length };
  },

  async create_teams_chat(ctx, p) {
    // p: { user_ids?: string[], contact_emails?: string[], contact_name?, topic? }
    let userIds: string[] = Array.isArray(p.user_ids) ? p.user_ids.slice() : [];
    const emails: string[] = Array.isArray(p.contact_emails) ? p.contact_emails.slice() : [];
    if (p.contact_email) emails.push(p.contact_email);
    if (!emails.length && p.contact_name) {
      const hit = await resolveContact(ctx, p.contact_name, "email");
      if (hit?.value) emails.push(hit.value);
    }
    // Résoudre emails → IDs Graph
    for (const email of emails) {
      const res = await msAction(ctx, "resolve_user_id", { email });
      if (res?.user_id) userIds.push(res.user_id);
    }
    userIds = Array.from(new Set(userIds.filter(Boolean)));
    if (!userIds.length) return { success: false, error: "no_recipients", message: "Aucun destinataire résolu pour créer le chat Teams." };

    const authHeader = ctx.profile.user_jwt ? `Bearer ${ctx.profile.user_jwt}` : `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_teams_chat", _user_id: ctx.userId, payload: { user_ids: userIds, topic: p.topic } }),
    });
    const j = await r.json().catch(() => ({}));
    return { success: !!j?.success, chat_id: j?.chat_id, message: j?.success ? "Chat Teams créé" : `Échec : ${j?.error ?? "inconnu"}` };
  },

  async send_teams_message(ctx, p) {
    // p: { chat_id? | (team_id + channel_id) | contact_name | contact_email, content, contentType? }
    const content = p.content ?? p.message;
    if (!content) return { success: false, error: "content_required" };
    let chatId = p.chat_id;
    const teamId = p.team_id, channelId = p.channel_id;

    if (!chatId && !(teamId && channelId)) {
      // Résoudre par contact
      let email = p.contact_email;
      if (!email && p.contact_name) {
        const hit = await resolveContact(ctx, p.contact_name, "email");
        email = hit?.value;
        if (!email) return { success: false, error: "contact_not_found", message: `Aucun email trouvé pour ${p.contact_name}` };
      }
      if (email) {
        const created = await TOOLS.create_teams_chat(ctx, { contact_email: email });
        if (!created.success) return { success: false, error: created.error, message: `Impossible de créer le chat Teams : ${created.error}` };
        chatId = created.chat_id as string;
      }
    }

    if (!chatId && !(teamId && channelId)) {
      return { success: false, error: "no_destination", message: "Fournis chat_id, team_id+channel_id, ou contact_name/contact_email." };
    }

    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_teams_message",
        _user_id: ctx.userId,
        payload: { chat_id: chatId, team_id: teamId, channel_id: channelId, content, contentType: p.contentType ?? "text" },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j?.success) {
      return { success: false, error: j?.error ?? j?.details?.message, message: `Message Teams NON envoyé : ${j?.error ?? j?.details?.message ?? "erreur inconnue"}` };
    }
    return { success: true, message_id: j?.message_id, message: "Message Teams envoyé" };
  },


  // ===== STATS =====
  async get_daily_briefing(ctx) {
    try {
      const r = await callPlanipretFunction(ctx, "pp-ava-brief", { period: "day", force: true }, {
        "x-ava-service": "1",
        "x-broker-user-id": ctx.userId,
      });
      const b = r.data;
      if (!r.httpOk || b?.error) return { success: false, error: b?.error ?? `brief_failed_${r.status}`, raw: b };
      const briefing = [
        b?.headline,
        ...(Array.isArray(b?.priorities) && b.priorities.length ? ["Priorités: " + b.priorities.join("; ")] : []),
        ...(Array.isArray(b?.risks) && b.risks.length ? ["Points d'attention: " + b.risks.join("; ")] : []),
      ].filter(Boolean).join("\n");
      return { success: true, briefing, summary: b?.stats, raw: b };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async get_my_stats(ctx, p) {
    const days = p?.period === "month" ? 30 : p?.period === "week" ? 7 : 1;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await ctx.admin.from("planipret_phone_calls")
      .select("direction, duration_seconds, lead_temperature, ai_coaching")
      .in("user_id", ownerIds(ctx)).gte("created_at", since);
    const rows = data ?? [];
    const total = rows.length;
    const out = rows.filter((c: any) => /out/i.test(c.direction ?? "")).length;
    const inb = rows.filter((c: any) => /in/i.test(c.direction ?? "")).length;
    const missed = rows.filter((c: any) => /miss/i.test(c.direction ?? "")).length;
    const totalDur = rows.reduce((a: number, c: any) => a + (c.duration_seconds ?? 0), 0);
    const hot = rows.filter((c: any) => c.lead_temperature === "hot").length;
    const scores = rows.map((c: any) => c.ai_coaching?.score).filter((n: any) => typeof n === "number");
    const avgScore = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
    return {
      success: true,
      total_calls: total, outbound: out, inbound: inb, missed,
      avg_duration_min: total ? Math.round(totalDur / total / 60) : 0,
      avg_coaching_score: Math.round(avgScore * 10) / 10,
      hot_leads_generated: hot,
    };
  },

  async get_performance_report(ctx, p) {
    try {
      const period = ["day", "week", "month"].includes(p?.period) ? p.period : "day";
      const language = p?.language === "en" ? "en" : "fr";
      const r = await callPlanipretFunction(ctx, "pp-ava-report", { period, language }, {
        "x-ava-service": "1",
        "x-broker-user-id": ctx.userId,
      });
      const b = r.data;
      if (!r.httpOk || b?.error) return { success: false, error: b?.error ?? `report_failed_${r.status}`, raw: b };
      return { success: true, period, language, report: b?.report ?? "", stats: b?.stats ?? {} };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  // ===== HELP =====
  async explain_feature(_ctx, p) {
    const KB: Record<string, { explanation: string; tips: string[] }> = {
      calls: { explanation: "L'onglet Appels regroupe l'historique, les enregistrements et les appels manqués.", tips: ["Tape sur un appel pour voir le détail", "Le badge rouge indique les manqués"] },
      maestro: { explanation: "Maestro est ton CRM hypothécaire intégré pour gérer clients, tâches et RDV.", tips: ["Active la sync dans Plus → Intégrations"] },
      ms365: { explanation: "Microsoft 365 te permet de lire/envoyer courriels et gérer ton calendrier depuis l'app.", tips: ["Connecte ton compte dans Plus → Microsoft 365"] },
      voicemail_greeting: { explanation: "Génère un message de boîte vocale professionnel avec une voix IA.", tips: ["Choisis la voix, écris le texte, génère, puis active."] },
      voice_agent: { explanation: "AVA est ton assistante vocale qui peut exécuter toutes les actions de l'app.", tips: ["Parle naturellement", "Mode 'full_auto' pour zéro confirmation"] },
    };
    const info = KB[p.feature] ?? { explanation: "Fonctionnalité non documentée.", tips: [] };
    return { success: true, ...info };
  },

  async get_integration_status(ctx) {
    const { data: prof } = await ctx.admin.from("planipret_profiles")
      .select("ns_jwt, maestro_connected, ms365_access_token")
      .eq("id", ctx.profile.id).maybeSingle();
    return {
      success: true,
      integrations: [
        { name: "NetSapiens", status: prof?.ns_jwt ? "connected" : "not_connected", message: prof?.ns_jwt ? "OK" : "JWT manquant" },
        { name: "Maestro", status: prof?.maestro_connected ? "connected" : "not_connected", message: "" },
        { name: "Microsoft 365", status: prof?.ms365_access_token ? "connected" : "not_connected", message: "" },
        { name: "ElevenLabs", status: Deno.env.get("ELEVENLABS_API_KEY") ? "connected" : "not_connected", message: "" },
        { name: "Anthropic / Lovable AI", status: Deno.env.get("LOVABLE_API_KEY") ? "connected" : "not_connected", message: "" },
      ],
    };
  },

  // ===== ALIASES (naming harmonization with ava-tools.ts specs) =====
  async update_calendar_event(ctx, p) { return TOOLS.move_calendar_event(ctx, { ...p, new_start: p.new_start ?? p.start, new_end: p.new_end ?? p.end, confirmed: p.confirmed ?? true }); },
  async delete_calendar_event(ctx, p) { return TOOLS.cancel_calendar_event(ctx, p); },
  async search_ms365_contacts(ctx, p) {
    const query = String(p?.query ?? "").trim();
    if (!query) return { success: false, error: "query_required" };
    const j = await msAction(ctx, "search_contact", { query });
    const results = (j?.results ?? []).slice(0, 10);
    return { success: !j?.error, count: results.length, contacts: results, message: results.length ? `${results.length} contact(s) M365` : "Aucun contact M365 trouvé", ...(j?.error ? { error: j.error } : {}) };
  },

  // ===== PUSH TO MAESTRO =====
  async push_call_summary(ctx, p) {
    if (!p?.call_id) return { success: false, error: "call_id_required" };
    // Récupère l'appel + client Maestro associé
    const { data: call } = await ctx.admin.from("planipret_phone_calls")
      .select("*").eq("id", p.call_id).maybeSingle();
    if (!call) return { success: false, error: "call_not_found" };
    const clientId = call.maestro_client_id ?? p.client_id;
    if (!clientId) return { success: false, error: "no_maestro_client_linked", message: "Aucun client Maestro lié à cet appel." };
    const noteBody = [
      p.summary ? `**Résumé**\n${p.summary}` : null,
      p.coaching ? `**Coaching**\n${p.coaching}` : null,
      p.notes ? `**Notes**\n${p.notes}` : null,
      p.next_steps ? `**Prochaines étapes**\n${p.next_steps}` : null,
      p.sentiment ? `_Sentiment: ${p.sentiment}_` : null,
    ].filter(Boolean).join("\n\n");
    try {
      const uid = await maestroUserId(ctx);
      if (!uid) return MAESTRO_NOT_LINKED;
      // Production Maestro: les résumés d'appels sont poussés sur /users/{id}/calls.
      const result = await maestroFetch(ctx, `/users/${uid}/calls`, {
        method: "POST",
        // Telecom REST spec: POST /users/{id}/calls accepts provider_call_id,
        // to_user_id, to_user_number, status, direction.
        body: JSON.stringify({
          provider_call_id: call.provider_call_id ?? call.ns_call_id ?? call.id,
          to_user_id: clientId,
          to_user_number: call.direction === "inbound" ? call.from_number : call.to_number,
          status: "ended",
          direction: call.direction ?? "outbound",
        }),
      });
      // Notes + résumé IA se poussent via PUT /users/{id}/calls/{callId}.
      const createdId = result?.id ?? result?.call_id ?? result?.data?.id ?? null;
      if (createdId) {
        await maestroFetch(ctx, `/users/${uid}/calls/${encodeURIComponent(String(createdId))}`, {
          method: "PUT",
          body: JSON.stringify({ status: "ended", notes: noteBody, ai_summary: p.summary ?? noteBody }),
        }).catch(() => null);
      }
      // Marque local pour éviter les doublons
      await ctx.admin.from("planipret_phone_calls").update({ maestro_pushed_at: new Date().toISOString() }).eq("id", call.id).then(() => null).catch(() => null);
      return { success: true, communication_id: result?.id, message: "Résumé poussé vers Maestro." };
    } catch (e) { return { success: false, error: String(e), message: `Push Maestro échoué : ${e}` }; }
  },

  async push_client_note(ctx, p) {
    if (!p?.client_id || !p?.note) return { success: false, error: "client_id_and_note_required" };
    try {
      const uid = await maestroUserId(ctx);
      if (!uid) return MAESTRO_NOT_LINKED;
      const result = await maestroFetch(ctx, `/users/${uid}/clients/${encodeURIComponent(p.client_id)}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: p.note, type: p.type ?? "general" }),
      });
      return { success: true, note_id: result?.id, message: "Note ajoutée dans Maestro." };
    } catch (e) { return { success: false, error: String(e), message: `Push note Maestro échoué : ${e}` }; }
  },

  async push_communication_log(ctx, p) {
    if (!p?.client_id) return { success: false, error: "client_id_required" };
    const channel = p.channel ?? "note";
    const payload: any = {
      client_id: p.client_id,
      channel,
      direction: p.direction ?? "outbound",
      summary: p.summary ?? "",
      notes: p.notes ?? p.coaching ?? "",
      body: p.notes ?? p.summary ?? "",
      duration: p.duration_seconds,
      duration_seconds: p.duration_seconds,
      occurred_at: p.occurred_at ?? new Date().toISOString(),
    };
    try {
      const uid = await maestroUserId(ctx);
      if (!uid) return MAESTRO_NOT_LINKED;
      // SMS → /users/{id}/messages, tout le reste → /users/{id}/calls (prod).
      const path = channel === "sms" || channel === "message"
        ? `/users/${uid}/messages`
        : `/users/${uid}/calls`;
      const result = await maestroFetch(ctx, path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return { success: true, communication_id: result?.id, message: `Communication ${channel} enregistrée dans Maestro.` };
    } catch (e) { return { success: false, error: String(e), message: `Push communication Maestro échoué : ${e}` }; }
  },

  // ===== COMMISSIONS (API officielle Planiprêt, lecture seule) =====
  async get_commission_summary(ctx, p) {
    const g = await commissionGuard(ctx);
    if ("error" in g) return g.error;
    const range = commissionRange(p);
    if ("error" in range) return range.error;
    const r = await commissionSummaryFor(g, range, p?.commission_type);
    if ("error" in r) return r.error;
    const s = r.summary;
    return {
      success: true,
      period: range.label,
      total_commission: s.total_commission,
      deposit_count: s.deposit_count,
      average_commission: s.average_commission,
      total_loan_volume: s.total_loan_volume,
      adjustments: s.adjustments,
      top_institutions: s.top_institutions.slice(0, 5),
      truncated: s.truncated,
      message: `${fmtCad(s.total_commission)} en commissions sur ${s.deposit_count} dépôt(s) pour ${range.label}.`,
    };
  },

  async get_commission_by_lender(ctx, p) {
    const g = await commissionGuard(ctx);
    if ("error" in g) return g.error;
    const range = commissionRange(p);
    if ("error" in range) return range.error;
    const r = await commissionSummaryFor(g, range);
    if ("error" in r) return r.error;
    const limit = Math.min(Math.max(Number(p?.limit ?? 5) || 5, 1), 15);
    const list = r.summary.top_institutions.slice(0, limit);
    return {
      success: true,
      period: range.label,
      lenders: list,
      message: list.length
        ? list.map((i: any) => `${i.institution}: ${fmtCad(i.amount)} (${i.count})`).join(" · ")
        : `Aucune commission pour ${range.label}.`,
    };
  },

  async compare_commission_periods(ctx, p) {
    const g = await commissionGuard(ctx);
    if ("error" in g) return g.error;
    const unit = ["month", "quarter", "year"].includes(p?.period) ? p.period : "month";
    const cur = commissionRange({ period: unit });
    const prev = commissionRange({ period: unit, previous: true });
    if ("error" in cur) return cur.error;
    if ("error" in prev) return prev.error;
    const [a, b] = await Promise.all([commissionSummaryFor(g, cur), commissionSummaryFor(g, prev)]);
    if ("error" in a) return a.error;
    if ("error" in b) return b.error;
    const delta = a.summary.total_commission - b.summary.total_commission;
    const pct = b.summary.total_commission ? Math.round((delta / b.summary.total_commission) * 1000) / 10 : null;
    return {
      success: true,
      current: { period: cur.label, total: a.summary.total_commission, deposits: a.summary.deposit_count },
      previous: { period: prev.label, total: b.summary.total_commission, deposits: b.summary.deposit_count },
      delta: Math.round(delta * 100) / 100,
      delta_pct: pct,
      message: `${cur.label}: ${fmtCad(a.summary.total_commission)} vs ${prev.label}: ${fmtCad(b.summary.total_commission)}${pct == null ? "" : ` (${pct > 0 ? "+" : ""}${pct} %)`}.`,
    };
  },

  async list_commission_deposits(ctx, p) {
    const g = await commissionGuard(ctx);
    if ("error" in g) return g.error;
    const range = commissionRange(p);
    if ("error" in range) return range.error;
    const limit = Math.min(Math.max(Number(p?.limit ?? 10) || 10, 1), 50);
    const qs = buildDepositQuery({
      users_id: g.usersId,
      date_from: range.from, date_to: range.to,
      order_by: "date_trans", sort: "desc", page: 1, per_page: limit,
    });
    const res = await commissionGet(`/api/main/commissions/reports/deposits?${qs}`, g.token, g.cid);
    if (!res.ok) return commissionUpstreamError(res);
    const rows = Array.isArray(res.data?.data) ? res.data.data : [];
    return {
      success: true,
      period: range.label,
      total_available: Number(res.data?.meta?.total ?? rows.length),
      deposits: rows.map((d: any) => ({
        number: d.number ?? null,
        institution: d.institution ?? null,
        amount: commissionNum(d.amount),
        loan_amount: commissionNum(d.loan_amt),
        date: d.date_trans ? String(d.date_trans).slice(0, 10) : null,
        commission_type: d.commission_type ?? null,
      })),
    };
  },

  async list_financial_institutions(ctx) {
    const g = await commissionGuard(ctx);
    if ("error" in g) return g.error;
    const res = await commissionGet("/api/main/financial-institutions", g.token, g.cid);
    if (!res.ok) return commissionUpstreamError(res);
    const list = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
    return {
      success: true,
      institutions: list.map((i: any) => ({ id: i?.id ?? null, label: institutionLabel(i) })).filter((i: any) => i.id != null),
    };
  },

  // ---- Alias conformes au contrat officiel ----
  async get_commission_deposits(ctx, p) {
    const range = p?.date_from || p?.date_to
      ? { period: "custom", date_from: p?.date_from, date_to: p?.date_to }
      : { period: p?.period ?? "month" };
    return await TOOLS.list_commission_deposits(ctx, { ...p, ...range });
  },

  async get_commission_agents(ctx) {
    const g = await commissionGuard(ctx);
    if ("error" in g) return g.error;
    const res = await commissionGet("/api/main/commissions/reports/agents", g.token, g.cid);
    if (!res.ok) return commissionUpstreamError(res);
    const list = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
    return { success: true, agents: list.map(mapCommissionAgent).filter((a: any) => a.users_id != null) };
  },

  async get_financial_institutions(ctx) {
    return await TOOLS.list_financial_institutions(ctx, {});
  },

  async open_commission_report(ctx, p) {
    const role = String((ctx.profile as any)?.role ?? "");
    if (role !== "broker" && role !== "admin") {
      return { success: false, error: "forbidden", message: "Les rapports de commissions sont réservés aux courtiers et administrateurs." };
    }
    const qp = new URLSearchParams();
    for (const k of ["period", "date_from", "date_to", "commission_type", "financial_inst_id"]) {
      const v = p?.[k] ?? p?.filters?.[k];
      if (v != null && String(v).trim() !== "") qp.set(k, String(v).trim().slice(0, 40));
    }
    const path = `/mplanipret/commissions${qp.toString() ? `?${qp}` : ""}`;
    return {
      success: true,
      navigate: path,
      action: "navigate",
      message: "J'ouvre le rapport de commissions détaillé.",
    };
  },
};

/** Agent row → { users_id, name } tolerant to Maestro field shapes. */
function mapCommissionAgent(a: any) {
  const name = [a?.agent_name, a?.name, a?.full_name,
    [a?.first_name, a?.last_name].filter(Boolean).join(" ").trim(),
    a?.target_name, a?.email]
    .map((v) => (v == null ? "" : String(v).trim()))
    .find((v) => v.length > 0) ?? "—";
  return { users_id: a?.users_id ?? a?.agent_name_id ?? a?.id ?? null, name };
}


const fmtCad = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);

const commissionNum = num;

function commissionUpstreamError(r: { status: number; data: any }) {
  return {
    success: false,
    error: `maestro_${r.status}`,
    message: r.status === 401
      ? "Session Maestro expirée : reconnecte ton compte Maestro dans Réglages."
      : "Maestro n'a pas pu fournir les rapports de commissions pour le moment.",
  };
}

/** Consent + role + Maestro identity gate for every commission tool. */
async function commissionGuard(ctx: Ctx): Promise<
  { token: string; usersId: string; cid: string } | { error: ToolResult }
> {
  const role = String((ctx.profile as any)?.role ?? "");
  if (role !== "broker" && role !== "admin") {
    return { error: { success: false, error: "forbidden", message: "Les commissions sont réservées aux courtiers." } };
  }
  const { data: settings } = await ctx.admin
    .from("planipret_settings").select("preferences").eq("user_id", ctx.userId).maybeSingle();
  if ((settings?.preferences as any)?.ava_include_commissions !== true) {
    return {
      error: {
        success: false,
        error: "commissions_not_authorized",
        message: "Les commissions ne sont pas partagées avec AVA. Active « Inclure les commissions dans AVA » dans Plus › Commissions pour que je puisse les consulter.",
      },
    };
  }
  const token = await getUserMaestroAccessToken(ctx.admin, ctx.userId);
  if (!token) {
    return { error: { success: false, error: "maestro_not_connected", message: "Ton compte Maestro n'est pas connecté." } };
  }
  let usersId = (ctx.profile as any)?.maestro_broker_id ? String((ctx.profile as any).maestro_broker_id) : "";
  if (!/^\d+$/.test(usersId)) {
    const identity = await fetchMaestroUserProfile(getMaestroOAuthEnv(), token);
    usersId = String(extractMaestroBrokerId(identity) ?? "");
  }
  if (!/^\d+$/.test(usersId)) {
    return { error: { success: false, error: "broker_id_unresolved", message: "Impossible de résoudre ton identifiant Maestro." } };
  }
  return { token, usersId, cid: crypto.randomUUID().slice(0, 8) };
}

/** Period → America/Toronto date window (YYYY-MM-DD). */
function commissionRange(p: any): { from: string; to: string; label: string } | { error: ToolResult } {
  const period = String(p?.period ?? "month");
  const previous = p?.previous === true;
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Toronto" }));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  if (period === "custom") {
    const from = String(p?.date_from ?? "").slice(0, 10);
    const to = String(p?.date_to ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return { error: { success: false, error: "invalid_range", message: "Précise les dates de début et de fin (AAAA-MM-JJ)." } };
    }
    return { from: `${from} 00:00:00`, to: `${to} 23:59:59`, label: `${from} → ${to}` };
  }
  let start: Date, end: Date, label: string;
  if (period === "year") {
    const y = now.getFullYear() - (previous ? 1 : 0);
    start = new Date(y, 0, 1); end = new Date(y, 11, 31); label = `${y}`;
  } else if (period === "ytd") {
    const y = now.getFullYear();
    start = new Date(y, 0, 1); end = now; label = `${y} à ce jour`;
  } else if (period === "quarter") {
    let q = Math.floor(now.getMonth() / 3) - (previous ? 1 : 0);
    let y = now.getFullYear();
    if (q < 0) { q = 3; y -= 1; }
    start = new Date(y, q * 3, 1); end = new Date(y, q * 3 + 3, 0); label = `T${q + 1} ${y}`;
  } else {
    const d = new Date(now.getFullYear(), now.getMonth() - (previous ? 1 : 0), 1);
    start = d; end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    label = d.toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
  }
  return { from: `${iso(start)} 00:00:00`, to: `${iso(end)} 23:59:59`, label };
}

async function commissionSummaryFor(
  g: { token: string; usersId: string; cid: string },
  range: { from: string; to: string; label: string },
  commissionType?: string,
): Promise<{ summary: ReturnType<typeof summarize> } | { error: ToolResult }> {
  const rows: any[] = [];
  let page = 1;
  while (page <= 5) {
    const qs = buildDepositQuery({
      users_id: g.usersId,
      date_from: range.from, date_to: range.to,
      commission_type: ["base", "bonus", "bonus2", "perform"].includes(String(commissionType)) ? String(commissionType) : "base",
      page, per_page: 200,
    });
    const res = await commissionGet(`/api/main/commissions/reports/deposits?${qs}`, g.token, g.cid);
    if (!res.ok) return { error: commissionUpstreamError(res) };
    const batch = Array.isArray(res.data?.data) ? res.data.data : [];
    rows.push(...batch);
    const last = Number(res.data?.meta?.last_page ?? 1);
    if (page >= last || batch.length === 0) break;
    page += 1;
  }
  return { summary: summarize(rows, page > 5) };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "method_not_allowed" }, 405);

  const auth = await authBroker(req);
  if ("error" in auth) return auth.error;

  // GATING: AVA est activée uniquement pour les courtiers sélectionnés par un admin
  // via le toggle "Agent IA" dans Gestion Utilisateurs (planipret_profiles.voice_agent_enabled).
  const { data: gate } = await auth.admin
    .from("planipret_profiles")
    .select("voice_agent_enabled")
    .eq("id", auth.profile.id)
    .maybeSingle();
  if (gate?.voice_agent_enabled === false) {
    return jsonResponse({ success: false, error: "ava_not_enabled_for_user" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  // New shape: tool_name comes via header X-Ava-Tool-Name and params are flat in body.
  // Legacy shape: { tool_name, parameters, session_id }
  const headerToolName = req.headers.get("x-ava-tool-name") ?? req.headers.get("X-Ava-Tool-Name");
  const tool_name: string | undefined = headerToolName || body?.tool_name;
  const session_id: string | undefined = body?.session_id;
  const parameters = body?.parameters && typeof body.parameters === "object"
    ? body.parameters
    : (() => {
        const { tool_name: _t, session_id: _s, parameters: _p, ...rest } = body ?? {};
        return rest;
      })();
  if (!tool_name || typeof tool_name !== "string") {
    return jsonResponse({ success: false, error: "tool_name_required" }, 400);
  }
  const fn = TOOLS[tool_name];
  if (!fn) return jsonResponse({ success: false, error: "unknown_tool", tool_name }, 400);

  const ctx: Ctx = { admin: auth.admin, userId: auth.userId, profile: auth.profile };
  try {
    const result = await fn(ctx, parameters ?? {});
    await logTool(ctx, session_id ?? "no-session", tool_name, parameters, result);
    return jsonResponse(result);

  } catch (e) {
    const err = { success: false, error: e instanceof Error ? e.message : String(e) };
    await logTool(ctx, session_id ?? "no-session", tool_name, parameters, err);
    return jsonResponse(err, 200);
  }
});
