import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Unified write helper for PBX admin pages.
 * Routes mutations through `pbx-write` (RBAC + audit + mirror) when an org is selected,
 * else falls back to the raw `fusionpbx-proxy` (super_admin tooling).
 */
export function usePbxAction() {
  const { selectedOrgId } = useOrganization();
  const qc = useQueryClient();

  async function run(opts: {
    action: string;
    params?: Record<string, any>;
    objectType?: string;
    objectPbxUuid?: string;
    mirror?: { table: string; row: Record<string, any>; onConflict?: string };
    invalidate?: any[];
    successMessage?: string;
  }) {
    const { action, params = {}, objectType, objectPbxUuid, mirror, invalidate, successMessage } = opts;
    try {
      let data: any, error: any;
      if (selectedOrgId) {
        ({ data, error } = await supabase.functions.invoke('pbx-write', {
          body: { organizationId: selectedOrgId, action, params, objectType, objectPbxUuid, mirror },
        }));
      } else {
        ({ data, error } = await supabase.functions.invoke('fusionpbx-proxy', { body: { action, params } }));
      }
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if (successMessage) toast.success(successMessage);
      if (invalidate) qc.invalidateQueries({ queryKey: invalidate });
      return data;
    } catch (e: any) {
      toast.error(e?.message || 'Action failed');
      throw e;
    }
  }

  return { run };
}
