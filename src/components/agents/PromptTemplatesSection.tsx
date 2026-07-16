import { useState } from 'react';
import { FileText, Check, ChevronDown, Sparkles, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePromptTemplates, useApplyPromptTemplate, PromptTemplate } from '@/hooks/usePromptTemplates';
import { Skeleton } from '@/components/ui/skeleton';

interface PromptTemplatesSectionProps {
  agentId: string;
  platformAgentId?: string;
  onApplied?: () => void;
}

export function PromptTemplatesSection({ agentId, platformAgentId, onApplied }: PromptTemplatesSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [applyFirstMessage, setApplyFirstMessage] = useState(true);
  
  const { data: templates, isLoading } = usePromptTemplates();
  const applyTemplate = useApplyPromptTemplate();

  const handleSelectTemplate = (template: PromptTemplate) => {
    setSelectedTemplate(template);
    setShowConfirmDialog(true);
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplate || !platformAgentId) return;
    
    await applyTemplate.mutateAsync({
      agentId: platformAgentId,
      template: selectedTemplate,
      applyFirstMessage,
    });
    
    setShowConfirmDialog(false);
    setSelectedTemplate(null);
    onApplied?.();
  };

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const defaultTemplates = templates?.filter(t => t.is_default) || [];
  const customTemplates = templates?.filter(t => !t.is_default) || [];

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className="glass-card">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Templates de Prompts
                  <Badge variant="secondary" className="ml-2">
                    {templates?.length || 0} disponibles
                  </Badge>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground mb-4">
                Appliquez un template prédéfini pour configurer rapidement votre agent avec les meilleures pratiques.
              </p>
              
              {!platformAgentId && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-4">
                  <p className="text-sm text-yellow-600">
                    Cet agent n'est pas connecté à une plateforme. Les templates seront appliqués uniquement localement.
                  </p>
                </div>
              )}
              
              <ScrollArea className="max-h-[400px]">
                {defaultTemplates.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">Templates prédéfinis</h4>
                    <div className="grid gap-3">
                      {defaultTemplates.map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          onSelect={() => handleSelectTemplate(template)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                
                {customTemplates.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-muted-foreground">Mes templates</h4>
                      <div className="grid gap-3">
                        {customTemplates.map((template) => (
                          <TemplateCard
                            key={template.id}
                            template={template}
                            onSelect={() => handleSelectTemplate(template)}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </ScrollArea>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Appliquer le template "{selectedTemplate?.name}"
            </DialogTitle>
            <DialogDescription>
              Ce template va remplacer la configuration actuelle de votre agent.
            </DialogDescription>
          </DialogHeader>
          
          {selectedTemplate && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="text-sm font-medium mb-2">Prompt système</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {selectedTemplate.system_prompt}
                </p>
              </div>
              
              {selectedTemplate.first_message && (
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="text-sm font-medium mb-2">Premier message</h4>
                  <p className="text-sm text-muted-foreground">
                    {selectedTemplate.first_message}
                  </p>
                </div>
              )}
              
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="apply-first-message">Appliquer le premier message</Label>
                  <p className="text-sm text-muted-foreground">
                    Remplacer également le message d'accueil de l'agent
                  </p>
                </div>
                <Switch
                  id="apply-first-message"
                  checked={applyFirstMessage}
                  onCheckedChange={setApplyFirstMessage}
                  disabled={!selectedTemplate.first_message}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Annuler
            </Button>
            <Button 
              onClick={handleApplyTemplate}
              disabled={applyTemplate.isPending}
            >
              {applyTemplate.isPending ? 'Application...' : 'Appliquer le template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TemplateCard({ template, onSelect }: { template: PromptTemplate; onSelect: () => void }) {
  return (
    <div 
      className="p-4 border rounded-lg hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer group"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h5 className="font-medium truncate">{template.name}</h5>
            {template.is_default && (
              <Badge variant="secondary" className="text-xs">Prédéfini</Badge>
            )}
          </div>
          {template.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
              {template.description}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            {template.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <Button 
          size="sm" 
          variant="ghost" 
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Check className="h-4 w-4 mr-1" />
          Appliquer
        </Button>
      </div>
    </div>
  );
}
