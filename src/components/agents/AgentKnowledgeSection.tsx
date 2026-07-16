import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  BookOpen, 
  RefreshCw, 
  Loader2,
  FileText,
  Plus,
  Trash2,
  Link as LinkIcon,
  AlertCircle,
  Upload
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

interface AgentKnowledgeSectionProps {
  agentId: string;
  platform: string;
  platformAgentId: string;
  organizationId: string;
}

interface KBItem {
  id: string;
  name: string;
  type: string;
  content?: string;
  url?: string;
  created_at?: string;
}

export function AgentKnowledgeSection({ 
  agentId, 
  platform, 
  platformAgentId, 
  organizationId 
}: AgentKnowledgeSectionProps) {
  const queryClient = useQueryClient();
  const [addType, setAddType] = useState<'text' | 'url' | 'file'>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Fetch knowledge base based on platform
  const { data: kbData, isLoading, refetch } = useQuery({
    queryKey: ['agent-knowledge-base', agentId, platform, platformAgentId],
    queryFn: async () => {
      switch (platform) {
        case 'elevenlabs': {
          const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
            body: { 
              action: 'list',
              agentId: platformAgentId,
              organizationId,
            },
          });
          if (error) throw error;
          const items = data?.knowledge_base?.items || data?.items || [];
          return items.map((item: any) => ({
            id: item.id,
            name: item.name || item.title || 'Sans titre',
            type: item.type || 'text',
            content: item.content,
            url: item.url,
            created_at: item.created_at,
          }));
        }
        
        case 'retell': {
          // Get agent to find linked KBs
          let linkedKbIds: string[] = [];
          try {
            const { data: agentData } = await supabase.functions.invoke('retell-proxy', {
              body: { action: 'getAgent', organizationId, agentId: platformAgentId },
            });
            linkedKbIds = agentData?.data?.knowledge_base_ids || [];
          } catch (e) {
            console.warn('[AgentKnowledgeSection] Could not fetch Retell agent config:', e);
          }

          // Fetch all KBs
          const { data, error } = await supabase.functions.invoke('retell-proxy', {
            body: { action: 'listKnowledgeBases', organizationId },
          });
          if (error) throw error;
          
          const rawKbs = data?.data || data || [];
          const kbs = Array.isArray(rawKbs) ? rawKbs : [];
          
          // Show all if none linked, otherwise filter
          const filteredKbs = linkedKbIds.length > 0 
            ? kbs.filter((kb: any) => linkedKbIds.includes(kb.knowledge_base_id))
            : kbs;
          
          return filteredKbs.map((kb: any) => ({
            id: kb.knowledge_base_id,
            name: kb.knowledge_base_name || 'Base de connaissances',
            type: 'text',
            created_at: kb.created_at,
          }));
        }
        
        case 'vapi': {
          // Get assistant to find linked files
          let linkedFileIds: string[] = [];
          try {
            const { data: assistantData } = await supabase.functions.invoke('vapi-proxy', {
              body: { action: 'getAssistant', organizationId, assistantId: platformAgentId },
            });
            
            if (assistantData?.data) {
              const assistant = assistantData.data;
              if (assistant.knowledgeBase?.fileIds) {
                linkedFileIds = assistant.knowledgeBase.fileIds;
              } else if (Array.isArray(assistant.knowledgeBases)) {
                for (const kb of assistant.knowledgeBases) {
                  if (Array.isArray(kb.fileIds)) {
                    linkedFileIds.push(...kb.fileIds);
                  }
                }
              }
            }
          } catch (e) {
            console.warn('[AgentKnowledgeSection] Could not fetch VAPI assistant config:', e);
          }

          // Fetch all files
          const { data, error } = await supabase.functions.invoke('vapi-proxy', {
            body: { action: 'listFiles', organizationId },
          });
          if (error) throw error;
          
          let files = data?.data || data || [];
          files = Array.isArray(files) ? files : [];
          
          // Filter by linked files if any
          if (linkedFileIds.length > 0) {
            files = files.filter((file: any) => linkedFileIds.includes(file.id));
          }
          
          return files.map((file: any) => ({
            id: file.id,
            name: file.name || file.filename || 'Fichier',
            type: file.type || 'file',
            url: file.url,
            created_at: file.created_at || file.createdAt,
          }));
        }
        
        default:
          return [];
      }
    },
    enabled: !!platformAgentId && !!organizationId,
  });

  // Add document mutation
  const addDocument = useMutation({
    mutationFn: async () => {
      switch (platform) {
        case 'elevenlabs': {
          if (addType === 'file' && selectedFile) {
            // File upload uses FormData
            const formData = new FormData();
            formData.append('action', 'create_file');
            formData.append('agentId', platformAgentId);
            formData.append('organizationId', organizationId);
            if (title) formData.append('title', title);
            formData.append('file', selectedFile);
            
            const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
              body: formData,
            });
            if (error) throw error;
            return data;
          }
          
          const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
            body: { 
              action: addType === 'url' ? 'create_url' : 'add',
              agentId: platformAgentId,
              organizationId,
              title: title,
              content: addType === 'text' ? content : undefined,
              url: addType === 'url' ? url : undefined,
            },
          });
          if (error) throw error;
          return data;
        }
        
        case 'retell': {
          // Create KB with document
          const { data: kbData, error: kbError } = await supabase.functions.invoke('retell-proxy', {
            body: { 
              action: 'createKnowledgeBase',
              organizationId,
              name: title,
              texts: addType === 'text' ? [{ title, content }] : undefined,
              urls: addType === 'url' ? [url] : undefined,
            },
          });
          if (kbError) throw kbError;

          // Link to agent
          const newKbId = kbData?.data?.knowledge_base_id;
          if (newKbId) {
            const { data: agentData } = await supabase.functions.invoke('retell-proxy', {
              body: { action: 'getAgent', organizationId, agentId: platformAgentId },
            });
            
            const currentKbIds = agentData?.data?.knowledge_base_ids || [];
            await supabase.functions.invoke('retell-proxy', {
              body: { 
                action: 'updateAgent',
                organizationId,
                agentId: platformAgentId,
                retellAgentId: platformAgentId,
                config: { knowledge_base_ids: [...currentKbIds, newKbId] },
              },
            });
          }
          return kbData;
        }
        
        case 'vapi': {
          const { data, error } = await supabase.functions.invoke('vapi-proxy', {
            body: { 
              action: 'createFile',
              organizationId,
              name: title,
              content: addType === 'text' ? content : undefined,
              url: addType === 'url' ? url : undefined,
            },
          });
          if (error) throw error;
          return data;
        }
        
        default:
          throw new Error(`Platform ${platform} not supported`);
      }
    },
    onSuccess: (data: any) => {
      toast.success('Document ajouté avec succès');
      const newItem: KBItem = {
        id: data?.documentId || `temp-${Date.now()}`,
        name: title || selectedFile?.name || 'Document',
        type: addType === 'url' ? 'url' : addType === 'file' ? 'file' : 'text',
        content: addType === 'text' ? content : undefined,
        url: addType === 'url' ? url : undefined,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData(
        ['agent-knowledge-base', agentId, platform, platformAgentId],
        (old: KBItem[] | undefined) => [...(old || []), newItem]
      );
      setTitle('');
      setContent('');
      setUrl('');
      setSelectedFile(null);
      // Also refetch after delay to get the real data from ElevenLabs
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['agent-knowledge-base', agentId] });
      }, 3000);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de l\'ajout du document');
    }
  });

  // Delete document mutation
  const deleteDocument = useMutation({
    mutationFn: async (documentId: string) => {
      switch (platform) {
        case 'elevenlabs': {
          const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
            body: { 
              action: 'delete',
              agentId: platformAgentId,
              organizationId,
              documentId,
            },
          });
          if (error) throw error;
          return data;
        }
        
        case 'retell': {
          const { data, error } = await supabase.functions.invoke('retell-proxy', {
            body: { 
              action: 'deleteKnowledgeBase',
              organizationId,
              knowledgeBaseId: documentId,
            },
          });
          if (error) throw error;
          return data;
        }
        
        case 'vapi': {
          const { data, error } = await supabase.functions.invoke('vapi-proxy', {
            body: { 
              action: 'deleteFile',
              organizationId,
              fileId: documentId,
            },
          });
          if (error) throw error;
          return data;
        }
        
        default:
          throw new Error(`Platform ${platform} not supported`);
      }
    },
    onSuccess: () => {
      toast.success('Document supprimé');
      queryClient.invalidateQueries({ queryKey: ['agent-knowledge-base', agentId] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  });

  const items: KBItem[] = kbData || [];
  const platformLabel = platform.toUpperCase();

  const getDocIcon = (type: string) => {
    if (type === 'url' || type === 'link') return <LinkIcon className="w-4 h-4 text-muted-foreground" />;
    if (type === 'file') return <Upload className="w-4 h-4 text-muted-foreground" />;
    return <FileText className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Base de Connaissances
              <Badge variant="outline" className="ml-2">{platformLabel}</Badge>
            </CardTitle>
            <CardDescription>
              Documents et informations que l'agent utilise pour répondre aux questions.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Actualiser
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Chargement de la base de connaissances...</span>
          </div>
        ) : (
          <>
            {/* Liste des documents existants */}
            <div className="space-y-2">
              <Label>Documents existants ({items.length})</Label>
              <ScrollArea className="h-48 border rounded-lg p-2">
                {items.length > 0 ? (
                  <div className="space-y-2">
                    {items.map((item, index) => (
                      <div key={item.id || index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {getDocIcon(item.type)}
                          <div className="flex-1 min-w-0">
                            <span className="font-medium truncate block">{item.name}</span>
                            {item.type && (
                              <span className="text-xs text-muted-foreground">({item.type})</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{item.type}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (confirm('Supprimer ce document ?')) {
                                deleteDocument.mutate(item.id);
                              }
                            }}
                            disabled={deleteDocument.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm">Aucun document dans la base de connaissances</p>
                    <p className="text-xs mt-1">Ajoutez du contenu ci-dessous</p>
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Formulaire d'ajout */}
            <div className="space-y-4 pt-4 border-t">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Ajouter du contenu
              </Label>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="kb-title">Titre</Label>
                  <Input
                    id="kb-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="FAQ Produit, Guide d'utilisation..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-type">Type de contenu</Label>
                  <Select value={addType} onValueChange={(v) => setAddType(v as 'text' | 'url' | 'file')}>
                    <SelectTrigger id="kb-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texte</SelectItem>
                      <SelectItem value="url">URL</SelectItem>
                      <SelectItem value="file">Fichier (PDF, Excel, ...)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {addType === 'text' ? (
                <div className="space-y-2">
                  <Label htmlFor="kb-content">Contenu</Label>
                  <Textarea
                    id="kb-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Entrez le contenu que l'agent doit connaître..."
                    className="min-h-[150px]"
                  />
                </div>
              ) : addType === 'url' ? (
                <div className="space-y-2">
                  <Label htmlFor="kb-url">URL</Label>
                  <Input
                    id="kb-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/document.pdf"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="kb-file">Fichier</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="kb-file"
                      type="file"
                      accept=".pdf,.xlsx,.xls,.csv,.txt,.doc,.docx,.pptx,.html,.md"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setSelectedFile(file);
                        if (file && !title) setTitle(file.name);
                      }}
                      className="flex-1"
                    />
                    {selectedFile && (
                      <Badge variant="outline" className="shrink-0">
                        <Upload className="w-3 h-3 mr-1" />
                        {(selectedFile.size / 1024).toFixed(0)} Ko
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Formats acceptés : PDF, Excel, CSV, Word, PowerPoint, HTML, TXT, Markdown
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={() => addDocument.mutate()}
                  disabled={addDocument.isPending || (addType === 'file' ? !selectedFile : (!title || (addType === 'text' ? !content : !url)))}
                >
                  {addDocument.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Ajouter
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
