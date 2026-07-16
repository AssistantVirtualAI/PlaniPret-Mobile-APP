import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Link2, Plus, Loader2, Upload, X } from 'lucide-react';
import { useAddKnowledgeBaseItem, useAddKnowledgeBaseUrl, useAddKnowledgeBaseFile } from '@/hooks/useElevenLabsKnowledgeBase';

interface AddKnowledgeDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  apiKey?: string;
  organizationId?: string;
}

const CATEGORIES = [
  'Général',
  'FAQ',
  'Produits',
  'Services',
  'Politiques',
  'Support',
  'Tarifs',
  'Contact',
  'À propos',
];

const ACCEPTED_FILE_TYPES = '.pdf,.xlsx,.xls,.csv,.doc,.docx,.pptx,.html,.txt,.md';
const MAX_FILE_SIZE_MB = 50;

export function AddKnowledgeDocumentModal({ 
  open, 
  onOpenChange, 
  agentId, 
  apiKey,
  organizationId
}: AddKnowledgeDocumentModalProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'url' | 'file'>('text');
  
  // Text form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Général');
  
  // URL form state
  const [url, setUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');

  // File form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addTextMutation = useAddKnowledgeBaseItem();
  const addUrlMutation = useAddKnowledgeBaseUrl();
  const addFileMutation = useAddKnowledgeBaseFile();

  const isLoading = addTextMutation.isPending || addUrlMutation.isPending || addFileMutation.isPending;

  const resetForm = () => {
    setTitle('');
    setContent('');
    setCategory('Général');
    setUrl('');
    setUrlTitle('');
    setSelectedFile(null);
    setFileTitle('');
    setActiveTab('text');
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`Le fichier dépasse la limite de ${MAX_FILE_SIZE_MB} Mo`);
      return;
    }

    setSelectedFile(file);
    if (!fileTitle) {
      setFileTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileTitle('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddText = async () => {
    if (!title || !content) return;
    await addTextMutation.mutateAsync({
      agentId,
      apiKey,
      title,
      content,
      category,
      organizationId,
    });
    handleClose();
  };

  const handleAddUrl = async () => {
    if (!url) return;
    await addUrlMutation.mutateAsync({
      agentId,
      apiKey,
      url,
      title: urlTitle || undefined,
      organizationId,
    });
    handleClose();
  };

  const handleAddFile = async () => {
    if (!selectedFile) return;
    await addFileMutation.mutateAsync({
      agentId,
      apiKey,
      file: selectedFile,
      title: fileTitle || undefined,
      organizationId,
    });
    handleClose();
  };

  const handleSubmit = () => {
    if (activeTab === 'text') {
      handleAddText();
    } else if (activeTab === 'url') {
      handleAddUrl();
    } else {
      handleAddFile();
    }
  };

  const canSubmit = 
    activeTab === 'text' ? (title.trim() && content.trim()) :
    activeTab === 'url' ? url.trim() :
    !!selectedFile;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Ajouter un document
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'text' | 'url' | 'file')} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="text" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Texte
            </TabsTrigger>
            <TabsTrigger value="url" className="flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              URL
            </TabsTrigger>
            <TabsTrigger value="file" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Fichier
            </TabsTrigger>
          </TabsList>

          {/* Text Tab */}
          <TabsContent value="text" className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Titre *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: FAQ Produits"
                  className="bg-background"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="category">Catégorie</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Contenu *</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Entrez le contenu du document..."
                className="min-h-[200px] bg-background font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {content.length} caractères
              </p>
            </div>
          </TabsContent>

          {/* URL Tab */}
          <TabsContent value="url" className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">URL *</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/documentation"
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground">
                Le contenu de la page web sera automatiquement extrait et indexé
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="urlTitle">Titre (optionnel)</Label>
              <Input
                id="urlTitle"
                value={urlTitle}
                onChange={(e) => setUrlTitle(e.target.value)}
                placeholder="Titre personnalisé pour ce document"
                className="bg-background"
              />
            </div>
          </TabsContent>

          {/* File Tab */}
          <TabsContent value="file" className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fileTitle">Titre (optionnel)</Label>
              <Input
                id="fileTitle"
                value={fileTitle}
                onChange={(e) => setFileTitle(e.target.value)}
                placeholder="Titre personnalisé pour ce fichier"
                className="bg-background"
              />
            </div>

            <div className="space-y-2">
              <Label>Fichier *</Label>
              {selectedFile ? (
                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border">
                  <Upload className="w-5 h-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFile}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium mb-1">Cliquez pour sélectionner un fichier</p>
                  <p className="text-xs text-muted-foreground">
                    PDF, Word, Excel, PowerPoint, HTML, TXT, Markdown, CSV
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Maximum {MAX_FILE_SIZE_MB} Mo
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Annuler
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!canSubmit || isLoading}
            className="min-w-[120px]"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {activeTab === 'file' ? 'Upload...' : 'Ajout...'}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Ajouter
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
