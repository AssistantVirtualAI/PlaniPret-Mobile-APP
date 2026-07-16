import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function ResellerSettings() {
  const { slug } = useParams();
  const { data: org, refetch } = useQuery({
    queryKey: ["org-by-slug", slug],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id,slug,name,brand_app_name,brand_name,brand_logo_url,brand_favicon_url,brand_primary_color,brand_accent_color,brand_support_email,billing_plan,is_active,parent_org_id,root_org_id,onboarding_completed,hipaa_enabled").eq("slug", slug!).maybeSingle();
      return data as any;
    },
    enabled: !!slug,
  });

  const [form, setForm] = useState<any>({});
  useEffect(() => { if (org) setForm(org); }, [org]);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    const { error } = await supabase
      .from("organizations")
      .update({
        brand_name: form.brand_name,
        brand_app_name: form.brand_app_name,
        brand_primary_color: form.brand_primary_color,
        brand_accent_color: form.brand_accent_color,
        brand_logo_url: form.brand_logo_url,
        brand_favicon_url: form.brand_favicon_url,
        brand_portal_domain: form.brand_portal_domain,
        brand_support_email: form.brand_support_email,
        brand_support_phone: form.brand_support_phone,
        brand_website: form.brand_website,
      })
      .eq("id", org.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Saved — refresh to apply branding");
      refetch();
    }
  };

  if (!org) return <div className="p-6">Loading…</div>;

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Brand & settings</h1>
        <p className="text-muted-foreground">Customize how your portal looks to your customers.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Brand name</Label><Input value={form.brand_name || ""} onChange={(e) => set("brand_name", e.target.value)} /></div>
          <div><Label>App name</Label><Input value={form.brand_app_name || ""} onChange={(e) => set("brand_app_name", e.target.value)} /></div>
          <div><Label>Logo URL</Label><Input value={form.brand_logo_url || ""} onChange={(e) => set("brand_logo_url", e.target.value)} /></div>
          <div><Label>Favicon URL</Label><Input value={form.brand_favicon_url || ""} onChange={(e) => set("brand_favicon_url", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Primary color</Label><Input type="color" value={form.brand_primary_color || "#003DA6"} onChange={(e) => set("brand_primary_color", e.target.value)} /></div>
            <div><Label>Accent color</Label><Input type="color" value={form.brand_accent_color || "#FFD700"} onChange={(e) => set("brand_accent_color", e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Custom domain</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Portal domain</Label>
            <Input value={form.brand_portal_domain || ""} onChange={(e) => set("brand_portal_domain", e.target.value)} placeholder="portal.yourbrand.com" />
          </div>
          {form.brand_portal_domain && (
            <div className="bg-muted/30 p-3 rounded text-sm">
              <strong>DNS setup:</strong>
              <pre className="mt-2 text-xs">
{`Type:  CNAME
Name:  ${form.brand_portal_domain.split(".")[0]}
Value: avastatistic.ca
TTL:   3600`}
              </pre>
              <p className="text-xs text-muted-foreground mt-2">SSL is auto-issued within 24h after DNS propagation.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Support contact</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Support email</Label><Input value={form.brand_support_email || ""} onChange={(e) => set("brand_support_email", e.target.value)} /></div>
          <div><Label>Support phone</Label><Input value={form.brand_support_phone || ""} onChange={(e) => set("brand_support_phone", e.target.value)} /></div>
          <div><Label>Website</Label><Input value={form.brand_website || ""} onChange={(e) => set("brand_website", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Button onClick={save} size="lg">Save settings</Button>
    </div>
  );
}
