import { lazy, Suspense } from "react";
import { ConsolePageHeader } from "@/components/console/ConsolePageHeader";

const OrgChat = lazy(() => import("@/pages/my/OrgChat"));

export default function ConsoleChat() {
  return (
    <div>
      <ConsolePageHeader
        title="Team Chat"
        description="Workspace channels and direct messages. Available to anyone with portal access."
        sourceId="extensions"
        hasData
      />
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading chat…</div>}>
        <OrgChat />
      </Suspense>
    </div>
  );
}
