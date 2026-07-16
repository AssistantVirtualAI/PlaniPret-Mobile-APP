import { supabase } from '@/integrations/supabase/client';

/**
 * Unified PBX invocation. For mutating actions (create-/update-/delete-/restart-/sync-/resync-)
 * routes through `pbx-write` (RBAC + audit + mirror) when `organizationId` is provided.
 * Read actions (list-/get-) always go directly to `fusionpbx-proxy`.
 */
const MUTATING = /^(create|update|delete|restart|sync|resync|reload|toggle|enable|disable)-/;

export async function pbxInvoke(
  action: string,
  params: Record<string, any> = {},
  opts: { organizationId?: string | null; clientId?: string; objectType?: string; objectPbxUuid?: string } = {},
) {
  const isMutation = MUTATING.test(action);
  if (isMutation && opts.organizationId) {
    return supabase.functions.invoke('pbx-write', {
      body: {
        organizationId: opts.organizationId,
        clientId: opts.clientId,
        action,
        params,
        objectType: opts.objectType,
        objectPbxUuid: opts.objectPbxUuid,
      },
    });
  }
  return supabase.functions.invoke('fusionpbx-proxy', { body: { action, params } });
}
