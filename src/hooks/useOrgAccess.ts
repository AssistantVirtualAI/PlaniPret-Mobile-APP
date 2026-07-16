import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { ResellerRole } from '@/lib/postLoginRoute';

interface OrgMemberRow {
  role: ResellerRole;
  org_id: string;
  can_manage_users: boolean;
  can_manage_extensions: boolean;
  can_manage_ivr: boolean;
  can_manage_queues: boolean;
  can_manage_billing: boolean;
  can_manage_resellers: boolean;
  can_view_recordings: boolean;
  can_listen_calls: boolean;
  can_export_data: boolean;
  organizations?: { id: string; slug: string; org_type: string } | null;
}

const SUPER_ROLES: ResellerRole[] = ['ava_admin', 'master_admin'];

export function useOrgAccess(orgSlug?: string) {
  const { user } = useAuth();
  const [rows, setRows] = useState<OrgMemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from('org_members')
      .select(
        'role, org_id, can_manage_users, can_manage_extensions, can_manage_ivr, can_manage_queues, can_manage_billing, can_manage_resellers, can_view_recordings, can_listen_calls, can_export_data, organizations:org_id(id, slug, org_type)',
      )
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (cancelled) return;
        setRows((data as any) || []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const membership = useMemo(() => {
    if (!orgSlug) return rows[0];
    return rows.find((r) => r.organizations?.slug === orgSlug) ?? rows[0];
  }, [rows, orgSlug]);

  const role = membership?.role;
  const isSuper = role ? SUPER_ROLES.includes(role) : false;

  const canAccess = useMemo(() => {
    if (!user) return false;
    if (isSuper) return true;
    if (!orgSlug) return rows.length > 0;
    return rows.some((r) => r.organizations?.slug === orgSlug);
  }, [user, isSuper, orgSlug, rows]);

  const grant = (flag: keyof OrgMemberRow) =>
    isSuper || Boolean(membership?.[flag]);

  const can = {
    manageUsers: grant('can_manage_users'),
    manageExtensions: grant('can_manage_extensions'),
    manageIVR: grant('can_manage_ivr'),
    manageQueues: grant('can_manage_queues'),
    manageBilling: grant('can_manage_billing'),
    manageResellers: grant('can_manage_resellers'),
    viewRecordings: grant('can_view_recordings'),
    listenCalls: grant('can_listen_calls'),
    exportData: grant('can_export_data'),
  };

  return { canAccess, can, role, isSuper, membership, loading, memberships: rows };
}
