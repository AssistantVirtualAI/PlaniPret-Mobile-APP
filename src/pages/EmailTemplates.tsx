import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Plus, Trash2 } from 'lucide-react';
import { useEmailTemplates, TEMPLATE_TYPES, EmailTemplate } from '@/hooks/useEmailTemplates';
import { EmailTemplateEditor } from '@/components/email/EmailTemplateEditor';
import { EmailPreview } from '@/components/email/EmailPreview';
import { VariablesHelper } from '@/components/email/VariablesHelper';
import { useOrganization } from '@/context/OrganizationContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function EmailTemplates() {
  const { templates, isLoading, createTemplate, updateTemplate, deleteTemplate } = useEmailTemplates();
  const { selectedOrg: selectedOrganization } = useOrganization();
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  const handleCreateTemplate = (templateType: string) => {
    const typeInfo = TEMPLATE_TYPES.find(t => t.value === templateType);
    createTemplate.mutate({
      template_type: templateType,
      subject: `${typeInfo?.label || templateType}`,
      greeting: 'Bonjour {{name}},',
      body: '<p>Contenu de votre email ici...</p>',
    });
  };

  const handleSaveTemplate = (data: Partial<EmailTemplate>) => {
    if (data.id) {
      updateTemplate.mutate(data as EmailTemplate & { id: string });
    }
  };

  const handleDeleteTemplate = () => {
    if (templateToDelete) {
      deleteTemplate.mutate(templateToDelete);
      if (selectedTemplate?.id === templateToDelete) {
        setSelectedTemplate(null);
      }
      setTemplateToDelete(null);
    }
  };

  const getTemplateByType = (type: string) => {
    return templates.find(t => t.template_type === type);
  };

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold gradient-text mb-2">
            Templates Email
          </h1>
          <p className="text-muted-foreground">
            Personnalisez vos emails avec un éditeur WYSIWYG et des variables dynamiques
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Template List */}
          <div className="space-y-4">
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Mail className="w-6 h-6 text-primary" />
                  <div>
                    <CardTitle>Types de templates</CardTitle>
                    <CardDescription>Sélectionnez ou créez un template</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? (
                  <>
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </>
                ) : (
                  TEMPLATE_TYPES.map((type) => {
                    const existingTemplate = getTemplateByType(type.value);
                    const isSelected = selectedTemplate?.template_type === type.value;

                    return (
                      <div
                        key={type.value}
                        className={`p-3 rounded-lg border transition-all cursor-pointer ${
                          isSelected 
                            ? 'border-primary bg-primary/10' 
                            : 'border-border hover:border-primary/50 hover:bg-muted/30'
                        }`}
                        onClick={() => existingTemplate && setSelectedTemplate(existingTemplate)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{type.label}</p>
                            <p className="text-xs text-muted-foreground">{type.description}</p>
                          </div>
                          {existingTemplate ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">Configuré</Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTemplateToDelete(existingTemplate.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateTemplate(type.value);
                              }}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Create
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <VariablesHelper />
          </div>

          {/* Editor */}
          <div className="lg:col-span-2 space-y-4">
            <EmailTemplateEditor
              template={selectedTemplate}
              onSave={handleSaveTemplate}
              isSaving={updateTemplate.isPending}
            />

            {selectedTemplate && (
              <EmailPreview
                subject={selectedTemplate.subject || ''}
                greeting={selectedTemplate.greeting || ''}
                body={selectedTemplate.body || ''}
                organizationName={selectedOrganization?.name}
              />
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!templateToDelete} onOpenChange={() => setTemplateToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The template will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
