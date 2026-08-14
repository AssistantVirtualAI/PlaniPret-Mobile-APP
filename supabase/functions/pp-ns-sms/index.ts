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

const digitsOnly = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);

/** Peer number of a locally logged message row. */
function localPeer(row: any): string {
  return String((row.direction === "outbound" ? row.to_number : row.from_number) ?? "");
}

/** Local history rows (planipret_phone_messages) for the current broker. */
async function getLocalMessages(supabase: any, userId: string, limit = 500): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from("planipret_phone_messages")
      .select("id,direction,to_number,from_number,body,thread_id,sent_at,read_at")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[pp-ns-sms] local history error:", error.message);
      return [];
    }
    return data ?? [];
  } catch (e) {
    console.warn("[pp-ns-sms] local history error:", e);
    return [];
  }
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
      let threads: any[] = [];
      let nsWarning: { status: number; body: string } | null = null;
      if (!res.ok) {
        // Fail-soft: an extension without messaging provisioned must show an
        // empty inbox, not a blocking error screen.
        const txt = await res.text().catch(() => "");
        console.warn(`[pp-ns-sms] messagesessions ${res.status}:`, txt.slice(0, 300));
        nsWarning = { status: res.status, body: txt.slice(0, 300) };
      } else {
        const raw = await res.json().catch(() => null);
        threads = Array.isArray(raw) ? raw : (raw?.messagesessions ?? raw?.data ?? []);
      }

      // Historique local (planipret_phone_messages) : garantit que les SMS
      // envoyés/reçus restent visibles même si NS-API n'expose pas la session.
      const localRows = await getLocalMessages(supabase, ctx.profileId ?? ctx.userId);
       const nsThreadByPeer = new Map<string, any>();
       for (const thread of threads) {
         const key = digitsOnly(
           thread.destination
             ?? thread["messagesession-destination"]
             ?? thread.remote_party
             ?? thread.phonenumber
             ?? thread.contact
             ?? "",
         );
         if (key && !nsThreadByPeer.has(key)) nsThreadByPeer.set(key, thread);
       }
      const byPeer = new Map<string, any>();
      for (const row of localRows) {
        const peer = localPeer(row);
        const key = digitsOnly(peer);
         if (!key) continue;

         // NS can return a stale thread after an outgoing send. Keep its real
         // session id, but promote the newer local message so the conversation
         // immediately moves to the top and shows the text that was just sent.
         const nsThread = nsThreadByPeer.get(key);
         if (nsThread) {
           const nsTime = new Date(
             nsThread.last_message_at
               ?? nsThread.updated_at
               ?? nsThread.timestamp
               ?? nsThread["messagesession-last-datetime"]
               ?? 0,
           ).getTime();
           const localTime = new Date(row.sent_at ?? 0).getTime();
           if (!Number.isFinite(nsTime) || localTime >= nsTime) {
             nsThread.last_message = row.body;
             nsThread.last_message_at = row.sent_at;
           }
           continue;
         }

         if (byPeer.has(key)) continue;
        byPeer.set(key, {
          id: row.thread_id ?? `local:${peer}`,
          messagesession_id: row.thread_id ?? `local:${peer}`,
          destination: peer,
          last_message: row.body,
          last_message_at: row.sent_at,
          unread: 0,
          source: "local",
        });
      }
      threads = [...threads, ...byPeer.values()];

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
      return jsonResponse({ ok: true, count: threads.length, threads, maestro_inbox: maestroInbox, ns_warning: nsWarning });
    }

    if (action === "messages") {
      const threadId = pick("thread_id") as string | undefined;
      if (!threadId) return jsonResponse({ error: "thread_id requis" }, 400);
      const limit = (pick("limit") as string) ?? "100";
      let messages: any[] = [];
      if (!threadId.startsWith("local:")) {
        const res = await nsFetch(
          `${userBase}/messagesessions/${encodeURIComponent(threadId)}/messages?limit=${limit}`,
          { method: "GET" }
        );
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          console.warn(`[pp-ns-sms] messages ${res.status}:`, txt.slice(0, 300));
        } else {
          const raw = await res.json().catch(() => null);
          messages = Array.isArray(raw) ? raw : (raw?.messages ?? raw?.data ?? []);
        }
      }

       const phoneHint = (pick("phone_number") as string | undefined)
        ?? (threadId.startsWith("local:") ? threadId.slice(6) : undefined);

      // Fusion de l'historique local (dédupliqué par corps + minute).
      try {
        const localRows = await getLocalMessages(supabase, ctx.profileId ?? ctx.userId);
        const hintKey = digitsOnly(phoneHint);
        const seen = new Set(
          messages.map((m: any) => `${String(m.text ?? m.message ?? m.body ?? "").trim()}|${String(m.timestamp ?? m.created_at ?? "").slice(0, 16)}`),
        );
        const merged = localRows
          .filter((row: any) => row.thread_id === threadId || (hintKey && digitsOnly(localPeer(row)) === hintKey))
          .map((row: any) => ({
            id: row.id,
            direction: row.direction,
            from: row.from_number,
            to: row.to_number,
            "from-number": row.from_number,
            text: row.body,
            body: row.body,
            timestamp: row.sent_at,
            source: "local",
          }))
          .filter((m: any) => !seen.has(`${String(m.text).trim()}|${String(m.timestamp).slice(0, 16)}`));
        messages = [...messages, ...merged].sort(
          (a: any, b: any) => +new Date(a.timestamp ?? a.created_at ?? 0) - +new Date(b.timestamp ?? b.created_at ?? 0),
        );
      } catch (e) {
        console.warn("[pp-ns-sms] local merge failed:", e);
      }

      // Best-effort Maestro conversation enrichment (needs a phone hint).
      let maestroMessages: any[] = [];
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



      // ---- Garde d'idempotence -------------------------------------------
      // AVA (chatbot/voicebot) peut rejouer un tool call, et un double tap
      // mobile peut envoyer deux fois. On refuse tout SMS identique
      // (même courtier, même destinataire, même texte) dans les 90 dernières
      // secondes et on renvoie le succès du premier envoi.
      try {
        const since = new Date(Date.now() - 90_000).toISOString();
        const { data: dup } = await supabase
          .from("planipret_phone_messages")
          .select("id, thread_id, sent_at")
          .eq("user_id", ctx.profileId ?? ctx.userId)
          .eq("direction", "outbound")
          .eq("to_number", destination)
          .eq("body", message)
          .gte("sent_at", since)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (dup?.id) {
          console.warn("[pp-ns-sms] duplicate suppressed", { to: destination, dup_id: dup.id });
          return jsonResponse({
            ok: true,
            success: true,
            duplicate: true,
            message_id: dup.id,
            thread_id: dup.thread_id ?? thread_id ?? null,
            to: destination,
            from: fromNumber,
            note: "SMS identique déjà envoyé il y a moins de 90 s — envoi ignoré.",
          }, 200);
        }
      } catch (dupErr) {
        console.warn("[pp-ns-sms] dedupe check failed (non-fatal):", dupErr);
      }




      // ---- Voie 1 : NS-API v2 (DID NetSapiens du courtier) ----------------
      // On envoie TOUJOURS via NS-API en priorité : c'est la seule voie qui
      // respecte `from-number` (le DID réel du courtier). Maestro
      // `POST /users/{id}/messages` envoie depuis un numéro générique Maestro
      // et sert donc uniquement de repli.
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

      const nsError = result?.error ?? result?.errorMessage ?? result?.error_message ?? result?.message?.error;
      const nsStatus = String(result?.status ?? result?.state ?? "").toLowerCase();
      const nsRejected = !res.ok || !!nsError || nsStatus === "failed" || nsStatus === "error"
        || result?.ok === false || result?.success === false;

      const logMessage = async (threadId: string | null, nsMsgId: string | null = null) => {
        try {
          const { data: logged, error: logError } = await supabase
            .from("planipret_phone_messages")
            .insert({
              // FK fk_phone_messages_profile → planipret_profiles.id
              user_id: ctx.profileId ?? ctx.userId,
              direction: "outbound",
              to_number: destination,
              from_number: fromNumber,
              body: message,
              status: "sent",
              ns_message_id: nsMsgId,
              metadata: { type },
              thread_id: threadId,
              sent_at: new Date().toISOString(),
            })
            .select("id")
            .maybeSingle();
          if (logError) console.error("[pp-ns-sms] log insert error:", logError.message);
          return logged?.id ?? null;
        } catch (logErr) {
          console.warn("[pp-ns-sms] log insert failed (non-fatal):", logErr);
          return null;
        }
      };


      if (!nsRejected) {
        const resolvedThreadId = thread_id
          ?? result?.messagesession_id
          ?? result?.["messagesession-id"]
          ?? result?.messagesession
          ?? sessionId;
        const messageId = await logMessage(resolvedThreadId, result?.id ?? result?.message_id ?? result?.["message-id"]);
        // Synchronisation Maestro : on NE renvoie PAS le SMS via Maestro
        // (mauvais afficheur) — on pousse seulement l'enregistrement pour que
        // la conversation apparaisse dans Maestro avec le vrai DID NS.
        if (messageId) {
          try {
            await supabase.functions.invoke("maestro-sync-message", { body: { message_id: messageId } });
          } catch (syncErr) {
            console.warn("[pp-ns-sms] maestro sync failed (non-fatal):", syncErr);
          }
        }

        // ---- Vérification post-envoi ---------------------------------------
        // On relit la ligne réellement persistée pour confirmer (a) qu'elle est
        // bien dans l'historique du courtier et (b) que le DID affiché est le
        // DID NetSapiens attendu.
        const verification: Record<string, unknown> = {
          saved: false,
          did_match: false,
          expected_from: fromNumber,
          stored_from: null,
          thread_id: resolvedThreadId,
          message_id: messageId,
        };
        if (messageId) {
          try {
            const { data: check } = await supabase
              .from("planipret_phone_messages")
              .select("id, from_number, to_number, thread_id, sent_at, direction")
              .eq("id", messageId)
              .maybeSingle();
            if (check) {
              verification.saved = true;
              verification.stored_from = check.from_number;
              verification.stored_to = check.to_number;
              verification.sent_at = check.sent_at;
              verification.thread_id = check.thread_id ?? resolvedThreadId;
              verification.did_match = digitsOnly(check.from_number ?? "") === digitsOnly(fromNumber);
            }
          } catch (vErr) {
            verification.error = String((vErr as Error).message ?? vErr);
          }
        }
        if (!verification.saved) verification.warning = "message_not_persisted";
        else if (!verification.did_match) verification.warning = "did_mismatch";

        return jsonResponse({
          ok: true, via: "ns", result, message_id: messageId,
          from: fromNumber, to: destination, thread_id: resolvedThreadId,
          verification,
        });

      }


      console.error("[pp-ns-sms] NS send failed", res.status, nsError ?? lastText?.slice(0, 200));

      // ---- PAS de repli Maestro -------------------------------------------
      // `POST /users/{id}/messages` (Maestro) ignore `from`/`from_number` et
      // envoie depuis un numéro du pool Maestro (le destinataire voyait le DID
      // d'un autre courtier). On préfère échouer clairement plutôt que d'envoyer
      // avec un mauvais afficheur.

      return jsonResponse(
        { ok: false, error: nsError ?? `Envoi SMS refusé par le PBX (${res.status}) — le message n'a pas été envoyé. Vérifiez que le DID ${fromNumber} est bien attribué à votre extension.`, status: res.status, body: lastText, from: fromNumber, to: destination, endpoint: path },
        200,
      );

    }

    return jsonResponse({ error: `Action inconnue: ${action}` }, 400);
  } catch (e) {
    console.error("[pp-ns-sms] Erreur:", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
