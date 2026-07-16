import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Briefcase, Store, Zap, Check } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  parentOrgId?: string;
}

const STEPS = ["Type", "Basic info", "FusionPBX", "Plan & limits", "Branding", "Admin user"];

export function CreateOrgWizard({ open, onOpenChange, onCreated, parentOrgId }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    org_type: "customer",
    name: "",
    slug: "",
    parent_org_id: parentOrgId || "71755d33-ed64-4ad5-a828-61c9d2029eb7",
    billing_email: "",
    brand_support_email: "",
    brand_support_phone: "",
    fusionpbx_mode: "lemtel",
    fusionpbx_server_url: "",
    fusionpbx_api_key: "",
    fusionpbx_domain_uuid: "",
    max_extensions: 10,
    max_dids: 5,
    max_storage_gb: 10,
    can_create_resellers: false,
    max_resellers: 0,
    billing_plan: "basic",
    brand_app_name: "",
    brand_primary_color: "#003DA6",
    brand_accent_color: "#FFD700",
    brand_portal_domain: "",
    brand_website: "",
    admin_first_name: "",
    admin_last_name: "",
    admin_email: "",
    send_welcome: true,
  });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const submit = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-organization", {
        body: form,
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success("Organization created");
      onCreated?.();
      onOpenChange(false);
      setStep(0);
    } catch (e: any) {
      toast.error(e.message || "Failed to create organization");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <div className="flex gap-1 mt-3">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`flex-1 h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </p>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {step === 0 && (
            <div className="grid gap-3">
              {[
                { id: "reseller", label: "Reseller", desc: "Can create their own customers, has white-label", Icon: Briefcase },
                { id: "customer", label: "Customer", desc: "End customer with phone system", Icon: Store },
                { id: "direct", label: "Direct Customer", desc: "Customer managed directly by Lemtel", Icon: Zap },
              ].map((t) => (
                <Card
                  key={t.id}
                  className={`p-4 cursor-pointer border-2 ${
                    form.org_type === t.id ? "border-primary" : "border-border"
                  }`}
                  onClick={() => set("org_type", t.id)}
                >
                  <div className="flex items-center gap-3">
                    <t.Icon className="h-6 w-6 text-primary" />
                    <div className="flex-1">
                      <div className="font-medium">{t.label}</div>
                      <div className="text-sm text-muted-foreground">{t.desc}</div>
                    </div>
                    {form.org_type === t.id && <Check className="h-5 w-5 text-primary" />}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div>
                <Label>Organization name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => {
                    set("name", e.target.value);
                    if (!form.slug) set("slug", generateSlug(e.target.value));
                  }}
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={form.slug} onChange={(e) => set("slug", generateSlug(e.target.value))} />
              </div>
              <div>
                <Label>Billing email</Label>
                <Input
                  type="email"
                  value={form.billing_email}
                  onChange={(e) => set("billing_email", e.target.value)}
                />
              </div>
              <div>
                <Label>Support email</Label>
                <Input
                  type="email"
                  value={form.brand_support_email}
                  onChange={(e) => set("brand_support_email", e.target.value)}
                />
              </div>
              <div>
                <Label>Support phone</Label>
                <Input
                  value={form.brand_support_phone}
                  onChange={(e) => set("brand_support_phone", e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <Label>FusionPBX server</Label>
                <Select value={form.fusionpbx_mode} onValueChange={(v) => set("fusionpbx_mode", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lemtel">Use Lemtel's FusionPBX (auto-create domain)</SelectItem>
                    <SelectItem value="external">External FusionPBX server</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.fusionpbx_mode === "lemtel" ? (
                <div>
                  <Label>Domain name (auto-generated)</Label>
                  <Input value={`${form.slug || "org"}.lemtel.tel`} disabled />
                </div>
              ) : (
                <>
                  <div>
                    <Label>Server URL</Label>
                    <Input
                      value={form.fusionpbx_server_url}
                      onChange={(e) => set("fusionpbx_server_url", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>API key</Label>
                    <Input
                      type="password"
                      value={form.fusionpbx_api_key}
                      onChange={(e) => set("fusionpbx_api_key", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Domain UUID</Label>
                    <Input
                      value={form.fusionpbx_domain_uuid}
                      onChange={(e) => set("fusionpbx_domain_uuid", e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div>
                <Label>Plan</Label>
                <Select value={form.billing_plan} onValueChange={(v) => set("billing_plan", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter ($29.99)</SelectItem>
                    <SelectItem value="basic">Basic ($49.99)</SelectItem>
                    <SelectItem value="professional">Professional ($149.99)</SelectItem>
                    <SelectItem value="reseller">Reseller ($299.99)</SelectItem>
                    <SelectItem value="enterprise">Enterprise (custom)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Max extensions</Label>
                  <Input type="number" value={form.max_extensions} onChange={(e) => set("max_extensions", +e.target.value)} />
                </div>
                <div>
                  <Label>Max DIDs</Label>
                  <Input type="number" value={form.max_dids} onChange={(e) => set("max_dids", +e.target.value)} />
                </div>
                <div>
                  <Label>Storage GB</Label>
                  <Input type="number" value={form.max_storage_gb} onChange={(e) => set("max_storage_gb", +e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.can_create_resellers}
                  onCheckedChange={(v) => set("can_create_resellers", v)}
                />
                <Label>Can create resellers</Label>
              </div>
              {form.can_create_resellers && (
                <div>
                  <Label>Max resellers</Label>
                  <Input
                    type="number"
                    value={form.max_resellers}
                    onChange={(e) => set("max_resellers", +e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div>
                <Label>App / portal name</Label>
                <Input
                  value={form.brand_app_name}
                  onChange={(e) => set("brand_app_name", e.target.value)}
                  placeholder={form.name}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Primary color</Label>
                  <Input
                    type="color"
                    value={form.brand_primary_color}
                    onChange={(e) => set("brand_primary_color", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Accent color</Label>
                  <Input
                    type="color"
                    value={form.brand_accent_color}
                    onChange={(e) => set("brand_accent_color", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Custom portal domain</Label>
                <Input
                  placeholder="portal.yourdomain.com"
                  value={form.brand_portal_domain}
                  onChange={(e) => set("brand_portal_domain", e.target.value)}
                />
                {form.brand_portal_domain && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Add CNAME: {form.brand_portal_domain} → avastatistic.ca
                  </p>
                )}
              </div>
              <div>
                <Label>Website</Label>
                <Input value={form.brand_website} onChange={(e) => set("brand_website", e.target.value)} />
              </div>
              <Card
                className="p-4 mt-4"
                style={{ background: form.brand_primary_color, color: "white" }}
              >
                <div className="text-xs opacity-80">Preview</div>
                <div className="text-xl font-bold">{form.brand_app_name || form.name || "Portal"}</div>
              </Card>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First name</Label>
                  <Input
                    value={form.admin_first_name}
                    onChange={(e) => set("admin_first_name", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Last name</Label>
                  <Input
                    value={form.admin_last_name}
                    onChange={(e) => set("admin_last_name", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.admin_email}
                  onChange={(e) => set("admin_email", e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.send_welcome} onCheckedChange={(v) => set("send_welcome", v)} />
                <Label>Send welcome email with login credentials</Label>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)}>Next</Button>
          ) : (
            <Button onClick={submit} disabled={saving}>
              {saving ? "Creating…" : "Finish & Create"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
