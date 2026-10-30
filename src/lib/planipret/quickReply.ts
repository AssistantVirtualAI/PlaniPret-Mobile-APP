// Répondre par texto à un appel entrant.
// Le texto part via pp-ns-sms (expéditeur = DID texto du courtier, vérifié
// côté serveur). Une seule réponse par appel : clé d'idempotence quick-reply:<callId>.
import { supabase } from "@/integrations/supabase/client";

export type QuickReplyId = "unavailable" | "meeting" | "callback";
export type QuickReplyLang = "fr" | "en";
export type QuickReplyTemplates = Record<QuickReplyId, string>;

export const QUICK_REPLY_IDS: QuickReplyId[] = ["unavailable", "meeting", "callback"];
export const QUICK_REPLY_ACTION_TYPE = "PP_QUICK_REPLY";
export const QUICK_REPLY_PROMPT_TTL_MS = 10 * 60 * 1000;
export const QUICK_REPLY_MAX_LEN = 300;

export const DEFAULT_QUICK_REPLIES: Record<QuickReplyLang, QuickReplyTemplates> = {
  fr: {
    unavailable: "Je ne suis pas disponible pour le moment.",
    meeting: "Je suis en réunion, je vous reviens dès que possible.",
    callback: "Je vous rappelle sous peu.",
  },
  en: {
    unavailable: "I'm not available right now.",
    meeting: "I'm in a meeting, I'll get back to you as soon as possible.",
    callback: "I'll call you back shortly.",
  },
};

const storageKey = (uid: string) => `pp.quickReplies.v1.${uid}`;
const sentKey = "pp.quickReplies.sent.v1";

/** Numéro externe nord-américain joignable par texto, sinon null (poste, masqué, court). */
export function quickReplyTarget(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s || /anonymous|restricted|private|unknown|masqu/i.test(s)) return null;
  const m = s.match(/(?:sip:|tel:)?\+?(\d[\d\s().-]{6,})/i);
  const digits = (m ? m[1] : s).replace(/\D/g, "");
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1") && /^[2-9]/.test(digits[1])) return `+${digits}`;
  return null;
}

export function loadQuickReplies(uid: string | null, lang: QuickReplyLang): QuickReplyTemplates {
  const base = { ...DEFAULT_QUICK_REPLIES[lang] };
  if (!uid) return base;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(uid)) || "{}");
    for (const id of QUICK_REPLY_IDS) {
      const v = typeof saved?.[id] === "string" ? saved[id].trim() : "";
      if (v) base[id] = v.slice(0, QUICK_REPLY_MAX_LEN);
    }
  } catch { /* défauts */ }
  return base;
}

export function saveQuickReplies(uid: string, t: Partial<QuickReplyTemplates>) {
  const clean: Partial<QuickReplyTemplates> = {};
  for (const id of QUICK_REPLY_IDS) {
    const v = String(t[id] ?? "").trim().slice(0, QUICK_REPLY_MAX_LEN);
    if (v) clean[id] = v;
  }
  localStorage.setItem(storageKey(uid), JSON.stringify(clean));
}

export function resetQuickReplies(uid: string) {
  localStorage.removeItem(storageKey(uid));
}

function sentSet(): Record<string, number> {
  try {
    const o = JSON.parse(localStorage.getItem(sentKey) || "{}");
    const now = Date.now();
    for (const k of Object.keys(o)) if (now - o[k] > 24 * 3600_000) delete o[k];
    return o;
  } catch { return {}; }
}

export function alreadyReplied(callId: string): boolean {
  return !!callId && !!sentSet()[callId];
}

export type QuickReplyResult = { ok: boolean; error: string; duplicate?: boolean };

export async function sendQuickReply(args: { callId: string; to: string; text: string }): Promise<QuickReplyResult> {
  const to = quickReplyTarget(args.to);
  const text = String(args.text ?? "").trim().slice(0, QUICK_REPLY_MAX_LEN);
  if (!to) return { ok: false, error: "no_target" };
  if (!text) return { ok: false, error: "empty" };
  const callId = String(args.callId || `${to}-${Math.floor(Date.now() / 300_000)}`);
  if (alreadyReplied(callId)) return { ok: false, error: "duplicate", duplicate: true };
  const { data, error } = await supabase.functions.invoke("pp-ns-sms?action=send", {
    method: "POST",
    body: { to, message: text, idempotency_key: `quick-reply:${callId}`.slice(0, 120), surface: "call_quick_reply" },
  });
  if (error || !data || (data as any).ok === false) {
    const code = (data as any)?.error_code || (data as any)?.error || error?.message || "send_failed";
    return { ok: false, error: String(code) };
  }
  const s = sentSet(); s[callId] = Date.now();
  try { localStorage.setItem(sentKey, JSON.stringify(s)); } catch { /* ignore */ }
  return { ok: true, error: "" };
}

export function quickReplyErrorText(error: string, lang: QuickReplyLang): string {
  const fr = lang === "fr";
  if (error === "no_target") return fr ? "Ce numéro ne peut pas recevoir de texto." : "This number can't receive texts.";
  if (error === "duplicate") return fr ? "Une réponse a déjà été envoyée pour cet appel." : "A reply was already sent for this call.";
  if (/sender|did|no_sms|sms_number/i.test(error)) return fr ? "Aucun numéro texto actif." : "No active texting number.";
  return fr ? "Texto non envoyé. Réessayez." : "Text not sent. Try again.";
}

/** Notification « Répondre par texto ? » après un refus hors de l'app (verrouillé / app fermée). */
export async function registerQuickReplyActionType(lang: QuickReplyLang = "fr") {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const tpl = DEFAULT_QUICK_REPLIES[lang];
    await LocalNotifications.registerActionTypes({
      types: [{
        id: QUICK_REPLY_ACTION_TYPE,
        actions: [
          { id: "qr_unavailable", title: short(tpl.unavailable) },
          { id: "qr_meeting", title: short(tpl.meeting) },
          { id: "qr_callback", title: short(tpl.callback) },
          { id: "qr_custom", title: lang === "fr" ? "Personnalisé…" : "Custom…", input: true,
            inputButtonTitle: lang === "fr" ? "Envoyer" : "Send",
            inputPlaceholder: lang === "fr" ? "Votre message" : "Your message" },
        ],
      }],
    });
  } catch { /* web / plugin absent */ }
}

function short(s: string) { return s.length > 40 ? `${s.slice(0, 38)}…` : s; }

export async function scheduleQuickReplyPrompt(args: { callId: string; from: string; lang?: QuickReplyLang }) {
  const to = quickReplyTarget(args.from);
  if (!to || alreadyReplied(args.callId)) return false;
  const lang = args.lang ?? "fr";
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return false;
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await registerQuickReplyActionType(lang);
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 2_000_000_000),
        title: lang === "fr" ? "Répondre par texto ?" : "Reply by text?",
        body: to,
        actionTypeId: QUICK_REPLY_ACTION_TYPE,
        extra: { type: "quick_reply", callId: args.callId, to, expiresAt: String(Date.now() + QUICK_REPLY_PROMPT_TTL_MS) },
      }],
    });
    return true;
  } catch { return false; }
}

/** Traite un tap sur la notification « Répondre par texto ? ». */
export async function handleQuickReplyAction(
  actionId: string, extra: Record<string, string>, inputValue?: string,
): Promise<QuickReplyResult | "open"> {
  const expiresAt = Number(extra.expiresAt || 0);
  if (expiresAt && Date.now() > expiresAt) return { ok: false, error: "expired" };
  const lang: QuickReplyLang = (localStorage.getItem("mplanipret-lang") === "en" ? "en" : "fr");
  const { data } = await supabase.auth.getUser();
  const tpl = loadQuickReplies(data.user?.id ?? null, lang);
  let text = "";
  if (actionId === "qr_unavailable") text = tpl.unavailable;
  else if (actionId === "qr_meeting") text = tpl.meeting;
  else if (actionId === "qr_callback") text = tpl.callback;
  else if (actionId === "qr_custom" && inputValue?.trim()) text = inputValue;
  else return "open";
  return sendQuickReply({ callId: extra.callId, to: extra.to, text });
}
