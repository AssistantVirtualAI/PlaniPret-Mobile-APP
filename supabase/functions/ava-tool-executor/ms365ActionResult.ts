export type Ms365ActionResult = {
  success: boolean;
  error?: string;
  message: string;
  id?: string;
};

/**
 * Empêche AVA d'annoncer une création/envoi tant que ms365-actions n'a pas
 * explicitement confirmé l'opération attendue.
 */
export function ms365ActionResult(
  response: any,
  options: {
    action: "calendar" | "email" | "teams";
    successMessage: string;
    requiredId?: string | null;
  },
): Ms365ActionResult {
  const error = String(response?.error ?? response?.details?.message ?? "").trim();
  if (response?.success !== true) {
    return {
      success: false,
      error: error || `${options.action}_not_confirmed`,
      message: `Action Microsoft non confirmée : ${error || "le service n'a pas confirmé l'opération."}`,
    };
  }

  if (options.requiredId !== undefined && !options.requiredId) {
    return {
      success: false,
      error: `${options.action}_id_missing`,
      message: "Action Microsoft non confirmée : identifiant de résultat manquant.",
    };
  }

  return { success: true, message: options.successMessage, ...(options.requiredId ? { id: options.requiredId } : {}) };
}
