import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Link2, File, Calendar, HardDrive, Bot, ExternalLink, Copy, Check, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ElevenLabsKBItem } from '@/hooks/useElevenLabsKnowledgeBase';
import { useKnowledgeBaseDocument } from '@/hooks/useElevenLabsKnowledgeBase';
import { toast } from 'sonner';

interface KnowledgeDocumentViewerProps {
  document: ElevenLabsKBItem | null;
  agentId?: string | null;
  apiKey?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KnowledgeDocumentViewer({ document, agentId, apiKey, open, onOpenChange }: KnowledgeDocumentViewerProps) {
  const [copied, setCopied] = useState(false);

  // Fetch full document content when modal opens
  const { data: fullDocument, isLoading, error } = useKnowledgeBaseDocument(
    agentId || null,
    open && document ? document.id : null,
    apiKey || null
  );

  // Use full document if loaded, otherwise fall back to the passed document
  const displayDoc = fullDocument || document;

  if (!document) return null;

  const handleCopyContent = async () => {
    if (displayDoc?.content) {
      await navigator.clipboard.writeText(displayDoc.content);
      setCopied(true);
      toast.success('Contenu copié');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getTypeIcon = () => {
    switch (displayDoc?.type) {
      case 'url': return <Link2 className="w-5 h-5" />;
      case 'file': return <File className="w-5 h-5" />;
      default: return <FileText className="w-5 h-5" />;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              {getTypeIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="truncate block">{displayDoc?.name}</span>
            </div>
            <Badge variant="outline">{displayDoc?.type}</Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="content" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="content">Contenu</TabsTrigger>
            <TabsTrigger value="metadata">Métadonnées</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="mt-4">
            <div className="space-y-4">
              {displayDoc?.url && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Link2 className="w-4 h-4 text-primary" />
                  <a 
                    href={displayDoc.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex-1 truncate"
                  >
                    {displayDoc.url}
                  </a>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={displayDoc.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              )}

              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="ml-3 text-muted-foreground">Chargement du contenu...</span>
                </div>
              )}

              {error && (
                <div className="text-center py-12 text-destructive">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Erreur lors du chargement du contenu</p>
                  <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
                </div>
              )}

              {!isLoading && !error && displayDoc?.content && (
                <div className="relative">
                  <div className="absolute top-2 right-2 z-10">
                    <Button variant="ghost" size="sm" onClick={handleCopyContent}>
                      {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <ScrollArea className="h-[400px] border border-border rounded-lg p-4 bg-muted/30">
                    <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                      {displayDoc.content}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              {!isLoading && !error && !displayDoc?.content && !displayDoc?.url && (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Aucun contenu disponible pour ce document</p>
                  <p className="text-sm mt-2">Ce document peut être un fichier binaire ou ne contient pas de texte extractible.</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="metadata" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-muted/30 rounded-lg space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span className="text-sm">Type</span>
                </div>
                <p className="font-medium capitalize">{displayDoc?.type}</p>
              </div>

              {displayDoc?.file_size && (
                <div className="p-4 bg-muted/30 rounded-lg space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <HardDrive className="w-4 h-4" />
                    <span className="text-sm">Taille</span>
                  </div>
                  <p className="font-medium">{formatFileSize(displayDoc.file_size)}</p>
                </div>
              )}

              {displayDoc?.created_at && (
                <div className="p-4 bg-muted/30 rounded-lg space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">Créé le</span>
                  </div>
                  <p className="font-medium">
                    {format(new Date(displayDoc.created_at), 'PPP à HH:mm', { locale: fr })}
                  </p>
                </div>
              )}

              {displayDoc?.updated_at && (
                <div className="p-4 bg-muted/30 rounded-lg space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">Modifié le</span>
                  </div>
                  <p className="font-medium">
                    {format(new Date(displayDoc.updated_at), 'PPP à HH:mm', { locale: fr })}
                  </p>
                </div>
              )}

              {displayDoc?.dependent_agents && displayDoc.dependent_agents.length > 0 && (
                <div className="p-4 bg-muted/30 rounded-lg space-y-2 md:col-span-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Bot className="w-4 h-4" />
                    <span className="text-sm">Agents liés</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {displayDoc.dependent_agents.map((agent) => (
                      <Badge key={agent.id} variant="secondary">
                        {agent.name || agent.id.slice(0, 8)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {displayDoc?.metadata?.category && (
                <div className="p-4 bg-muted/30 rounded-lg space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm">Catégorie</span>
                  </div>
                  <Badge variant="secondary">{displayDoc.metadata.category}</Badge>
                </div>
              )}

              <div className="p-4 bg-muted/30 rounded-lg space-y-1 md:col-span-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span className="text-sm">ID Document</span>
                </div>
                <code className="text-xs bg-muted px-2 py-1 rounded">{displayDoc?.id}</code>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}