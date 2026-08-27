/**
 * Broker identity resolution for the commission register.
 * Normalises agent names coming from the Excel register and resolves them
 * to a Planiprêt broker (user id + first/last name + Maestro broker id).
 */

export type BrokerDir = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  maestro_broker_id: string | null;
};

export type AliasRow = {
  agent_key: string;
  broker_user_id: string | null;
  maestro_broker_id: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type Resolved = {
  broker_user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  maestro_broker_id: string | null;
  match_method: string | null;
};

const strip = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Normalised, order-insensitive key: "Tremblay, Marc" == "MARC TREMBLAY". */
export function agentKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = strip(String(raw)).replace(/[^a-z0-9,\s'-]/g, " ");
  if (s.includes(",")) {
    const [last, ...rest] = s.split(",");
    s = `${rest.join(" ")} ${last}`;
  }
  const parts = s.split(/[\s'-]+/).filter(Boolean).sort();
  return parts.length ? parts.join(" ") : null;
}

export function splitName(full: string | null | undefined): { first: string | null; last: string | null } {
  if (!full) return { first: null, last: null };
  let s = String(full).trim().replace(/\s+/g, " ");
  if (s.includes(",")) {
    const [last, ...rest] = s.split(",");
    s = `${rest.join(" ").trim()} ${last.trim()}`.trim();
  }
  const parts = s.split(" ").filter(Boolean);
  if (!parts.length) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function buildResolver(profiles: BrokerDir[], aliases: AliasRow[]) {
  const byAlias = new Map<string, AliasRow>();
  for (const a of aliases) if (a.agent_key) byAlias.set(a.agent_key, a);

  const byKey = new Map<string, BrokerDir>();
  const byEmail = new Map<string, BrokerDir>();
  const byMaestro = new Map<string, BrokerDir>();
  for (const p of profiles) {
    const k = agentKey(p.full_name) ?? agentKey([p.first_name, p.last_name].filter(Boolean).join(" "));
    if (k && !byKey.has(k)) byKey.set(k, p);
    if (p.email) byEmail.set(strip(p.email.trim()), p);
    if (p.maestro_broker_id) byMaestro.set(String(p.maestro_broker_id).trim(), p);
  }

  const fromProfile = (p: BrokerDir, method: string): Resolved => {
    const sp = splitName(p.full_name);
    return {
      broker_user_id: p.user_id,
      first_name: p.first_name ?? sp.first,
      last_name: p.last_name ?? sp.last,
      maestro_broker_id: p.maestro_broker_id ?? null,
      match_method: method,
    };
  };

  return function resolve(rawName: string | null | undefined, rawMaestroId?: string | null): Resolved {
    const key = agentKey(rawName);
    const fallback = splitName(rawName);

    // 1. explicit alias
    if (key) {
      const a = byAlias.get(key);
      if (a) {
        const p = a.broker_user_id ? profiles.find((x) => x.user_id === a.broker_user_id) : undefined;
        const base = p ? fromProfile(p, "alias") : null;
        return {
          broker_user_id: a.broker_user_id ?? base?.broker_user_id ?? null,
          first_name: a.first_name ?? base?.first_name ?? fallback.first,
          last_name: a.last_name ?? base?.last_name ?? fallback.last,
          maestro_broker_id: a.maestro_broker_id ?? base?.maestro_broker_id ?? null,
          match_method: "alias",
        };
      }
    }

    // 2. maestro id carried by the source row
    if (rawMaestroId) {
      const p = byMaestro.get(String(rawMaestroId).trim());
      if (p) return fromProfile(p, "maestro_id");
    }

    // 3. normalised name
    if (key) {
      const p = byKey.get(key);
      if (p) return fromProfile(p, "name");
    }

    // 4. email in the agent field
    if (rawName && rawName.includes("@")) {
      const p = byEmail.get(strip(rawName.trim()));
      if (p) return fromProfile(p, "email");
    }

    // 5. unmatched — still expose first/last derived from the file
    return {
      broker_user_id: null,
      first_name: fallback.first,
      last_name: fallback.last,
      maestro_broker_id: rawMaestroId ? String(rawMaestroId).trim() : null,
      match_method: null,
    };
  };
}
