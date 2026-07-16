import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Palette, Phone, Users, CreditCard, Save, UserPlus, Globe, Copy, CheckCircle2, Laptop, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { InviteUserDialog } from "@/components/portal/InviteUserDialog";
import { Switch } from "@/components/ui/switch";

export default function CustomerSettings() {
  const { slug } = useParams();
  const qc = useQueryClient();

  const { data: org } = useQuery({
    queryKey: ["org-full", slug],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("*").eq("slug", slug!).maybeSingle();
      return data as any;
    },
    enabled: !!slug,
  });

  const [brandName, setBrandName] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [brandColor, setBrandColor] = useState("#0023e6");
  const [supportEmail, setSupportEmail] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [portalDomain, setPortalDomain] = useState("");
  const [savingDomain, setSavingDomain] = useState(false);

  useEffect(() => {
    if (org) {
      setBrandName(org.brand_name || org.name || "");
      setBrandLogo(org.brand_logo_url || "");
      setBrandColor(org.brand_primary_color || "#0023e6");
      setSupportEmail(org.support_email || org.brand_support_email || "");
      setPortalDomain(org.brand_portal_domain || "");
    }
  }, [org]);

  const saveBrand = async () => {
    if (!org?.id) return;
    const { error } = await supabase.from("organizations").update({
      brand_name: brandName, brand_logo_url: brandLogo,
      brand_primary_color: brandColor, brand_support_email: supportEmail,
    }).eq("id", org.id);
    if (error) return toast.error(error.message);
    toast.success("Branding saved");
    qc.invalidateQueries({ queryKey: ["org-full", slug] });
  };

  const saveDomain = async () => {
    if (!org?.id) return;
    const domain = portalDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      return toast.error("Enter a valid domain (e.g. portal.acme.com)");
    }
    setSavingDomain(true);
    const { error } = await supabase.from("organizations").update({
      brand_portal_domain: domain || null,
    }).eq("id", org.id);
    setSavingDomain(false);
    if (error) return toast.error(error.message);
    toast.success("Domain saved");
    qc.invalidateQueries({ queryKey: ["org-full", slug] });
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const { data: members = [], refetch: refetchMembers } = useQuery({
    queryKey: ["org-members-list", org?.id],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-org-roles", {
        body: { action: "list", organization_id: org.id },
      });
      if (error) throw error;
      return ((data as any)?.members || []) as any[];
    },
  });

  const { data: softphoneUsers = [], refetch: refetchSoftphones } = useQuery({
    queryKey: ["org-softphone-access", org?.id],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pbx_softphone_users")
        .select("id, portal_user_id, extension, display_name, app_access_enabled, desktop_access_enabled, mobile_access_enabled, account_status")
        .eq("organization_id", org.id)
        .order("extension");
      return (data || []) as any[];
    },
  });

  const softphoneByUser = new Map(softphoneUsers.filter((u: any) => u.portal_user_id).map((u: any) => [u.portal_user_id, u]));

  const togglePlatformAccess = async (softphoneId: string, platform: 'app' | 'desktop' | 'mobile', enabled: boolean) => {
    const { error } = await (supabase as any).rpc("set_softphone_platform_access", {
      _softphone_id: softphoneId,
      _platform: platform,
      _enabled: enabled,
    });
    if (error) return toast.error(error.message);
    toast.success(`${platform === 'app' ? 'App' : platform === 'desktop' ? 'Desktop' : 'Mobile'} access ${enabled ? 'enabled' : 'blocked'}`);
    refetchSoftphones();
  };

  const { data: dids = [] } = useQuery({
    queryKey: ["org-dids", org?.id],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data } = await (supabase as any).from("phone_numbers").select("*").eq("organization_id", org.id);
      return (data || []) as any[];
    },
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-3xl font-bold">{org?.name || "Settings"}</h1>
      <Tabs defaultValue="branding">
        <TabsList>
          <TabsTrigger value="branding"><Palette className="h-4 w-4 mr-1" />Branding</TabsTrigger>
          <TabsTrigger value="domain"><Globe className="h-4 w-4 mr-1" />Domain</TabsTrigger>
          <TabsTrigger value="numbers"><Phone className="h-4 w-4 mr-1" />Numbers</TabsTrigger>
          <TabsTrigger value="users"><Users className="h-4 w-4 mr-1" />Users</TabsTrigger>
          <TabsTrigger value="billing"><CreditCard className="h-4 w-4 mr-1" />Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="branding">
          <Card>
            <CardHeader><CardTitle>White-label branding</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              <div><Label>Brand name</Label><Input value={brandName} onChange={(e) => setBrandName(e.target.value)} /></div>
              <div><Label>Logo URL</Label><Input value={brandLogo} onChange={(e) => setBrandLogo(e.target.value)} placeholder="https://…" /></div>
              <div><Label>Primary color</Label>
                <div className="flex gap-2">
                  <Input type="color" className="w-20" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />
                  <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />
                </div>
              </div>
              <div><Label>Support email</Label><Input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} /></div>
              <Button onClick={saveBrand}><Save className="h-4 w-4 mr-2" />Save branding</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="domain">
          <Card>
            <CardHeader><CardTitle>Custom portal domain</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-w-2xl">
              <div>
                <Label>Portal hostname</Label>
                <div className="flex gap-2">
                  <Input value={portalDomain} onChange={(e) => setPortalDomain(e.target.value)} placeholder="portal.acme.com" />
                  <Button onClick={saveDomain} disabled={savingDomain}><Save className="h-4 w-4 mr-2" />Save</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Customers will reach their portal at this hostname after DNS is verified.</p>
              </div>

              {org?.brand_portal_domain && (
                <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Globe className="h-4 w-4" /> DNS configuration
                  </div>
                  <p className="text-xs text-muted-foreground">Add the following CNAME record at your DNS provider for <span className="font-mono">{org.brand_portal_domain}</span>.</p>
                  <div className="rounded-md bg-background border p-3 font-mono text-xs space-y-1">
                    <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-center">
                      <span className="text-muted-foreground">Type</span><span>CNAME</span><span />
                    </div>
                    <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-center">
                      <span className="text-muted-foreground">Host</span><span>{org.brand_portal_domain}</span>
                      <Button size="sm" variant="ghost" onClick={() => copy(org.brand_portal_domain)}><Copy className="h-3 w-3" /></Button>
                    </div>
                    <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-center">
                      <span className="text-muted-foreground">Target</span><span>portal.lemtel.tel</span>
                      <Button size="sm" variant="ghost" onClick={() => copy("portal.lemtel.tel")}><Copy className="h-3 w-3" /></Button>
                    </div>
                    <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-center">
                      <span className="text-muted-foreground">TTL</span><span>3600</span><span />
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>After DNS propagates (1–60 min), TLS is auto-provisioned. The portal will serve under the new hostname with the customer's branding.</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>



        <TabsContent value="numbers">
          <Card>
            <CardHeader><CardTitle>Phone numbers ({dids.length})</CardTitle></CardHeader>
            <CardContent>
              {dids.length === 0 ? (
                <p className="text-sm text-muted-foreground">No numbers assigned yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b"><tr className="text-left"><th className="p-2">DID</th><th className="p-2">Type</th><th className="p-2">Status</th></tr></thead>
                  <tbody>
                    {dids.map((d: any) => (
                      <tr key={d.id} className="border-b">
                        <td className="p-2 font-mono">{d.did_number || d.number}</td>
                        <td className="p-2">{d.did_type || "—"}</td>
                        <td className="p-2"><Badge variant={d.enabled ? "default" : "secondary"}>{d.enabled ? "active" : "disabled"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Team members ({members.length})</CardTitle>
              <Button size="sm" onClick={() => setInviteOpen(true)} disabled={!org?.id}>
                <UserPlus className="h-4 w-4 mr-1" /> Invite user
              </Button>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet. Click "Invite user" to add one.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left">
                      <th className="p-2">User</th>
                      <th className="p-2">Role</th>
                      <th className="p-2">Extension</th>
                      <th className="p-2 text-right">App</th>
                      <th className="p-2 text-right"><span className="inline-flex items-center justify-end gap-1"><Laptop className="h-3 w-3" />Desktop</span></th>
                      <th className="p-2 text-right"><span className="inline-flex items-center justify-end gap-1"><Smartphone className="h-3 w-3" />Mobile</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m: any) => {
                      const profile = m.profile || {};
                      const softphone = softphoneByUser.get(m.user_id);
                      return (
                        <tr key={m.user_id} className="border-b">
                          <td className="p-2">
                            <div className="font-medium">{profile.full_name || profile.email || m.user_id?.slice(0, 12)}</div>
                            <div className="text-xs text-muted-foreground">{profile.email || m.user_id}</div>
                          </td>
                          <td className="p-2"><Badge variant="outline">{m.role || "viewer"}</Badge></td>
                          <td className="p-2">{softphone ? <Badge variant="secondary" className="font-mono">{softphone.extension}</Badge> : <span className="text-xs text-muted-foreground">No softphone</span>}</td>
                          <td className="p-2 text-right">{softphone ? <Switch checked={softphone.app_access_enabled !== false} onCheckedChange={(v) => togglePlatformAccess(softphone.id, 'app', v)} /> : <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-2 text-right">{softphone ? <Switch checked={softphone.desktop_access_enabled !== false} disabled={softphone.app_access_enabled === false} onCheckedChange={(v) => togglePlatformAccess(softphone.id, 'desktop', v)} /> : <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-2 text-right">{softphone ? <Switch checked={softphone.mobile_access_enabled !== false} disabled={softphone.app_access_enabled === false} onCheckedChange={(v) => togglePlatformAccess(softphone.id, 'mobile', v)} /> : <span className="text-muted-foreground">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          {org?.id && (
            <InviteUserDialog
              open={inviteOpen}
              onOpenChange={setInviteOpen}
              organizationId={org.id}
              onInvited={() => { qc.invalidateQueries({ queryKey: ["org-members-list", org.id] }); refetchMembers(); }}
            />
          )}
        </TabsContent>


        <TabsContent value="billing">
          <Card>
            <CardHeader><CardTitle>Plan & billing</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium capitalize">{org?.billing_plan || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge>{org?.status || "—"}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Max extensions</span><span>{org?.max_extensions || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Max DIDs</span><span>{org?.max_dids || "—"}</span></div>
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!org?.id) return;
                    const { data, error } = await supabase.functions.invoke("stripe-portal", {
                      body: { organizationId: org.id, returnUrl: window.location.href },
                    });
                    if (error || !data?.url) return toast.error(error?.message || "Could not open billing portal");
                    window.open(data.url, "_blank");
                  }}
                >
                  <CreditCard className="h-4 w-4 mr-2" /> Manage subscription
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
