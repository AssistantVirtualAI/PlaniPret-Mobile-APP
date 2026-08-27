/**
 * pp-cdr-e2e — logique PURE du test de bout en bout « un appel produit-il un
 * événement CDR ? ».
 *
 * Trois maillons doivent être vrais après un appel :
 *   1. l'abonnement webhook NS existe (sinon aucun événement n'est envoyé);
 *   2. le webhook a bien été reçu et un CDR a été écrit localement;
 *   3. le CDR a été poussé vers Maestro (widget + rapport de communications).
 *
 * Aucune dépendance Deno/Supabase ici : testable en vitest.
 */

export type CdrE2eInput = {
  /** Abonnement webhook `call` présent côté NetSapiens. */
  webhookSubscription: boolean;
  /** Date ISO du dernier appel enregistré localement (CDR reçu). */
  lastCallAt: string | null;
  /** Date ISO du dernier push Maestro réussi (widget / communications). */
  lastMaestroPushAt: string | null;
  /** Dernière erreur de push Maestro, si la dernière tentative a échoué. */
  lastMaestroError?: string | null;
  /** Maintenant (injectable pour les tests). */
  now?: Date;
  /** Fenêtre de fraîcheur en heures (défaut 72 h). */
  freshnessHours?: number;
};

export type CdrE2eCheck = {
  id: "webhook_subscription" | "cdr_received" | "maestro_push";
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  action?: string;
};

export type CdrE2eReport = {
  verdict: "ok" | "warn" | "fail";
  summary: string;
  checks: CdrE2eCheck[];
};

const ageHours = (iso: string | null | undefined, now: Date): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 3_600_000;
};

const human = (h: number) => (h < 1 ? `il y a ${Math.max(1, Math.round(h * 60))} min` : `il y a ${Math.round(h)} h`);

export function buildCdrE2eReport(input: CdrE2eInput): CdrE2eReport {
  const now = input.now ?? new Date();
  const window = input.freshnessHours ?? 72;
  const checks: CdrE2eCheck[] = [];

  checks.push(
    input.webhookSubscription
      ? {
          id: "webhook_subscription",
          label: "Abonnement webhook NetSapiens",
          status: "ok",
          detail: "Un abonnement `call` est actif : le PBX envoie les événements d'appel.",
        }
      : {
          id: "webhook_subscription",
          label: "Abonnement webhook NetSapiens",
          status: "fail",
          detail: "Aucun abonnement `call` : le PBX n'envoie aucun événement, donc aucun CDR n'arrivera jamais.",
          action: "Recréer l'abonnement webhook (modèle `call`, domaine obligatoire côté Reseller).",
        },
  );

  const callAge = ageHours(input.lastCallAt, now);
  if (callAge === null) {
    checks.push({
      id: "cdr_received",
      label: "CDR reçu par le webhook",
      status: "fail",
      detail: "Aucun appel enregistré pour ce poste : le webhook d'appel n'a jamais livré de CDR.",
      action: "Faire un appel de test vers le DID du poste, puis relancer ce diagnostic. "
        + "Si rien n'apparaît, vérifier le routage du DID (destination user_XXXX) et l'abonnement webhook.",
    });
  } else if (callAge > window) {
    checks.push({
      id: "cdr_received",
      label: "CDR reçu par le webhook",
      status: "warn",
      detail: `Dernier CDR reçu ${human(callAge)} — au-delà de la fenêtre de ${window} h.`,
      action: "Faire un appel de test : si aucun nouvel événement n'arrive, le webhook n'est plus livré.",
    });
  } else {
    checks.push({
      id: "cdr_received",
      label: "CDR reçu par le webhook",
      status: "ok",
      detail: `Dernier CDR reçu ${human(callAge)} : le webhook livre bien les événements d'appel.`,
    });
  }

  const pushAge = ageHours(input.lastMaestroPushAt, now);
  if (input.lastMaestroError) {
    checks.push({
      id: "maestro_push",
      label: "Push vers Maestro (widget + communications)",
      status: "fail",
      detail: `Le dernier envoi vers Maestro a échoué : ${input.lastMaestroError}`,
      action: "Reconnecter le compte Maestro puis relancer le rattrapage (pp-maestro-push-sweeper).",
    });
  } else if (pushAge === null) {
    checks.push({
      id: "maestro_push",
      label: "Push vers Maestro (widget + communications)",
      status: callAge === null ? "warn" : "fail",
      detail: callAge === null
        ? "Aucun push Maestro — attendu, puisqu'aucun CDR n'a encore été reçu."
        : "Des CDR sont reçus localement mais rien n'a été poussé vers Maestro : le widget et le rapport de communications resteront vides.",
      action: callAge === null
        ? "Faire d'abord un appel de test."
        : "Vérifier la connexion Maestro du courtier, puis relancer pp-maestro-push-sweeper.",
    });
  } else if (pushAge > window) {
    checks.push({
      id: "maestro_push",
      label: "Push vers Maestro (widget + communications)",
      status: "warn",
      detail: `Dernier push Maestro ${human(pushAge)} — au-delà de la fenêtre de ${window} h.`,
      action: "Relancer le rattrapage Maestro (pp-maestro-push-sweeper).",
    });
  } else {
    checks.push({
      id: "maestro_push",
      label: "Push vers Maestro (widget + communications)",
      status: "ok",
      detail: `Dernier push Maestro ${human(pushAge)} : le widget et le rapport de communications sont alimentés.`,
    });
  }

  const failed = checks.filter((c) => c.status === "fail");
  const warned = checks.filter((c) => c.status === "warn");
  return {
    verdict: failed.length ? "fail" : warned.length ? "warn" : "ok",
    summary: failed.length
      ? `Chaîne CDR interrompue : ${failed.map((c) => c.label).join(", ")}.`
      : warned.length
        ? `Chaîne CDR fonctionnelle mais silencieuse depuis un moment : ${warned.map((c) => c.label).join(", ")}.`
        : "Chaîne CDR complète : webhook reçu et poussé vers Maestro.",
    checks,
  };
}
