/**
 * Décision uniquement pour une réponse vocale courte et sans ambiguïté.
 * Toute autre phrase laisse la proposition en attente.
 */
export function voiceConfirmationDecision(value: unknown): "confirm" | "cancel" | null {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;
  if (/^(non|no|annule|annuler|arrete|stop|cancel|pas maintenant|ne le fais pas)$/.test(text)) return "cancel";
  if (/^(oui|oui confirme|yes|yes confirm|confirme|je confirme|vas y|go|d'accord|d accord|okay|ok)$/.test(text)) return "confirm";
  return null;
}
