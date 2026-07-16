import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Phone, FileText, Voicemail, MessageSquare, Headphones,
  Sliders, Sparkles, Download, User, Settings, Users, PlayCircle,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useOrganization } from "@/context/OrganizationContext";

type Item = { label: string; to: string; icon: React.ComponentType<{ className?: string }> };

const WORKSPACE: Item[] = [
  { label: "Dashboard",  to: "/my",            icon: LayoutDashboard },
  { label: "Softphone",  to: "/my/softphone",  icon: Phone },
  { label: "Calls",      to: "/my/calls",      icon: FileText },
  { label: "Voicemail",  to: "/my/voicemail",  icon: Voicemail },
  { label: "Greetings",  to: "/my/greetings",  icon: PlayCircle },
  { label: "Recordings", to: "/my/recordings", icon: Headphones },
  { label: "Messages",   to: "/my/messages",   icon: MessageSquare },
];

const COLLAB: Item[] = [
  { label: "Org Chat", to: "/my/chat",     icon: MessageSquare },
  { label: "Contacts", to: "/my/telecom",  icon: Users },
];

const TOOLS: Item[] = [
  { label: "AI Assistant", to: "/my/ai",        icon: Sparkles },
  { label: "Telecom",      to: "/my/telecom",   icon: Sliders },
  { label: "Downloads",    to: "/my/downloads", icon: Download },
  { label: "Profile",      to: "/my/profile",   icon: User },
  { label: "Settings",     to: "/my/settings",  icon: Settings },
];

function NavGroup({ label, items }: { label: string; items: Item[] }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  return (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((it) => {
            const active = it.to === "/my" ? pathname === "/my" : pathname === it.to || pathname.startsWith(it.to + "/");
            return (
              <SidebarMenuItem key={it.to}>
                <SidebarMenuButton asChild isActive={active} tooltip={it.label}>
                  <NavLink to={it.to} end={it.to === "/my"}>
                    <it.icon className="h-4 w-4" />
                    {!collapsed && <span>{it.label}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function WorkspaceSidebar() {
  const { selectedOrgId } = useOrganization();
  const isLemtelOrgSelected = selectedOrgId === "71755d33-ed64-4ad5-a828-61c9d2029eb7";
  const workspaceItems = isLemtelOrgSelected ? WORKSPACE : WORKSPACE.filter((item) => item.to === "/my");
  const collabItems = isLemtelOrgSelected ? COLLAB : COLLAB.filter((item) => item.to !== "/my/telecom");
  const toolItems = isLemtelOrgSelected ? TOOLS : TOOLS.filter((item) => item.to !== "/my/telecom");

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <NavGroup label="Workspace" items={workspaceItems} />
        <NavGroup label="Collaboration" items={collabItems} />
        <NavGroup label="Tools" items={toolItems} />
      </SidebarContent>
    </Sidebar>
  );
}
