import { describe, it, expect, vi, beforeEach } from "vitest";
const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: any[]) => invoke(...a) }, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } },
}));
import { quickReplyTarget, sendQuickReply, loadQuickReplies, saveQuickReplies, handleQuickReplyAction, DEFAULT_QUICK_REPLIES } from "../quickReply";

beforeEach(() => { localStorage.clear(); invoke.mockReset(); invoke.mockResolvedValue({ data: { ok: true }, error: null }); });

describe("quick reply", () => {
  it("accepte seulement les numéros externes nord-américains", () => {
    expect(quickReplyTarget("sip:15147071203@sbc1.ucstack.io")).toBe("+15147071203");
    expect(quickReplyTarget("(514) 707-1203")).toBe("+15147071203");
    expect(quickReplyTarget("1137")).toBeNull();
    expect(quickReplyTarget("anonymous")).toBeNull();
    expect(quickReplyTarget("")).toBeNull();
  });
  it("envoie un seul texto par appel avec la clé quick-reply:<callId>", async () => {
    expect(await sendQuickReply({ callId: "c1", to: "5147071203", text: "Je vous rappelle" })).toMatchObject({ ok: true });
    expect(invoke.mock.calls[0][1].body).toMatchObject({ to: "+15147071203", idempotency_key: "quick-reply:c1" });
    const again = await sendQuickReply({ callId: "c1", to: "5147071203", text: "x" });
    expect(again).toMatchObject({ ok: false, duplicate: true });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("refuse sans numéro texto valide et sans appel serveur", async () => {
    expect(await sendQuickReply({ callId: "c2", to: "113", text: "x" })).toMatchObject({ ok: false, error: "no_target" });
    expect(invoke).not.toHaveBeenCalled();
  });
  it("échec serveur (aucun numéro texto) n'est pas marqué envoyé", async () => {
    invoke.mockResolvedValueOnce({ data: { ok: false, error_code: "sms_sender_not_assigned" }, error: null });
    expect(await sendQuickReply({ callId: "c3", to: "5147071203", text: "x" })).toMatchObject({ ok: false });
    expect(await sendQuickReply({ callId: "c3", to: "5147071203", text: "x" })).toMatchObject({ ok: true });
  });
  it("textes personnalisés par utilisateur", () => {
    saveQuickReplies("u1", { meeting: "En rendez-vous" });
    expect(loadQuickReplies("u1", "fr").meeting).toBe("En rendez-vous");
    expect(loadQuickReplies("u2", "fr").meeting).toBe(DEFAULT_QUICK_REPLIES.fr.meeting);
  });
  it("notification expirée après 10 min : rien envoyé", async () => {
    const r = await handleQuickReplyAction("qr_meeting", { callId: "c4", to: "+15147071203", expiresAt: String(Date.now() - 1) });
    expect(r).toMatchObject({ ok: false, error: "expired" });
    expect(invoke).not.toHaveBeenCalled();
  });
  it("action notification envoie le texte choisi", async () => {
    const r = await handleQuickReplyAction("qr_callback", { callId: "c5", to: "+15147071203", expiresAt: String(Date.now() + 60000) });
    expect(r).toMatchObject({ ok: true });
    expect(invoke.mock.calls[0][1].body.message).toBe(DEFAULT_QUICK_REPLIES.fr.callback);
  });
});
