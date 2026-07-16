import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MembersList } from '@/components/team/MembersList';
import { InviteMemberModal } from '@/components/team/InviteMemberModal';
import { MemberDetailDialog } from '@/components/team/MemberDetailDialog';
import { useTeamMembers, TeamMember } from '@/hooks/useTeamMembers';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Users, UserPlus, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/useTranslation';

export function MembersTab() {
  const { t } = useTranslation();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [resetMember, setResetMember] = useState<TeamMember | null>(null);
  const { members, isLoading, createMember, updateMemberRole, removeMember } = useTeamMembers();
  const { user } = useAuth();
  const { can } = usePermissions();

  const canManageMembers = can('manage:members');



  return (
    <div className="space-y-6">
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('team.members')} ({members.length})</h3>
        {canManageMembers && (
          <Button onClick={() => setIsInviteModalOpen(true)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            {t('team.createMember')}
          </Button>
        )}
      </div>

      {/* Members List */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardContent className="pt-6">
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
              onResetPassword={canManageMembers ? setResetMember : undefined}
              onSelectMember={canManageMembers ? setSelectedMember : undefined}
              currentUserId={user?.id}
            />
          )}

        </CardContent>
      </Card>

      {/* Invite Modal */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onCreateMember={(data) => createMember.mutateAsync(data)}
        isLoading={createMember.isPending}
      />

      {/* Detail Modal */}
      <MemberDetailDialog
        member={selectedMember}
        isOpen={!!selectedMember}
        onClose={() => setSelectedMember(null)}
      />

      {/* Reset Password Modal */}
      <MemberDetailDialog
        member={resetMember}
        isOpen={!!resetMember}
        onClose={() => setResetMember(null)}
        focusReset
      />
    </div>
  );
}


