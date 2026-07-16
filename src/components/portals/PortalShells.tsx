import { ReactNode, useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Shield, Building2, User, LayoutDashboard, Users, Phone, BarChart3, Settings,
  CreditCard, FileText, Headphones, Voicemail, Download, MessageSquare, Database,
  Server, Activity, Sliders, Sparkles, Bot,
} from "lucide-react";
import { DollarSign } from "lucide-react";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import { WorkspaceHeaderExtras } from "@/components/portals/WorkspaceHeaderExtras";
import { useOrganization } from "@/context/OrganizationContext";
import { useAuth } from "@/hooks/useAuth";
import { AVA_OWNER_USER_ID } from "@/lib/avaOwner";
import { useLemtelAiRealtime } from "@/hooks/useLemtelAiRealtime";

type NavItem = { label: string; to: string; icon: React.ComponentType<{ className?: string }> };

function Shell({ title, badge, accent, items }: {
  title: string;
  badge: string;
  accent: string;
  items: NavItem[];
}) {
  const { pathname } = useLocation();
  const { selectedOrgId } = useOrganization();
  useLemtelAiRealtime(selectedOrgId);
  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="px-6 py-3 border-b border-cockpit-border/50 flex items-center gap-3 flex-wrap bg-cockpit-surface/60 sticky top-0 z-30 backdrop-blur-xl">
        <div className={`w-2 h-2 rounded-full ${accent}`} />
        <div className="mr-4">
          <div className="text-sm font-semibold leading-tight">{title}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{badge}</div>
        </div>
        <nav className="flex items-center gap-1 flex-wrap">
          {items.map((it) => {
            const isRoot = it.to.split("/").length <= 2;
            const active = isRoot ? pathname === it.to : pathname === it.to || pathname.startsWith(it.to + "/");
            return (
              <NavLink
                key={it.to}
                to={it.to}
                end={isRoot}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary/15 text-primary sidebar-glow"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <it.icon className="h-3.5 w-3.5" />
                <span>{it.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <NotificationCenter />
          <WorkspaceHeaderExtras />
        </div>
      </div>
      <main className="flex-1 overflow-x-hidden cockpit-scope">
        <Outlet />
      </main>
    </div>
  );
}

export function PlatformAdminShell({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const isAvaOwner = user?.id === AVA_OWNER_USER_ID;
  const items = useMemo(() => [
    { label: "Overview", to: "/platform", icon: LayoutDashboard },
    { label: "Organizations", to: "/platform/organizations", icon: Building2 },
    { label: "All Users", to: "/platform/users", icon: Users },
    { label: "System Health", to: "/platform/health", icon: Activity },
    { label: "Billing", to: "/platform/billing", icon: CreditCard },
    ...(isAvaOwner ? [{ label: "AI Usage", to: "/platform/ai-usage", icon: DollarSign }] : []),
    { label: "Audit Logs", to: "/platform/audit", icon: FileText },
    { label: "Settings", to: "/platform/settings", icon: Settings },
  ], [isAvaOwner]);


  return (
    <Shell
      title="AVA"
      badge="Super Admin"
      accent="bg-violet-500"
      items={items}
    />
  );
}


export function CustomerAdminShell({ children }: { children?: ReactNode }) {
  const { selectedOrgId } = useOrganization();
  const isLemtelOrgSelected = selectedOrgId === "71755d33-ed64-4ad5-a828-61c9d2029eb7";
  const items = useMemo(() => [
    { label: "Dashboard", to: "/customer", icon: LayoutDashboard },
    { label: "Team", to: "/customer/team", icon: Users },
    ...(isLemtelOrgSelected ? [
      { label: "Extensions", to: "/customer/extensions", icon: Phone },
      { label: "Queues", to: "/customer/queues", icon: Headphones },
      { label: "IVR", to: "/customer/ivr", icon: Server },
      { label: "Numbers", to: "/customer/numbers", icon: Phone },
      { label: "CDR & Call History", to: "/customer/calls", icon: FileText },
      { label: "Recordings", to: "/customer/recordings", icon: Headphones },
      { label: "Sync Health", to: "/customer/sync-health", icon: Activity },
      { label: "Reports", to: "/customer/reports", icon: BarChart3 },
      { label: "Analytics", to: "/customer/analytics", icon: BarChart3 },
    ] : []),
    { label: "Org Chat", to: "/customer/chat", icon: MessageSquare },
    { label: "AI Admin", to: "/customer/ai-admin", icon: Bot },
    { label: "Knowledge Base", to: "/customer/knowledge", icon: Database },
    { label: "Billing", to: "/customer/billing", icon: CreditCard },
    { label: "Settings", to: "/customer/settings", icon: Settings },
  ], [isLemtelOrgSelected]);

  return (
    <Shell
      title="Workspace Admin"
      badge="Customer Admin"
      accent="bg-blue-500"
      items={items}
    />
  );
}

export function MyWorkspaceShell({ children }: { children?: ReactNode }) {
  return (
    <Shell
      title="My Workspace"
      badge="User"
      accent="bg-emerald-500"
      items={[
        { label: "Home", to: "/my", icon: LayoutDashboard },
        { label: "Softphone", to: "/my/softphone", icon: Phone },
        { label: "My Calls", to: "/my/calls", icon: FileText },
        { label: "Voicemail", to: "/my/voicemail", icon: Voicemail },
        { label: "Messages", to: "/my/messages", icon: MessageSquare },
        { label: "Recordings", to: "/my/recordings", icon: Headphones },
        { label: "Org Chat", to: "/my/chat", icon: MessageSquare },
        { label: "Telecom", to: "/my/telecom", icon: Sliders },
        { label: "AI Assistant", to: "/my/ai", icon: Sparkles },
        { label: "Downloads", to: "/my/downloads", icon: Download },
        { label: "Profile", to: "/my/profile", icon: User },
        { label: "Settings", to: "/my/settings", icon: Settings },
      ]}
    />
  );
}

export function PortalRoleBadge({ role }: { role: "platform" | "customer" | "my" }) {
  const map = {
    platform: { icon: Shield, label: "Platform Admin", color: "text-red-500" },
    customer: { icon: Building2, label: "Customer Admin", color: "text-blue-500" },
    my: { icon: User, label: "My Workspace", color: "text-emerald-500" },
  } as const;
  const { icon: Icon, label, color } = map[role];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${color}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  );
}
