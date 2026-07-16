import { ReactNode, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Menu,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { AvaStatisticsLogo as AvaLogo } from "@/components/shared/AvaStatisticsLogo";
import { useOrganization } from "@/context/OrganizationContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTranslation } from "@/hooks/useTranslation";
import { useLiveCounters } from "@/hooks/useLiveCounters";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import {
  COCKPIT_NAV,
  filterCockpitNav,
  type CockpitNavGroup,
  type CockpitNavItem,
  type CockpitRole,
} from "./cockpitNavConfig";
import { LiveBadge, StatusChip } from "@/components/ui-cockpit";
import { cn } from "@/lib/utils";

interface CockpitShellProps {
  children: ReactNode;
  /** Optional page header rendered above the children, inside the glass content area. */
  header?: ReactNode;
}

export function CockpitShell({ children, header }: CockpitShellProps) {
  const { role, isSuperAdmin } = usePermissions();
  const { selectedOrg, userRole } = useOrganization();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();
  const location = useLocation();
  const counters = useLiveCounters();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const cockpitRole: CockpitRole = isSuperAdmin
    ? "super_admin"
    : ((userRole?.role as CockpitRole | undefined) ?? (role as CockpitRole | undefined) ?? "viewer");

  const groups = useMemo(() => filterCockpitNav(COCKPIT_NAV, cockpitRole), [cockpitRole]);

  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  return (
    <div className="cockpit-bg relative min-h-screen text-foreground">
      {/* Mobile top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center gap-2 border-b border-cockpit-border/40 bg-cockpit-bg-2/80 px-3 backdrop-blur md:hidden">
        <button
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-foreground hover:bg-cockpit-surface/60"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/" className="flex items-center gap-2">
          <AvaLogo size="sm" animated={false} showText={false} className="[&_div:first-child]:w-8 [&_div:first-child]:h-8 [&_img]:w-8 [&_img]:h-8" />
          <span className="text-sm font-semibold truncate max-w-[40vw]">{selectedOrg?.name ?? "AVA Statistic"}</span>
        </Link>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen border-r border-cockpit-border/50 bg-cockpit-bg-2/85 backdrop-blur-xl transition-all duration-300 ease-out",
          "flex flex-col",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0",
          collapsed ? "w-[4.5rem]" : "w-72",
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 border-b border-cockpit-border/40 px-3 py-3">
          <Link to="/" className="shrink-0" onClick={() => setMobileOpen(false)}>
            <AvaLogo size="md" animated showText={false} className="[&_div:first-child]:w-10 [&_div:first-child]:h-10 [&_img]:w-10 [&_img]:h-10" />
          </Link>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold leading-tight">{selectedOrg?.name ?? "AVA Statistic"}</div>
              <div className="mt-0.5">
                <StatusChip tone="cyan">{cockpitRole}</StatusChip>
              </div>
            </div>
          )}
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-cockpit-surface/60 md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="ml-auto hidden rounded-md p-1.5 text-muted-foreground hover:bg-cockpit-surface/60 md:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((g) => (
            <NavGroupBlock
              key={g.id}
              group={g}
              collapsed={collapsed}
              counters={counters}
              currentPath={location.pathname}
              onNavigate={() => setMobileOpen(false)}
              tr={tr}
            />
          ))}
        </nav>

        {/* Footer toolbar */}
        <div className="flex items-center gap-1 border-t border-cockpit-border/40 px-2 py-2">
          {!collapsed && (
            <div className="flex-1 px-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              v · cockpit
            </div>
          )}
          <NotificationsBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-cockpit-surface/60">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setLanguage("en")} className={language === "en" ? "bg-cockpit-cyan/10" : ""}>🇬🇧 English</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLanguage("fr")} className={language === "fr" ? "bg-cockpit-cyan/10" : ""}>🇫🇷 Français</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 hover:bg-cockpit-surface/60">
            {theme === "dark" ? <Sun className="h-4 w-4 text-cockpit-warning" /> : <Moon className="h-4 w-4 text-cockpit-cyan" />}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main
        className={cn(
          "pt-14 md:pt-0 min-h-screen transition-[margin] duration-300 ease-out",
          collapsed ? "md:ml-[4.5rem]" : "md:ml-72",
        )}
      >
        <div className="p-4 lg:p-6">
          {header ? <div className="mb-4">{header}</div> : null}
          {children}
        </div>
      </main>
    </div>
  );
}

function NavGroupBlock({
  group,
  collapsed,
  counters,
  currentPath,
  onNavigate,
  tr,
}: {
  group: CockpitNavGroup;
  collapsed: boolean;
  counters: ReturnType<typeof useLiveCounters>;
  currentPath: string;
  onNavigate: () => void;
  tr: (k: string, fb: string) => string;
}) {
  const Icon = group.icon;
  return (
    <div className="mb-2">
      {!collapsed && (
        <div className="flex items-center gap-2 px-2 pb-1 pt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Icon className="h-3 w-3 text-cockpit-cyan/80" />
          <span>{tr(group.labelKey, group.id.replace(/-/g, " "))}</span>
        </div>
      )}
      <ul className="space-y-0.5">
        {group.items.map((item) => (
          <NavItemRow
            key={`${group.id}-${item.href}-${item.labelKey}`}
            item={item}
            collapsed={collapsed}
            count={item.liveBadgeKey ? counters[item.liveBadgeKey] : 0}
            active={currentPath === item.href || currentPath.startsWith(item.href + "/")}
            onNavigate={onNavigate}
            tr={tr}
          />
        ))}
      </ul>
    </div>
  );
}

function NavItemRow({
  item,
  collapsed,
  count,
  active,
  onNavigate,
  tr,
}: {
  item: CockpitNavItem;
  collapsed: boolean;
  count: number;
  active: boolean;
  onNavigate: () => void;
  tr: (k: string, fb: string) => string;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        to={item.href}
        onClick={onNavigate}
        className={cn(
          "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
          active
            ? "bg-cockpit-surface-strong/80 text-foreground"
            : "text-muted-foreground hover:bg-cockpit-surface/60 hover:text-foreground",
        )}
      >
        {active && (
          <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-cockpit-cyan shadow-cockpit-glow-cyan" />
        )}
        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-cockpit-cyan" : "text-muted-foreground group-hover:text-cockpit-cyan")} />
        {!collapsed && <span className="flex-1 truncate">{tr(item.labelKey, item.labelKey)}</span>}
        {!collapsed && count > 0 ? (
          <LiveBadge tone="cyan" label="" count={count} className="ml-auto" />
        ) : null}
        {collapsed && count > 0 ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-cockpit-cyan shadow-cockpit-glow-cyan animate-cockpit-pulse" />
        ) : null}
      </Link>
    </li>
  );
}

export default CockpitShell;
