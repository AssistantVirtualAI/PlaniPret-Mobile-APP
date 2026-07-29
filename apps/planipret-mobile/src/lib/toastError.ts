import { toast } from "sonner";

/**
 * Unified error → toast helper used across AVA / Maestro / NS flows.
 * Handles 402 (credits) and 429 (rate limit) explicitly.
 */
export function toastError(err: unknown, fallback = "Une erreur est survenue") {
  const e: any = err ?? {};
  const status = e?.status ?? e?.code ?? e?.response?.status;
  const raw = String(e?.message ?? e?.error ?? e ?? "");

  if (status === 402 || /402|credit/i.test(raw)) {
    toast.error("Crédits AVA épuisés", {
      description: "Ajoute des crédits dans Paramètres → Workspace → Usage.",
    });
    return;
  }
  if (status === 429 || /429|rate/i.test(raw)) {
    toast.error("Trop de requêtes", {
      description: "Réessaie dans quelques secondes.",
    });
    return;
  }
  toast.error(fallback, { description: raw.slice(0, 200) || undefined });
}

let blockedUntil = 0;
export function isAvaBudgetBlocked(): boolean {
  return Date.now() < blockedUntil;
}
export function noteAvaBudgetError(status?: number) {
  if (status === 402 || status === 429) {
    blockedUntil = Date.now() + 60_000;
  }
}
