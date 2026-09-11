import { describe, it, expect } from "vitest";
import {
  alreadyDecided,
  canSendFollowup,
  clientNameOf,
  followupIdempotencyKey,
  needsClientSelection,
  pickEndedCall,
  type ConsentCall,
} from "../postCallConsent";

const base = (over: Partial<ConsentCall> = {}): ConsentCall => ({
  id: "call-1",
  user_id: "broker-1",
  from_number: "+15550001111",
  to_number: "+15550002222",
  direction: "out",
  maestro_client_id: "cli-1",
  maestro_client_name: "Client Fictif",
  from_name: null,
  to_name: null,
  duration_seconds: 42,
  save_consent: null,
  ...over,
});

describe("sélection de l'appel terminé", () => {
  it("retient uniquement l'appel désigné par l'événement", () => {
    const rows = [base({ id: "call-9" }), base({ id: "call-1" })];
    expect(pickEndedCall(rows, { providerCallId: "call-1" }, ["broker-1"])?.id).toBe("call-1");
  });

  it("ne réutilise jamais un appel déjà tranché", () => {
    const rows = [base({ save_consent: "approved" })];
    expect(pickEndedCall(rows, { providerCallId: "call-1" }, ["broker-1"])).toBeNull();
  });

  it("ignore l'appel d'un autre courtier", () => {
    const rows = [base({ user_id: "broker-2" })];
    expect(pickEndedCall(rows, { providerCallId: "call-1" }, ["broker-1"])).toBeNull();
  });

  it("sans identifiant fournisseur, exige le même numéro", () => {
    const rows = [base({ id: "call-7" })];
    expect(pickEndedCall(rows, { number: "5550002222" }, ["broker-1"])?.id).toBe("call-7");
    expect(pickEndedCall(rows, { number: "5559998888" }, ["broker-1"])).toBeNull();
    expect(pickEndedCall(rows, {}, ["broker-1"])).toBeNull();
  });

  it("détecte une décision déjà prise", () => {
    expect(alreadyDecided({ save_consent: "declined" })).toBe(true);
    expect(alreadyDecided({ save_consent: null })).toBe(false);
  });
});

describe("client ambigu", () => {
  it("exige une sélection manuelle sans client identifié", () => {
    expect(needsClientSelection(base({ maestro_client_id: null, maestro_client_name: null }))).toBe(true);
    expect(needsClientSelection(base())).toBe(false);
  });

  it("affiche le nom du client connu", () => {
    expect(clientNameOf(base())).toBe("Client Fictif");
  });
});

describe("garde d'envoi du suivi", () => {
  const draft = { kind: "sms" as const, body: "Merci pour l'appel.", recipient: "+15550002222", confirmed: true };

  it("bloque tant que la case de confirmation n'est pas cochée", () => {
    expect(canSendFollowup({ ...draft, confirmed: false })).toBe(false);
  });
  it("bloque un brouillon vide", () => {
    expect(canSendFollowup({ ...draft, body: "   " })).toBe(false);
  });
  it("bloque un courriel invalide", () => {
    expect(canSendFollowup({ ...draft, kind: "email", recipient: "pas-un-courriel" })).toBe(false);
    expect(canSendFollowup({ ...draft, kind: "email", recipient: "client@exemple.test" })).toBe(true);
  });
  it("bloque pendant un envoi en cours", () => {
    expect(canSendFollowup({ ...draft, busy: true })).toBe(false);
  });
  it("autorise après confirmation explicite", () => {
    expect(canSendFollowup(draft)).toBe(true);
  });
});

describe("clé d'idempotence", () => {
  const args = { userId: "u1", callId: "c1", kind: "sms" as const, recipient: "+15550002222", body: "Bonjour" };

  it("est stable pour le même contenu (double tap = un seul envoi)", () => {
    expect(followupIdempotencyKey(args)).toBe(followupIdempotencyKey({ ...args }));
  });
  it("change si le texte change", () => {
    expect(followupIdempotencyKey(args)).not.toBe(followupIdempotencyKey({ ...args, body: "Bonjour !" }));
  });
  it("change si l'appel change", () => {
    expect(followupIdempotencyKey(args)).not.toBe(followupIdempotencyKey({ ...args, callId: "c2" }));
  });
  it("change si le destinataire change", () => {
    expect(followupIdempotencyKey(args)).not.toBe(followupIdempotencyKey({ ...args, recipient: "+15550003333" }));
  });
});
