import type { ClientContact } from "@/lib/planipret/clientMaestro";

export type ClientProfileState = "idle" | "loading" | "ready" | "not_found" | "error";

export type MaestroClientProfile = ClientContact & {
  raw?: Record<string, any>;
  city?: string | null;
  province?: string | null;
  occupation?: string | null;
};

const text = (...values: unknown[]) => {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
};

export function maestroClientProfileFromPayload(payload: any): MaestroClientProfile | null {
  const source = payload?.profile ?? payload?.data ?? null;
  if (!source || typeof source !== "object") return null;
  const name = text(
    source.full_name,
    source.display_name,
    source.name,
    [source.first_name ?? source.firstname, source.last_name ?? source.lastname].filter(Boolean).join(" "),
  );
  const maestroClientId = text(source.id, source.client_id, source.maestro_client_id);
  if (!name && !maestroClientId) return null;
  const address = Array.isArray(source.addresses) ? source.addresses[0] : source.address ?? {};
  return {
    name: name || "Client Maestro",
    phone: text(source.phone, source.mobile, source.cell_phone, source.cellphone, source.phone_number) || null,
    email: text(source.email, source.email_address, source.mail) || null,
    maestroClientId: maestroClientId || null,
    city: text(source.city, address?.city) || null,
    province: text(source.province, source.state, address?.province, address?.state) || null,
    occupation: text(source.occupation, source.employment, source.employer) || null,
    raw: source,
  };
}

export function mergeClientProfile(
  profile: MaestroClientProfile | null,
  fallback: ClientContact | null,
): MaestroClientProfile | null {
  if (!profile && !fallback) return null;
  return {
    name: profile?.name || fallback?.name || "Client Maestro",
    phone: profile?.phone || fallback?.phone || null,
    email: profile?.email || fallback?.email || null,
    maestroClientId: profile?.maestroClientId || fallback?.maestroClientId || null,
    city: profile?.city || null,
    province: profile?.province || null,
    occupation: profile?.occupation || null,
    raw: profile?.raw,
  };
}

export function clientProfileErrorMessage(error: unknown, lang: "fr" | "en" = "fr") {
  const raw = String(error ?? "");
  const en = lang === "en";
  if (/404|not.?found|introuvable/i.test(raw)) return en ? "This Maestro client no longer exists or is not available to this account." : "Ce client Maestro n’existe plus ou n’est pas accessible à ce compte.";
  if (/not_connected|not_configured|unresolved|401|403/i.test(raw)) return en ? "Maestro must be connected to load this client profile." : "Maestro doit être connecté pour charger cette fiche client.";
  return en ? "The Maestro client profile could not be loaded. Retry without leaving this page." : "La fiche client Maestro n’a pas pu être chargée. Réessayez sans quitter cette page.";
}
