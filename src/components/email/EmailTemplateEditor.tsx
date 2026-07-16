import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Editor } from '@tinymce/tinymce-react';
import { Save, Loader2 } from 'lucide-react';
import { EmailTemplate } from '@/hooks/useEmailTemplates';

interface EmailTemplateEditorProps {
  template: EmailTemplate | null;
  onSave: (data: Partial<EmailTemplate>) => void;
  isSaving: boolean;
}

export const EmailTemplateEditor = ({ template, onSave, isSaving }: EmailTemplateEditorProps) => {
  const [subject, setSubject] = useState('');
  const [greeting, setGreeting] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (template) {
      setSubject(template.subject || '');
      setGreeting(template.greeting || '');
      setBody(template.body || '');
    }
  }, [template]);

  const handleSave = () => {
    onSave({
      id: template?.id,
      subject,
      greeting,
      body,
    });
  };

  if (!template) {
    return (
      <Card className="glass-card">
        <CardContent className="flex items-center justify-center h-[400px] text-muted-foreground">
          Select a template to edit
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Edit template</CardTitle>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="subject">Email subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ex: Bienvenue chez {{company}}, {{name}} !"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="greeting">Salutation</Label>
          <Input
            id="greeting"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Ex: Bonjour {{name}},"
          />
        </div>

        <div className="space-y-2">
          <Label>Contenu de l'email</Label>
          <div className="border rounded-lg overflow-hidden">
            <Editor
              apiKey="no-api-key"
              value={body}
              onEditorChange={(content) => setBody(content)}
              init={{
                height: 300,
                menubar: false,
                plugins: [
                  'advlist', 'autolink', 'lists', 'link', 'charmap',
                  'searchreplace', 'visualblocks', 'code',
                  'insertdatetime', 'table', 'help', 'wordcount'
                ],
                toolbar: 'undo redo | blocks | ' +
                  'bold italic forecolor | alignleft aligncenter ' +
                  'alignright alignjustify | bullist numlist outdent indent | ' +
                  'link | removeformat | help',
                content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px }',
                skin: 'oxide-dark',
                content_css: 'dark',
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Utilisez les variables dynamiques comme {'{{name}}'}, {'{{company}}'}, etc.
          </p>
        </div>

        {/* Fallback textarea if TinyMCE doesn't load */}
        <noscript>
          <div className="space-y-2">
            <Label>Contenu (HTML)</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="<p>Votre contenu HTML ici...</p>"
            />
          </div>
        </noscript>
      </CardContent>
    </Card>
  );
};
