export type CallAccessResult =
  | { ok: true; serviceRole: boolean; userId: string | null }
  | { ok: false; status: number; error: string };

const bearer = (req: Request) =>
  (req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();

export async function authorizeCallAccess(
  req: Request,
  admin: any,
  call: { user_id?: string | null },
): Promise<CallAccessResult> {
  const token = bearer(req);
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceRole && token === serviceRole) {
    return { ok: true, serviceRole: true, userId: null };
  }
  if (!token) return { ok: false, status: 401, error: "unauthorized" };

  const { data: authData } = await admin.auth.getUser(token);
  const userId = authData?.user?.id ?? null;
  if (!userId) return { ok: false, status: 401, error: "unauthorized" };

  const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: userId });
  if (isAdmin === true) return { ok: true, serviceRole: false, userId };

  const owner = String(call?.user_id ?? "");
  if (owner === userId) return { ok: true, serviceRole: false, userId };
  const { data: profiles } = await admin
    .from("planipret_profiles")
    .select("id, user_id")
    .or(`id.eq.${owner},user_id.eq.${owner},user_id.eq.${userId}`)
    .limit(10);
  const ownProfileIds = new Set(
    (profiles ?? [])
      .filter((p: any) => String(p.user_id ?? "") === userId)
      .map((p: any) => String(p.id)),
  );
  if (ownProfileIds.has(owner)) return { ok: true, serviceRole: false, userId };
  return { ok: false, status: 403, error: "forbidden" };
}

export function requireApprovedCallConsent(call: {
  save_consent?: string | null;
  deleted_at?: string | null;
}): { ok: true } | { ok: false; status: number; error: string } {
  if (call?.deleted_at) return { ok: false, status: 410, error: "call_deleted" };
  if (String(call?.save_consent ?? "pending") !== "approved") {
    return { ok: false, status: 409, error: "call_consent_required" };
  }
  return { ok: true };
}
