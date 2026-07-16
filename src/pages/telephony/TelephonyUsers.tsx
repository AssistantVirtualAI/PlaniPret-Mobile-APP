import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Users, Plus, Mail, KeyRound, Settings as SettingsIcon, Trash2, RefreshCw,
  Loader2, ShieldAlert, CheckCircle2, AlertCircle, Smartphone, Apple, Monitor,
  Globe, Laptop, Send, Copy, X, Link2, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { useLemtelAccess } from '@/hooks/useLemtelAccess';

const LEMTEL_ORG = '71755d33-ed64-4ad5-a828-61c9d2029eb7';
const DEFAULT_OUTBOUND_CID = '15144942888';

function generatePassword(len = 16) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function PlatformIcons({ platforms }: { platforms: string[] }) {
  const map: Record<string, JSX.Element> = {
    ios: <Smartphone key="ios" className="w-3.5 h-3.5" />,
    android: <Smartphone key="android" className="w-3.5 h-3.5" />,
    mac: <Apple key="mac" className="w-3.5 h-3.5" />,
    windows: <Monitor key="windows" className="w-3.5 h-3.5" />,
    linux: <Monitor key="linux" className="w-3.5 h-3.5" />,
    web: <Globe key="web" className="w-3.5 h-3.5" />,
  };
  if (!platforms?.length) return <span className="text-xs text-muted-foreground">—</span>;
  return <div className="flex gap-1 text-muted-foreground">{platforms.map(p => map[p] ?? <span key={p}>{p}</span>)}</div>;
}

interface UserRow {
  id: string;
  portal_user_id: string | null;
  extension: string;
  display_name: string | null;
  status: string | null;
  last_seen_at: string | null;
  active_platforms: string[] | null;
  account_status: string | null;
  total_calls: number | null;
  app_access_enabled?: boolean | null;
  desktop_access_enabled?: boolean | null;
  mobile_access_enabled?: boolean | null;
  email?: string | null;
}

function useSoftphoneUsers() {
  return useQuery({
    queryKey: ['lemtel', 'softphone-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pbx_softphone_users' as any)
        .select('id, portal_user_id, extension, display_name, status, last_seen_at, active_platforms, account_status, total_calls, app_access_enabled, desktop_access_enabled, mobile_access_enabled')
        .eq('organization_id', LEMTEL_ORG)
        .order('extension');
      if (error) throw error;
      const ids = (data || []).map((d: any) => d.portal_user_id).filter(Boolean);
      let emailMap: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', ids);
        emailMap = Object.fromEntries((profs || []).map((p: any) => [p.id, p.email]));
      }
      return (data || []).map((d: any) => ({ ...d, email: d.portal_user_id ? emailMap[d.portal_user_id] : null })) as UserRow[];
    },
  });
}

export default function TelephonyUsers() {
  const { isAdmin } = useLemtelAccess();
  const { data: users = [], isLoading, refetch } = useSoftphoneUsers();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const stats = useMemo(() => {
    const total = users.length;
    const online = users.filter(u => u.status === 'online').length;
    const offline = total - online;
    const pending = users.filter(u => !u.last_seen_at).length;
    return { total, online, offline, pending };
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(u =>
      !q || u.extension?.includes(q) ||
      u.display_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const nextExtension = useMemo(() => {
    const nums = users.map(u => parseInt(u.extension)).filter(n => !isNaN(n) && n >= 300 && n < 1000).sort((a, b) => a - b);
    let next = 300;
    for (const n of nums) { if (n === next) next++; else break; }
    return String(next);
  }, [users]);

  // Realtime: refresh on new provisioning
  useEffect(() => {
    const ch = supabase
      .channel('softphone-users')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pbx_softphone_users' }, () => {
        qc.invalidateQueries({ queryKey: ['lemtel', 'softphone-users'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const resendWelcome = async (u: UserRow) => {
    if (!u.email) { toast.error('No email on file'); return; }
    toast.loading('Resending welcome…', { id: u.id });
    const { data, error } = await supabase.functions.invoke('provision-softphone-user', {
      body: { email: u.email, display_name: u.display_name || `Ext ${u.extension}`, extension: u.extension },
    });
    if (error || (data as any)?.error) toast.error((data as any)?.message || error?.message || 'Failed', { id: u.id });
    else toast.success(`Welcome email sent to ${u.email}`, { id: u.id });
  };

  const sendInvite = async (u: UserRow) => {
    const choice = window.prompt(
      `Send Lemtel setup invitation to ${u.display_name || u.extension}?\n\nLink validity (hours): 24, 72, 168 (7d), 720 (30d)`,
      '168'
    );
    if (choice === null) return;
    const ttl_hours = Math.max(1, Math.min(parseInt(choice, 10) || 168, 720));

    toast.loading(`Sending invitation (${ttl_hours}h)…`, { id: `inv-${u.id}` });
    const { data, error } = await supabase.functions.invoke('lemtel-invite-send', {
      body: { softphone_user_id: u.id, ttl_hours },
    });
    const payload = data as any;
    if (error || payload?.error) {
      toast.error(payload?.detail || payload?.error || error?.message || 'Failed to send invitation', { id: `inv-${u.id}` });
      return;
    }
    if (payload?.email_sent === false) {
      toast.warning(`Link created but email failed: ${payload?.email_error || 'unknown'}`, { id: `inv-${u.id}`, duration: 8000 });
    } else {
      toast.success(`Invitation sent to ${payload.email} — expires ${new Date(payload.expires_at).toLocaleString()}`, { id: `inv-${u.id}` });
    }
    qc.invalidateQueries({ queryKey: ['lemtel', 'invites'] });
  };

  const resetPassword = async (u: UserRow) => {
    if (!u.email) { toast.error('No email on file'); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(u.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success(`Password reset email sent to ${u.email}`);
  };

  const syncSipPassword = async (u: UserRow) => {
    toast.loading('Syncing PBX password to apps…', { id: u.id });
    const { data, error } = await supabase.functions.invoke('set-unified-password', {
      body: { softphone_id: u.id, use_current_sip_password: true, source: 'admin_sync_sip' },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.message || error?.message || 'Failed', { id: u.id });
    } else {
      toast.success(`Password unified for ext ${u.extension}`, { id: u.id });
      refetch();
    }
  };

  const togglePlatformAccess = async (u: UserRow, platform: 'app' | 'desktop' | 'mobile', enabled: boolean) => {
    const { data, error } = await supabase.rpc('set_softphone_platform_access' as any, {
      _softphone_id: u.id, _platform: platform, _enabled: enabled,
    });
    if (error || (data as any)?.ok === false) {
      toast.error(error?.message || 'Failed to update access');
    } else {
      const label = platform === 'app' ? 'App' : platform === 'desktop' ? 'Desktop' : 'Mobile';
      toast.success(enabled ? `${label} access enabled` : `${label} access disabled`);
      qc.invalidateQueries({ queryKey: ['lemtel', 'softphone-users'] });
    }
  };

  const deactivate = async (u: UserRow) => {
    if (!confirm(`Deactivate ${u.display_name || u.extension}?`)) return;
    const { error } = await supabase
      .from('pbx_softphone_users' as any)
      .update({ account_status: 'inactive' })
      .eq('id', u.id);
    if (error) toast.error(error.message);
    else { toast.success('Deactivated'); refetch(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Users className="w-7 h-7" /> Team Members</h1>
          <p className="text-muted-foreground">Manage softphone users across all platforms</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!isAdmin} onClick={async () => {
            if (!confirm('Push every PBX SIP password into portal/desktop/mobile auth?')) return;
            toast.loading('Unifying passwords…', { id: 'backfill' });
            const { data, error } = await supabase.functions.invoke('unify-passwords-backfill', { body: {} });
            if (error || (data as any)?.error) toast.error((data as any)?.message || error?.message || 'Failed', { id: 'backfill' });
            else toast.success(`Unified ${(data as any)?.updated ?? 0} users`, { id: 'backfill' });
          }}>
            <KeyRound className="w-4 h-4 mr-2" /> Sync all passwords
          </Button>
          <Button onClick={() => setOpen(true)} disabled={!isAdmin}>
            <Plus className="w-4 h-4 mr-2" /> Add User
          </Button>
        </div>
      </div>

      {!isAdmin && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>Lemtel admin or super-admin role required to manage users.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Users', v: stats.total },
          { label: 'Active', v: stats.online },
          { label: 'Offline', v: stats.offline },
          { label: 'Pending Setup', v: stats.pending },
        ].map(s => (
          <Card key={s.label}><CardContent className="pt-6">
            <div className="text-2xl font-bold">{s.v}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{filtered.length} users</CardTitle>
          <Input className="max-w-xs" placeholder="Search name, email, extension…" value={search} onChange={e => setSearch(e.target.value)} />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-muted/40 rounded animate-pulse" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Extension</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Platforms</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead><span className="inline-flex items-center gap-1"><Laptop className="w-3.5 h-3.5" />Desktop</span></TableHead>
                  <TableHead><span className="inline-flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" />Mobile</span></TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold grid place-items-center">
                        {initials(u.display_name || u.email || u.extension)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{u.display_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{u.email || 'No email'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono bg-amber-500/10 text-amber-600 border-amber-500/30">{u.extension}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span className={`w-2 h-2 rounded-full ${u.status === 'online' ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                        {u.account_status === 'inactive' ? 'Inactive' : (u.status || 'offline')}
                      </span>
                    </TableCell>
                    <TableCell><PlatformIcons platforms={u.active_platforms || []} /></TableCell>
                    <TableCell>
                      <Switch
                        checked={u.app_access_enabled !== false}
                        disabled={!isAdmin}
                        onCheckedChange={(v) => togglePlatformAccess(u, 'app', v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.desktop_access_enabled !== false}
                        disabled={!isAdmin || u.app_access_enabled === false}
                        onCheckedChange={(v) => togglePlatformAccess(u, 'desktop', v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.mobile_access_enabled !== false}
                        disabled={!isAdmin || u.app_access_enabled === false}
                        onCheckedChange={(v) => togglePlatformAccess(u, 'mobile', v)}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.last_seen_at ? formatDistanceToNow(new Date(u.last_seen_at), { addSuffix: true }) : <span className="text-amber-600">Pending</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" title="Sync PBX password to portal/desktop/mobile" onClick={() => syncSipPassword(u)} disabled={!isAdmin}><RefreshCw className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" title="Send setup invitation (Lemtel branded)" onClick={() => sendInvite(u)} disabled={!isAdmin}><Send className="w-4 h-4 text-primary" /></Button>
                        <Button size="icon" variant="ghost" title="Resend welcome" onClick={() => resendWelcome(u)} disabled={!isAdmin}><Mail className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" title="Reset password (email)" onClick={() => resetPassword(u)} disabled={!isAdmin}><KeyRound className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" title="Deactivate" onClick={() => deactivate(u)} disabled={!isAdmin}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!filtered.length && (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No users yet — click <b>Add User</b> to provision one.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InvitesTable isAdmin={isAdmin} />

      <AddUserDialog open={open} onOpenChange={setOpen} suggestedExtension={nextExtension} />
    </div>
  );
}

// ===================================================================
// Invitations table (sent setup links, with resend / revoke)
// ===================================================================
type InviteRow = {
  id: string;
  softphone_user_id: string;
  email: string;
  status: 'pending' | 'sent' | 'viewed' | 'used' | 'expired' | 'revoked';
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  email_sent: boolean;
  email_error: string | null;
  setup_url: string;
};

function InvitesTable({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: invites = [], isLoading } = useQuery({
    queryKey: ['lemtel', 'invites'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('lemtel-invite-list', { body: {} });
      if (error) throw error;
      return ((data as any)?.invites || []) as InviteRow[];
    },
    refetchInterval: 30_000,
  });

  const STATUS_STYLE: Record<InviteRow['status'], string> = {
    pending: 'bg-slate-100 text-slate-700',
    sent: 'bg-blue-100 text-blue-700',
    viewed: 'bg-amber-100 text-amber-800',
    used: 'bg-emerald-100 text-emerald-700',
    expired: 'bg-slate-200 text-slate-500',
    revoked: 'bg-rose-100 text-rose-700',
  };

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success('Setup link copied'); } catch { toast.error('Copy failed'); }
  };

  const resend = async (inv: InviteRow) => {
    toast.loading('Resending…', { id: `re-${inv.id}` });
    const { data, error } = await supabase.functions.invoke('lemtel-invite-send', {
      body: { softphone_user_id: inv.softphone_user_id, ttl_hours: 168 },
    });
    const p = data as any;
    if (error || p?.error) toast.error(p?.detail || p?.error || error?.message || 'Failed', { id: `re-${inv.id}` });
    else toast.success(`Resent to ${p.email}`, { id: `re-${inv.id}` });
    qc.invalidateQueries({ queryKey: ['lemtel', 'invites'] });
  };

  const revoke = async (inv: InviteRow) => {
    if (!confirm(`Revoke invitation for ${inv.email}? The link will stop working immediately.`)) return;
    toast.loading('Revoking…', { id: `rv-${inv.id}` });
    const { data, error } = await supabase.functions.invoke('lemtel-invite-revoke', { body: { invite_id: inv.id } });
    const p = data as any;
    if (error || p?.error) toast.error(p?.detail || p?.error || error?.message || 'Failed', { id: `rv-${inv.id}` });
    else toast.success('Invitation revoked', { id: `rv-${inv.id}` });
    qc.invalidateQueries({ queryKey: ['lemtel', 'invites'] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Send className="w-4 h-4" /> Setup invitations</CardTitle>
        <Badge variant="outline">{invites.length} total</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />)}</div>
        ) : invites.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">No invitations sent yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Views</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map(inv => {
                const dead = inv.status === 'expired' || inv.status === 'revoked' || inv.status === 'used';
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold capitalize ${STATUS_STYLE[inv.status]}`}>{inv.status}</span>
                      {inv.email_sent === false && inv.email_error && (
                        <div className="text-[10px] text-rose-600 mt-0.5 max-w-[220px] truncate" title={inv.email_error}>{inv.email_error}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className={dead ? 'text-muted-foreground' : ''}>
                        <Clock className="inline w-3 h-3 mr-1" />
                        {formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true })}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{inv.view_count}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" title="Copy setup link" onClick={() => copy(inv.setup_url)} disabled={dead}><Copy className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" title="Open setup page" asChild disabled={dead}>
                          <a href={inv.setup_url} target="_blank" rel="noreferrer"><Link2 className="w-4 h-4" /></a>
                        </Button>
                        <Button size="icon" variant="ghost" title="Resend" onClick={() => resend(inv)} disabled={!isAdmin}><RefreshCw className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" title="Revoke" onClick={() => revoke(inv)} disabled={!isAdmin || dead}><X className="w-4 h-4 text-rose-600" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ===================================================================
// Add User wizard
// ===================================================================
function AddUserDialog({ open, onOpenChange, suggestedExtension }: { open: boolean; onOpenChange: (v: boolean) => void; suggestedExtension: string }) {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [extension, setExtension] = useState(suggestedExtension);
  const [sipPassword, setSipPassword] = useState(() => generatePassword());
  const [role, setRole] = useState<'user' | 'agent' | 'client_admin'>('user');
  const [outbound, setOutbound] = useState(true);
  const [recordings, setRecordings] = useState(true);
  const [ai, setAi] = useState(true);
  const [progress, setProgress] = useState<{ step: string; status: 'pending' | 'ok' | 'err' }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      setStep(1); setFullName(''); setEmail('');
      setExtension(suggestedExtension);
      setSipPassword(generatePassword());
      setRole('user'); setOutbound(true); setRecordings(true); setAi(true);
      setProgress([]); setErrorMsg(null);
    }
  }, [open, suggestedExtension]);

  const canNext1 = fullName.trim() && /\S+@\S+\.\S+/.test(email);
  const canNext2 = /^\d{3,11}$/.test(extension) && sipPassword.length >= 8;

  const submit = async () => {
    setSubmitting(true); setErrorMsg(null);
    const steps = [
      { key: 'auth', label: 'Creating account…' },
      { key: 'pbx', label: `Setting up extension ${extension} in FusionPBX…` },
      { key: 'mail', label: `Sending welcome email to ${email}…` },
    ];
    setProgress(steps.map(s => ({ step: s.label, status: 'pending' as const })));

    try {
      const { data, error } = await supabase.functions.invoke('provision-softphone-user', {
        body: {
          email,
          display_name: fullName,
          extension,
          sip_password: sipPassword,
          outbound_caller_id: DEFAULT_OUTBOUND_CID,
          portal_url: `${window.location.origin}/reset-password`,
        },
      });
      if (error) throw new Error(error.message);
      const res = data as any;
      if (res?.error) throw new Error(res.message || res.error);

      setProgress([
        { step: '✅ Account created', status: 'ok' },
        { step: res.extension_uuid ? '✅ Extension provisioned in FusionPBX' : '⚠️ Extension saved locally (FusionPBX skipped)', status: res.extension_uuid ? 'ok' : 'err' },
        { step: res.email_sent ? `✅ Welcome email sent to ${email}` : '⚠️ Email not sent (check Resend secret)', status: res.email_sent ? 'ok' : 'err' },
      ]);

      toast.success(`✅ ${fullName} (Ext. ${extension}) is now ready`);
      qc.invalidateQueries({ queryKey: ['lemtel', 'softphone-users'] });
      qc.invalidateQueries({ queryKey: ['pbx'] });
      setTimeout(() => onOpenChange(false), 1200);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Provisioning failed');
      setProgress(p => p.map(x => x.status === 'pending' ? { ...x, status: 'err' } : x));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add User — Step {step} of 4</DialogTitle>
          <DialogDescription>Provision a softphone user across all platforms</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Full Name *</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Mohamad Hassoun" /></div>
            <div className="space-y-2"><Label>Email *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@company.com" /></div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Extension Number *</Label>
              <Input value={extension} onChange={e => setExtension(e.target.value.replace(/\D/g, ''))} placeholder="300" inputMode="numeric" />
              <p className="text-xs text-muted-foreground">Next available: {suggestedExtension}</p>
            </div>
            <div className="space-y-2">
              <Label>SIP Password *</Label>
              <div className="flex gap-2">
                <Input value={sipPassword} onChange={e => setSipPassword(e.target.value)} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => setSipPassword(generatePassword())}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={v => setRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="client_admin">Client Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {[
              { label: 'Can make outbound calls', v: outbound, set: setOutbound },
              { label: 'Can view recordings', v: recordings, set: setRecordings },
              { label: 'Can access AI insights', v: ai, set: setAi },
            ].map(t => (
              <div key={t.label} className="flex items-center justify-between">
                <Label>{t.label}</Label>
                <Switch checked={t.v} onCheckedChange={t.set} />
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 py-2">
            <div className="rounded-md border p-4 bg-muted/30 space-y-2 text-sm">
              <div className="font-medium">Will create:</div>
              <div>✅ Supabase account for <b>{email}</b></div>
              <div>✅ FusionPBX extension <b>{extension}</b></div>
              <div>✅ Softphone access on all platforms (iOS, Android, Mac, Windows, Linux, Web)</div>
              <div>✅ Welcome email with download links</div>
            </div>

            {progress.length > 0 && (
              <div className="rounded-md border p-3 space-y-1 text-sm">
                {progress.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {p.status === 'pending' && <Loader2 className="w-3 h-3 animate-spin" />}
                    {p.status === 'ok' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                    {p.status === 'err' && <AlertCircle className="w-3 h-3 text-destructive" />}
                    <span>{p.step}</span>
                  </div>
                ))}
              </div>
            )}

            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          {step > 1 && step < 4 && <Button variant="outline" onClick={() => setStep(s => s - 1)}>Back</Button>}
          {step < 4 && (
            <Button onClick={() => setStep(s => s + 1)} disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}>
              Next
            </Button>
          )}
          {step === 4 && (
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              ✅ Create User & Send Welcome Email
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
