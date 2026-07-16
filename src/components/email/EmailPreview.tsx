import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye } from 'lucide-react';
import DOMPurify from 'dompurify';

interface EmailPreviewProps {
  subject: string;
  greeting: string;
  body: string;
  organizationName?: string;
}

export const EmailPreview = ({ subject, greeting, body, organizationName = 'Votre Entreprise' }: EmailPreviewProps) => {
  // Replace variables with sample data
  const replaceVariables = (text: string) => {
    return text
      .replace(/\{\{name\}\}/g, 'Jean Dupont')
      .replace(/\{\{email\}\}/g, 'jean.dupont@example.com')
      .replace(/\{\{company\}\}/g, organizationName)
      .replace(/\{\{link\}\}/g, 'https://example.com/action')
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString('fr-FR'));
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eye className="w-4 h-4" />
          Prévisualisation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden bg-white text-black">
          {/* Email header */}
          <div className="bg-muted/20 p-4 border-b">
            <div className="text-xs text-muted-foreground mb-1">De: {organizationName} &lt;noreply@example.com&gt;</div>
            <div className="text-xs text-muted-foreground mb-2">À: Jean Dupont &lt;jean.dupont@example.com&gt;</div>
            <div className="font-semibold">{replaceVariables(subject) || 'Sujet de l\'email'}</div>
          </div>

          {/* Email body */}
          <div className="p-6 min-h-[200px]">
            {greeting && (
              <p className="mb-4 text-lg">{replaceVariables(greeting)}</p>
            )}
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(replaceVariables(body) || '<p class="text-muted-foreground">Contenu de l\'email...</p>') }}
            />
          </div>

          {/* Email footer */}
          <div className="bg-muted/10 p-4 border-t text-center text-xs text-muted-foreground">
            <p>© 2025 {organizationName}. Tous droits réservés.</p>
            <p className="mt-1">
              <a href="#" className="text-primary hover:underline">Se désabonner</a>
              {' | '}
              <a href="#" className="text-primary hover:underline">Préférences</a>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
