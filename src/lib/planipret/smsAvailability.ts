import { supabase } from "@/integrations/supabase/client";

export type SmsAvailability = {
  state: "ready" | "unavailable" | "error";
  numbers: string[];
  primaryNumber: string | null;
  message: string | null;
  checkedAt: number;
};

const CACHE_MS = 5 * 60_000;
let cached: SmsAvailability | null = null;
let inflight: Promise<SmsAvailability> | null = null;

export function normalizeSmsNumber(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function smsNumberFromRow(row: unknown): string | null {
  if (typeof row === "string") return normalizeSmsNumber(row);
  const item = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
  return normalizeSmsNumber(
    item.number ?? item["from-number"] ?? item.from_number ?? item.phonenumber ?? item.smsnumber ?? item.did ?? item.phone_number_e164,
  );
}

export function smsAvailabilityFromPayload(payload: any): SmsAvailability {
  const rows = Array.isArray(payload?.numbers) ? payload.numbers : [];
  const numbers: string[] = [];
  for (const row of rows) {
    const number = smsNumberFromRow(row);
    if (number && !numbers.includes(number)) numbers.push(number);
  }
  const checkedAt = Date.now();
  if (numbers.length) {
    return { state: "ready", numbers, primaryNumber: numbers[0], message: null, checkedAt };
  }
  return {
    state: "unavailable",
    numbers: [],
    primaryNumber: null,
    message: "Aucun DID SMS actif n’est confirmé pour votre poste. Contactez l’administrateur afin de vérifier l’affectation NetSapiens.",
    checkedAt,
  };
}

export async function getSmsAvailability(force = false): Promise<SmsAvailability> {
  if (!force && cached && Date.now() - cached.checkedAt < CACHE_MS) return cached;
  if (!force && inflight) return inflight;
  const request = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("pp-ns-sms", { body: { action: "sms-numbers" } });
      if (error) throw error;
      const result = smsAvailabilityFromPayload(data);
      cached = result;
      return result;
    } catch (error: any) {
      const result: SmsAvailability = {
        state: "error",
        numbers: [],
        primaryNumber: null,
        message: error?.message || "La vérification du DID SMS est indisponible. Aucun texto n’a été envoyé.",
        checkedAt: Date.now(),
      };
      cached = result;
      return result;
    } finally {
      inflight = null;
    }
  })();
  inflight = request;
  return request;
}

export function clearSmsAvailabilityCache() {
  cached = null;
}

/** A send UI must never optimistic-send while DID preflight is unavailable. */
export function canSendWithSmsAvailability(availability: Pick<SmsAvailability, "state"> | null | undefined) {
  return availability?.state === "ready";
}
