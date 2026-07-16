import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/useTranslation';

export interface TeamMember {
  id: string;
  user_id: string;
  organization_id: string;
  invited_at: string;
  accepted_at: string | null;
  invited_by: string | null;
  profile: {
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  role: {
    role: 'super_admin' | 'org_admin' | 'manager' | 'agent' | 'viewer' | 'planipret_admin' | 'planipret_broker';
  } | null;
}

export const useTeamMembers = () => {
  const { selectedOrgId } = useOrganization();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['team-members', selectedOrgId],
    queryFn: async (): Promise<TeamMember[]> => {
      if (!selectedOrgId) return [];

      const { data: members, error } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', selectedOrgId);

      if (error) throw error;

      // Fetch profiles and roles for each member
      const memberIds = members.map(m => m.user_id);
      
      const [profilesRes, rolesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, full_name, avatar_url')
          .in('id', memberIds),
        supabase
          .from('user_roles')
          .select('user_id, role')
          .eq('organization_id', selectedOrgId)
          .in('user_id', memberIds),
      ]);

      const profilesMap = new Map(profilesRes.data?.map(p => [p.id, p]));
      const rolesMap = new Map(rolesRes.data?.map(r => [r.user_id, r]));

      return members
        .map(m => ({
          ...m,
          profile: profilesMap.get(m.user_id) || null,
          role: rolesMap.get(m.user_id) || null,
        }))
        .filter(m => m.role?.role !== 'super_admin');

    },
    enabled: !!selectedOrgId,
  });

  // Create member directly (new approach)
  const createMember = useMutation({
    mutationFn: async ({
      email,
      password,
      full_name,
      role,
      organization_id,
    }: {
      email: string;
      password: string;
      full_name: string;
      role: 'org_admin' | 'manager' | 'agent' | 'viewer';
      organization_id?: string;
    }) => {
      const targetOrg = organization_id || selectedOrgId;
      if (!targetOrg) throw new Error(t('messages.noOrganization'));

      const { data, error } = await supabase.functions.invoke('create-org-member', {
        body: {
          email,
          password,
          full_name,
          organization_id: targetOrg,
          role,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: t('messages.createSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });


  // Legacy invite member (kept for backwards compatibility)
  const inviteMember = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: 'org_admin' | 'manager' | 'agent' | 'viewer' }) => {
      if (!selectedOrgId) throw new Error(t('messages.noOrganization'));

      // Check if user exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (!existingProfile) {
        throw new Error(t('team.userNotFound'));
      }

      // Check if already a member
      const { data: existingMember } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', selectedOrgId)
        .eq('user_id', existingProfile.id)
        .maybeSingle();

      if (existingMember) {
        throw new Error(t('team.alreadyMember'));
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Add member
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: selectedOrgId,
          user_id: existingProfile.id,
          invited_by: user?.id,
          accepted_at: new Date().toISOString(),
        });

      if (memberError) throw memberError;

      // Add role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          organization_id: selectedOrgId,
          user_id: existingProfile.id,
          role,
        });

      if (roleError) throw roleError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: t('messages.createSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const updateMemberRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'org_admin' | 'manager' | 'agent' | 'viewer' }) => {
      if (!selectedOrgId) throw new Error(t('messages.noOrganization'));

      // Server-side authorization + audit logging
      const { data, error } = await supabase.functions.invoke('manage-org-roles', {
        body: {
          action: 'update_role',
          organization_id: selectedOrgId,
          user_id: userId,
          new_role: newRole,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: t('messages.updateSuccess') });
    },
    onError: () => {
      toast({ title: t('messages.updateError'), variant: 'destructive' });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      if (!selectedOrgId) throw new Error(t('messages.noOrganization'));

      // Remove role first
      await supabase
        .from('user_roles')
        .delete()
        .eq('organization_id', selectedOrgId)
        .eq('user_id', userId);

      // Remove membership
      const { error } = await supabase
        .from('organization_members')
        .delete()
        .eq('organization_id', selectedOrgId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: t('messages.deleteSuccess') });
    },
    onError: () => {
      toast({ title: t('messages.deleteError'), variant: 'destructive' });
    },
  });

  return {
    members: query.data || [],
    isLoading: query.isLoading,
    createMember,
    inviteMember,
    updateMemberRole,
    removeMember,
  };
};
