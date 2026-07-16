import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, RefreshCw, BookOpen, FileText, Trash2, Link2, AlertCircle, CheckCircle2, Bot, File, Eye, Info, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { 
  useElevenLabsKnowledgeBase, 
  useDeleteKnowledgeBaseItem,
  type ElevenLabsKBItem
} from '@/hooks/useElevenLabsKnowledgeBase';
import { useAllAgents, getPlatformDisplayName } from '@/hooks/useAllAgents';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KnowledgeDocumentViewer } from '@/components/knowledge/KnowledgeDocumentViewer';
import { AddKnowledgeDocumentModal } from '@/components/knowledge/AddKnowledgeDocumentModal';

import { useTranslation } from '@/hooks/useTranslation';

const KnowledgeBase = () => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<ElevenLabsKBItem | null>(null);

  // Retell viewer/add state
  const [retellViewerOpen, setRetellViewerOpen] = useState(false);
  const [selectedRetellKb, setSelectedRetellKb] = useState<{ id: string; name?: string } | null>(null);
  const [retellNewName, setRetellNewName] = useState('');
  const [retellNewContent, setRetellNewContent] = useState('');
  const [retellNewUrl, setRetellNewUrl] = useState('');

  const queryClient = useQueryClient();

  // Get ALL agents (all platforms)
  const { data: agentsData, isLoading: isLoadingAgents } = useAllAgents();
  const agents = agentsData?.agents || [];

  // Get the selected agent
  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  const selectedPlatform = selectedAgent?.platform?.toLowerCase() || '';
  const isElevenLabs = selectedPlatform === 'elevenlabs';
  const isRetell = selectedPlatform === 'retell';

  // IMPORTANT: API keys must never be handled client-side.
  // Platform credentials are resolved server-side inside backend functions.
  const apiKey = null;
  const platformAgentId = selectedAgent?.platform_agent_id || undefined;
  const organizationId = selectedAgent?.organization_id || undefined;

  // Fetch knowledge base
  const {
    data: elevenKbData,
    isLoading: isLoadingElevenKB,
    error: elevenKbError,
    refetch: refetchElevenKb,
  } = useElevenLabsKnowledgeBase(
    isElevenLabs ? selectedAgentId : null,
    null
  );

  const {
    data: retellKbData,
    isLoading: isLoadingRetellKB,
    error: retellKbError,
    refetch: refetchRetellKb,
  } = useQuery({
    queryKey: ['retell-knowledge-base', organizationId, platformAgentId],
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization not available');

      // Optional filtering: only KBs attached to the agent's LLM
      let allowedKbIds: string[] | null = null;
      if (platformAgentId) {
        try {
          const { data: agentRes, error: agentErr } = await supabase.functions.invoke('retell-proxy', {
            body: { action: 'getAgent', organizationId, agentId: platformAgentId },
          });
          if (!agentErr) {
            const agent = (agentRes as any)?.data ?? agentRes;
            const llmId = agent?.response_engine?.llm_id;
            if (llmId) {
              const { data: llmRes, error: llmErr } = await supabase.functions.invoke('retell-proxy', {
                body: { action: 'getLlm', organizationId, llmId },
              });
              if (!llmErr) {
                const llm = (llmRes as any)?.data ?? llmRes;
                if (Array.isArray(llm?.knowledge_base_ids)) {
                  allowedKbIds = llm.knowledge_base_ids.filter(Boolean);
                }
              }
            }
          }
        } catch {
          // ignore and fall back to unfiltered list
        }
      }

      const { data, error } = await supabase.functions.invoke('retell-proxy', {
        body: { action: 'listKnowledgeBases', organizationId },
      });
      if (error) throw error;

      const rawKbs = (data as any)?.data ?? data ?? [];
      const kbs = Array.isArray(rawKbs) ? rawKbs : [];
      const filtered = Array.isArray(allowedKbIds) && allowedKbIds.length > 0
        ? kbs.filter((kb: any) => allowedKbIds!.includes(kb.knowledge_base_id))
        : kbs;

      return filtered as Array<{ knowledge_base_id: string; knowledge_base_name?: string; created_at?: string }>;
    },
    enabled: isRetell && !!organizationId,
  });

  const deleteMutation = useDeleteKnowledgeBaseItem();

  const items = (isElevenLabs ? (elevenKbData?.knowledge_base?.items || []) : []).map((item: any) => item) as ElevenLabsKBItem[];
  const totalDocs = isElevenLabs ? (elevenKbData?.knowledge_base?.all_documents_count || 0) : (retellKbData?.length || 0);

  const isLoadingKB = isElevenLabs ? isLoadingElevenKB : isLoadingRetellKB;
  const kbError = (isElevenLabs ? elevenKbError : retellKbError) as any;
  const kbListForRetell = retellKbData || [];


  // Filter items
  const filteredItems = useMemo(() => {
    if (isRetell) {
      const list = kbListForRetell as any[];
      if (!searchTerm) return list;
      return list.filter((kb: any) =>
        (kb.knowledge_base_name || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (!searchTerm) return items;
    return items.filter(item =>
      item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.content?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, kbListForRetell, isRetell, searchTerm]);

  const handleViewDocument = (item: ElevenLabsKBItem) => {
    setSelectedDocument(item);
    setViewerOpen(true);
  };

  const handleDeleteItem = async (item: ElevenLabsKBItem) => {
    if (!selectedAgentId) return;
    if (!confirm(`Delete "${item.name}"?`)) return;

    await deleteMutation.mutateAsync({
      agentId: selectedAgentId,
      apiKey: undefined,
      documentId: item.id,
    });
  };

  const deleteRetellKb = useMutation({
    mutationFn: async ({ knowledgeBaseId }: { knowledgeBaseId: string }) => {
      if (!organizationId) throw new Error('Organization not available');
      const { error } = await supabase.functions.invoke('retell-proxy', {
        body: { action: 'deleteKnowledgeBase', organizationId, knowledgeBaseId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retell-knowledge-base', organizationId, platformAgentId] });
    },
  });

  const handleDeleteRetellKb = async (knowledgeBaseId: string, name?: string) => {
    if (!confirm(`Delete "${name || 'this base'}"?`)) return;
    await deleteRetellKb.mutateAsync({ knowledgeBaseId });
  };

  const createRetellKb = useMutation({
    mutationFn: async ({ name, content, url }: { name: string; content?: string; url?: string }) => {
      if (!organizationId) throw new Error('Organization not available');
      const { error } = await supabase.functions.invoke('retell-proxy', {
        body: {
          action: 'createKnowledgeBase',
          organizationId,
          name,
          texts: content ? [{ title: name, content }] : undefined,
          urls: url ? [url] : undefined,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retell-knowledge-base', organizationId, platformAgentId] });
      setIsAddDialogOpen(false);
      setRetellNewName('');
      setRetellNewContent('');
      setRetellNewUrl('');
    },
  });

  const handleCreateRetellKb = async () => {
    if (!retellNewName.trim()) return;
    if (!retellNewContent.trim() && !retellNewUrl.trim()) return;
    await createRetellKb.mutateAsync({
      name: retellNewName.trim(),
      content: retellNewContent.trim() || undefined,
      url: retellNewUrl.trim() || undefined,
    });
  };

  const {
    data: retellKbDetail,
    isLoading: isLoadingRetellKbDetail,
    error: retellKbDetailError,
  } = useQuery({
    queryKey: ['retell-knowledge-base-detail', organizationId, selectedRetellKb?.id],
    queryFn: async () => {
      if (!organizationId || !selectedRetellKb?.id) throw new Error('Missing parameters');
      const { data, error } = await supabase.functions.invoke('retell-proxy', {
        body: { action: 'getKnowledgeBase', organizationId, knowledgeBaseId: selectedRetellKb.id },
      });
      if (error) throw error;
      const kb = (data as any)?.data ?? data;
      
      // Parse knowledge_base_sources (new Retell API structure)
      const sources = kb?.knowledge_base_sources || [];
      const documents = sources.filter((s: any) => s.type === 'document');
      const urls = sources.filter((s: any) => s.type === 'url');
      
      return {
        name: kb?.knowledge_base_name,
        sources,
        documents,
        urls,
      };
    },
    enabled: isRetell && !!organizationId && !!selectedRetellKb?.id && retellViewerOpen,
  });

  const handleRefresh = () => {
    if (!selectedAgentId) return;

    if (isElevenLabs) {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-knowledge-base', selectedAgentId] });
      refetchElevenKb();
      return;
    }

    if (isRetell) {
      queryClient.invalidateQueries({ queryKey: ['retell-knowledge-base', organizationId, platformAgentId] });
      refetchRetellKb();
    }
  };

  // Auto-select first agent if none selected
  if (!selectedAgentId && agents.length > 0 && !isLoadingAgents) {
    setSelectedAgentId(agents[0].id);
  }

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'url': return <Link2 className="w-4 h-4" />;
      case 'file': 
      case 'document': return <File className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  // Platform badge color
  const getPlatformBadgeClass = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'elevenlabs':
        return 'bg-primary/20 text-primary border-primary/30';
      case 'retell':
        return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
      case 'vapi':
        return 'bg-purple-500/20 text-purple-500 border-purple-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 gradient-text">Base de Connaissances</h1>
          <p className="text-muted-foreground text-lg">
            Gérez les documents de votre agent IA (ElevenLabs / Retell)
          </p>
        </div>

        {/* Agent Selector */}
        <Card className="mb-6 bg-card/50 border-border">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <Label className="text-sm text-muted-foreground mb-2 block">Sélectionner un agent</Label>
                <Select 
                  value={selectedAgentId || ''} 
                  onValueChange={setSelectedAgentId}
                  disabled={isLoadingAgents}
                >
                  <SelectTrigger className="w-full sm:w-96 bg-background border-border">
                    <SelectValue placeholder={isLoadingAgents ? "Chargement..." : "Sélectionner un agent"} />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    {agents.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-primary" />
                          <span>{agent.name}</span>
                          <Badge variant="outline" className={`text-xs ml-1 ${getPlatformBadgeClass(agent.platform)}`}>
                            {getPlatformDisplayName(agent.platform)}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Connection Status */}
              {selectedAgentId && (isElevenLabs || isRetell) && (
                <div className="flex items-center gap-2">
                  <Badge className="bg-success/20 text-success border-success/30">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Connecté
                  </Badge>
                  {isElevenLabs && totalDocs > items.length && (
                    <span className="text-sm text-muted-foreground">
                      {items.length} liés / {totalDocs} total
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions Bar */}
        {selectedAgentId && (isElevenLabs || isRetell) && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Rechercher dans la base de connaissances..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-background border-border"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleRefresh}
                variant="outline"
                disabled={isLoadingKB}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingKB ? 'animate-spin' : ''}`} />
                Rafraîchir
              </Button>

              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter
              </Button>
            </div>
          </div>
        )}

        {/* No Agent Selected State */}
        {!selectedAgentId && !isLoadingAgents && (
          <Card className="p-12 text-center border-border">
            <Bot className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">{t('knowledgeBase.noAgentSelected')}</h3>
            <p className="text-muted-foreground mb-4">
              {agents.length === 0
                ? t('knowledgeBase.noAgentConfigured')
                : t('knowledgeBase.selectAgent')}
            </p>
          </Card>
        )}

        {/* Platform Not Supported State */}
        {selectedAgentId && !isElevenLabs && !isRetell && (
          <Card className="p-12 text-center border-border">
            <Info className="w-16 h-16 mx-auto mb-4 text-blue-500" />
            <h3 className="text-lg font-semibold mb-2">Base de connaissances non disponible</h3>
            <p className="text-muted-foreground mb-4">
              La gestion de base de connaissances n'est pas disponible pour la plateforme {getPlatformDisplayName(selectedPlatform)}.
            </p>
            <Badge variant="outline" className={getPlatformBadgeClass(selectedPlatform)}>
              {getPlatformDisplayName(selectedPlatform)}
            </Badge>
          </Card>
        )}

        {/* API keys are resolved server-side; missing credentials will surface as backend errors. */}

        {/* Loading State */}
        {isLoadingKB && selectedAgentId && (isElevenLabs || isRetell) && (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-muted-foreground">Chargement de la base de connaissances...</p>
          </div>
        )}

        {/* Error State */}
        {kbError && selectedAgentId && (isElevenLabs || isRetell) && (
          <Card className="p-12 text-center border-destructive">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2">Erreur de chargement</h3>
            <p className="text-muted-foreground mb-4">
              {(kbError as Error).message || 'Une erreur est survenue'}
            </p>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Réessayer
            </Button>
          </Card>
        )}

        {/* Knowledge Base Items */}
        {!isLoadingKB && !kbError && selectedAgentId && (isElevenLabs || isRetell) && (
          <>
            {isElevenLabs ? (
              filteredItems.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredItems.map((item, index) => (
                    <motion.div
                      key={item.id || item.name}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                    >
                      <Card className="bg-card border-border hover:border-primary/50 transition-all h-full">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="p-2 bg-primary/10 rounded-lg">
                                {getItemIcon(item.type)}
                              </div>
                              <CardTitle className="text-base truncate">
                                {item.name}
                              </CardTitle>
                            </div>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {item.type}
                            </Badge>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-3">
                          {item.content && (
                            <p className="text-sm text-muted-foreground line-clamp-3">
                              {item.content.substring(0, 150)}...
                            </p>
                          )}

                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-1"
                            >
                              <Link2 className="w-3 h-3" />
                              {item.url.substring(0, 40)}...
                            </a>
                          )}

                          {item.metadata?.category && (
                            <Badge variant="secondary" className="text-xs">
                              {item.metadata.category}
                            </Badge>
                          )}

                          <div className="flex items-center justify-end gap-1 pt-2 border-t border-border">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDocument(item)}
                              className="text-primary hover:text-primary hover:bg-primary/10"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteItem(item)}
                              disabled={deleteMutation.isPending}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <Card className="p-12 text-center border-border">
                  <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Base de connaissances vide</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchTerm
                      ? 'Aucun document trouvé avec cette recherche'
                      : 'Ajoutez des documents pour enrichir votre agent'}
                  </p>
                  <Button onClick={() => setIsAddDialogOpen(true)} className="bg-primary">
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter un document
                  </Button>
                </Card>
              )
            ) : (
              kbListForRetell.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {kbListForRetell.map((kb: any, index: number) => (
                    <motion.div
                      key={kb.knowledge_base_id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                    >
                      <Card className="bg-card border-border hover:border-primary/50 transition-all h-full">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="p-2 bg-primary/10 rounded-lg">
                                <BookOpen className="w-4 h-4" />
                              </div>
                              <CardTitle className="text-base truncate">
                                {kb.knowledge_base_name || 'Base de connaissances'}
                              </CardTitle>
                            </div>
                            <Badge variant="outline" className="text-xs shrink-0">
                              retell
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-end gap-1 pt-2 border-t border-border">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedRetellKb({ id: kb.knowledge_base_id, name: kb.knowledge_base_name });
                                setRetellViewerOpen(true);
                              }}
                              className="text-primary hover:text-primary hover:bg-primary/10"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteRetellKb(kb.knowledge_base_id, kb.knowledge_base_name)}
                              disabled={deleteRetellKb.isPending}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <Card className="p-12 text-center border-border">
                  <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Base de connaissances vide</h3>
                  <p className="text-muted-foreground mb-4">
                    Ajoutez des documents pour enrichir votre agent
                  </p>
                  <Button onClick={() => setIsAddDialogOpen(true)} className="bg-primary">
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter une base
                  </Button>
                </Card>
              )
            )}
          </>
        )}

        {/* Stats Footer */}
        {selectedAgentId && ((isElevenLabs && items.length > 0) || (isRetell && kbListForRetell.length > 0)) && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {isElevenLabs
              ? `${items.length} document${items.length > 1 ? 's' : ''} dans la base de connaissances`
              : `${kbListForRetell.length} base${kbListForRetell.length > 1 ? 's' : ''} de connaissances`}
          </div>
        )}
      </div>

      {/* Document Viewer Modal */}
      {isElevenLabs && (
        <KnowledgeDocumentViewer
          document={selectedDocument}
          agentId={selectedAgentId}
          apiKey={apiKey}
          open={viewerOpen}
          onOpenChange={setViewerOpen}
        />
      )}

      {/* Retell KB Viewer */}
      <Dialog open={retellViewerOpen} onOpenChange={setRetellViewerOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{retellKbDetail?.name || selectedRetellKb?.name || 'Base de connaissances'}</DialogTitle>
            <DialogDescription>Contenu de la base de connaissances Retell</DialogDescription>
          </DialogHeader>

          {isLoadingRetellKbDetail ? (
            <div className="py-6 text-center text-muted-foreground">Chargement…</div>
          ) : retellKbDetailError ? (
            <div className="py-6 text-center text-destructive">Erreur: {(retellKbDetailError as Error).message}</div>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Documents (PDFs, fichiers) */}
              {retellKbDetail?.documents?.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <File className="w-4 h-4" />
                    Documents ({retellKbDetail.documents.length})
                  </div>
                  <div className="space-y-2">
                    {retellKbDetail.documents.map((doc: any) => (
                      <div key={doc.source_id || doc.filename} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="flex-1 truncate text-sm">{doc.filename || 'Document'}</span>
                        {doc.file_url && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* URLs */}
              {retellKbDetail?.urls?.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    URLs ({retellKbDetail.urls.length})
                  </div>
                  <div className="space-y-2">
                    {retellKbDetail.urls.map((item: any) => (
                      <a 
                        key={item.source_id || item.url} 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-sm text-primary hover:underline flex items-center gap-1 p-2 bg-muted rounded-lg"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {item.url}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Aucun contenu */}
              {!retellKbDetail?.documents?.length && !retellKbDetail?.urls?.length && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Aucun contenu dans cette base de connaissances.
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRetellViewerOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Document Modal */}
      {selectedAgentId && (
        isElevenLabs ? (
          <AddKnowledgeDocumentModal
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            agentId={selectedAgentId}
            apiKey={undefined}
            organizationId={organizationId}
          />
        ) : (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Ajouter une base de connaissances (Retell)</DialogTitle>
                <DialogDescription>
                  Crée une nouvelle base et y ajoute un texte ou une URL.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input value={retellNewName} onChange={(e) => setRetellNewName(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Contenu (optionnel si URL)</Label>
                  <Textarea rows={6} value={retellNewContent} onChange={(e) => setRetellNewContent(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>URL (optional if content is provided)</Label>
                  <Input value={retellNewUrl} onChange={(e) => setRetellNewUrl(e.target.value)} placeholder="https://…" />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateRetellKb} disabled={createRetellKb.isPending}>
                  {createRetellKb.isPending ? 'Adding…' : 'Add'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      )}
    </AppLayout>
  );
};

export default KnowledgeBase;
