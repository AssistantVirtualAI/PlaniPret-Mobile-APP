import { useState, useMemo } from 'react';
import { usePortal } from '@/hooks/usePortalAuth';
import {
  usePortalKnowledgeBase,
  usePortalKnowledgeDocument,
  usePortalAddKnowledgeDocument,
  usePortalDeleteKnowledgeDocument,
  usePortalUpdateKnowledgeDocument,
} from '@/hooks/usePortalKnowledgeBase';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BookOpen,
  Search,
  FileText,
  Plus,
  Calendar,
  Trash2,
  ExternalLink,
  Loader2,
  AlertCircle,
  Eye,
  Link as LinkIcon,
  RefreshCw,
  Filter,
  Edit,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { GlowBadge } from '@/components/portal/GlowBadge';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

const PortalKnowledge = () => {
  const { session } = usePortal();

  const { data: kbData, isLoading, refetch } = usePortalKnowledgeBase();
  const addDocument = usePortalAddKnowledgeDocument();
  const deleteDocument = usePortalDeleteKnowledgeDocument();
  const updateDocument = usePortalUpdateKnowledgeDocument();

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [addType, setAddType] = useState<'text' | 'url'>('text');

  // View modal state
  const [viewDocumentId, setViewDocumentId] = useState<string | null>(null);
  
  // Edit modal state
  const [editDocumentId, setEditDocumentId] = useState<string | null>(null);
  const [editDocName, setEditDocName] = useState('');
  const [editDocContent, setEditDocContent] = useState('');
  const [editDocUrl, setEditDocUrl] = useState('');
  const [editDocType, setEditDocType] = useState<'text' | 'url'>('text');

  const { data: documentData, isLoading: isLoadingDocument } = usePortalKnowledgeDocument(viewDocumentId);
  const { data: editDocumentData, isLoading: isLoadingEditDocument } = usePortalKnowledgeDocument(editDocumentId);

  // Permissions: modification uniquement si l'utilisateur a explicitement le droit
  const canEdit =
    session?.role === 'super_admin' ||
    session?.role === 'admin' ||
    session?.canEditKnowledge === true ||
    session?.memberRole === 'admin';

  // Read from the unified knowledge base response
  const items = kbData?.items || [];
  const allDocumentsCount = kbData?.total || items.length;

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((doc: any) => {
      const cat = doc.category || doc.type || 'Général';
      cats.add(cat);
    });
    return Array.from(cats).sort();
  }, [items]);

  const filteredDocuments = items.filter((doc: any) => {
    const docName = doc.name || doc.title || '';
    const docCategory = doc.category || doc.type || 'Général';
    
    if (searchTerm && !docName.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    if (categoryFilter !== 'all' && docCategory !== categoryFilter) {
      return false;
    }
    
    return true;
  });

  const handleAddDocument = async () => {
    if (!newDocName.trim()) {
      toast.error('Veuillez remplir le nom du document');
      return;
    }
    if (addType === 'text' && !newDocContent.trim()) {
      toast.error('Veuillez remplir le contenu du document');
      return;
    }
    if (addType === 'url' && !newDocUrl.trim()) {
      toast.error('Veuillez remplir l\'URL du document');
      return;
    }

    try {
      await addDocument.mutateAsync({ 
        name: newDocName, 
        content: addType === 'text' ? newDocContent : undefined,
        url: addType === 'url' ? newDocUrl : undefined,
      });
      toast.success('Document ajouté avec succès');
      setIsAddModalOpen(false);
      setNewDocName('');
      setNewDocContent('');
      setNewDocUrl('');
      setAddType('text');
    } catch (error: any) {
      if (error.message?.includes('403') || error.message?.includes('Accès refusé')) {
        toast.error('Accès refusé. Seuls les administrateurs peuvent ajouter des documents.');
      } else {
        toast.error('Erreur lors de l\'ajout du document');
      }
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce document ?')) return;

    try {
      await deleteDocument.mutateAsync(documentId);
      toast.success('Document supprimé');
    } catch (error: any) {
      if (error.message?.includes('403') || error.message?.includes('Accès refusé')) {
        toast.error('Accès refusé. Seuls les administrateurs peuvent supprimer des documents.');
      } else {
        toast.error('Erreur lors de la suppression');
      }
    }
  };

  const handleOpenView = (docId: string) => {
    setViewDocumentId(docId);
  };

  const handleOpenEdit = (doc: any) => {
    setEditDocumentId(doc.id);
    setEditDocName(doc.name || doc.title || '');
    setEditDocType(doc.url && !doc.content ? 'url' : 'text');
    setEditDocContent('');
    setEditDocUrl(doc.url || '');
  };

  // Populate edit form when document data loads
  useMemo(() => {
    if (editDocumentData && editDocumentId) {
      if (editDocumentData.content && !editDocContent) {
        setEditDocContent(editDocumentData.content);
      }
      if (editDocumentData.url && !editDocUrl) {
        setEditDocUrl(editDocumentData.url);
      }
    }
  }, [editDocumentData, editDocumentId]);

  const handleUpdateDocument = async () => {
    if (!editDocumentId) return;
    
    if (!editDocName.trim()) {
      toast.error('Veuillez remplir le nom du document');
      return;
    }
    if (editDocType === 'text' && !editDocContent.trim()) {
      toast.error('Veuillez remplir le contenu du document');
      return;
    }
    if (editDocType === 'url' && !editDocUrl.trim()) {
      toast.error('Veuillez remplir l\'URL du document');
      return;
    }

    try {
      await updateDocument.mutateAsync({
        documentId: editDocumentId,
        name: editDocName,
        content: editDocType === 'text' ? editDocContent : undefined,
        url: editDocType === 'url' ? editDocUrl : undefined,
      });
      toast.success('Document mis à jour avec succès');
      setEditDocumentId(null);
      setEditDocName('');
      setEditDocContent('');
      setEditDocUrl('');
    } catch (error: any) {
      if (error.message?.includes('403') || error.message?.includes('Accès refusé')) {
        toast.error('Accès refusé. Seuls les administrateurs peuvent modifier des documents.');
      } else {
        toast.error('Erreur lors de la mise à jour du document');
      }
    }
  };

  const getDocIcon = (type: string) => {
    if (type === 'url' || type === 'link') return <LinkIcon className="h-5 w-5 text-primary" />;
    return <FileText className="h-5 w-5 text-primary" />;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PortalPageHeader
        icon={BookOpen}
        title="Base de connaissances"
        description={`${session?.agentName} • ${items.length} document(s) liés${allDocumentsCount > items.length ? ` (${allDocumentsCount} total)` : ''}`}
        gradient="green-cyan"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
            </Button>
            {!canEdit && (
              <GlowBadge variant="secondary">Lecture seule</GlowBadge>
            )}
            {canEdit && (
              <Button 
                className="gap-2 bg-gradient-to-r from-primary to-purple-500"
                onClick={() => setIsAddModalOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Ajouter
              </Button>
            )}
          </div>
        }
      />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/30">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Aucun document</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              La base de connaissances est vide. Ajoutez des documents pour enrichir les réponses de l'agent.
            </p>
            {canEdit && (
              <Button onClick={() => setIsAddModalOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Ajouter un document
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          <Card className="bg-card/50 backdrop-blur-sm border-border/30">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Rechercher dans la base de connaissances..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    className="pl-10 bg-muted/30 border-border/50 h-11" 
                  />
                </div>
                {categories.length > 1 && (
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-full md:w-48 bg-muted/30 border-border/50">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les catégories</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {filteredDocuments.length} document(s) affiché(s) sur {items.length}
              </p>
            </CardContent>
          </Card>

          <ScrollArea className="h-[calc(100vh-380px)]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocuments.map((doc: any, index: number) => (
                <motion.div
                  key={doc.id || index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="bg-card/50 backdrop-blur-sm border-border/30 hover:border-primary/30 transition-all group h-full">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          {getDocIcon(doc.type)}
                        </div>
                        <GlowBadge variant="secondary" className="text-xs">
                          {doc.type || 'text'}
                        </GlowBadge>
                      </div>
                      
                      <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors truncate">
                        {doc.name || doc.title || 'Sans titre'}
                      </h3>

                      {doc.content && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {doc.content.substring(0, 100)}...
                        </p>
                      )}
                      
                      {doc.created_at && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(doc.created_at), 'dd MMM yyyy', { locale: fr })}
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-4">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="flex-1 gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleOpenView(doc.id)}
                        >
                          <Eye className="h-3 w-3" />
                          Voir
                        </Button>
                        {canEdit && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleOpenEdit(doc)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        )}
                        {doc.url && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => window.open(doc.url, '_blank')}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
                        {canEdit && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteDocument(doc.id)}
                            disabled={deleteDocument.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* View Document Modal */}
      <Dialog open={!!viewDocumentId} onOpenChange={(open) => { if (!open) setViewDocumentId(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {documentData?.name || documentData?.title || 'Document'}
            </DialogTitle>
            <DialogDescription>Contenu complet du document</DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh]">
            {isLoadingDocument ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : documentData?.content ? (
              <div className="whitespace-pre-wrap text-sm p-4 bg-muted rounded-lg">
                {documentData.content}
              </div>
            ) : documentData?.url ? (
              <div className="p-4">
                <p className="text-sm text-muted-foreground mb-2">Document lié à une URL :</p>
                <a 
                  href={documentData.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  {documentData.url}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : documentData?.contentUnavailableReason ? (
              <div className="p-4 text-center">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {documentData.contentUnavailableReason === 'binary_content' || documentData.contentUnavailableReason === 'binary_or_not_extractible'
                    ? 'Ce fichier est binaire et son contenu ne peut pas être affiché.'
                    : 'Le contenu de ce document n\'est pas disponible.'}
                </p>
                {documentData.url && (
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => window.open(documentData.url, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Ouvrir le fichier
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground p-4 text-center">Aucun contenu disponible</p>
            )}
          </ScrollArea>

          <DialogFooter>
            {canEdit && documentData && (
              <Button variant="outline" onClick={() => { setViewDocumentId(null); handleOpenEdit(documentData); }}>
                <Edit className="h-4 w-4 mr-2" />
                Modifier
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewDocumentId(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Document Modal */}
      <Dialog open={!!editDocumentId} onOpenChange={(open) => { if (!open) { setEditDocumentId(null); setEditDocContent(''); setEditDocUrl(''); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier le document</DialogTitle>
            <DialogDescription>Mettez à jour le contenu du document</DialogDescription>
          </DialogHeader>
          
          {isLoadingEditDocument ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Type de document</label>
                <Select value={editDocType} onValueChange={(v: 'text' | 'url') => setEditDocType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texte</SelectItem>
                    <SelectItem value="url">URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Nom du document</label>
                <Input
                  value={editDocName}
                  onChange={(e) => setEditDocName(e.target.value)}
                  placeholder="Ex: FAQ Produit"
                />
              </div>
              {editDocType === 'text' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Contenu</label>
                  <Textarea
                    value={editDocContent}
                    onChange={(e) => setEditDocContent(e.target.value)}
                    placeholder="Entrez le contenu du document..."
                    rows={10}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">URL</label>
                  <Input
                    value={editDocUrl}
                    onChange={(e) => setEditDocUrl(e.target.value)}
                    placeholder="https://example.com/document"
                  />
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDocumentId(null); setEditDocContent(''); setEditDocUrl(''); }}>
              Annuler
            </Button>
            <Button 
              onClick={handleUpdateDocument} 
              disabled={updateDocument.isPending || isLoadingEditDocument}
              className="gap-2"
            >
              {updateDocument.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Document Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Type de document</label>
              <Select value={addType} onValueChange={(v: 'text' | 'url') => setAddType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texte</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nom du document</label>
              <Input
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                placeholder="Ex: FAQ Produit"
              />
            </div>
            {addType === 'text' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Contenu</label>
                <Textarea
                  value={newDocContent}
                  onChange={(e) => setNewDocContent(e.target.value)}
                  placeholder="Entrez le contenu du document..."
                  rows={8}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">URL</label>
                <Input
                  value={newDocUrl}
                  onChange={(e) => setNewDocUrl(e.target.value)}
                  placeholder="https://example.com/document"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Annuler
            </Button>
            <Button 
              onClick={handleAddDocument} 
              disabled={addDocument.isPending}
              className="gap-2"
            >
              {addDocument.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default PortalKnowledge;
