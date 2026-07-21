// AVA Planiprêt — secure server-side tool router for the ElevenLabs agent.
// Every tool the agent triggers passes through here. Logs each call into
// planipret_ava_conversations.
import { authBroker, corsHeaders, jsonResponse, nsBrokerFetch } from "../_shared/ns-broker.ts";

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
  const base = (Deno.env.get("MAESTRO_API_URL") ?? "").replace(/\/$/, "");
  if (!base) throw new Error("maestro_not_configured");
  const { data: profileWithToken } = await ctx.admin
    .from("planipret_profiles")
    .select("maestro_broker_token, maestro_broker_id")
    .eq("id", ctx.profile.id)
    .maybeSingle();
  const token = profileWithToken?.maestro_broker_token ?? Deno.env.get("MAESTRO_API_KEY") ?? "";
  if (!token) throw new Error("maestro_not_connected");
  const r = await fetch(`${base}${path}`, {
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

async function broadcastNav(ctx: Ctx, route: string, extra?: any) {
  // Use Supabase Realtime broadcast so the mobile app can navigate live.
  try {
    const channel = ctx.admin.channel(`ava-nav:${ctx.userId}`);
    await channel.send({ type: "broadcast", event: "navigate", payload: { route, ...extra } });
    await ctx.admin.removeChannel(channel);
  } catch (_) { /* noop */ }
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

async function resolveContact(ctx: Ctx, name: string, want: "phone" | "email"): Promise<{ value: string; name: string } | null> {
  if (!name) return null;
  // 1) local contacts
  const { data: local } = await ctx.admin.from("planipret_contacts")
    .select("full_name, phone, email").ilike("full_name", `%${name}%`).limit(3);
  for (const c of local ?? []) {
    const v = want === "phone" ? c.phone : c.email;
    if (v) return { value: v, name: c.full_name };
  }
  // 2) Maestro cache
  const { data: mst } = await ctx.admin.from("planipret_maestro_clients")
    .select("name, phone, email").ilike("name", `%${name}%`).limit(3);
  for (const c of mst ?? []) {
    const v = want === "phone" ? c.phone : c.email;
    if (v) return { value: v, name: c.name };
  }
  // 3) MS365 people/contacts
  const r = await msAction(ctx, "search_contact", { query: name });
  for (const c of r?.results ?? []) {
    const v = want === "phone" ? c.phone : c.email;
    if (v) return { value: v, name: c.name };
  }
  return null;
}

async function callClaude(system: string, userText: string): Promise<string | null> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (key) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-5-20250929", max_tokens: 1200, system, messages: [{ role: "user", content: userText }] }),
    });
    if (r.ok) { const j = await r.json(); return j.content?.[0]?.text ?? null; }
  }
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
    const r = await callPlanipretFunction(ctx, "pp-ns-calls", {
      action: "start",
      to_number,
      destination: to_number,
      caller_id_name: p?.caller_id_name ?? ctx.profile?.full_name ?? "Courtier Planiprêt",
      client_type: p?.client_type ?? "mobile",
    });
    const j = r.data;
    const ok = r.httpOk && j?.success === true;
    if (!ok) {
      const reason = j?.error ?? j?.message ?? j?.body ?? `Erreur téléphone (${r.status})`;
      return { success: false, error: reason, message: `Appel NON lancé vers ${contact_name ?? to_number} : ${reason}`, raw: j };
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
      .eq("user_id", ctx.userId).gte("created_at", since)
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
      return { success: false, error: reason, message: `SMS NON envoyé à ${name ?? to} : ${reason}`, raw: j };
    }
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
      .select("*").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(limit);
    return { success: true, messages: data ?? [], count: data?.length ?? 0 };
  },

  async get_voicemails(ctx, p) {
    const { data } = await ctx.admin.from("planipret_voicemails")
      .select("*").eq("user_id", ctx.userId).eq("folder", p?.folder ?? "inbox")
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
      .eq("user_id", ctx.userId).eq("lead_temperature", "hot")
      .gte("created_at", since).order("lead_score", { ascending: false }).limit(limit);
    return { success: true, leads: data ?? [], count: data?.length ?? 0 };
  },

  async get_coaching_summary(ctx, p) {
    const days = p?.period === "month" ? 30 : p?.period === "today" ? 1 : 7;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await ctx.admin.from("planipret_phone_calls")
      .select("ai_coaching").eq("user_id", ctx.userId).gte("created_at", since).not("ai_coaching", "is", null);
    const scores = (data ?? []).map((r: any) => r.ai_coaching?.score).filter((n: any) => typeof n === "number");
    const avg = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
    return { success: true, avg_score: Math.round(avg * 10) / 10, calls_analyzed: scores.length };
  },

  // ===== MAESTRO =====
  async search_client(ctx, p) {
    try {
      // Cache first
      const { data: cached } = await ctx.admin.from("planipret_maestro_clients")
        .select("*").or(`name.ilike.%${p.query}%,phone.ilike.%${p.query}%,email.ilike.%${p.query}%`).limit(5);
      if (cached?.length) return { success: true, found: true, clients: cached, source: "cache" };
      const result = await maestroFetch(ctx, `/api/v1/clients/lookup?phone=${encodeURIComponent(p.query)}`);
      return { success: true, found: !!result?.client, clients: result?.client ? [result.client] : [] };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  async get_client_profile(ctx, p) {
    try {
      const result = await maestroFetch(ctx, `/api/v1/clients/${p.client_id}`);
      return { success: true, profile: result };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async get_client_history(ctx, p) {
    try {
      const result = await maestroFetch(ctx, `/api/v1/clients/${p.client_id}/communications?limit=${p?.limit ?? 20}`);
      return { success: true, communications: result?.data ?? result, count: (result?.data ?? result)?.length ?? 0 };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async create_task(ctx, p) {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/maestro-task`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        maestro_client_id: p.client_id,
        title: p.title,
        due_date: p.due_date ?? new Date(Date.now() + 86400000).toISOString(),
        priority: p.priority ?? "medium",
        notes: p.notes,
        _user_id: ctx.userId,
      }),
    });
    const j = await r.json().catch(() => ({}));
    return { success: r.ok, task_id: j.task_id, message: `Tâche "${p.title}" créée` };
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
    try {
      const brokerId = ctx.profile.maestro_broker_id ?? "me";
      const result = await maestroFetch(ctx, `/api/v1/tasks?assigned_to=${brokerId}&status=pending&limit=${p?.limit ?? 10}`);
      const tasks = result?.data ?? result ?? [];
      const now = Date.now();
      const overdue = tasks.filter((t: any) => t.due_date && new Date(t.due_date).getTime() < now).length;
      return { success: true, tasks, overdue_count: overdue };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async get_upcoming_appointments(ctx, p) {
    try {
      const brokerId = ctx.profile.maestro_broker_id ?? "me";
      const days = p?.days ?? 7;
      const from = new Date().toISOString();
      const to = new Date(Date.now() + days * 86400000).toISOString();
      const result = await maestroFetch(ctx, `/api/v1/calendar?broker_id=${brokerId}&from=${from}&to=${to}`);
      return { success: true, appointments: result?.data ?? result ?? [] };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async update_client(ctx, p) {
    try {
      const result = await maestroFetch(ctx, `/api/v1/clients/${p.client_id}`, {
        method: "PATCH", body: JSON.stringify(p.updates ?? {}),
      });
      return { success: true, message: "Profil mis à jour", result };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async create_client(ctx, p) {
    try {
      const result = await maestroFetch(ctx, `/api/v1/clients`, {
        method: "POST",
        body: JSON.stringify({
          phone: p.phone, first_name: p.first_name, last_name: p.last_name,
          notes: p.notes, broker_id: ctx.profile.maestro_broker_id,
        }),
      });
      return { success: true, client_id: result?.id, message: "Nouveau prospect créé" };
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
      "/mplanipret/stats",
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

  // ===== M365 CONTACTS =====
  async find_contact(ctx, p) {
    const query = String(p?.query ?? p?.name ?? "").trim();
    if (!query) return { success: false, error: "query_required" };
    const results: any[] = [];
    // 1) local
    const { data: local } = await ctx.admin.from("planipret_contacts")
      .select("full_name, phone, email").ilike("full_name", `%${query}%`).limit(5);
    for (const c of local ?? []) results.push({ name: c.full_name, email: c.email, phone: c.phone, source: "local" });
    // 2) Maestro
    const { data: mst } = await ctx.admin.from("planipret_maestro_clients")
      .select("name, phone, email").ilike("name", `%${query}%`).limit(5);
    for (const c of mst ?? []) results.push({ name: c.name, email: c.email, phone: c.phone, source: "maestro" });
    // 3) MS365
    const ms = await msAction(ctx, "search_contact", { query });
    if (ms?.results) for (const r of ms.results) results.push(r);
    if (ms?.error && !results.length) {
      return { success: false, error: ms.error, needs_reconnect: /scope|permission|Insufficient/i.test(String(ms.error)), message: `Impossible de chercher dans Microsoft : ${ms.error}` };
    }
    // Dédupliquer par email
    const seen = new Set<string>();
    const unique = results.filter((r) => {
      const k = (r.email || r.phone || r.name || "").toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k); return true;
    }).slice(0, 10);
    return { success: true, count: unique.length, contacts: unique, message: unique.length ? `${unique.length} contact(s) trouvé(s) pour "${query}"` : `Aucun contact trouvé pour "${query}"` };
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
      .eq("user_id", ctx.userId).gte("created_at", since);
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
};

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
