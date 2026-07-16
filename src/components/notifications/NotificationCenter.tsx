import { useEffect, useState } from "react";
import { Bell, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Notif = {
  id: string;
  level: string;
  title: string;
  body: string | null;
  metadata: any;
  read_at: string | null;
  created_at: string;
};

const levelColor: Record<string, string> = {
  info: "bg-blue-500",
  success: "bg-green-600",
  warning: "bg-amber-500",
  error: "bg-destructive",
};

export default function NotificationCenter() {
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase
      .from("org_notifications")
      .select("*")
      .eq("recipient_user_id", u.user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data as Notif[]) ?? []);
  };

  useEffect(() => {
    load();
    let chId: any;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      chId = supabase
        .channel(`notifs-${u.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "org_notifications",
            filter: `recipient_user_id=eq.${u.user.id}`,
          },
          load,
        )
        .subscribe();
    })();
    return () => {
      if (chId) supabase.removeChannel(chId);
    };
  }, []);

  const unread = items.filter((n) => !n.read_at).length;

  const markRead = async (id: string) => {
    await supabase
      .from("org_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
  };

  const markAllRead = async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length === 0) return;
    await supabase
      .from("org_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    load();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-semibold text-sm">Notifications</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              <Check className="h-3 w-3 mr-1" /> Tout marquer lu
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aucune notification
            </div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "px-3 py-2 border-b last:border-0 hover:bg-muted/40 transition-colors",
                  !n.read_at && "bg-primary/5",
                )}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full mt-1.5 shrink-0",
                      levelColor[n.level] ?? "bg-muted",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    {n.body && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    {!n.read_at && (
                      <button
                        className="text-[10px] text-primary hover:underline mt-1"
                        onClick={() => markRead(n.id)}
                      >
                        Marquer lu
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}j`;
}
