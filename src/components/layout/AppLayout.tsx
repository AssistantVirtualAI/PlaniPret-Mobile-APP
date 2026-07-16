import { ReactNode, useState, useCallback, useMemo, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Moon, Sun, Globe, GripVertical } from 'lucide-react';
import { AvaStatisticsLogo as AvaLogo } from '@/components/shared/AvaStatisticsLogo';
import { AvaFooter } from '@/components/shared/AvaFooter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOrganization } from '@/context/OrganizationContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useTheme } from '@/context/ThemeContext';
import { useLanguage } from '@/context/LanguageContext';
import { useTranslation } from '@/hooks/useTranslation';
import { SidebarFooter } from '@/components/sidebar/SidebarFooter';
import { SidebarNavGroup } from '@/components/sidebar/SidebarNavGroup';
import { sidebarGroups, settingsLink, NavGroup, getSidebarScope } from '@/components/sidebar/sidebarConfig';
import { UserCircle2, ArrowLeft } from 'lucide-react';
import { CookieConsentBanner } from '@/components/gdpr/CookieConsentBanner';
import { motion } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NotificationsBell } from '@/components/notifications/NotificationsBell';
import { OrgSwitcher } from '@/components/layout/OrgSwitcher';
import { useApplyBranding } from '@/hooks/useApplyBranding';
// Portal softphone removed; calls happen via mobile app.

import { VersionBadge } from '@/components/shared/VersionBadge';
import { useLemtelAiRealtime } from '@/hooks/useLemtelAiRealtime';

const SIDEBAR_ORDER_KEY = 'sidebar-group-order';

const getSavedOrder = (): string[] | null => {
  try {
    const stored = localStorage.getItem(SIDEBAR_ORDER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
};

const saveOrder = (order: string[]) => {
  localStorage.setItem(SIDEBAR_ORDER_KEY, JSON.stringify(order));
};

function SortableNavGroup({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group/drag">
      <div
        className="absolute left-0 top-3 p-1 opacity-0 group-hover/drag:opacity-60 cursor-grab active:cursor-grabbing z-10 transition-opacity"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <SidebarNavGroup group={group} onNavigate={onNavigate} />
    </div>
  );
}

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const { role, isSuperAdmin } = usePermissions();
  const { selectedOrg, selectedOrgId, organizationMemberships, isLoading, userRole } = useOrganization();
  useApplyBranding(selectedOrgId, 'admin');
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // (debug logging removed)

  // Filter groups based on route scope, role and Lemtel org membership
  const isLemtelOrgSelected = selectedOrgId === '71755d33-ed64-4ad5-a828-61c9d2029eb7';
  const isPlanipretOrgSelected = selectedOrgId === '17d6507f-a9ca-409d-8e49-371d50332615';
  useLemtelAiRealtime(isLemtelOrgSelected ? selectedOrgId : null);
  const currentScope = getSidebarScope(location.pathname);
  const homeHref = isLemtelOrgSelected
    ? (currentScope === 'my' ? '/my' : '/org/lemtel/admin/dashboard')
    : '/dashboard';
  const visibleGroups = useMemo(() => sidebarGroups.filter(g => {
    const groupScope = g.scope ?? 'legacy';
    if (currentScope === 'admin') return false; // admin portal uses its own layout
    if ((g as any).planipretOnly && !isPlanipretOrgSelected) return false;
    // Legacy AVA groups are visible for any non-Lemtel org (AVA standalone + Planipret).
    if (groupScope === 'legacy' && isLemtelOrgSelected) return false;
    if (g.lemtelOnly && !isLemtelOrgSelected) return false;
    if (g.hideForLemtel && isLemtelOrgSelected) return false;
    if (isLemtelOrgSelected && (groupScope === 'org' || groupScope === 'my')) return true;
    if (groupScope === 'legacy') return true;
    if (groupScope !== currentScope) return false;
    return true;
  }), [isLemtelOrgSelected, isPlanipretOrgSelected, currentScope]);


  // Sidebar group ordering with drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const orderedGroups = useMemo(() => {
    const saved = getSavedOrder();
    if (!saved) return visibleGroups;
    const ordered: typeof visibleGroups = [];
    saved.forEach(id => {
      const g = visibleGroups.find(g => g.id === id);
      if (g) ordered.push(g);
    });
    visibleGroups.forEach(g => {
      if (!ordered.find(o => o.id === g.id)) ordered.push(g);
    });
    return ordered;
  }, [visibleGroups]);

  const [groupOrder, setGroupOrder] = useState(orderedGroups.map(g => g.id));

  // Keep groupOrder in sync when visible groups change (e.g. role loads after initial render)
  useEffect(() => {
    setGroupOrder(prev => {
      const visibleIds = orderedGroups.map(g => g.id);
      const kept = prev.filter(id => visibleIds.includes(id));
      const added = visibleIds.filter(id => !kept.includes(id));
      const next = [...kept, ...added];
      const changed = next.length !== prev.length || next.some((id, i) => id !== prev[i]);
      return changed ? next : prev;
    });
  }, [orderedGroups]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setGroupOrder(prev => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        const newOrder = arrayMove(prev, oldIndex, newIndex);
        saveOrder(newOrder);
        return newOrder;
      });
    }
  }, []);

  const sortedGroups = useMemo(() => {
    return groupOrder
      .map(id => orderedGroups.find(g => g.id === id))
      .filter(Boolean) as typeof orderedGroups;
  }, [groupOrder, orderedGroups]);

  const isSettingsActive = location.pathname === settingsLink.href;
  const SettingsIcon = settingsLink.icon;

  const getRoleBadge = () => {
    if (isSuperAdmin) return `👑 ${t('roles.superAdmin')}`;
    if (role === 'org_admin') return `🔑 ${t('roles.admin')}`;
    if (role === 'manager') return `👨‍💼 ${t('roles.manager')}`;
    if (role === 'agent') return `👤 ${t('roles.agent')}`;
    return `👁️ ${t('roles.viewer')}`;
  };

  return (
    <div className="portal-shell min-h-screen bg-background cockpit-bg">
      {/* Mobile Header with Hamburger */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-cockpit-bg-2/85 backdrop-blur-xl border-b border-cockpit-border/50 z-40 flex items-center px-4 md:hidden">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-cockpit-surface/60 transition-colors"
        >
          <Menu className="w-6 h-6 text-foreground" />
        </button>
        <Link to={homeHref} className="ml-3">
          <AvaLogo size="sm" animated={false} showText={false} className="[&_div:first-child]:w-10 [&_div:first-child]:h-10 [&_img]:w-10 [&_img]:h-10" />
        </Link>
      </header>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar-pane fixed left-0 top-0 h-screen w-64 xl:w-72 z-50 transition-transform duration-300 ease-in-out ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0`}>
        {/* Neon edge handled by .sidebar-pane::after */}
        <div className="flex flex-col h-full relative">
          {/* Header: Logo + Org name */}
          <div className="px-4 py-4 border-b border-cockpit-border/40 flex items-center gap-3 bg-gradient-to-r from-cockpit-cyan/[0.06] via-transparent to-cockpit-violet/[0.06]">
            <Link to={homeHref} onClick={() => setIsSidebarOpen(false)} className="shrink-0 relative">
              <span className="absolute inset-0 -m-1 rounded-full bg-cockpit-cyan/20 blur-md opacity-60 animate-cockpit-pulse" aria-hidden />
              <AvaLogo size="md" animated={true} showText={false} className="relative [&_div:first-child]:w-11 [&_div:first-child]:h-11 [&_img]:w-11 [&_img]:h-11" />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground truncate leading-tight">
                {selectedOrg?.name || 'AVA Statistics'}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-cockpit-cyan/90 truncate font-medium">
                {userRole?.role || (isSuperAdmin ? 'super_admin' : 'member')}
              </div>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 rounded-md hover:bg-cockpit-surface/60 transition-colors md:hidden"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>

          {/* Compact toolbar: org switcher + actions */}
          <div className="px-3 py-2 border-b border-cockpit-border/40 flex items-center gap-1.5">
            <div className="flex-1 min-w-0">
              <OrgSwitcher />
            </div>
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-cockpit-surface/60 shrink-0">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setLanguage('en')} className={language === 'en' ? 'bg-cockpit-cyan/10' : ''}>
                  🇬🇧 English
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLanguage('fr')} className={language === 'fr' ? 'bg-cockpit-cyan/10' : ''}>
                  🇫🇷 Français
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 hover:bg-cockpit-surface/60 shrink-0">
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-cockpit-warning" />
              ) : (
                <Moon className="w-4 h-4 text-cockpit-cyan" />
              )}
            </Button>
          </div>

          {/* Version + clear cache */}
          <div className="px-3 py-1.5 border-b border-cockpit-border/40 flex justify-center">
            <VersionBadge />
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={groupOrder} strategy={verticalListSortingStrategy}>
                {sortedGroups.map((group) => (
                  <SortableNavGroup
                    key={group.id}
                    group={group}
                    onNavigate={() => setIsSidebarOpen(false)}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {/* Portal switcher (Lemtel only) */}
            {isLemtelOrgSelected && currentScope === 'org' && (
              <Link
                to="/my"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 mt-3 text-muted-foreground hover:text-foreground hover:bg-muted border border-dashed border-border/60"
              >
                <UserCircle2 className="w-4 h-4" />
                <span className="font-medium text-sm">👤 My Workspace →</span>
              </Link>
            )}
            {isLemtelOrgSelected && currentScope === 'my' && (
              <Link
                to="/org/lemtel/admin/dashboard"
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 mt-3 text-muted-foreground hover:text-foreground hover:bg-muted border border-dashed border-border/60"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="font-medium text-sm">Back to Org Portal</span>
              </Link>
            )}

            {/* Per-domain cockpit shortcut for org_admin / manager of a customer domain */}
            {!isSuperAdmin && (role === 'org_admin' || role === 'manager') && selectedOrg?.slug && selectedOrgId !== '71755d33-ed64-4ad5-a828-61c9d2029eb7' && (
              <Link
                to={`/domain/${selectedOrg.slug}/admin/dashboard`}
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 mt-3 text-foreground bg-primary/10 hover:bg-primary/15 border border-primary/30"
              >
                <Globe className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">My Domain Cockpit →</span>
              </Link>
            )}

            {/* Settings link - always visible */}
            <Link
              to={settingsLink.href}
              onClick={() => setIsSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 mt-1 ${
                isSettingsActive
                  ? 'bg-primary/15 text-foreground border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span className="font-medium text-sm">{t(settingsLink.nameKey)}</span>
            </Link>
          </nav>

          {/* Footer */}
          <SidebarFooter />
        </div>
      </aside>

      {/* Main content */}
      <main className="pt-14 md:pt-0 md:ml-64 xl:ml-72 min-h-screen flex flex-col cockpit-scope min-w-0">

        <div className="px-4 lg:px-6 py-4 flex-1 w-full min-w-0">
          {children}
        </div>
        <AvaFooter />
      </main>

      {/* Cookie Consent Banner */}
      {selectedOrg?.gdpr_enabled && (
        <CookieConsentBanner 
          organizationId={selectedOrg.id} 
          gdprEnabled={selectedOrg.gdpr_enabled} 
        />
      )}

      {/* Portal softphone disabled — use the mobile app for calling. */}

    </div>
  );
};