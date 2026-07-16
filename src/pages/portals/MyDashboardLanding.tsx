import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Phone, Voicemail, MessageSquare, Headphones, Download, User, ArrowRight,
  FileText, Sparkles, TrendingUp, PhoneMissed, Clock, AlertCircle, BarChart3,
} from "lucide-react";
import { PortalRoleBadge } from "@/components/portals/PortalShells";
import { useMyDashboardStats } from "@/hooks/useMyDashboardStats";
import { formatDistanceToNow } from "date-fns";

const quick = [
  { title: "Softphone", desc: "Make and receive calls", to: "/my/softphone", icon: Phone },
  { title: "My Calls", desc: "Your recent call history", to: "/my/calls", icon: FileText },
  { title: "Voicemail", desc: "Listen to messages", to: "/my/voicemail", icon: Voicemail },
  { title: "Messages", desc: "Team chat and SMS", to: "/my/messages", icon: MessageSquare },
  { title: "Recordings", desc: "Your call recordings", to: "/my/recordings", icon: Headphones },
  { title: "AI Assistant", desc: "Ask AVA anything", to: "/my/ai", icon: Sparkles },
  { title: "Downloads", desc: "Desktop and mobile apps", to: "/my/downloads", icon: Download },
  { title: "Profile", desc: "Your account and preferences", to: "/my/profile", icon: User },
];

function fmtDuration(sec: number) {
  if (!sec) return "0s";
  const m = Math.floor(sec / 60); const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function timeAgoSafe(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : formatDistanceToNow(date, { addSuffix: true });
}

function StatCard({ icon: Icon, label, value, hint, accent = "primary" }: { icon: any; label: string; value: string | number; hint?: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 text-${accent}`} />
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export default function MyDashboardLanding() {
  const { data, isLoading } = useMyDashboardStats();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <PortalRoleBadge role="my" />
          <h1 className="text-3xl font-bold mt-1">Welcome back{data?.display_name ? `, ${data.display_name}` : ""}</h1>
          <p className="text-muted-foreground text-sm">
            {data?.has_extension
              ? `Extension ${data.extension} · ${data.registration_status ?? "unknown"}`
              : "Your personal workspace"}
          </p>
        </div>
        <Button asChild>
          <Link to="/my/ai"><Sparkles className="h-4 w-4 mr-1.5" /> Ask AVA</Link>
        </Button>
      </div>

      {!isLoading && data && !data.has_extension && (
        <Card className="border-destructive/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <div className="font-medium">No SIP extension linked yet</div>
              <div className="text-xs text-muted-foreground">Ask your admin to assign you an extension so we can show your stats.</div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />) : (
          <>
            <StatCard icon={Phone} label="Calls today" value={data?.today_calls ?? 0} hint={`${data?.week_calls ?? 0} this week`} />
            <StatCard icon={PhoneMissed} label="Missed today" value={data?.missed_calls_today ?? 0} accent="destructive" />
            <StatCard icon={Clock} label="Talk time today" value={fmtDuration(data?.total_talk_seconds_today ?? 0)} accent="primary" />
            <StatCard icon={Voicemail} label="Unread voicemail" value={data?.unread_voicemail ?? 0} accent="amber-500" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Recent calls</CardTitle>
            <Button asChild size="sm" variant="ghost"><Link to="/my/calls">View all <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            {!isLoading && (data?.recent_calls ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No calls yet.</p>
            )}
            {(data?.recent_calls ?? []).map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 p-2 rounded border">
                <Phone className={`h-4 w-4 ${c.direction === "inbound" ? "text-emerald-500" : "text-blue-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {c.direction === "inbound" ? c.caller_number : c.destination_number}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {timeAgoSafe(c.start_at)} · {fmtDuration(c.duration_seconds ?? 0)}
                    {c.ai_summary && <> · <span className="italic">{String(c.ai_summary).slice(0, 60)}{String(c.ai_summary).length > 60 ? "…" : ""}</span></>}
                  </div>
                </div>
                {(c.missed_call || c.call_status === "missed") && <Badge variant="destructive" className="text-[10px]">Missed</Badge>}
                {c.sentiment && <Badge variant="outline" className="text-[10px]">{c.sentiment}</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><Voicemail className="h-4 w-4 text-amber-500" /> Voicemail</CardTitle>
            <Button asChild size="sm" variant="ghost"><Link to="/my/voicemail">Open <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            {!isLoading && (data?.recent_voicemails ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No voicemails.</p>
            )}
            {(data?.recent_voicemails ?? []).map((v: any) => (
              <div key={v.id} className={`p-2 rounded border ${!v.read_at ? "border-l-4 border-l-primary" : ""}`}>
                <div className="text-sm font-medium truncate">{v.caller_name || v.caller_number || "Unknown"}</div>
                <div className="text-xs text-muted-foreground">
                  {timeAgoSafe(v.received_at)} · {fmtDuration(v.duration_seconds ?? 0)}
                </div>
                {v.ai_summary && <div className="text-xs italic mt-1 line-clamp-2">{v.ai_summary}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><Headphones className="h-4 w-4 text-primary" /> Recent recordings</CardTitle>
            <Button asChild size="sm" variant="ghost"><Link to="/my/recordings">View all <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            {!isLoading && (data?.recent_recordings ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No recordings.</p>
            )}
            {(data?.recent_recordings ?? []).map((r: any) => (
              <div key={r.id} className="flex items-center gap-2 p-2 rounded border">
                <Headphones className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{r.recording_name ?? r.id}</div>
                  <div className="text-xs text-muted-foreground">
                    {timeAgoSafe(r.recorded_at || r.start_at)} · {fmtDuration(r.duration_seconds ?? 0)}
                  </div>
                </div>
                <div className="flex gap-1">
                  {r.transcribed && <Badge variant="outline" className="text-[10px]">T</Badge>}
                  {r.analyzed && <Badge variant="outline" className="text-[10px]">AI</Badge>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            {!isLoading && (data?.recent_insights ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No insights yet — start a few calls.</p>
            )}
            {(data?.recent_insights ?? []).map((i: any) => (
              <div key={i.id} className="p-2 rounded border bg-primary/5">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">AI</Badge>
                  {i.sentiment && <Badge variant="secondary" className="text-[10px]">{i.sentiment}</Badge>}
                </div>
                <div className="text-xs">{i.summary}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5" /> Quick access
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quick.map((q) => (
            <Card key={q.to} className="hover:border-primary/40 transition-colors">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><q.icon className="h-4 w-4 text-primary" /> {q.title}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">{q.desc}</p>
                <Button asChild size="sm" variant="outline"><Link to={q.to}>Open <ArrowRight className="ml-1 h-3 w-3" /></Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
