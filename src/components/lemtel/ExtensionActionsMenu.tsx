import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MoreHorizontal, KeyRound, Mail, Send, Copy, Check, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Ext = {
  id: string;
  extension: string;
  organization_id: string;
  effective_cid_name?: string | null;
  description?: string | null;
};

type DialogMode = null | "reset" | "link" | "welcome" | "set-portal";

export default function ExtensionActionsMenu({ ext }: { ext: Ext }) {
  const [mode, setMode] = useState<DialogMode>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [syncSip, setSyncSip] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ password?: string; link?: string; sent?: boolean; ok?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => { setMode(null); setResult(null); setEmail(""); setPassword(""); setConfirm(""); setSyncSip(true); setCopied(false); };

  async function invoke(action: string, body: any) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("extension-manage", {
        body: { action, organization_id: ext.organization_id, extension: String(ext.extension), ...body },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error + ((data as any).detail ? ` — ${(data as any).detail}` : ""));
      return data as any;
    } finally { setBusy(false); }
  }

  const doReset = async () => {
    try {
      const data = await invoke("reset-sip-password", { password: password || undefined, sync_portal_password: !password });
      setResult({ password: data.sip_password });
      toast.success(`SIP password reset for ext. ${ext.extension}`);
    } catch (e: any) { toast.error(e?.message || "Reset failed"); }
  };

  const doLink = async () => {
    try {
      const data = await invoke("link-email", { email, create_if_missing: true, initial_password: password || undefined });
      setResult({ password: password || (data.initial_password === "generated" ? "(generated — send welcome to reveal)" : undefined) });
      toast.success(`Linked ${email} to ext. ${ext.extension}`);
    } catch (e: any) { toast.error(e?.message || "Link failed"); }
  };

  const doWelcome = async () => {
    try {
      const data = await invoke("send-welcome", { email: email || undefined });
      setResult({ sent: data.email_sent, link: data.action_link });
      if (data.email_sent) toast.success(`Welcome email sent to ${data.email}`);
      else toast.warning(`Link generated (email not sent): ${data.email_error || ""}`);
    } catch (e: any) { toast.error(e?.message || "Send failed"); }
  };

  const doSetPortal = async () => {
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    try {
      await invoke("set-portal-password", { password, sync_sip: syncSip, email: email || undefined });
      setResult({ ok: true, password });
      toast.success(`Password set for ext. ${ext.extension}`);
    } catch (e: any) { toast.error(e?.message || "Set failed"); }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline"><MoreHorizontal className="w-3.5 h-3.5" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Extension {ext.extension}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setMode("reset")}>
            <KeyRound className="w-4 h-4 mr-2" /> Reset SIP password
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("link")}>
            <Mail className="w-4 h-4 mr-2" /> Link email account
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("set-portal")}>
            <Lock className="w-4 h-4 mr-2" /> Set portal password
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("welcome")}>
            <Send className="w-4 h-4 mr-2" /> Send welcome email
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mode !== null} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === "reset" && `Reset SIP password — ext. ${ext.extension}`}
              {mode === "link" && `Link email — ext. ${ext.extension}`}
              {mode === "welcome" && `Send welcome email — ext. ${ext.extension}`}
              {mode === "set-portal" && `Set portal password — ext. ${ext.extension}`}
            </DialogTitle>
            <DialogDescription>
              {mode === "reset" && "Generate a new SIP password. Leave blank to auto-generate. The linked portal login password will also be rotated when auto-generated."}
              {mode === "link" && "Attach an existing (or new) email to this extension so the user can sign in. If the email doesn't exist yet, an account will be created."}
              {mode === "welcome" && "Send a branded email inviting the user to choose their own password. Uses the email currently linked to the extension unless you specify one."}
              {mode === "set-portal" && "Directly set the portal login password for the user linked to this extension. Works across all domains. Optionally sync the same value to the SIP password so the softphone keeps working."}
            </DialogDescription>
          </DialogHeader>

          {!result && (
            <div className="space-y-3">
              {(mode === "link" || mode === "welcome" || mode === "set-portal") && (
                <div>
                  <Label htmlFor="email">Email {mode === "set-portal" && <span className="text-xs text-muted-foreground">(optional — auto-detected from link)</span>}</Label>
                  <Input id="email" type="email" placeholder="user@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              )}
              {(mode === "reset" || mode === "link") && (
                <div>
                  <Label htmlFor="pwd">{mode === "reset" ? "New password (optional)" : "Initial login password (optional)"}</Label>
                  <Input id="pwd" type="text" placeholder="Leave blank to auto-generate" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              )}
              {mode === "set-portal" && (
                <>
                  <div>
                    <Label htmlFor="pwd">New password</Label>
                    <Input id="pwd" type="password" autoComplete="new-password" placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="pwd2">Confirm password</Label>
                    <Input id="pwd2" type="password" autoComplete="new-password" placeholder="Re-enter password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                    {confirm && password !== confirm && <p className="text-xs text-destructive mt-1">Passwords do not match.</p>}
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={syncSip} onChange={(e) => setSyncSip(e.target.checked)} />
                    Also update SIP password (softphone will use same password)
                  </label>
                </>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-3 text-sm">
              {result.password && (
                <div className="rounded-md border p-3 bg-muted/40">
                  <div className="text-xs text-muted-foreground mb-1">Password</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-sm break-all">{result.password}</code>
                    <Button size="sm" variant="ghost" onClick={() => copy(result.password!)}>
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              )}
              {result.sent === true && <div className="text-green-600">✓ Welcome email delivered.</div>}
              {result.link && (
                <div className="rounded-md border p-3 bg-muted/40">
                  <div className="text-xs text-muted-foreground mb-1">Password-choice link (share manually)</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-xs break-all">{result.link}</code>
                    <Button size="sm" variant="ghost" onClick={() => copy(result.link!)}>
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {!result ? (
              <>
                <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
                <Button
                  onClick={mode === "reset" ? doReset : mode === "link" ? doLink : mode === "set-portal" ? doSetPortal : doWelcome}
                  disabled={busy || ((mode === "link") && !email) || (mode === "set-portal" && (password.length < 8 || password !== confirm))}
                >
                  {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {mode === "reset" && "Reset password"}
                  {mode === "link" && "Link account"}
                  {mode === "welcome" && "Send email"}
                  {mode === "set-portal" && "Set password"}
                </Button>
              </>
            ) : (
              <Button onClick={close}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
