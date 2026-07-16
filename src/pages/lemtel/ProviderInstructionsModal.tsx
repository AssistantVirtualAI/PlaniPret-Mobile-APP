import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface InstructionsGuide {
  name: string;
  emoji: string;
  url: string;
  intro: string;
  steps: { title: string; body: string }[];
  notes?: string[];
  callbackUrl?: string;
}

export default function ProviderInstructionsModal({
  open, onOpenChange, guide,
}: { open: boolean; onOpenChange: (v: boolean) => void; guide: InstructionsGuide | null }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  if (!guide) return null;

  const copyCallback = async () => {
    if (!guide.callbackUrl) return;
    await navigator.clipboard.writeText(guide.callbackUrl);
    setCopied(true);
    toast({ title: 'Copied', description: 'Callback URL copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="text-2xl">{guide.emoji}</span> {guide.name} setup guide
          </DialogTitle>
          <DialogDescription>{guide.intro}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {guide.callbackUrl && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Webhook / Callback URL</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-background px-2 py-1.5 rounded border break-all">{guide.callbackUrl}</code>
                <Button size="sm" variant="outline" onClick={copyCallback}>
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Paste this in your provider's webhook / status callback configuration.</p>
            </div>
          )}

          <ol className="space-y-3">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary text-sm font-bold flex items-center justify-center">{i + 1}</span>
                <div className="space-y-0.5">
                  <div className="font-semibold text-sm">{s.title}</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">{s.body}</div>
                </div>
              </li>
            ))}
          </ol>

          {guide.notes && guide.notes.length > 0 && (
            <div className="rounded-md border-l-4 border-amber-500/60 bg-amber-500/5 p-3 space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">Security notes</div>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                {guide.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}

          <Button asChild variant="outline" size="sm" className="w-full">
            <a href={guide.url} target="_blank" rel="noopener noreferrer" className="gap-2">
              Open {guide.name} console <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
