export function commissionLoadMessage(raw: unknown, isFr: boolean) {
  const message = String(raw ?? "").trim();
  if (/unauthorized|session|401/i.test(message)) {
    return isFr
      ? "Votre session a expiré. Reconnectez-vous puis réessayez."
      : "Your session expired. Sign in again and retry.";
  }
  if (/timeout|abort|network|failed to (send|fetch)|load failed/i.test(message)) {
    return isFr
      ? "Le rapport prend plus de temps que prévu. Réessayez dans un instant."
      : "The report is taking longer than expected. Please retry in a moment.";
  }
  return isFr
    ? "Le rapport de commissions est temporairement indisponible. Réessayez dans un instant."
    : "The commission report is temporarily unavailable. Please retry in a moment.";
}
