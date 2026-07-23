// pp-ns-sms — Proxy NS-API v2 SMS/Messages pour Planiprêt.
// AVA Planiprêt uniquement. Segmentation stricte par extension utilisateur.
//
// GET  ?action=threads              → Liste des sessions de messages (threads)
// GET  ?action=messages&thread_id=X → Messages d'un thread
// POST ?action=send  body { to, message, type? }  → Envoyer SMS/Chat
// GET  ?action=sms-numbers          → Numéros SMS assignés à l'utilisateur
//
// Sécurité : requirePlanipretBroker() vérifie :
//   1. JWT Supabase valide
//   2. Utilisateur membre de l'organisation Planiprêt (is_planipret_member)
//   3. Profil planipret_profiles avec extension et ns_domain
//   4. Bloque les utilisateurs Lemtel-only

import {
  corsHeaders,
  jsonResponse,
  requirePlanipretBroker,
  nsFetch,
} from "../_shared/planipret-ns.ts";
import {
  getMaestroTelecomConfig,
  isMaestroTelecomConfigured,
  maestroTelecomFetch,
  maestroTelecomMirror,
} from "../_shared/maestro-telecom.ts";

function normalizeE164(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // Strip all non-digit characters (including leading +)
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  // Reject clearly-invalid short numbers (extensions, half-typed inputs).
  if (digits.length < 10) return null;
  // 10-digit North American number → always prefix with +1
  if (digits.length === 10) return `+1${digits}`;
  // 11-digit starting with 1 → standard NANP E.164
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // International (>=11 digits, not NANP): return as +digits
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

function pickSmsNumber(row: any): string | null {
  return normalizeE164(
    (typeof row === "string" && row) ||
    row?.["from-number"] ||
    row?.from_number ||
    row?.number ||
    row?.phone_number_e164 ||
    row?.phonenumber ||
    row?.smsnumber ||
    row?.did ||
    row?.phone_number_digits ||
    null,
  );
}

async function getAssignedSmsNumbers(supabase: any, ctx: any): Promise<any[]> {
  const numbers: any[] = [];

  // Source 1 : NS-API smsnumbers endpoint
  try {
    const res = await nsFetch(`/domains/${encodeURIComponent(ctx.nsDomain)}/users/${encodeURIComponent(ctx.extension)}/smsnumbers`, { method: "GET" });
    if (res.ok) {
      const raw = await res.json();
      const list = Array.isArray(raw) ? raw : (raw?.smsnumbers ?? raw?.data ?? []);
      for (const n of list) {
        const e164 = pickSmsNumber(n);
        if (e164) numbers.push({ ...(typeof n === "object" ? n : {}), number: e164, "from-number": e164, source: "ns_api" });
      }
    } else {
      const txt = await res.text().catch(() => "");
      console.warn(`[pp-ns-sms] smsnumbers NS-API ${res.status}:`, txt.slice(0, 200));
    }
  } catch (e) {
    console.warn("[pp-ns-sms] smsnumbers NS-API error:", e);
  }

  // Source 2 : planipret_did_assignments — extension + domain
  if (!numbers.length) {
    try {
      const { data, error } = await supabase
        .from("planipret_did_assignments")
        .select("phone_number_e164,phone_number_digits,extension,domain,callerid_name")
        .eq("extension", String(ctx.extension))
        .eq("domain", String(ctx.nsDomain))
        .limit(5);
      if (error) console.warn("[pp-ns-sms] did_assignments (domain) error:", error.message);
      for (const n of data ?? []) {
        const e164 = pickSmsNumber(n);
        if (e164) numbers.push({ ...n, number: e164, "from-number": e164, source: "did_assignment" });
      }
    } catch (e) {
      console.warn("[pp-ns-sms] did_assignments (domain) error:", e);
    }
  }

  // Source 3 : planipret_did_assignments — extension seul (sans filtre domain)
  if (!numbers.length) {
    try {
      const { data, error } = await supabase
        .from("planipret_did_assignments")
        .select("phone_number_e164,phone_number_digits,extension,domain,callerid_name")
        .eq("extension", String(ctx.extension))
        .limit(5);
      if (error) console.warn("[pp-ns-sms] did_assignments (no domain) error:", error.message);
      for (const n of data ?? []) {
        const e164 = pickSmsNumber(n);
        if (e164) numbers.push({ ...n, number: e164, "from-number": e164, source: "did_assignment_no_domain" });
      }
    } catch (e) {
      console.warn("[pp-ns-sms] did_assignments (no domain) error:", e);
    }
  }

  // Source 4 : planipret_profiles — colonne phone_number ou sms_number
  if (!numbers.length) {
    try {
      const { data, error } = await supabase
        .from("planipret_profiles")
        .select("phone_number,sms_number")
        .eq("id", ctx.profileId)
        .maybeSingle();
      if (error) console.warn("[pp-ns-sms] profiles fallback error:", error.message);
      const raw = (data as any)?.sms_number ?? (data as any)?.phone_number ?? null;
      const e164 = normalizeE164(raw);
      if (e164) numbers.push({ number: e164, "from-number": e164, source: "profile" });
    } catch (e) {
      console.warn("[pp-ns-sms] profiles fallback error:", e);
    }
  }

  console.log(`[pp-ns-sms] getAssignedSmsNumbers ext=${ctx.extension} domain=${ctx.nsDomain} found=${numbers.length} sources=${numbers.map((n: any) => n.source).join(",")}`);

  const seen = new Set<string>();
  return numbers.filter((n) => {
    const v = pickSmsNumber(n);
    if (!v || seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}

function newMessageSessionId() {
  return crypto.randomUUID().replace(/-/g, "");
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requirePlanipretBroker(req);
  if (guard instanceof Response) return guard;

  const { ctx, supabase } = guard;
  const url = new URL(req.url);

  // Parse body once (tolerant to invoke() which always POSTs JSON)
  let body: Record<string, any> = {};
  if (req.method !== "GET") {
    body = await req.json().catch(() => ({})) ?? {};
  }
  const qp = url.searchParams;
  const pick = (k: string) => body?.[k] ?? qp.get(k) ?? undefined;

  const action = (pick("action") as string) ?? "threads";
  const userBase = `/domains/${encodeURIComponent(ctx.nsDomain)}/users/${encodeURIComponent(ctx.extension)}`;

  try {
    if (action === "threads") {
      const limit = (pick("limit") as string) ?? "50";
      const res = await nsFetch(`${userBase}/messagesessions?limit=${limit}`, { method: "GET" });
      if (!res.ok) {
        const txt = await res.text();
        return jsonResponse({ error: "NS-API threads fetch failed", status: res.status, body: txt }, 502);
      }
      const raw = await res.json();
      const threads = Array.isArray(raw) ? raw : (raw?.messagesessions ?? raw?.data ?? []);

      // Best-effort Maestro inbox enrichment.
      let maestroInbox: any[] = [];
      if (ctx.maestroBrokerId) {
        try {
          const cfg = await getMaestroTelecomConfig(supabase);
          if (isMaestroTelecomConfigured(cfg)) {
            const r = await maestroTelecomFetch<any>(cfg, `/users/${encodeURIComponent(ctx.maestroBrokerId)}/inbox`);
            const list = Array.isArray(r.data) ? r.data : (r.data?.inbox ?? r.data?.threads ?? r.data?.data ?? []);
            if (Array.isArray(list)) maestroInbox = list;
          }
        } catch { /* ignore */ }
      }
      return jsonResponse({ ok: true, count: threads.length, threads, maestro_inbox: maestroInbox });
    }

    if (action === "messages") {
      const threadId = pick("thread_id") as string | undefined;
      if (!threadId) return jsonResponse({ error: "thread_id requis" }, 400);
      const limit = (pick("limit") as string) ?? "100";
      const res = await nsFetch(
        `${userBase}/messagesessions/${encodeURIComponent(threadId)}/messages?limit=${limit}`,
        { method: "GET" }
      );
      if (!res.ok) {
        const txt = await res.text();
        return jsonResponse({ error: "NS-API messages fetch failed", status: res.status, body: txt }, 502);
      }
      const raw = await res.json();
      const messages = Array.isArray(raw) ? raw : (raw?.messages ?? raw?.data ?? []);

      // Best-effort Maestro conversation enrichment (needs a phone hint).
      let maestroMessages: any[] = [];
      const phoneHint = pick("phone_number") as string | undefined;
      if (ctx.maestroBrokerId && phoneHint) {
        try {
          const cfg = await getMaestroTelecomConfig(supabase);
          if (isMaestroTelecomConfigured(cfg)) {
            const r = await maestroTelecomFetch<any>(
              cfg,
              `/users/${encodeURIComponent(ctx.maestroBrokerId)}/messages/with/${encodeURIComponent(phoneHint)}`,
            );
            const list = Array.isArray(r.data) ? r.data : (r.data?.messages ?? r.data?.data ?? []);
            if (Array.isArray(list)) maestroMessages = list;
          }
        } catch { /* ignore */ }
      }
      return jsonResponse({ ok: true, count: messages.length, messages, maestro_messages: maestroMessages });
    }


    if (action === "sms-numbers") {
      const numbers = await getAssignedSmsNumbers(supabase, ctx);
      return jsonResponse({ ok: true, numbers });
    }

    if (action === "send") {
      const to = pick("to") as string | undefined;
      const message = pick("message") as string | undefined;
      const type = (pick("type") as string) ?? "sms";
      const thread_id = pick("thread_id") as string | undefined;
      let from = pick("from") as string | undefined;

      console.info("[pp-ns-sms] send request", {
        userId: ctx.userId, extension: ctx.extension, domain: ctx.nsDomain,
        to_raw: to, from_raw: from, thread_id, msg_len: message?.length ?? 0,
      });

      if (!to || !message) {
        return jsonResponse({ ok: false, error: "Paramètres manquants: 'to' et 'message' sont requis", missing: { to: !to, message: !message } }, 400);
      }

      // Auto-detect broker DID/SMS number if not provided.
      if (!from) {
        const first = (await getAssignedSmsNumbers(supabase, ctx))[0];
        from = pickSmsNumber(first) ?? undefined;
        console.info("[pp-ns-sms] auto-detected from", from);
      }

      const destination = normalizeE164(to);
      if (!destination) return jsonResponse({ ok: false, error: `Numéro destinataire invalide: '${to}' (format E.164 requis, ex: +15145551234)` }, 400);

      const fromNumber = normalizeE164(from);
      if (!fromNumber) {
        return jsonResponse({ ok: false, error: "Aucun numéro SMS (DID) assigné à ce courtier — contactez un administrateur pour attribuer un DID." }, 200);
      }


      // NS-API v2 SMS: POST /users/{ext}/messagesessions/messages creates the
      // session (if needed) and sends the message in one shot. This is the
      // endpoint NetSapiens actually accepts — POSTing to /messagesessions
      // directly returns HTTP 500 on most tenants.
      const nsBody: Record<string, unknown> = {
        type: type === "chat" ? "chat" : "sms",
        destination,
        message,
        "from-number": fromNumber,
      };

      // NS-API requires a 32-char random session id when creating a new thread.
      const sessionId = thread_id ?? newMessageSessionId();
      const path = `${userBase}/messagesessions/${encodeURIComponent(sessionId)}/messages`;

      let res = await nsFetch(path, { method: "POST", body: JSON.stringify(nsBody) });
      let lastText = await res.text();

      // Fallback: older NS builds accept POST /messagesessions with the
      // session id embedded in the body.
      if (!res.ok && res.status !== 401 && res.status !== 403) {
        const altPath = `${userBase}/messagesessions`;
        const alt = await nsFetch(altPath, {
          method: "POST",
          body: JSON.stringify({ ...nsBody, "messagesession-id": sessionId, messagesession_id: sessionId }),
        });
        const altText = await alt.text();
        if (alt.ok) { res = alt; lastText = altText; }
      }

      let result: any = null;
      try { result = lastText ? JSON.parse(lastText) : {}; } catch { result = { raw: lastText }; }

      if (!res.ok) {
        console.error("[pp-ns-sms] NS send failed", res.status, path, lastText);
        return jsonResponse(
          { ok: false, error: `Envoi SMS refusé (${res.status})`, status: res.status, body: lastText, from: fromNumber, to: destination, endpoint: path },
          200,
        );
      }

      // NS-API returns HTTP 200 even when the message failed downstream —
      // inspect result body for explicit error/failure flags before claiming success.
      const nsError = result?.error ?? result?.errorMessage ?? result?.error_message ?? result?.message?.error;
      const nsStatus = String(result?.status ?? result?.state ?? "").toLowerCase();
      if (nsError || nsStatus === "failed" || nsStatus === "error" || result?.ok === false || result?.success === false) {
        console.error("[pp-ns-sms] NS send returned 200 with error body:", result);
        return jsonResponse(
          { ok: false, error: nsError ?? `NS-API a rejeté le SMS (status=${nsStatus || "unknown"})`, ns_result: result, from: fromNumber, to: destination },
          200,
        );
      }

      const resolvedThreadId = thread_id
        ?? result?.messagesession_id
        ?? result?.["messagesession-id"]
        ?? result?.messagesession
        ?? sessionId;

      try {
        await supabase
          .from("planipret_phone_messages")
          .insert({
            user_id: ctx.userId,
            direction: "outbound",
            to_number: destination,
            from_number: fromNumber,
            body: message,
            type,
            ns_thread_id: resolvedThreadId,
            sent_at: new Date().toISOString(),
          });
      } catch (logErr) {
        console.warn("[pp-ns-sms] log insert failed (non-fatal):", logErr);
      }

      // Mirror the outbound SMS to Maestro Telecom — fire-and-forget.
      if (ctx.maestroBrokerId) {
        maestroTelecomMirror(supabase, `/users/${encodeURIComponent(ctx.maestroBrokerId)}/messages`, {
          method: "POST",
          body: { to_user_number: destination, message },
          action: "sms.send",
          userId: ctx.userId,
        });
      }

      return jsonResponse({ ok: true, result, from: fromNumber, to: destination, thread_id: resolvedThreadId });
    }

    return jsonResponse({ error: `Action inconnue: ${action}` }, 400);
  } catch (e) {
    console.error("[pp-ns-sms] Erreur:", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
