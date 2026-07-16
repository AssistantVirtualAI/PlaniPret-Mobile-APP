import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useLemtelAccess } from '@/hooks/useLemtelAccess';

export function OrderDIDModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [areaCode, setAreaCode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const { isAdmin } = useLemtelAccess();

  const submit = () => {
    if (!isAdmin) {
      toast.error('You need Lemtel admin access to order DIDs.');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1 || qty > 50) {
      toast.error('Quantity must be between 1 and 50');
      return;
    }
    if (areaCode && !/^\d{3}$/.test(areaCode)) {
      toast.error('Area code must be exactly 3 digits (e.g. 514)');
      return;
    }
    const subject = encodeURIComponent(`DID Order — Area code ${areaCode || 'any'} (${qty})`);
    const body = encodeURIComponent(
      `Hello,\n\nPlease provision ${qty} new DID(s) in area code ${areaCode || 'any'}.\n\nNotes:\n${notes || '(none)'}\n\nThanks.`
    );
    window.open(`mailto:support@assistantvirtualai.com?subject=${subject}&body=${body}`, '_blank');
    toast.success('Order request opened in your email client');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Order a new DID</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!isAdmin && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                You don't have permission to order DIDs. Lemtel admin or super-admin role required.
              </AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            DID provisioning is performed by our telecom team. Submit your request and we'll provision it on FusionPBX within 1 business day.
          </p>
          <div className="space-y-2">
            <Label htmlFor="ac">Preferred area code</Label>
            <Input id="ac" placeholder="e.g. 514, 438, 450" value={areaCode} onChange={e => setAreaCode(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qty">Quantity</Label>
            <Input id="qty" type="number" min={1} max={50} value={quantity} onChange={e => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" placeholder="Routing, SMS needed, customer name, etc." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!isAdmin}>Send Order Request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
