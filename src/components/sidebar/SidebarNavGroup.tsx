import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { NavGroup } from './sidebarConfig';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/hooks/useTranslation';
import { useOrganization } from '@/context/OrganizationContext';

interface SidebarNavGroupProps {
  group: NavGroup;
  onNavigate?: () => void;
}

const STORAGE_KEY = 'sidebar-collapsed-groups';

const getCollapsedGroups = (): string[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setCollapsedGroups = (groups: string[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
};

export const SidebarNavGroup = ({ group, onNavigate }: SidebarNavGroupProps) => {
  const location = useLocation();
  const { t } = useTranslation();
  const { selectedOrgId } = useOrganization();
  const isLemtelOrgSelected = selectedOrgId === '71755d33-ed64-4ad5-a828-61c9d2029eb7';
  const visibleItems = useMemo(() => group.items.filter(item => !(item.hideForLemtel && isLemtelOrgSelected)), [group.items, isLemtelOrgSelected]);
  const isActiveGroup = visibleItems.some(item => location.pathname === item.href);
  
  const [isOpen, setIsOpen] = useState(() => {
    if (isActiveGroup) return true;
    const collapsed = getCollapsedGroups();
    return !collapsed.includes(group.id);
  });

  useEffect(() => {
    if (isActiveGroup && !isOpen) {
      setIsOpen(true);
    }
  }, [isActiveGroup, location.pathname]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    const collapsed = getCollapsedGroups();
    if (open) {
      setCollapsedGroups(collapsed.filter(id => id !== group.id));
    } else {
      setCollapsedGroups([...collapsed, group.id]);
    }
  };

  const Icon = group.icon;

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger className={`nav-group-trigger ${isActiveGroup ? 'is-active' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="nav-icon-wrap text-muted-foreground">
            <Icon className="w-4 h-4" />
          </div>
          <span className={`font-medium text-sm tracking-tight ${isActiveGroup ? 'text-foreground' : 'text-muted-foreground'}`}>
            {t(group.labelKey)}
          </span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.18 }}
        >
          <ChevronDown className={`w-4 h-4 ${isActiveGroup ? 'text-cockpit-cyan' : 'opacity-60'}`} />
        </motion.div>
      </CollapsibleTrigger>

      <AnimatePresence>
        {isOpen && (
          <CollapsibleContent className="pl-4 mt-1.5 space-y-1 overflow-hidden">
            {visibleItems.map((item, index) => {
              const ItemIcon = item.icon;
              const isActive = location.pathname === item.href;

              return (
                <motion.div
                  key={`${item.href}-${item.nameKey}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03, duration: 0.15 }}
                >
                  <Link
                    to={item.href}
                    onClick={onNavigate}
                    className={`nav-item ${isActive ? 'is-active' : ''}`}
                  >
                    <ItemIcon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-cockpit-cyan' : ''}`} />
                    <span className="text-sm">{t(item.nameKey)}</span>
                  </Link>
                </motion.div>
              );
            })}
          </CollapsibleContent>
        )}
      </AnimatePresence>
    </Collapsible>
  );
};