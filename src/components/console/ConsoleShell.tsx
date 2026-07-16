import { ReactNode } from "react";
import { NavLink, useLocation, Outlet } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Phone, Smartphone, Wifi, PhoneCall, FileAudio, Voicemail,
  Hash, Route as RouteIcon, ListTree, Users2, ClipboardList, Sparkles, Bot,
  AlertTriangle, CircleDot, MessageSquare,
} from "lucide-react";
import { useDesktopRole } from "@/hooks/useDesktopRole";
import { Navigate } from "react-router-dom";

const ITEMS = [
  { to: "/console", label: "Dashboard", icon: LayoutDashboard, end: true, group: "Overview" },
  { to: "/console/extensions", label: "Extensions", icon: Phone, group: "Inventory" },
  { to: "/console/devices", label: "Devices", icon: Smartphone, group: "Inventory" },
  { to: "/console/ivrs", label: "IVRs", icon: ListTree, group: "Inventory" },
  { to: "/console/ring-groups", label: "Ring Groups", icon: Users2, group: "Inventory" },
  { to: "/console/queues", label: "Queues", icon: Users2, group: "Inventory" },
  { to: "/console/dids", label: "DIDs", icon: Hash, group: "Inventory" },
  { to: "/console/inbound-routes", label: "Inbound Routes", icon: RouteIcon, group: "Inventory" },
  { to: "/console/voicemail", label: "Voicemail", icon: Voicemail, group: "Inventory" },
  { to: "/console/registrations", label: "Live Registrations", icon: Wifi, group: "Live" },
  { to: "/console/active-calls", label: "Active Calls", icon: PhoneCall, group: "Live" },
  { to: "/console/cdr", label: "CDR & Recordings", icon: FileAudio, group: "Live" },
  { to: "/console/insights", label: "AI Insights", icon: Sparkles, group: "AI" },
  { to: "/console/chatbot", label: "PBX Chatbot", icon: Bot, group: "AI" },
  { to: "/console/chat", label: "Team Chat", icon: MessageSquare, group: "AI" },
  { to: "/console/presence", label: "Presence", icon: CircleDot, group: "Admin" },
  { to: "/console/audit", label: "Audit Log", icon: ClipboardList, group: "Admin" },
];

function ConsoleSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const groups = Array.from(new Set(ITEMS.map(i => i.group)));
  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {groups.map(g => (
          <SidebarGroup key={g}>
            {!collapsed && <SidebarGroupLabel>{g}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {ITEMS.filter(i => i.group === g).map(item => {
                  const active = item.end ? pathname === item.to : pathname.startsWith(item.to);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active}>
                        <NavLink to={item.to} end={item.end} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.label}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

export function ConsoleShell({ children }: { children?: ReactNode }) {
  const { isAdmin, loading } = useDesktopRole();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading console…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <AlertTriangle className="h-10 w-10 mx-auto text-amber-500" />
          <h1 className="text-xl font-semibold">Command Center is admin-only</h1>
          <p className="text-sm text-muted-foreground">Your account doesn't have telephony admin permissions on this workspace.</p>
        </div>
      </div>
    );
  }
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <ConsoleSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 border-b flex items-center px-3 gap-2 sticky top-0 bg-background/80 backdrop-blur z-10">
            <SidebarTrigger />
            <div className="text-sm font-semibold tracking-wide">PBX Command Center</div>
          </header>
          <main className="flex-1 overflow-auto">{children ?? <Outlet />}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export function ConsoleAdminRedirect() {
  return <Navigate to="/console" replace />;
}
