import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, MessageSquare, Smartphone, Settings, Activity, Download, MonitorDown, Apple } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { fetchLatestRelease, resolveUrl } from "@/lib/githubRelease";

interface Mapping {
  extension: string;
  display_name: string | null;
  status: string | null;
  forward_enabled?: boolean | null;
  forward_to?: string | null;
}

export default function PortalDashboard() {
  const { user } = useAuth();
  const [me, setMe] = useState<Mapping | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [calls, setCalls] = useState<any[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [sms, setSms] = useState<any[]>([]);
  const [smsLoading, setSmsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setMeLoading(true);
      const { data: sp } = await supabase
        .from("pbx_softphone_users")
        .select("extension, display_name, status, forward_enabled, forward_to")
        .eq("portal_user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setMe(sp as any);
      setMeLoading(false);

      if (!sp?.extension) {
        setCallsLoading(false);
        setSmsLoading(false);
        return;
      }

      // Fire in parallel so each list renders as soon as it's ready
      supabase
        .from("pbx_call_records")
        .select("id, direction, caller_number, destination_number, duration_seconds, start_at, missed_call")
        .or(`caller_number.eq.${sp.extension},destination_number.eq.${sp.extension}`)
        .order("start_at", { ascending: false })
        .limit(20)
        .then(({ data }) => {
          if (!cancelled) {
            setCalls(data || []);
            setCallsLoading(false);
          }
        });

      supabase
        .from("pbx_sms_threads")
        .select("id, contact_name, contact_phone, unread_count, last_message_at")
        .order("last_message_at", { ascending: false })
        .limit(10)
        .then(({ data }) => {
          if (!cancelled) {
            setSms(data || []);
            setSmsLoading(false);
          }
        });
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const todayCalls = calls.filter((c) => c.start_at && new Date(c.start_at).toDateString() === new Date().toDateString());
  const missed = todayCalls.filter((c) => c.missed_call).length;
  const inbound = todayCalls.filter((c) => c.direction === "inbound").length;
  const outbound = todayCalls.filter((c) => c.direction === "outbound").length;
  const unread = sms.reduce((s, t: any) => s + (t.unread_count || 0), 0);

  if (!meLoading && !me) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Phone className="w-10 h-10 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">No extension assigned</h2>
            <p className="text-sm text-muted-foreground">
              Your account isn't linked to a softphone extension yet. Contact your administrator.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/org/lemtel/portal/diagnostic">Run diagnostic</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dot =
    me?.status === "available" ? "bg-emerald-500" :
    me?.status === "oncall" ? "bg-amber-500" :
    me?.status === "dnd" ? "bg-rose-500" :
    "bg-muted-foreground";

  return (
    <div className="space-y-6 p-2 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3 min-w-0">
        <div className="min-w-0">
          {meLoading ? (
            <>
              <Skeleton className="h-7 w-56 mb-2" />
              <Skeleton className="h-4 w-40" />
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold truncate">Welcome, {me!.display_name || `Ext ${me!.extension}`}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
                <span className={`w-2 h-2 rounded-full ${dot}`} />
                Extension {me!.extension} · {me!.status || "offline"}
                {me!.forward_enabled && me!.forward_to && (
                  <Badge variant="outline" className="ml-2">↪ forwarding to {me!.forward_to}</Badge>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm">
            <Link to="/org/lemtel/portal/softphone"><Phone className="w-4 h-4 mr-2" /> Open Softphone</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/org/lemtel/portal/diagnostic"><Settings className="w-4 h-4 mr-2" /> Diagnostic</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Calls today" value={todayCalls.length} Icon={Activity} color="text-blue-500" loading={callsLoading} />
        <Kpi label="Inbound" value={inbound} Icon={PhoneIncoming} color="text-emerald-500" loading={callsLoading} />
        <Kpi label="Outbound" value={outbound} Icon={PhoneOutgoing} color="text-indigo-500" loading={callsLoading} />
        <Kpi label="Missed" value={missed} Icon={PhoneMissed} color="text-rose-500" loading={callsLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
        <Card className="min-w-0">
          <CardHeader className="pb-3"><CardTitle className="text-base">Recent calls</CardTitle></CardHeader>
          <CardContent className="p-0">
            {callsLoading ? (
              <ListSkeleton rows={6} />
            ) : calls.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">No calls yet</div>
            ) : (
              <ul className="divide-y">
                {calls.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2 text-sm min-w-0">
                    {c.missed_call ? <PhoneMissed className="w-4 h-4 text-rose-500 shrink-0" /> :
                      c.direction === "inbound" ? <PhoneIncoming className="w-4 h-4 text-emerald-500 shrink-0" /> :
                      <PhoneOutgoing className="w-4 h-4 text-indigo-500 shrink-0" />}
                    <span className="font-mono text-xs flex-1 truncate min-w-0">
                      {c.direction === "inbound" ? c.caller_number : c.destination_number}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{c.duration_seconds || 0}s</span>
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                      {c.start_at ? formatDistanceToNow(new Date(c.start_at), { addSuffix: true }) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">SMS inbox</CardTitle>
            {unread > 0 && <Badge>{unread} unread</Badge>}
          </CardHeader>
          <CardContent className="p-0">
            {smsLoading ? (
              <ListSkeleton rows={5} />
            ) : sms.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">No messages</div>
            ) : (
              <ul className="divide-y">
                {sms.slice(0, 8).map((t: any) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2 text-sm min-w-0">
                    <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate min-w-0">{t.contact_name || t.contact_phone}</span>
                    {t.unread_count > 0 && <Badge variant="secondary" className="shrink-0">{t.unread_count}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink to="/org/lemtel/portal/softphone" Icon={Phone} label="Softphone" />
        <QuickLink to="/org/lemtel/portal/calls" Icon={Activity} label="Call history" />
        <QuickLink to="/org/lemtel/portal/messages" Icon={MessageSquare} label="Messages" />
        <QuickLink to="/org/lemtel/portal/extensions" Icon={Smartphone} label="Extensions" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MonitorDown className="h-4 w-4 text-primary" />
            Download Desktop App
          </CardTitle>
        </CardHeader>
        <DesktopDownloadButtons />
      </Card>
    </div>
  );
}

function DesktopDownloadButtons() {
  const { data: release } = useQuery({
    queryKey: ["gh-release-latest"],
    queryFn: fetchLatestRelease,
    staleTime: 30 * 60_000,
    retry: false,
  });
  const items = [
    { Icon: Apple, label: "Mac M1 / M2 / M3", sub: "Apple Silicon · .dmg", url: resolveUrl(release ?? null, "macArm") },
    { Icon: Apple, label: "Mac Intel", sub: "Intel chip · .dmg", url: resolveUrl(release ?? null, "macIntel") },
    { Icon: MonitorDown, label: "Windows", sub: "10 / 11 · .exe", url: resolveUrl(release ?? null, "windows") },
  ];
  return (
    <CardContent className="grid gap-3 sm:grid-cols-3">
      {items.map(({ Icon, label, sub, url }) => (
        <Button key={label} asChild variant="outline" className="h-auto py-3 justify-start gap-3">
          <a href={url} download>
            <Icon className="h-4 w-4" />
            <div className="flex flex-col items-start text-left">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{sub}</span>
            </div>
            <Download className="h-4 w-4 ml-auto opacity-60" />
          </a>
        </Button>
      ))}
    </CardContent>
  );
}


function Kpi({ label, value, Icon, color, loading }: { label: string; value: number; Icon: any; color: string; loading?: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs text-muted-foreground font-normal">{label}</CardTitle>
        <Icon className={`w-4 h-4 ${color}`} />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-7 w-12" /> : <div className="text-2xl font-bold">{value}</div>}
      </CardContent>
    </Card>
  );
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="divide-y">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="w-4 h-4 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-10" />
        </li>
      ))}
    </ul>
  );
}

function QuickLink({ to, Icon, label }: { to: string; Icon: any; label: string }) {
  return (
    <Link to={to} className="block">
      <Card className="hover:bg-muted/40 transition cursor-pointer">
        <CardContent className="flex items-center gap-3 py-3">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium truncate">{label}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
