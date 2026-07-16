import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/useTranslation';
import { UserAvatar } from './UserAvatar';

export const SidebarFooter = () => {
  const { user } = useAuth();
  const { role, isSuperAdmin } = usePermissions();
  const { t } = useTranslation();

  const roleBadge = isSuperAdmin
    ? `👑 ${t('roles.superAdmin') || 'Super Admin'}`
    : role === 'org_admin'
      ? `🔑 ${t('roles.admin') || 'Admin'}`
      : role === 'manager'
        ? `👨‍💼 ${t('roles.manager') || 'Manager'}`
        : role === 'agent'
          ? `👤 ${t('roles.agent') || 'Agent'}`
          : `👁️ ${t('roles.viewer') || 'Viewer'}`;

  const name = (user?.user_metadata?.full_name as string | undefined)
    || user?.email?.split('@')[0]
    || 'User';

  return (
    <div className="px-3 py-3 border-t border-cockpit-border/40 bg-gradient-to-r from-cockpit-cyan/[0.04] via-transparent to-cockpit-violet/[0.04] backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <UserAvatar />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{name}</div>
          <div className="text-[10px] uppercase tracking-widest text-cockpit-cyan/90 truncate">{roleBadge}</div>
        </div>
      </div>
    </div>
  );
};
