import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoreHorizontal, Shield, UserMinus, Mail, KeyRound } from 'lucide-react';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { TeamMember } from '@/hooks/useTeamMembers';
import { useTranslation } from '@/hooks/useTranslation';
import { useLanguage } from '@/context/LanguageContext';

interface MembersListProps {
  members: TeamMember[];
  onUpdateRole: (userId: string, newRole: 'org_admin' | 'manager' | 'agent' | 'viewer') => void;
  onRemoveMember: (userId: string) => void;
  onResetPassword?: (member: TeamMember) => void;
  onSelectMember?: (member: TeamMember) => void;
  currentUserId?: string;
}

export const MembersList = ({ members, onUpdateRole, onRemoveMember, onResetPassword, onSelectMember, currentUserId }: MembersListProps) => {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const dateLocale = language === 'fr' ? fr : enUS;

  const roleLabels: Record<string, { label: string; color: string }> = {
    super_admin: { label: t('roles.superAdmin'), color: 'bg-red-500/10 text-red-500' },
    org_admin: { label: t('roles.admin'), color: 'bg-purple-500/10 text-purple-500' },
    manager: { label: t('roles.manager'), color: 'bg-blue-500/10 text-blue-500' },
    agent: { label: t('roles.agent'), color: 'bg-green-500/10 text-green-500' },
    viewer: { label: t('roles.viewer'), color: 'bg-gray-500/10 text-gray-500' },
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.substring(0, 2).toUpperCase();
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('team.list.member')}</TableHead>
          <TableHead>{t('team.list.role')}</TableHead>
          <TableHead>{t('team.list.joinedAt')}</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => {
          const role = member.role?.role || 'viewer';
          const roleInfo = roleLabels[role] || roleLabels.viewer;
          const isCurrentUser = member.user_id === currentUserId;

          return (
            <TableRow
              key={member.id}
              className={onSelectMember ? 'cursor-pointer hover:bg-muted/40' : undefined}
              onClick={() => onSelectMember?.(member)}
            >
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(member.profile?.full_name || null, member.profile?.email || '')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-foreground">
                      {member.profile?.full_name || t('team.list.noName')}
                      {isCurrentUser && <span className="text-muted-foreground ml-2">{t('team.list.you')}</span>}
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {member.profile?.email}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge className={roleInfo.color} variant="secondary">
                  {roleInfo.label}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {member.accepted_at
                  ? format(new Date(member.accepted_at), 'dd MMM yyyy', { locale: dateLocale })
                  : t('team.list.pending')}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                {!isCurrentUser && role !== 'super_admin' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onUpdateRole(member.user_id, 'org_admin')}>
                        <Shield className="h-4 w-4 mr-2" />
                        {t('team.list.setAs')} {t('roles.admin')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onUpdateRole(member.user_id, 'manager')}>
                        <Shield className="h-4 w-4 mr-2" />
                        {t('team.list.setAs')} {t('roles.manager')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onUpdateRole(member.user_id, 'agent')}>
                        <Shield className="h-4 w-4 mr-2" />
                        {t('team.list.setAs')} {t('roles.agent')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onUpdateRole(member.user_id, 'viewer')}>
                        <Shield className="h-4 w-4 mr-2" />
                        {t('team.list.setAs')} {t('roles.viewer')}
                      </DropdownMenuItem>
                      {onResetPassword && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onResetPassword(member)}>
                            <KeyRound className="h-4 w-4 mr-2" />
                            {t('team.list.resetPassword')}
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onRemoveMember(member.user_id)}
                        className="text-destructive"
                      >
                        <UserMinus className="h-4 w-4 mr-2" />
                        {t('team.list.remove')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
