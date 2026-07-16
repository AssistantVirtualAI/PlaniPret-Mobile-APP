import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PERMS = [
  { key: "can_manage_users", label: "Manage users" },
  { key: "can_manage_billing", label: "Manage billing" },
  { key: "can_manage_extensions", label: "Manage extensions" },
  { key: "can_manage_ivr", label: "Manage IVR" },
  { key: "can_manage_queues", label: "Manage queues" },
  { key: "can_view_recordings", label: "View recordings" },
  { key: "can_listen_calls", label: "Listen to calls" },
  { key: "can_export_data", label: "Export data" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId: string;
  onInvited?: () => void;
}

export function InviteUserDialog({ open, onOpenChange, organizationId, onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"customer_admin" | "user" | "agent">("user");
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email) return toast.error("Email required");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-org-user", {
        body: { email, full_name: fullName, organization_id: organizationId, role, permissions: perms },
      });
      if (error) throw error;
      toast.success(`Invite sent to ${email}`);
      if ((data as any)?.invite_link) {
        navigator.clipboard.writeText((data as any).invite_link).catch(() => {});
        toast.info("Magic link copied to clipboard");
      }
      onInvited?.();
      onOpenChange(false);
      setEmail(""); setFullName(""); setPerms({});
    } catch (e: any) {
      toast.error(e.message || "Invite failed");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Invite team member</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><Label>Full name</Label><Input value={fullName} onChange={e => setFullName(e.target.value)} /></div>
          <div><Label>Role</Label>
            <select value={role} onChange={e => setRole(e.target.value as any)}
              className="w-full h-10 px-3 rounded-md border bg-background">
              <option value="customer_admin">Customer admin</option>
              <option value="user">User</option>
              <option value="agent">Agent</option>
            </select>
          </div>
          <div>
            <Label>Permissions</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {PERMS.map(p => (
                <label key={p.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!perms[p.key]}
                    onCheckedChange={(v) => setPerms({ ...perms, [p.key]: !!v })} />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={loading}>{loading ? "Inviting…" : "Send invite"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
