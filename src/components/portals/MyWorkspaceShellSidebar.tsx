import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WorkspaceSidebar } from "@/components/portals/WorkspaceSidebar";
import { WorkspaceHeaderExtras } from "@/components/portals/WorkspaceHeaderExtras";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import { MyAIChatLauncher } from "@/components/ai/MyAIChat";
import { useLemtelAiRealtime } from "@/hooks/useLemtelAiRealtime";
import { useOrganization } from "@/context/OrganizationContext";

const STORAGE_KEY = "ava.sidebar.workspace.open";

export function MyWorkspaceShellSidebar() {
  const { selectedOrgId } = useOrganization();
  useLemtelAiRealtime(selectedOrgId);
  const initialOpen = (() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === "1";
  })();

  return (
    <SidebarProvider
      defaultOpen={initialOpen}
      onOpenChange={(open) => {
        try { window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0"); } catch {}
      }}
    >
      <div className="min-h-screen flex w-full bg-background">
        <WorkspaceSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center gap-3 px-4 border-b border-cockpit-border/50 bg-cockpit-surface/60 sticky top-0 z-30 backdrop-blur-xl">
            <SidebarTrigger />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">My Workspace</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">User</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <NotificationCenter />
              <WorkspaceHeaderExtras />
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden cockpit-scope p-4">
            <Outlet />
          </main>
        </div>
        <MyAIChatLauncher />
      </div>
    </SidebarProvider>
  );
}
