import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

type AuditAction = 'view' | 'create' | 'update' | 'delete' | 'export' | 'login' | 'logout' | 'access';

interface LogEventParams {
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export const useAuditLog = () => {
  const { selectedOrg } = useOrganization();

  const logEvent = useCallback(async ({
    action,
    resourceType,
    resourceId,
    metadata = {},
  }: LogEventParams) => {
    if (!selectedOrg) return;

    try {
      await supabase.from('audit_logs').insert([{
        organization_id: selectedOrg.id,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        metadata: JSON.parse(JSON.stringify(metadata)),
        user_agent: navigator.userAgent,
      }]);
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }, [selectedOrg]);

  return { logEvent };
};
