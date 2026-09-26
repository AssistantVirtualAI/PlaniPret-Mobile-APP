// Determines the only Maestro credential allowed for a commission report.
// Brokers are always bound to themselves. Administrators use their own token
// only for their personal report; firm-wide or selected-broker reports require
// a dedicated Maestro administrator credential.

export type CommissionScopeRole = "admin" | "broker";

type CommissionScopeInput = {
  role: CommissionScopeRole;
  action: string;
  requestedUsersId?: string | null;
  ownUsersId?: string | null;
  ownToken?: string | null;
  firmToken?: string | null;
};

export type CommissionScope =
  | {
    ok: true;
    usersId: string | null;
    token: string;
    mode: "own" | "selected_broker" | "all_brokers" | "metadata";
  }
  | {
    ok: false;
    error: "broker_id_unresolved" | "maestro_not_connected" | "admin_scope_unavailable";
  };

const asId = (value: unknown) => {
  const id = String(value ?? "").trim();
  return /^\d+$/.test(id) ? id : null;
};

/**
 * The agents directory is an administrator-only view in Maestro. Financial
 * institutions are non-personal metadata and may safely use the caller token.
 */
export function resolveCommissionScope(input: CommissionScopeInput): CommissionScope {
  const requestedUsersId = asId(input.requestedUsersId);
  const ownUsersId = asId(input.ownUsersId);
  const ownToken = input.ownToken?.trim() || null;
  const firmToken = input.firmToken?.trim() || null;

  if (input.role === "broker") {
    if (!ownUsersId) return { ok: false, error: "broker_id_unresolved" };
    if (!ownToken) return { ok: false, error: "maestro_not_connected" };
    return { ok: true, usersId: ownUsersId, token: ownToken, mode: "own" };
  }

  if (input.action === "institutions") {
    const token = ownToken ?? firmToken;
    if (!token) return { ok: false, error: "maestro_not_connected" };
    return { ok: true, usersId: requestedUsersId, token, mode: "metadata" };
  }

  const isOwnReport = requestedUsersId !== null && ownUsersId !== null && requestedUsersId === ownUsersId;
  if (isOwnReport && ownToken) {
    return { ok: true, usersId: ownUsersId, token: ownToken, mode: "own" };
  }

  // Agents, all-broker dashboards, and a named peer must be queried only with
  // the firm credential that Maestro grants administrator scope to.
  if (!firmToken) return { ok: false, error: "admin_scope_unavailable" };
  return {
    ok: true,
    usersId: requestedUsersId,
    token: firmToken,
    mode: requestedUsersId ? "selected_broker" : input.action === "agents" ? "metadata" : "all_brokers",
  };
}
