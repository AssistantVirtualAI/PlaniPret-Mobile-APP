export type CallPartyInput = {
  direction?: string | null;
  fromNumber?: unknown;
  fromName?: unknown;
  toNumber?: unknown;
  toName?: unknown;
  ownExtension?: unknown;
  resolvedName?: unknown;
};

export type CallParty = {
  /** Name supplied by CDR or a local contact lookup, never an internal extension. */
  name: string | null;
  /** Dialable public number, never an internal extension. */
  phone: string | null;
  /** Internal extension retained only for diagnostics, never the display label. */
  internalExtension: string | null;
  /** Human-friendly Canadian/international telephone formatting. */
  formattedPhone: string | null;
};

function stringValue(value: unknown): string | null {
  if (value == null) return null;
  const valueString = String(value).trim();
  return valueString || null;
}

/** Normalizes URI-shaped CDR endpoints without accepting anonymous identities. */
export function normalizeCallEndpoint(value: unknown): string | null {
  let endpoint = stringValue(value);
  if (!endpoint) return null;
  endpoint = endpoint.replace(/^sips?:/i, "").replace(/^tel:/i, "");
  const at = endpoint.indexOf("@");
  if (at !== -1) endpoint = endpoint.slice(0, at);
  endpoint = endpoint.replace(/[<>"']/g, "").trim();
  if (!endpoint || /^(anonymous|unknown|restricted|private|unavailable|null)$/i.test(endpoint)) return null;
  return endpoint;
}

function endpointDigits(value: string | null): string {
  return value ? value.replace(/\D/g, "") : "";
}

/** A Planiprêt/NetSapiens extension is never a customer phone number. */
export function isInternalExtension(value: unknown, ownExtension?: unknown): boolean {
  const endpoint = normalizeCallEndpoint(value);
  const digits = endpointDigits(endpoint);
  if (!digits) return false;
  const ownDigits = endpointDigits(normalizeCallEndpoint(ownExtension));
  if (ownDigits && digits === ownDigits) return true;
  // Canadian customer numbers are 10 digits (or 11 beginning with 1). Treat
  // short numeric CDR endpoints as PBX extensions so we never display them as
  // the other party in a call history.
  return digits.length >= 2 && digits.length <= 6;
}

/** Retains an external phone number only; local PBX endpoints are suppressed. */
export function publicPhone(value: unknown, ownExtension?: unknown): string | null {
  const endpoint = normalizeCallEndpoint(value);
  if (!endpoint || isInternalExtension(endpoint, ownExtension)) return null;
  const digits = endpointDigits(endpoint);
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  // Preserve valid international E.164-shaped values rather than guessing a
  // Canadian format. Reject short/non-dialable values.
  return digits.length >= 7 && digits.length <= 18 ? endpoint : null;
}

export function formatPublicPhone(value: string | null): string | null {
  if (!value) return null;
  const digits = endpointDigits(value);
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return value;
}

function meaningfulName(value: unknown, ownExtension?: unknown): string | null {
  const name = normalizeCallEndpoint(value);
  if (!name || isInternalExtension(name, ownExtension)) return null;
  // CDRs often put a telephone number in caller-id-name. It is valid as a
  // number, but must not be presented as a person's name.
  const digits = endpointDigits(name);
  if (digits.length >= 7 && digits.length <= 18 && /^[+\d().\-\s]+$/.test(name)) return null;
  return name;
}

/**
 * Presents the *other party* in a call. Name comes first, then a resolved
 * contact name, then the public number. A PBX extension is never selected as
 * a primary label or phone sublabel. A trusted resolved name is also valid for
 * an internal extension, so known colleagues do not appear as a bare extension.
 */
export function presentCallParty(input: CallPartyInput): CallParty {
  const outbound = String(input.direction ?? "").toLowerCase() === "outbound";
  const rawNumber = outbound ? input.toNumber : input.fromNumber;
  const rawName = outbound ? input.toName : input.fromName;
  const phone = publicPhone(rawNumber, input.ownExtension);
  const directName = meaningfulName(rawName, input.ownExtension);
  const resolvedName = meaningfulName(input.resolvedName, input.ownExtension);
  const endpoint = normalizeCallEndpoint(rawNumber);

  return {
    name: directName ?? resolvedName,
    phone,
    internalExtension: endpoint && isInternalExtension(endpoint, input.ownExtension) ? endpoint : null,
    formattedPhone: formatPublicPhone(phone),
  };
}
