import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ShieldCheck, Eye, Pencil, FlaskConical, Plus, Trash2, EyeOff } from 'lucide-react';

interface AuditRow {
  id: string;
  actor_email: string | null;
  provider: string;
  action: string;
  field_changed: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  metadata: any;
}

const ACTION_META: Record<string, { label: string; icon: any; tone: string }> = {
  create:  { label: 'Created', icon: Plus,         tone: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  update:  { label: 'Updated', icon: Pencil,       tone: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  delete:  { label: 'Deleted', icon: Trash2,       tone: 'bg-red-500/15 text-red-400 border-red-500/30' },
  view:    { label: 'Viewed',  icon: Eye,          tone: 'bg-muted text-muted-foreground' },
  reveal:  { label: 'Revealed',icon: EyeOff,       tone: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  test:    { label: 'Tested',  icon: FlaskConical, tone: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
};

export default function ProviderAuditLog() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [provider, setProvider] = useState<string>('all');
  const [action, setAction] = useState<string>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let q = supabase.from('provider_credentials_audit').select('*').order('created_at', { ascending: false }).limit(200);
    if (provider !== 'all') q = q.eq('provider', provider);
    if (action !== 'all') q = q.eq('action', action);
    q.then(({ data }) => setRows((data as AuditRow[]) || []));
  }, [provider, action]);

  const filtered = (rows || []).filter((r) =>
    !query || r.actor_email?.toLowerCase().includes(query.toLowerCase()) || r.field_changed?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Credential audit log</CardTitle>
        <CardDescription>Every change, reveal, and connection test on provider credentials is recorded here. Last 200 events.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-2">
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger><SelectValue placeholder="All providers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              <SelectItem value="twilio">Twilio</SelectItem>
              <SelectItem value="telnyx">Telnyx</SelectItem>
              <SelectItem value="skyetel">Skyetel</SelectItem>
              <SelectItem value="voipms">VoIP.ms</SelectItem>
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(ACTION_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Search by user or field…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {!rows && <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>}
        {rows && filtered.length === 0 && (
          <div className="text-center py-10 text-sm text-muted-foreground">No audit events match these filters.</div>
        )}

        <div className="divide-y divide-border/60 rounded-md border border-border/60 overflow-hidden">
          {filtered.map((r) => {
            const meta = ACTION_META[r.action] || { label: r.action, icon: Pencil, tone: 'bg-muted' };
            const Icon = meta.icon;
            return (
              <div key={r.id} className="flex items-start gap-3 p-3 hover:bg-muted/30">
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${meta.tone}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{r.actor_email || 'Unknown user'}</span>
                    <Badge variant="outline" className={meta.tone}>{meta.label}</Badge>
                    <Badge variant="secondary" className="capitalize">{r.provider}</Badge>
                    {r.field_changed && <code className="text-xs px-1.5 py-0.5 rounded bg-muted">{r.field_changed}</code>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                    {r.ip && <span>IP {r.ip}</span>}
                    {r.user_agent && <span className="truncate max-w-[260px]" title={r.user_agent}>{r.user_agent.split(' ')[0]}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
