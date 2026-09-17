import { describe, expect, it } from "vitest";
import {
  SMS_AUTOMATIC_ATTEMPTS,
  canAutomaticallyRetrySms,
  getSmsSubmission,
  smsSubmissionFingerprint,
} from "../smsSendGuard";

describe("smsSendGuard", () => {
  const draft = { to: "+1 (514) 555-0199", body: "Bonjour\u00a0client" };

  it("interdit toute reprise automatique après une tentative SMS", () => {
    expect(SMS_AUTOMATIC_ATTEMPTS).toBe(1);
    expect(canAutomaticallyRetrySms()).toBe(false);
  });

  it("conserve la même clé pour un renvoi manuel du même brouillon", () => {
    const first = getSmsSubmission(null, draft, () => "nonce-1");
    const replay = getSmsSubmission(first, { to: "5145550199", body: "Bonjour client" }, () => "nonce-2");

    expect(replay.idempotencyKey).toBe("pp-sms-v1:nonce-1");
    expect(replay.fingerprint).toBe(smsSubmissionFingerprint(draft));
  });

  it("renouvelle la clé seulement quand le destinataire ou le texte change", () => {
    const first = getSmsSubmission(null, draft, () => "nonce-1");

    expect(getSmsSubmission(first, { ...draft, body: "Bonjour client!" }, () => "nonce-2").idempotencyKey)
      .toBe("pp-sms-v1:nonce-2");
    expect(getSmsSubmission(first, { ...draft, to: "+1 438 555-0199" }, () => "nonce-3").idempotencyKey)
      .toBe("pp-sms-v1:nonce-3");
  });
});
