// AVA feedback helper. A feedback report can name the current feature, but a
// screenshot is opt-in because the screen may contain client information.
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "pp-feedback-screenshots";
const LAST_PAGE_KEY = "pp_last_page_before_ava";

const ROUTE_LABELS: Array<[RegExp, string]> = [
  [/\/(mplanipret|planipret)\/home(?:\/|$)/i, "Accueil"],
  [/\/(mplanipret|planipret)\/contacts?(?:\/|$)/i, "Contacts"],
  [/\/(mplanipret|planipret)\/tasks?(?:\/|$)/i, "Tâches"],
  [/\/(mplanipret|planipret)\/calls?(?:\/|$)/i, "Appels"],
  [/\/(mplanipret|planipret)\/messages?(?:\/|$)/i, "Messages"],
  [/\/(mplanipret|planipret)\/commissions?(?:\/|$)/i, "Commissions"],
  [/\/(mplanipret|planipret)\/more(?:\/|$)/i, "Plus"],
  [/\/(mplanipret|planipret)\/feedback(?:\/|$)/i, "Feedback"],
];

export function safeFeedbackPage(path: string | null | undefined): string {
  const clean = String(path ?? "").split(/[?#]/, 1)[0];
  return ROUTE_LABELS.find(([pattern]) => pattern.test(clean))?.[1] ?? "Application Planiprêt";
}

/** Remember the last non-AVA page so AVA knows which screen the issue is about. */
export function rememberPageForAva(path: string) {
  try { if (!/\/ava/i.test(path)) sessionStorage.setItem(LAST_PAGE_KEY, safeFeedbackPage(path)); } catch { /* ignore */ }
}
export function lastPageBeforeAva(): string {
  try { return safeFeedbackPage(sessionStorage.getItem(LAST_PAGE_KEY) || window.location.pathname); } catch { return "Application Planiprêt"; }
}

/** Screenshot only after a separate, explicit opt-in. Elements tagged with
 * data-feedback-redact or data-html2canvas-ignore are excluded. */
export async function captureScreenBlob(): Promise<Blob | null> {
  try {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(document.body, {
      useCORS: true, logging: false, backgroundColor: null,
      scale: Math.min(2, window.devicePixelRatio || 1),
      width: window.innerWidth, height: window.innerHeight,
      x: window.scrollX, y: window.scrollY,
      ignoreElements: (element) => element.hasAttribute("data-html2canvas-ignore") || element.hasAttribute("data-feedback-redact"),
    });
    return await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.85));
  } catch (e) {
    console.warn("[avaFeedback] capture failed", e);
    return null;
  }
}

/** Capture + upload after the caller has collected explicit consent. Returns a
 * storage path or null; automatic capture is deliberately not provided. */
export async function captureAndUploadScreenshot({ consent }: { consent: boolean }): Promise<string | null> {
  if (consent !== true) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const blob = await captureScreenBlob();
  if (!blob) return null;
  const path = `${user.id}/${Date.now()}-ava-screen.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) { console.warn("[avaFeedback] upload failed", error.message); return null; }
  return path;
}
