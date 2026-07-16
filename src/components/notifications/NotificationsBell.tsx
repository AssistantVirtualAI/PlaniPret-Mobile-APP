import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useOrganization } from '@/context/OrganizationContext';
import { useOrgNotifications, useMarkNotificationRead } from '@/hooks/useNotifications';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export const NotificationsBell = () => {
  const { selectedOrgId } = useOrganization();
  const q = useOrgNotifications(selectedOrgId || undefined);
  const markRead = useMarkNotificationRead();

  const unread = (q.data || []).filter((n) => !n.read_at).length;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 hover:bg-muted" aria-label="Notifications">
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1">
              <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px] leading-5">
                {unread}
              </Badge>
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {q.isLoading ? (
            <div className="text-sm text-muted-foreground">Chargement…</div>
          ) : (q.data || []).length === 0 ? (
            <div className="text-sm text-muted-foreground">Aucune notification.</div>
          ) : (
            <ScrollArea className="h-[70vh] pr-3">
              <div className="space-y-2">
                {(q.data || []).map((n) => (
                  <button
                    key={n.id}
                    className={cn(
                      'w-full text-left rounded-lg border border-border/50 p-3 transition-colors hover:bg-muted/40',
                      !n.read_at && 'bg-muted/30',
                    )}
                    onClick={() => {
                      if (!n.read_at && !markRead.isPending) markRead.mutate({ id: n.id });
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{n.title}</div>
                        {n.body && <div className="mt-1 text-xs text-muted-foreground">{n.body}</div>}
                      </div>
                      {!n.read_at && <Badge variant="secondary" className="text-[10px]">Nouveau</Badge>}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
