import { describe, it, expect } from "vitest";
import {
  AVA_SENSITIVE_TOOLS,
  buildIdempotencyKey,
  claimAction,
  confirmationRequiredResult,
  finishAction,
  isConfirmed,
  isSensitiveAvaTool,
  isAvaOriginated,
  isSensitiveMs365Action,
} from "../../supabase/functions/_shared/ava-confirm";
import { validateFollowup, normalizeE164 } from "../../supabase/functions/pp-call-followup/logic";

/** Base en mémoire imitant la table planipret_ava_action_confirmations. */
function fakeAdmin() {
  const rows: any[] = [];
  return {
    rows,
    from() {
      let key: string | null = null;
      let id: string | null = null;
      const api: any = {
        select: () => api,
        eq: (col: string, val: string) => {
          if (col === "idempotency_key") key = val;
          if (col === "id") id = val;
          return api;
        },
        maybeSingle: async () => ({ data: rows.find((r) => r.idempotency_key === key) ?? null }),
        insert(row: any) {
          if (rows.some((r) => r.idempotency_key === row.idempotency_key)) {
            return { select: () => ({ maybeSingle: async () => ({ data: null, error: { code: "23505" } }) }) };
          }
          const created = { id: `row-${rows.length + 1}`, ...row };
          rows.push(created);
          return { select: () => ({ maybeSingle: async () => ({ data: created, error: null }) }) };
        },
        update(patch: any) {
          const upd: any = {
            eq: async (col: string, val: string) => {
              const row = rows.find((r) => (col === "id" ? r.id === val : r.idempotency_key === val));
              if (row) Object.assign(row, patch);
              return { data: null };
            },
          };
          return upd;
        },
      };
      void id;
      return api;
    },
  };
}

describe("barrière de confirmation AVA", () => {
  it("couvre les actions sensibles (texto, courriel, appel, tâches, Maestro)", () => {
    for (const t of ["send_sms", "send_email", "make_call", "create_task", "delete_task", "push_call_summary", "push_client_note"]) {
      expect(isSensitiveAvaTool(t)).toBe(true);
    }
    expect(isSensitiveAvaTool("get_calendar_today")).toBe(false);
    expect(AVA_SENSITIVE_TOOLS.size).toBeGreaterThan(15);
  });

  it("refuse l'exécution sans confirmation explicite", () => {
    expect(isConfirmed({})).toBe(false);
    expect(isConfirmed({ confirmed: "true" })).toBe(false);
    expect(isConfirmed({ confirmed: true })).toBe(true);
    expect(isConfirmed({ approved: true })).toBe(true);
    const res = confirmationRequiredResult("send_sms", { to: "+15550001111" });
    expect(res.success).toBe(false);
    expect(res.needs_confirmation).toBe(true);
  });
});

describe("idempotence serveur", () => {
  const args = { userId: "u1", action: "send_sms", destination: "+15550001111", callId: "c1", payload: { body: "Bonjour" } };

  it("produit la même clé pour la même action", async () => {
    expect(await buildIdempotencyKey(args)).toBe(await buildIdempotencyKey({ ...args }));
  });

  it("produit une clé différente si le contenu change", async () => {
    expect(await buildIdempotencyKey(args)).not.toBe(await buildIdempotencyKey({ ...args, payload: { body: "Autre" } }));
  });

  it("un double tap ne produit qu'une seule exécution", async () => {
    const admin = fakeAdmin();
    const key = await buildIdempotencyKey(args);
    const first = await claimAction(admin as any, { userId: "u1", action: "send_sms", surface: "ava_tool", idempotencyKey: key });
    expect(first.replay).toBe(false);
    await finishAction(admin as any, (first as any).id, true, { sent: true });

    const second = await claimAction(admin as any, { userId: "u1", action: "send_sms", surface: "ava_tool", idempotencyKey: key });
    expect(second.replay).toBe(true);
    expect((second as any).result.idempotent_replay).toBe(true);
    expect(admin.rows).toHaveLength(1);
  });

  it("un webhook rejoué pendant l'exécution ne renvoie pas une deuxième fois", async () => {
    const admin = fakeAdmin();
    const key = await buildIdempotencyKey({ ...args, callId: "c2" });
    await claimAction(admin as any, { userId: "u1", action: "send_sms", surface: "ava_tool", idempotencyKey: key });
    const replay = await claimAction(admin as any, { userId: "u1", action: "send_sms", surface: "ava_tool", idempotencyKey: key });
    expect(replay.replay).toBe(true);
    expect(admin.rows).toHaveLength(1);
  });

  it("un échec réel n'est jamais présenté comme un succès et autorise un nouvel essai", async () => {
    const admin = fakeAdmin();
    const key = await buildIdempotencyKey({ ...args, callId: "c3" });
    const first = await claimAction(admin as any, { userId: "u1", action: "send_sms", surface: "ava_tool", idempotencyKey: key });
    await finishAction(admin as any, (first as any).id, false, null, "network_error");
    expect(admin.rows[0].status).toBe("failed");
    const retry = await claimAction(admin as any, { userId: "u1", action: "send_sms", surface: "ava_tool", idempotencyKey: key });
    expect(retry.replay).toBe(false);
  });

  it("ne journalise ni jeton ni contenu audio", async () => {
    const admin = fakeAdmin();
    const key = await buildIdempotencyKey({ ...args, callId: "c4" });
    await claimAction(admin as any, { userId: "u1", action: "send_sms", surface: "ava_tool", destination: "+15550001111", idempotencyKey: key });
    const stored = JSON.stringify(admin.rows[0]);
    expect(stored).not.toMatch(/token|password|audio|Bearer/i);
  });
});

describe("suivi de fin d'appel côté serveur", () => {
  it("refuse sans confirmation", () => {
    expect(validateFollowup({ kind: "sms", recipient: "+15550001111", body: "Salut" })).toMatchObject({ ok: false, error: "confirmation_required" });
  });
  it("refuse un destinataire manquant ou invalide", () => {
    expect(validateFollowup({ kind: "sms", recipient: "", body: "Salut", confirmed: true })).toMatchObject({ ok: false });
    expect(validateFollowup({ kind: "email", recipient: "nope", body: "Salut", confirmed: true })).toMatchObject({ ok: false, error: "recipient_invalid" });
  });
  it("refuse un brouillon vide", () => {
    expect(validateFollowup({ kind: "sms", recipient: "+15550001111", body: "  ", confirmed: true })).toMatchObject({ ok: false, error: "empty_body" });
  });
  it("accepte un brouillon confirmé et normalise le numéro", () => {
    const r = validateFollowup({ kind: "sms", recipient: "(555) 000-1111", body: "Merci", confirmed: true });
    expect(r.ok).toBe(true);
    expect((r as any).destination).toBe("+15550001111");
  });
  it("normalise les numéros nord-américains", () => {
    expect(normalizeE164("5550001111")).toBe("+15550001111");
    expect(normalizeE164("123")).toBeNull();
  });
});

describe("barrière Microsoft 365 et textos AVA", () => {
  it("classe les actions M365 sortantes comme sensibles", () => {
    for (const a of ["send_email", "reply_email", "reply_all_email", "forward_email", "delete_email",
      "create_calendar_event", "update_calendar_event", "delete_calendar_event",
      "send_teams_message", "reply_teams_message", "create_teams_chat", "upsert_contact"]) {
      expect(isSensitiveMs365Action(a)).toBe(true);
    }
  });
  it("laisse passer les lectures M365", () => {
    for (const a of ["read_emails", "list_folders", "daily_briefing", "connection_status", "search_contact"]) {
      expect(isSensitiveMs365Action(a)).toBe(false);
    }
  });
  it("détecte un envoi préparé par AVA", () => {
    expect(isAvaOriginated({ origin: "ava_chat" })).toBe(true);
    expect(isAvaOriginated({ surface: "AVA-voice" })).toBe(true);
    expect(isAvaOriginated({ ava_generated: true })).toBe(true);
    expect(isAvaOriginated({ draft: true })).toBe(true);
    expect(isAvaOriginated({ origin: "mobile_manual" })).toBe(false);
    expect(isAvaOriginated({})).toBe(false);
  });
  it("un brouillon AVA n'est jamais confirmé implicitement", () => {
    expect(isConfirmed({ origin: "ava", draft: true })).toBe(false);
    expect(isConfirmed({ origin: "ava", confirmed: "true" })).toBe(false);
    expect(isConfirmed({ origin: "ava", confirmed: true })).toBe(true);
    expect(isConfirmed({ origin: "ava", approved: true })).toBe(true);
  });
  it("la même action M365 confirmée deux fois n'exécute qu'une fois", async () => {
    const admin = fakeAdmin();
    const key = await buildIdempotencyKey({
      userId: "broker-1", action: "ms365:send_email",
      destination: "client@example.test", callId: "call-1", payload: { subject: "Suivi" },
    });
    const first = await claimAction(admin as any, {
      userId: "broker-1", action: "ms365:send_email", surface: "ms365",
      destination: "client@example.test", provider: "microsoft365", idempotencyKey: key,
    });
    expect(first.replay).toBe(false);
    await finishAction(admin as any, (first as any).id, true, { success: true, id: "msg-1" });
    const second = await claimAction(admin as any, {
      userId: "broker-1", action: "ms365:send_email", surface: "ms365",
      destination: "client@example.test", provider: "microsoft365", idempotencyKey: key,
    });
    expect(second.replay).toBe(true);
    expect((second as any).result).toMatchObject({ id: "msg-1", idempotent_replay: true });
  });
});

describe("actions courriel proposées par AVA (ava-action-executor)", () => {
  it("refuse l'exécution d'une action proposée sans confirmation", () => {
    const req = { analysis_id: "a1", action_id: "act1" };
    expect(isConfirmed(req)).toBe(false);
    const res = confirmationRequiredResult("ava_action:act1", req);
    expect(res.needs_confirmation).toBe(true);
    expect(res.success).toBe(false);
  });

  it("un double tap sur « Confirmer et envoyer » n'exécute qu'une fois", async () => {
    const admin = fakeAdmin();
    const key = await buildIdempotencyKey({
      userId: "broker-9", action: "ava_action:email_reply",
      destination: "client@example.test", payload: { analysis_id: "a1", action_id: "act1", content: "Bonjour" },
    });
    const first = await claimAction(admin as any, {
      userId: "broker-9", action: "ava_action:email_reply", surface: "ava_email_actions",
      destination: "client@example.test", provider: "ms365", idempotencyKey: key,
    });
    expect(first.replay).toBe(false);
    await finishAction(admin as any, (first as any).id, true, { execution_mode: "live", result: { sent_to: ["client@example.test"] } });
    const second = await claimAction(admin as any, {
      userId: "broker-9", action: "ava_action:email_reply", surface: "ava_email_actions",
      destination: "client@example.test", provider: "ms365", idempotencyKey: key,
    });
    expect(second.replay).toBe(true);
    expect(admin.rows).toHaveLength(1);
  });

  it("une modification du brouillon change la clé d'idempotence", async () => {
    const base = { userId: "broker-9", action: "ava_action:email_reply", destination: "client@example.test" };
    const k1 = await buildIdempotencyKey({ ...base, payload: { content: "Bonjour" } });
    const k2 = await buildIdempotencyKey({ ...base, payload: { content: "Bonjour, merci" } });
    expect(k1).not.toBe(k2);
  });

  it("un texto préparé par AVA via mobile-sms exige une confirmation", () => {
    const draft = { threadId: "t1", body: "Suivi", origin: "ava_post_call" };
    expect(isAvaOriginated(draft)).toBe(true);
    expect(isConfirmed(draft)).toBe(false);
    expect(isConfirmed({ ...draft, confirmed: true })).toBe(true);
  });
});
