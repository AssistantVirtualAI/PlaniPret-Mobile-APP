import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MembersList } from '@/components/team/MembersList';
import { InviteMemberModal } from '@/components/team/InviteMemberModal';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/useTranslation';
import { Users, UserPlus, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const Team = () => {
  const { t } = useTranslation();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const { members, isLoading, createMember, updateMemberRole, removeMember } = useTeamMembers();
  const { user } = useAuth();
  const { can } = usePermissions();

  const canManageMembers = can('manage:members');

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              {t('team.title')}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t('team.description')}
            </p>
          </div>
          {canManageMembers && (
            <Button onClick={() => setIsInviteModalOpen(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              {t('team.createMember')}
            </Button>
          )}
        </div>

        {/* Roles Legend */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {t('team.rolesLegend')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Badge className="bg-purple-500/10 text-purple-500">{t('roles.admin')}</Badge>
                <span className="text-sm text-muted-foreground">{t('team.roles.admin')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-500/10 text-blue-500">{t('roles.manager')}</Badge>
                <span className="text-sm text-muted-foreground">{t('team.roles.manager')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500/10 text-green-500">{t('roles.agent')}</Badge>
                <span className="text-sm text-muted-foreground">{t('team.roles.agent')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-gray-500/10 text-gray-500">{t('roles.viewer')}</Badge>
                <span className="text-sm text-muted-foreground">{t('team.roles.viewer')}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Members List */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('team.members')} ({members.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{t('team.noMembers')}</p>
                {canManageMembers && (
                  <Button
                    onClick={() => setIsInviteModalOpen(true)}
                    className="mt-4"
                    variant="outline"
                  >
                    {t('team.inviteFirst')}
                  </Button>
                )}
              </div>
            ) : (
              <MembersList
                members={members}
                onUpdateRole={(userId, role) => updateMemberRole.mutate({ userId, newRole: role })}
                onRemoveMember={(userId) => removeMember.mutate(userId)}
                currentUserId={user?.id}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invite Modal */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onCreateMember={(data) => createMember.mutateAsync(data)}
        isLoading={createMember.isPending}
      />
    </AppLayout>
  );
};

export default Team;
