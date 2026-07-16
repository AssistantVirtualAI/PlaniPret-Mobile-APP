import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, MessageSquare, Copy, Variable } from "lucide-react";
import { useSmsTemplates, SmsTemplate } from "@/hooks/useSmsTemplates";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "general", label: "Général" },
  { value: "reminder", label: "Rappel" },
  { value: "confirmation", label: "Confirmation" },
  { value: "promotion", label: "Promotion" },
  { value: "follow_up", label: "Suivi" },
];

const AVAILABLE_VARIABLES = [
  { name: "{{name}}", description: "Nom du contact" },
  { name: "{{phone}}", description: "Numéro de téléphone" },
  { name: "{{company}}", description: "Nom de l'entreprise" },
  { name: "{{date}}", description: "Date du rendez-vous" },
  { name: "{{time}}", description: "Heure du rendez-vous" },
  { name: "{{agent_name}}", description: "Nom de l'agent" },
  { name: "{{link}}", description: "Lien personnalisé" },
];

export default function SmsTemplates() {
  const { templates, isLoading, createTemplate, updateTemplate, deleteTemplate } = useSmsTemplates();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    content: "",
    category: "general",
    is_active: true,
  });

  const resetForm = () => {
    setFormData({ name: "", content: "", category: "general", is_active: true });
    setEditingTemplate(null);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.content) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    // Extract variables from content
    const variableMatches = formData.content.match(/\{\{[^}]+\}\}/g) || [];
    const variables = [...new Set(variableMatches)];

    if (editingTemplate) {
      await updateTemplate(editingTemplate.id, { ...formData, variables });
    } else {
      await createTemplate({ ...formData, variables });
    }

    resetForm();
    setIsCreateOpen(false);
  };

  const handleEdit = (template: SmsTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      content: template.content,
      category: template.category || "general",
      is_active: template.is_active,
    });
    setIsCreateOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce template ?")) {
      await deleteTemplate(id);
    }
  };

  const insertVariable = (variable: string) => {
    setFormData(prev => ({
      ...prev,
      content: prev.content + variable,
    }));
  };

  const copyContent = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success("Contenu copié !");
  };

  const charCount = formData.content.length;
  const smsCount = Math.ceil(charCount / 160) || 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Templates SMS</h1>
          <p className="text-muted-foreground">Gérez vos modèles de messages pour les campagnes outbound</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Edit template" : "Create SMS template"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Template name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Example: Appointment confirmation"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Message content *</Label>
                  <span className="text-xs text-muted-foreground">
                    {charCount} characters ({smsCount} SMS)
                  </span>
                </div>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Bonjour {{name}}, votre rendez-vous est confirmé pour le {{date}} à {{time}}."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Variable className="h-4 w-4" />
                  Available variables
                </Label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_VARIABLES.map(variable => (
                    <Button
                      key={variable.name}
                      variant="outline"
                      size="sm"
                      onClick={() => insertVariable(variable.name)}
                      title={variable.description}
                    >
                      {variable.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
                <Label>Active template</Label>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  resetForm();
                  setIsCreateOpen(false);
                }}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit}>
                  {editingTemplate ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Modèles de messages ({templates.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Chargement...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucun template SMS. Créez votre premier modèle.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Contenu</TableHead>
                  <TableHead>Variables</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {CATEGORIES.find(c => c.value === template.category)?.label || template.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{template.content}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {template.variables?.slice(0, 3).map((v, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {v}
                          </Badge>
                        ))}
                        {(template.variables?.length || 0) > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{(template.variables?.length || 0) - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={template.is_active ? "default" : "secondary"}>
                        {template.is_active ? "Actif" : "Inactif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyContent(template.content)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(template.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
