import { useEffect, useMemo, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ExtensionsPanel, type LiveExt, type LiveState } from '@/components/lemtel/ExtensionsPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Search, Building2, Loader2, Globe, RefreshCw, ChevronRight, Pencil, Trash2, LogIn, Link2 } from 'lucide-react';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { LEMTEL_ORG } from '@/hooks/usePbxData';

const BASE_DOMAIN = 'lemtel.tel';
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

type Domain = {
  domain_uuid: string;
  domain_name: string;
  domain_description?: string;
  domain_enabled?: string | boolean;
};

type Ext = {
  extension: string;
  effective_cid_name: string | null;
  effective_cid_number: string | null;
  enabled: boolean | null;
  description: string | null;
  domain_uuid: string | null;
};

export default function LemtelCustomers() {
  const qc = useQueryClient();
  const impersonation = useImpersonation();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', domain: '', adminEmail: '', adminPassword: '',
    adminFirstName: '', adminLastName: '', adminPhone: '',
    companyName: '', address: '', city: '', province: '', postal: '',
    phoneNumbersText: '', notes: '',
  });
  const [domainTouched, setDomainTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState<string | null>(null);
  const [editDomain, setEditDomain] = useState<Domain | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editEnabled, setEditEnabled] = useState(true);
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [success, setSuccess] = useState<null | {
    orgId: string; orgName: string; slug?: string;
    domainName: string; adminEmail: string;
    adminUserId?: string | null; inviteUrl?: string | null;
  }>(null);
  const [mintLoading, setMintLoading] = useState<'desktop' | 'mobile' | null>(null);
  const [mintedLinks, setMintedLinks] = useState<{ desktop?: string; mobile?: string }>({});

  // 1) FusionPBX domains (live, via proxy)
  const { data: domains = [], isLoading: loadingDomains, refetch: refetchDomains } = useQuery({
    queryKey: ['fusionpbx', 'list-domains'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'list-domains' },
      });
      if (error) throw error;
      const arr = (data?.domains || data?.data?.domains || data?.data || []) as Domain[];
      return Array.isArray(arr) ? arr : [];
    },
  });

  // 2) Local extension cache (for counts + expand)
  const { data: extensions = [] } = useQuery({
    queryKey: ['pbx_extensions', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pbx_extensions')
        .select('extension,effective_cid_name,effective_cid_number,enabled,description,domain_uuid')
        .order('extension');
      if (error) throw error;
      return (data || []) as Ext[];
    },
  });

  // 3) Org map (link domain -> tenant)
  const { data: orgs = [] } = useQuery({
    queryKey: ['organizations', 'fpbx-map'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_org_pbx_mapping');
      if (error) throw error;
      return data || [];
    },
  });

  // Slugs for cockpit deep-link (RLS-safe — anyone who can see customers can see slugs)
  const { data: orgSlugs = [] } = useQuery({
    queryKey: ['organizations', 'slugs'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('organizations').select('id,slug');
      return data || [];
    },
  });

  const orgByDomain = useMemo(() => {
    const slugById = new Map<string, string>();
    for (const s of orgSlugs as any[]) slugById.set(s.id, s.slug);
    const m = new Map<string, { id: string; name: string; slug?: string }>();
    for (const o of orgs as any[]) {
      if (o.fusionpbx_domain_uuid) m.set(o.fusionpbx_domain_uuid, { id: o.id, name: o.name, slug: slugById.get(o.id) });
    }
    return m;
  }, [orgs, orgSlugs]);


  const extsByDomain = useMemo(() => {
    const m = new Map<string, Ext[]>();
    for (const e of extensions) {
      const k = e.domain_uuid || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return m;
  }, [extensions]);

  // Live extensions per domain (fans out list-extensions in parallel)
  const { data: liveExtMap = {}, isLoading: loadingCounts, refetch: refetchLive } = useQuery<Record<string, LiveState>>({
    queryKey: ['fusionpbx', 'ext-live', (domains as Domain[]).map(d => d.domain_uuid).sort().join(',')],
    enabled: (domains as Domain[]).length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out: Record<string, LiveState> = {};
      await Promise.all((domains as Domain[]).map(async (d) => {
        try {
          const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
            body: { action: 'list-extensions', domain_uuid: d.domain_uuid },
          });
          if (error) throw error;
          const arr = (data?.extensions || data?.data?.extensions || data?.data || []) as LiveExt[];
          out[d.domain_uuid] = { exts: Array.isArray(arr) ? arr : [] };
        } catch (e: any) {
          out[d.domain_uuid] = { exts: [], error: e?.message || 'PBX unreachable' };
        }
      }));
      return out;
    },
  });


  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (domains as Domain[]).filter(d =>
      (d.domain_name || '').toLowerCase().includes(s) ||
      (d.domain_description || '').toLowerCase().includes(s) ||
      (orgByDomain.get(d.domain_uuid)?.name || '').toLowerCase().includes(s)
    );
  }, [domains, search, orgByDomain]);

  const onNameChange = (name: string) => {
    setForm(f => ({
      ...f,
      name,
      domain: domainTouched ? f.domain : (slugify(name) ? `${slugify(name)}.${BASE_DOMAIN}` : ''),
    }));
  };

  const handleCreate = async () => {
    if (!form.name || !form.domain) return toast.error('Name and domain required');
    setSaving(true);
    try {
      // 1) Create the FusionPBX domain
      const { data: res, error: fnErr } = await supabase.functions.invoke('pbx-write', {
        body: {
          organizationId: LEMTEL_ORG,
          action: 'create-domain',
          params: { domain_name: form.domain, domain_enabled: true, domain_description: `Customer: ${form.name}` },
        },
      });
      if (fnErr || (res as any)?.error) throw new Error((fnErr as any)?.message || (res as any)?.error || 'create-domain failed');
      const domainUuid = (res as any)?.data?.domain_uuid || (res as any)?.domain_uuid || null;
      toast.success(`Domain ${form.domain} created`);

      // 2) Auto-create the matching tenant organization
      let tenantOrgId: string | null = null;
      if (domainUuid) {
        const { data: newOrgId, error: orgErr } = await (supabase as any).rpc('setup_customer_organization', {
          _name: form.name,
          _slug: slugify(form.name),
          _domain_uuid: domainUuid,
          _domain_name: form.domain,
          _admin_email: form.adminEmail || null,
        });
        if (orgErr) toast.error('Tenant org link failed: ' + orgErr.message);
        else {
          tenantOrgId = newOrgId as string;
          toast.success('Tenant organization linked');
        }
      } else {
        toast.warning('Could not link tenant org (missing domain_uuid in PBX response)');
      }

      // 3) Optionally invite the admin (sends email + assigns role)
      let adminUserId: string | null = null;
      let inviteUrl: string | null = null;
      if (form.adminEmail && tenantOrgId) {
        const fullName = `${form.adminFirstName} ${form.adminLastName}`.trim() || undefined;
        const { data: invData, error: invErr } = await supabase.functions.invoke('customer-invite-admin', {
          body: { organizationId: tenantOrgId, email: form.adminEmail, fullName },
        });
        if (invErr) toast.error('Invite failed: ' + invErr.message);
        else {
          toast.success(`Invite sent to ${form.adminEmail}`);
          adminUserId = (invData as any)?.user_id || null;
          inviteUrl = (invData as any)?.invite_url || null;
        }
      }


      // 4) Persist customer record with company/address/phones/admin
      if (domainUuid) {
        const phones = form.phoneNumbersText
          .split(/[,\n]/).map(s => s.trim()).filter(Boolean);
        const addressLine = [form.address, form.city, form.province, form.postal]
          .map(s => (s || '').trim()).filter(Boolean).join(', ');
        const { error: custErr } = await (supabase as any).from('lemtel_customers').insert({
          name: form.name,
          company_name: form.companyName || form.name,
          address: addressLine || null,
          phone_numbers: phones,
          domain_uuid: domainUuid,
          domain_name: form.domain,
          admin_email: form.adminEmail || null,
          email: form.adminEmail || null,
          status: 'active',
          plan: 'basic',
          portal_enabled: !!tenantOrgId,
        });
        if (custErr) toast.error('Customer record save failed: ' + custErr.message);

        // Best-effort DID provisioning
        for (const n of phones) {
          const { error: didErr } = await (supabase as any).from('lemtel_dids').insert({ number: n });
          if (didErr) toast.warning(`DID ${n}: ${didErr.message}`);
        }
      }

      // 5) Show success screen with portal + app invite generators
      if (tenantOrgId) {
        const slug = slugify(form.name);
        setSuccess({
          orgId: tenantOrgId, orgName: form.name, slug,
          domainName: form.domain, adminEmail: form.adminEmail,
          adminUserId, inviteUrl,
        });
        setMintedLinks({});
      }

      setForm({
        name: '', domain: '', adminEmail: '', adminPassword: '',
        adminFirstName: '', adminLastName: '', adminPhone: '',
        companyName: '', address: '', city: '', province: '', postal: '',
        phoneNumbersText: '', notes: '',
      });
      setDomainTouched(false);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['fusionpbx', 'list-domains'] });
      qc.invalidateQueries({ queryKey: ['organizations', 'fpbx-map'] });
    } catch (e: any) {
      toast.error(e.message || 'Failed to create customer');
    } finally { setSaving(false); }
  };

  const mintAppInvite = async (app: 'desktop' | 'mobile') => {
    if (!success?.adminUserId) {
      toast.error('Admin user not provisioned yet. They must accept the email invite first.');
      return;
    }
    setMintLoading(app);
    try {
      const { data, error } = await supabase.functions.invoke('mint-app-login-token', {
        body: { target_user_id: success.adminUserId, organization_id: success.orgId, app },
      });
      if (error) throw error;
      const token = (data as any)?.token;
      if (!token) throw new Error('No token returned');
      const scheme = app === 'desktop' ? 'ava-desktop' : 'ava-mobile';
      const httpsFallback = `https://avastatistic.ca/app-login?token=${token}&app=${app}`;
      const deepLink = `${scheme}://invite?token=${token}`;
      const url = `${deepLink}\n\nFallback: ${httpsFallback}`;
      setMintedLinks(s => ({ ...s, [app]: httpsFallback }));
      await navigator.clipboard.writeText(httpsFallback);
      toast.success(`${app === 'desktop' ? 'Desktop' : 'Mobile'} invite link copied`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to mint invite token');
    } finally { setMintLoading(null); }
  };

  const manageAs = async (d: Domain) => {
    const org = orgByDomain.get(d.domain_uuid);
    if (!org) {
      toast.error('No tenant org linked. Edit the customer to link or recreate.');
      return;
    }
    sessionStorage.setItem('lemtel.activeDomain', JSON.stringify({ uuid: d.domain_uuid, name: d.domain_name, org_id: org.id }));
    await impersonation.enter(org.id, org.name);
    toast.success(`Now managing ${d.domain_name}`);
    window.location.href = '/console';
  };

  const copyPortalLink = (d: Domain) => {
    const url = `${window.location.origin}/c/${encodeURIComponent(d.domain_name)}`;
    navigator.clipboard.writeText(url);
    toast.success('Portal link copied: ' + url);
  };

  const toggleExpand = (uuid: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(uuid) ? n.delete(uuid) : n.add(uuid);
      return n;
    });
  };

  const syncDomain = async (d: Domain) => {
    setSyncing(d.domain_uuid);
    try {
      const org = orgByDomain.get(d.domain_uuid);
      await supabase.functions.invoke('fusionpbx-proxy', {
        body: {
          action: 'sync-all',
          resources: ['extensions', 'queues', 'ivrs', 'ring_groups'],
          organization_id: org?.id || LEMTEL_ORG,
          domain_uuid: d.domain_uuid,
        },
      });
      toast.success(`Synced ${d.domain_name}`);
      qc.invalidateQueries({ queryKey: ['pbx_extensions', 'all'] });
    } catch (e: any) {
      toast.error('Sync failed: ' + (e?.message || 'unknown'));
    } finally { setSyncing(null); }
  };

  const openEdit = (d: Domain) => {
    setEditDomain(d);
    setEditDesc(d.domain_description || '');
    setEditEnabled(d.domain_enabled === true || d.domain_enabled === 'true');
  };

  const saveEdit = async () => {
    if (!editDomain) return;
    setEditSaving(true);
    try {
      const { error } = await supabase.functions.invoke('pbx-write', {
        body: {
          organizationId: LEMTEL_ORG,
          action: 'update-domain',
          params: {
            domain_uuid: editDomain.domain_uuid,
            domain_description: editDesc,
            domain_enabled: editEnabled,
          },
        },
      });
      if (error) throw error;
      toast.success('Domain updated');
      setEditDomain(null);
      qc.invalidateQueries({ queryKey: ['fusionpbx', 'list-domains'] });
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    } finally { setEditSaving(false); }
  };

  const deleteDomain = async (d: Domain) => {
    if (!confirm(`Delete domain ${d.domain_name}? This removes all extensions on the PBX.`)) return;
    setDeleting(d.domain_uuid);
    try {
      const { error } = await supabase.functions.invoke('pbx-write', {
        body: {
          organizationId: LEMTEL_ORG,
          action: 'delete-domain',
          params: { domain_uuid: d.domain_uuid },
        },
      });
      if (error) throw error;
      toast.success(`Deleted ${d.domain_name}`);
      qc.invalidateQueries({ queryKey: ['fusionpbx', 'list-domains'] });
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    } finally { setDeleting(null); }
  };

  return (
    <div className="space-y-6 w-full min-w-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Building2 className="w-7 h-7" /> Customers</h1>
          <p className="text-muted-foreground">Every FusionPBX domain on this server — each is a tenant with its own extensions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetchDomains()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> New Customer</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add Customer (provisions FusionPBX domain)</DialogTitle></DialogHeader>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                <div><Label>Business Name *</Label><Input value={form.name} onChange={e => onNameChange(e.target.value)} /></div>
                <div><Label>Company / Legal Name</Label><Input value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} placeholder="Defaults to business name" /></div>
                <div>
                  <Label className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> SIP Domain *</Label>
                  <Input
                    value={form.domain}
                    placeholder={`customer.${BASE_DOMAIN}`}
                    onChange={e => { setDomainTouched(true); setForm({ ...form, domain: e.target.value.trim().toLowerCase() }); }}
                  />
                </div>
                <div>
                  <Label>Phone numbers to port (comma or newline separated)</Label>
                  <textarea
                    className="w-full min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm"
                    value={form.phoneNumbersText}
                    onChange={e => setForm({ ...form, phoneNumbersText: e.target.value })}
                    placeholder="+15145551234, +15145559876"
                  />
                </div>
                <div>
                  <Label>Address (street)</Label>
                  <Input
                    value={form.address}
                    onChange={e => setForm({ ...form, address: e.target.value })}
                    placeholder="123 Rue Principale"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label>City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                  <div><Label>Province</Label><Input value={form.province} onChange={e => setForm({ ...form, province: e.target.value })} placeholder="QC" /></div>
                  <div><Label>Postal</Label><Input value={form.postal} onChange={e => setForm({ ...form, postal: e.target.value })} placeholder="H1A 1A1" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Admin first name *</Label><Input value={form.adminFirstName} onChange={e => setForm({ ...form, adminFirstName: e.target.value })} /></div>
                  <div><Label>Admin last name *</Label><Input value={form.adminLastName} onChange={e => setForm({ ...form, adminLastName: e.target.value })} /></div>
                </div>
                <div>
                  <Label>Admin email *</Label>
                  <Input
                    type="email"
                    value={form.adminEmail}
                    placeholder="admin@customer.com"
                    onChange={e => setForm({ ...form, adminEmail: e.target.value.trim().toLowerCase() })}
                  />
                </div>
                <div>
                  <Label>Admin phone</Label>
                  <Input
                    type="tel"
                    value={form.adminPhone}
                    placeholder="+1 514 555 1234"
                    onChange={e => setForm({ ...form, adminPhone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Notes (internal)</Label>
                  <textarea
                    className="w-full min-h-[50px] rounded-md border bg-background px-3 py-2 text-sm"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Admin password (optional — leave blank to send magic-link invite)</Label>
                  <Input
                    type="password"
                    value={form.adminPassword}
                    placeholder="min 12 chars"
                    onChange={e => setForm({ ...form, adminPassword: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create on PBX
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>{filtered.length} domain{filtered.length === 1 ? '' : 's'}</CardTitle>
            <div className="relative w-72 max-w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search domains, tenants…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingDomains ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>PBX Domain</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="text-right">Extensions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No PBX domains returned. Check FusionPBX credentials.</TableCell></TableRow>
                ) : filtered.flatMap((d) => {
                  const org = orgByDomain.get(d.domain_uuid);
                  const exts = extsByDomain.get(d.domain_uuid) || [];
                  const live = (liveExtMap as Record<string, LiveState>)[d.domain_uuid];
                  const hasLive = !!live && !live.error;
                  const liveErr = live?.error;
                  const displayCount = hasLive ? live!.exts.length : exts.length;

                  const enabled = d.domain_enabled === true || d.domain_enabled === 'true';
                  const clickable = !!org;
                  const isOpen = expanded.has(d.domain_uuid);
                  return [
                    <TableRow
                      key={d.domain_uuid}
                      className={clickable ? "cursor-pointer hover:bg-muted/40" : "opacity-80"}
                      title={clickable ? "Click row to open customer portal — chevron to view extensions" : "No tenant org linked"}
                      onClick={() => { if (clickable) manageAs(d); else toast.error('No tenant org linked. Edit the customer to link or recreate.'); }}
                    >
                      <TableCell>
                        <button
                          aria-label={isOpen ? 'Collapse extensions' : 'Expand extensions'}
                          onClick={(e) => { e.stopPropagation(); toggleExpand(d.domain_uuid); }}
                          className="p-0.5 hover:bg-muted rounded"
                        >
                          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-muted-foreground" />{d.domain_name}</div>
                        {d.domain_description && <div className="text-xs text-muted-foreground mt-0.5">{d.domain_description}</div>}
                      </TableCell>
                      <TableCell>
                        {org ? <span className="font-medium">{org.name}</span> : <span className="text-xs text-muted-foreground">— not linked —</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {loadingCounts && !live ? (
                          <Loader2 className="w-3 h-3 animate-spin inline" />
                        ) : liveErr ? (
                          <span className="inline-flex items-center gap-1.5 text-destructive text-xs" title={liveErr}>
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> error
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            {hasLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Live from PBX" />}
                            {displayCount}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost" size="sm" title="Open customer portal"
                          onClick={(e) => { e.stopPropagation(); manageAs(d); }}
                        >
                          <LogIn className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" title="Copy portal link"
                          onClick={(e) => { e.stopPropagation(); copyPortalLink(d); }}
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" title="Sync from PBX"
                          onClick={(e) => { e.stopPropagation(); syncDomain(d); refetchLive(); }}
                          disabled={syncing === d.domain_uuid}
                        >
                          {syncing === d.domain_uuid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        </Button>
                        <Button variant="ghost" size="sm" title="Edit" onClick={(e) => { e.stopPropagation(); openEdit(d); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" title="Delete domain"
                          onClick={(e) => { e.stopPropagation(); deleteDomain(d); }}
                          disabled={deleting === d.domain_uuid}
                        >
                          {deleting === d.domain_uuid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-destructive" />}
                        </Button>
                        <Button asChild variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                          <Link to={`/org/lemtel/admin/customers/${d.domain_uuid}`}>Open</Link>
                        </Button>
                        {orgByDomain.get(d.domain_uuid)?.slug && (
                          <Button asChild variant="secondary" size="sm" onClick={(e) => e.stopPropagation()}>
                            <Link to={`/domain/${orgByDomain.get(d.domain_uuid)!.slug}/admin/dashboard`}>Cockpit</Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>,
                    isOpen ? (
                      <TableRow key={d.domain_uuid + '-exp'} className="bg-muted/20 hover:bg-muted/20">
                        <TableCell />
                        <TableCell colSpan={5} className="py-3">
                          <ExtensionsPanel
                            domainUuid={d.domain_uuid}
                            domainName={d.domain_name}
                            organizationId={org?.id}
                            live={live}
                            loading={loadingCounts && !live}
                            onChanged={() => refetchLive()}
                          />
                        </TableCell>
                      </TableRow>
                    ) : null,
                  ].filter(Boolean) as any;
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editDomain} onOpenChange={(o) => !o && setEditDomain(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editDomain?.domain_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enabled</Label>
              <Switch checked={editEnabled} onCheckedChange={setEditEnabled} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDomain(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving}>
              {editSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!success} onOpenChange={(o) => !o && setSuccess(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>🎉 Customer provisioned</DialogTitle>
          </DialogHeader>
          {success && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                <div><strong>Tenant:</strong> {success.orgName}</div>
                <div><strong>SIP domain:</strong> <code className="text-xs">{success.domainName}</code></div>
                <div><strong>Admin:</strong> {success.adminEmail}</div>
              </div>
              <div className="space-y-2">
                <Label>Customer portal link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={`${window.location.origin}/c/${encodeURIComponent(success.domainName)}`} />
                  <Button variant="outline" size="sm" onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/c/${encodeURIComponent(success.domainName)}`);
                    toast.success('Portal link copied');
                  }}>Copy</Button>
                </div>
              </div>
              {success.inviteUrl && (
                <div className="space-y-2">
                  <Label>Email confirmation link (one-time)</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={success.inviteUrl} />
                    <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(success.inviteUrl!); toast.success('Copied'); }}>Copy</Button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>App invite links</Label>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => mintAppInvite('desktop')} disabled={mintLoading === 'desktop' || !success.adminUserId}>
                    {mintLoading === 'desktop' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                    Copy desktop invite
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => mintAppInvite('mobile')} disabled={mintLoading === 'mobile' || !success.adminUserId}>
                    {mintLoading === 'mobile' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                    Copy mobile invite
                  </Button>
                </div>
                {mintedLinks.desktop && <p className="text-xs text-muted-foreground break-all">🖥️ {mintedLinks.desktop}</p>}
                {mintedLinks.mobile && <p className="text-xs text-muted-foreground break-all">📱 {mintedLinks.mobile}</p>}
                {!success.adminUserId && (
                  <p className="text-xs text-amber-600">App invite tokens require the admin user to be provisioned. If the email invite was queued but the user record isn't ready yet, ask them to accept the email first.</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSuccess(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
