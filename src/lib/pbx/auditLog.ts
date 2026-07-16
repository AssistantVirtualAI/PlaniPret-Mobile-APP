import { supabase } from "@/integrations/supabase/client";

export interface LogAdminActionInput {
  organizationId: string;
  domainUuid?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;            // e.g. "extension.update"
  source?: string;           // ava | pbx | copilot
  before?: unknown;
  after?: unknown;
  diff?: unknown;
  confirmedAt?: string | null;
  result?: string | null;
  error?: string | null;
  rollbackOf?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Phase 0 audit-log helper. Inserts into pbx_admin_actions; RLS verifies the
 * caller is org_admin / lemtel_admin / super_admin.
 */
export async function logAdminAction(input: LogAdminActionInput) {
  const { data: { user } } = await supabase.auth.getUser();
  const row = {
    organization_id: input.organizationId,
    domain_uuid: input.domainUuid ?? null,
    actor_user_id: user?.id ?? null,
    actor_email: user?.email ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    action: input.action,
    source: input.source ?? "ava",
    before_json: input.before ?? null,
    after_json: input.after ?? null,
    diff_json: input.diff ?? null,
    confirmed_at: input.confirmedAt ?? new Date().toISOString(),
    result: input.result ?? "ok",
    error: input.error ?? null,
    rollback_of: input.rollbackOf ?? null,
    metadata: input.metadata ?? {},
  };
  // Cast through any: types regenerate after migration; insert at runtime regardless.
  const { data, error } = await (supabase.from("pbx_admin_actions") as any)
    .insert(row).select("id").maybeSingle();
  if (error) console.warn("[auditLog] insert failed", error);
  return data?.id ?? null;
}
