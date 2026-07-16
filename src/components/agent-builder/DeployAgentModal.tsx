import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Rocket,
  Check,
  Copy,
  Code,
  Link,
  MessageSquare,
  Settings,
  Loader2,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { AgentBuilderConfig } from '@/hooks/useAgentBuilder';

interface DeployAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentName: string;
  config: AgentBuilderConfig;
  onDeploy: () => Promise<string | null>;
  isSaving: boolean;
}

export function DeployAgentModal({
  open,
  onOpenChange,
  agentName,
  config,
  onDeploy,
  isSaving,
}: DeployAgentModalProps) {
  const [deployedAgentId, setDeployedAgentId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleDeploy = async () => {
    const agentId = await onDeploy();
    if (agentId) {
      setDeployedAgentId(agentId);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    toast.success('Copié dans le presse-papier !');
    setTimeout(() => setCopied(null), 2000);
  };

  const embedCode = deployedAgentId
    ? `<script src="${window.location.origin}/widget.js" data-agent-id="${deployedAgentId}"></script>`
    : '';

  const agentUrl = deployedAgentId
    ? `${window.location.origin}/widget/${deployedAgentId}`
    : '';

  const configSummary = [
    { label: 'System Prompt', value: config.systemPrompt ? '✓ Configuré' : '✗ Non défini', ok: !!config.systemPrompt },
    { label: 'Premier message', value: config.firstMessage ? '✓ Configuré' : '✗ Non défini', ok: !!config.firstMessage },
    { label: 'Température', value: config.temperature.toString(), ok: true },
    { label: 'Max tokens', value: config.maxTokens.toString(), ok: true },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {deployedAgentId ? (
              <>
                <CheckCircle2 className="h-6 w-6 text-green-500" />
                Agent Déployé !
              </>
            ) : (
              <>
                <Rocket className="h-6 w-6 text-primary" />
                Déployer votre agent
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {deployedAgentId
              ? 'Votre agent est maintenant en ligne. Utilisez les options ci-dessous pour l\'intégrer.'
              : 'Vérifiez la configuration avant de déployer votre agent.'}
          </DialogDescription>
        </DialogHeader>

        {!deployedAgentId ? (
          <>
            {/* Pre-deploy summary */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold">{agentName || 'Agent sans nom'}</h3>
                  <p className="text-sm text-muted-foreground">Agent conversationnel</p>
                </div>
              </div>

              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Résumé de la configuration
                  </h4>
                  <div className="space-y-2">
                    {configSummary.map((item) => (
                      <div key={item.label} className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">{item.label}</span>
                        <Badge variant={item.ok ? 'default' : 'destructive'} className="font-normal">
                          {item.value}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {!config.systemPrompt && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  ⚠️ The System Prompt is not set. Your agent may not work correctly.
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleDeploy} disabled={isSaving || !agentName}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Déploiement...
                  </>
                ) : (
                  <>
                    <Rocket className="mr-2 h-4 w-4" />
                    Déployer maintenant
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Post-deploy options */}
            <Tabs defaultValue="embed" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="embed" className="flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  Code d'intégration
                </TabsTrigger>
                <TabsTrigger value="link" className="flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  Lien direct
                </TabsTrigger>
              </TabsList>

              <TabsContent value="embed" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Copiez ce code dans votre site web</Label>
                  <div className="relative">
                    <pre className="p-4 rounded-lg bg-muted text-sm overflow-x-auto">
                      <code>{embedCode}</code>
                    </pre>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(embedCode, 'embed')}
                    >
                      {copied === 'embed' ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="link" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Lien direct vers votre agent</Label>
                  <div className="flex gap-2">
                    <Input value={agentUrl} readOnly />
                    <Button
                      variant="secondary"
                      onClick={() => copyToClipboard(agentUrl, 'link')}
                    >
                      {copied === 'link' ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button variant="outline" asChild>
                      <a href={agentUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>
                Terminé
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
