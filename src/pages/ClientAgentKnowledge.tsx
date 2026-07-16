import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useClientAgentAccess } from '@/hooks/useClientAgentAccess';
import { 
  useClientElevenLabsKnowledgeBase, 
  useClientElevenLabsKnowledgeBaseDocument,
  useClientAddKnowledgeBaseText,
  useClientDeleteKnowledgeBaseItem 
} from '@/hooks/useClientElevenLabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  BookOpen, 
  Plus, 
  Search,
  FileText,
  Tag,
  Lock,
  Eye,
  Trash2,
  RefreshCw,
  Link as LinkIcon,
  ExternalLink,
  Edit,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

// Hook for updating knowledge base document (recreate strategy)
const useClientUpdateKnowledgeDocument = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      apiKey, 
      agentId, 
      documentId, 
      name, 
      content, 
      deleteOld = true,
      organizationId
    }: { 
      apiKey?: string | null;
      agentId: string;
      documentId: string;
      name: string; 
      content: string;
      deleteOld?: boolean;
      organizationId?: string | null;
    }) => {
      // Create new document
      const { data: createData, error: createError } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: {
          action: 'create_text',
          agentId,
          apiKey: apiKey || undefined,
          organizationId: organizationId || undefined,
          title: name,
          content,
        },
      });

      if (createError) throw createError;
      if (createData?.error) throw new Error(createData.error);

      // Delete old document if requested
      if (deleteOld && documentId) {
        try {
          await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
            body: {
              action: 'delete',
              agentId,
              apiKey: apiKey || undefined,
              organizationId: organizationId || undefined,
              documentId,
            },
          });
        } catch (e) {
          console.warn('Could not delete old document:', e);
        }
      }

      return createData;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['client-elevenlabs-knowledge-base', variables.agentId] });
      queryClient.invalidateQueries({ queryKey: ['client-elevenlabs-kb-document'] });
      toast.success('Document updated successfully');
    },
    onError: (error: any) => {
      if (error.message?.includes('403') || error.message?.includes('Access denied')) {
        toast.error('Access denied. Only administrators can edit documents.');
      } else {
        toast.error(error.message || 'Error while editing');
      }
    },
  });
};

const ClientAgentKnowledge = () => {
  const { clientId, agentId } = useParams();
  const { apiKey, platformAgentId, agentName, canEdit, organizationId } = useClientAgentAccess(clientId, agentId);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewDocumentId, setViewDocumentId] = useState<string | null>(null);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ title: '', content: '', category: '' });
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');

  const { data: knowledgeBase, isLoading, error, refetch } = useClientElevenLabsKnowledgeBase({
    apiKey,
    agentId: platformAgentId,
    organizationId,
  });

  const { data: documentData, isLoading: isLoadingDocument } = useClientElevenLabsKnowledgeBaseDocument(
    { apiKey, agentId: platformAgentId, organizationId },
    viewDocumentId
  );

  const addMutation = useClientAddKnowledgeBaseText();
  const deleteMutation = useClientDeleteKnowledgeBaseItem();
  const updateMutation = useClientUpdateKnowledgeDocument();

  const items = knowledgeBase?.knowledge_base?.items || [];
  const categories = knowledgeBase?.knowledge_base?.categories || [];

  const filteredItems = items.filter((item: any) => {
    const itemTitle = item.title || item.name || '';
    const itemContent = item.content || '';
    const matchesSearch = 
      itemTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      itemContent.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleAddItem = async () => {
    if ((!apiKey && !organizationId) || !platformAgentId) return;
    if (!newItem.title || !newItem.content) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      await addMutation.mutateAsync({
        apiKey,
        agentId: platformAgentId,
        title: newItem.title,
        content: newItem.content,
        category: newItem.category || 'General',
        organizationId,
      });

      setIsAddModalOpen(false);
      setNewItem({ title: '', content: '', category: '' });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDeleteItem = async () => {
    if ((!apiKey && !organizationId) || !platformAgentId || !deleteDocumentId) return;

    try {
      await deleteMutation.mutateAsync({
        apiKey,
        agentId: platformAgentId,
        documentId: deleteDocumentId,
        organizationId,
      });
      setDeleteDocumentId(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleOpenView = (docId: string, docName: string) => {
    setViewDocumentId(docId);
    setIsEditMode(false);
    setEditName(docName);
    setEditContent('');
  };

  const handleStartEdit = () => {
    if (documentData?.document) {
      setEditName(documentData.document.name || '');
      setEditContent(documentData.document.content || '');
    }
    setIsEditMode(true);
  };

  const handleSaveEdit = async () => {
    if ((!apiKey && !organizationId) || !platformAgentId || !viewDocumentId || !editName.trim() || !editContent.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        apiKey,
        agentId: platformAgentId,
        documentId: viewDocumentId,
        name: editName,
        content: editContent,
        deleteOld: true,
        organizationId,
      });
      setViewDocumentId(null);
      setIsEditMode(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const getItemIcon = (type: string) => {
    if (type === 'url' || type === 'link') return <LinkIcon className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Base de connaissances</h1>
          <p className="text-muted-foreground">Informations disponibles pour {agentName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canEdit ? (
            <Button onClick={() => setIsAddModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          ) : (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Read only
            </Badge>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((cat: string) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Knowledge Base Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!apiKey || !platformAgentId ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">ElevenLabs configuration is missing for this agent</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-destructive/50 mb-4" />
              <p className="text-muted-foreground mb-4">Error loading the knowledge base</p>
              <Button variant="outline" onClick={() => refetch()}>Try again</Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {searchTerm || selectedCategory !== 'all' 
                  ? 'No results found' 
                  : 'The knowledge base is empty'
                }
              </p>
              {canEdit && !searchTerm && selectedCategory === 'all' && (
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setIsAddModalOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add first item
                </Button>
              )}
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <div className="space-y-3 pr-4">
                {filteredItems.map((item: any, index: number) => (
                  <div
                    key={item.id || index}
                    className="p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {getItemIcon(item.type)}
                          <h3 className="font-medium truncate">{item.title || item.name}</h3>
                          {item.category && (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              {item.category}
                            </Badge>
                          )}
                          {item.type && (
                            <Badge variant="outline" className="text-xs">
                              {item.type}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {item.content || item.url || 'Click to view full content'}
                        </p>
                        {item.created_at && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Created on {new Date(item.created_at).toLocaleDateString('en-US')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleOpenView(item.id, item.title || item.name || '')}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {item.url && (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => window.open(item.url, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        {canEdit && (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteDocumentId(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* View/Edit Document Modal */}
      <Dialog open={!!viewDocumentId} onOpenChange={(open) => { if (!open) { setViewDocumentId(null); setIsEditMode(false); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {isEditMode ? 'Edit document' : (documentData?.document?.name || 'Document')}
            </DialogTitle>
            <DialogDescription>
              {isEditMode ? 'Edit the document content' : 'Full document content'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {isLoadingDocument ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : isEditMode ? (
              <div className="space-y-4 p-1">
                <div className="space-y-2">
                  <Label>Document name</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Document name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Content</Label>
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Document content..."
                    rows={12}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            ) : documentData?.document?.content ? (
              <div className="whitespace-pre-wrap text-sm p-4 bg-muted rounded-lg">
                {documentData.document.content}
              </div>
            ) : documentData?.document?.url ? (
              <div className="p-4">
                <p className="text-sm text-muted-foreground mb-2">Document linked to a URL:</p>
                <a 
                  href={documentData.document.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  {documentData.document.url}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : documentData?.document?.content_unavailable_reason ? (
              <div className="p-4 text-center">
                <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">
                  {documentData.document.content_unavailable_reason === 'binary_or_not_extractible' 
                    ? 'This file is binary or its content cannot be extracted.'
                    : 'This document content is not available.'}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground p-4 text-center">No content available</p>
            )}
          </ScrollArea>
          <DialogFooter className="gap-2">
            {isEditMode ? (
              <>
                <Button variant="outline" onClick={() => setIsEditMode(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit} disabled={updateMutation.isPending} className="gap-2">
                  {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setViewDocumentId(null)}>
                  Close
                </Button>
                {canEdit && documentData?.document?.type !== 'url' && documentData?.document?.content && (
                  <Button onClick={handleStartEdit} className="gap-2">
                    <Edit className="h-4 w-4" />
                    Edit
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to knowledge base</DialogTitle>
            <DialogDescription>
              Add text content that will be used by the agent
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newItem.title}
                onChange={(e) => setNewItem(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Item title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={newItem.category}
                onChange={(e) => setNewItem(prev => ({ ...prev, category: e.target.value }))}
                placeholder="Example: FAQ, Products, Services..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={newItem.content}
                onChange={(e) => setNewItem(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Item content..."
                rows={8}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddItem} disabled={addMutation.isPending}>
              {addMutation.isPending ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDocumentId} onOpenChange={(open) => !open && setDeleteDocumentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The document will be permanently removed from the knowledge base.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClientAgentKnowledge;