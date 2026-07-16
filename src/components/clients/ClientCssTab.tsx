import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Code, Save, RotateCcw, Eye } from 'lucide-react';
import { ClientDetail } from '@/hooks/useClientDetail';

const DEFAULT_CSS = `/* Personnalisation du portail client */

/* Couleur primaire */
.client-portal {
  --primary-color: #8B5CF6;
}

/* Boutons */
.client-portal button {
  border-radius: 8px;
}

/* Cards */
.client-portal .card {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}
`;

interface ClientCssTabProps {
  client: ClientDetail;
  onUpdate: (updates: Partial<ClientDetail>) => void;
  isUpdating: boolean;
}

export const ClientCssTab = ({ client, onUpdate, isUpdating }: ClientCssTabProps) => {
  const [css, setCss] = useState(client.custom_css || '');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setCss(client.custom_css || '');
  }, [client.custom_css]);

  const handleSave = () => {
    onUpdate({ custom_css: css });
  };

  const handleReset = () => {
    setCss(DEFAULT_CSS);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            CSS personnalisé
          </CardTitle>
          <CardDescription>
            Ajoutez du CSS personnalisé pour modifier l'apparence du portail client
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={css}
            onChange={(e) => setCss(e.target.value)}
            placeholder="/* Entrez votre CSS personnalisé ici */"
            className="font-mono text-sm min-h-[400px]"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Modèle par défaut
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowPreview(!showPreview)}
              >
                <Eye className="h-4 w-4 mr-2" />
                {showPreview ? 'Masquer' : 'Aperçu'}
              </Button>
            </div>
            <Button onClick={handleSave} disabled={isUpdating}>
              <Save className="h-4 w-4 mr-2" />
              Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>

      {showPreview && (
        <Card>
          <CardHeader>
            <CardTitle>Aperçu du CSS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg p-4 bg-muted/50">
              <style>{css}</style>
              <div className="client-portal space-y-4">
                <div className="card bg-background p-4 rounded-lg border">
                  <h3 className="font-semibold mb-2">Exemple de card</h3>
                  <p className="text-muted-foreground text-sm">
                    Ceci est un aperçu de votre CSS personnalisé
                  </p>
                  <button className="mt-3 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">
                    Bouton exemple
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Variables CSS disponibles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <code className="block bg-muted px-2 py-1 rounded">--primary-color</code>
              <code className="block bg-muted px-2 py-1 rounded">--background-color</code>
              <code className="block bg-muted px-2 py-1 rounded">--text-color</code>
            </div>
            <div className="space-y-2">
              <code className="block bg-muted px-2 py-1 rounded">--border-radius</code>
              <code className="block bg-muted px-2 py-1 rounded">--card-shadow</code>
              <code className="block bg-muted px-2 py-1 rounded">--accent-color</code>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
