import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, KeyRound, Trash2, Plus, UserCog } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/context/OrganizationContext';
import { TeamMember } from '@/hooks/useTeamMembers';
import { useTranslation } from '@/hooks/useTranslation';

type Role = 'org_admin' | 'manager' | 'agent' | 'viewer';

interface UserOrg {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

interface MemberDetailDialogProps {
  member: TeamMember | null;
  isOpen: boolean;
  onClose: () => void;
  focusReset?: boolean;
}

export function MemberDetailDialog({ member, isOpen, onClose, focusReset }: MemberDetailDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedOrgId, organizations, isSuperAdmin } = useOrganization();
  const { t } = useTranslation();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [newPassword, setNewPassword] = useState('');
  const [addOrgId, setAddOrgId] = useState<string>('');
  const [addRole, setAddRole] = useState<Role>('viewer');
  const resetRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!member) return;
    setFullName(member.profile?.full_name || '');
    setEmail(member.profile?.email || '');
    setRole((member.role?.role as Role) || 'viewer');
    setNewPassword('');
    setAddOrgId('');
    setAddRole('viewer');
  }, [member]);

  useEffect(() => {
    if (isOpen && focusReset) {
      setTimeout(() => resetRef.current?.focus(), 100);
    }
  }, [isOpen, focusReset]);

  const userOrgsQuery = useQuery({
    queryKey: ['member-user-orgs', member?.user_id],
    enabled: !!member?.user_id && isOpen,
    queryFn: async (): Promise<UserOrg[]> => {
      const { data, error } = await supabase.functions.invoke('manage-org-roles', {
        body: { action: 'list_user_orgs', user_id: member!.user_id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data?.organizations || [];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['team-members'] });
    queryClient.invalidateQueries({ queryKey: ['member-user-orgs', member?.user_id] });
  };

  const errToast = (e: Error) =>
    toast({ title: t('common.error'), description: e.message, variant: 'destructive' });

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!member || !selectedOrgId) throw new Error(t('team.detail.invalidMember'));
      const { data, error } = await supabase.functions.invoke('manage-org-roles', {
        body: {
          action: 'update_profile',
          organization_id: selectedOrgId,
          user_id: member.user_id,
          full_name: fullName,
          email,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast({ title: t('team.detail.profileUpdated') });
      invalidate();
    },
    onError: errToast,
  });

  const updateRole = useMutation({
    mutationFn: async (newRole: Role) => {
      if (!member || !selectedOrgId) throw new Error(t('team.detail.invalidMember'));
      const { data, error } = await supabase.functions.invoke('manage-org-roles', {
        body: {
          action: 'update_role',
          organization_id: selectedOrgId,
          user_id: member.user_id,
          new_role: newRole,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast({ title: t('team.detail.roleUpdated') });
      invalidate();
    },
    onError: errToast,
  });

  const resetPassword = useMutation({
    mutationFn: async () => {
      if (!member || !selectedOrgId) throw new Error(t('team.detail.invalidMember'));
      if (newPassword.length < 8) throw new Error(t('team.detail.minChars'));
      const { data, error } = await supabase.functions.invoke('manage-org-roles', {
        body: {
          action: 'reset_password',
          organization_id: selectedOrgId,
          user_id: member.user_id,
          new_password: newPassword,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast({ title: t('team.detail.passwordReset') });
      setNewPassword('');
    },
    onError: errToast,
  });

  const addToOrg = useMutation({
    mutationFn: async () => {
      if (!member || !addOrgId) throw new Error(t('team.detail.selectOrg'));
      const { data, error } = await supabase.functions.invoke('manage-org-roles', {
        body: {
          action: 'add_to_org',
          organization_id: addOrgId,
          user_id: member.user_id,
          role: addRole,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast({ title: t('team.detail.addedToOrg') });
      setAddOrgId('');
      invalidate();
    },
    onError: errToast,
  });

  const removeFromOrg = useMutation({
    mutationFn: async (orgId: string) => {
      if (!member) throw new Error(t('team.detail.invalidMember'));
      const { data, error } = await supabase.functions.invoke('manage-org-roles', {
        body: {
          action: 'remove_from_org',
          organization_id: orgId,
          user_id: member.user_id,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast({ title: t('team.detail.removedFromOrg') });
      invalidate();
    },
    onError: errToast,
  });

  const currentOrgIds = new Set((userOrgsQuery.data || []).map((o) => o.id));
  const addableOrgs = organizations.filter((o) => !currentOrgIds.has(o.id));

  if (!member) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            {t('team.detail.title')}
          </DialogTitle>
          <DialogDescription>{t('team.detail.description')}</DialogDescription>
        </DialogHeader>

        {/* Profile */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t('team.detail.fullName')}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('team.detail.email')}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button
            onClick={() => updateProfile.mutate()}
            disabled={updateProfile.isPending}
            className="w-full"
          >
            {updateProfile.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('team.detail.saveProfile')}
          </Button>
        </div>

        <Separator />

        {/* Role */}
        <div className="space-y-2">
          <Label>{t('team.detail.currentOrgRole')}</Label>
          <div className="flex gap-2">
            <Select
              value={role}
              onValueChange={(v) => {
                setRole(v as Role);
                updateRole.mutate(v as Role);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="org_admin">{t('roles.admin')}</SelectItem>
                <SelectItem value="manager">{t('roles.manager')}</SelectItem>
                <SelectItem value="agent">{t('roles.agent')}</SelectItem>
                <SelectItem value="viewer">{t('roles.viewer')}</SelectItem>
              </SelectContent>
            </Select>
            {updateRole.isPending && <Loader2 className="h-4 w-4 animate-spin self-center" />}
          </div>
        </div>

        <Separator />

        {/* Reset password */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> {t('team.detail.resetPassword')}
          </Label>
          <div className="flex gap-2">
            <Input
              ref={resetRef}
              type="password"
              placeholder={t('team.detail.newPasswordPlaceholder')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Button
              onClick={() => resetPassword.mutate()}
              disabled={resetPassword.isPending || newPassword.length < 8}
            >
              {resetPassword.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('team.detail.setPassword')}
            </Button>
          </div>
        </div>

        <Separator />

        {/* Organizations */}
        <div className="space-y-3">
          <Label>{t('team.detail.organizations')}</Label>
          {userOrgsQuery.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <div className="space-y-2">
              {(userOrgsQuery.data || []).map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-md border border-border p-2"
                >
                  <div>
                    <p className="text-sm font-medium">{o.name}</p>
                    <Badge variant="secondary" className="text-xs mt-1">{o.role}</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFromOrg.mutate(o.id)}
                    disabled={removeFromOrg.isPending}
                    title={t('team.detail.removeFromOrg')}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {(userOrgsQuery.data || []).length === 0 && (
                <p className="text-sm text-muted-foreground">{t('team.detail.noOrganization')}</p>
              )}
            </div>
          )}

          {addableOrgs.length > 0 && (
            <div className="space-y-2 rounded-md bg-muted/30 p-3">
              <Label className="text-xs">{t('team.detail.addToOrg')}</Label>
              <div className="flex gap-2">
                <Select value={addOrgId} onValueChange={setAddOrgId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t('team.detail.chooseOrg')} />
                  </SelectTrigger>
                  <SelectContent>
                    {addableOrgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={addRole} onValueChange={(v) => setAddRole(v as Role)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org_admin">{t('roles.admin')}</SelectItem>
                    <SelectItem value="manager">{t('roles.manager')}</SelectItem>
                    <SelectItem value="agent">{t('roles.agent')}</SelectItem>
                    <SelectItem value="viewer">{t('roles.viewer')}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  onClick={() => addToOrg.mutate()}
                  disabled={!addOrgId || addToOrg.isPending}
                >
                  {addToOrg.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {!isSuperAdmin && (
                <p className="text-[11px] text-muted-foreground">
                  {t('team.detail.onlyAdminOrgsHint')}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
