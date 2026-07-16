import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Key, RefreshCw, Mail, Eye, EyeOff, CheckCircle, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ClientPasswordResetProps {
  clientId: string;
  clientEmail?: string | null;
  hasPassword: boolean;
}

export const ClientPasswordReset = ({ clientId, clientEmail, hasPassword }: ClientPasswordResetProps) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const generateRandomPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(result);
    setGeneratedPassword(result);
    setShowPassword(true);
  };

  const handleSetPassword = async () => {
    if (password.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('client-auth', {
        body: { 
          action: 'set-password', 
          client_id: clientId,
          password
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSuccess(true);
      toast.success('Mot de passe défini avec succès');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la définition du mot de passe');
    } finally {
      setIsLoading(false);
    }
  };

  const copyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      toast.success('Mot de passe copié');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Gestion du mot de passe
        </CardTitle>
        <CardDescription>
          {hasPassword 
            ? 'Le client a un mot de passe défini. Vous pouvez le réinitialiser.'
            : 'Aucun mot de passe défini. Le client ne peut pas se connecter.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status indicator */}
        <div className={`flex items-center gap-2 p-3 rounded-lg ${hasPassword ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
          <div className={`h-2 w-2 rounded-full ${hasPassword ? 'bg-green-500' : 'bg-yellow-500'}`} />
          <span className="text-sm font-medium">
            {hasPassword ? 'Mot de passe défini' : 'Aucun mot de passe'}
          </span>
        </div>

        {success && generatedPassword && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700">
              <p className="font-medium mb-2">Mot de passe défini avec succès!</p>
              <div className="flex items-center gap-2 bg-white p-2 rounded border">
                <code className="flex-1 text-sm">{generatedPassword}</code>
                <Button size="sm" variant="ghost" onClick={copyPassword}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs mt-2">
                Copiez ce mot de passe et transmettez-le au client de manière sécurisée.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {!success && (
          <>
            <div className="space-y-2">
              <Label htmlFor="password">Nouveau mot de passe</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setGeneratedPassword(null);
                    }}
                    placeholder="Entrez un mot de passe"
                    minLength={8}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button variant="outline" onClick={generateRandomPassword}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Générer
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum 8 caractères. Utilisez le bouton "Générer" pour un mot de passe sécurisé.
              </p>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleSetPassword} 
                disabled={isLoading || password.length < 8}
                className="flex-1"
              >
                {isLoading ? 'Enregistrement...' : (hasPassword ? 'Réinitialiser' : 'Définir le mot de passe')}
              </Button>
              
              {clientEmail && (
                <Button variant="outline" disabled title="Envoie le mot de passe par email">
                  <Mail className="h-4 w-4 mr-2" />
                  Envoyer par email
                </Button>
              )}
            </div>
          </>
        )}

        {success && (
          <Button 
            variant="outline" 
            onClick={() => {
              setSuccess(false);
              setPassword('');
              setGeneratedPassword(null);
            }}
            className="w-full"
          >
            Définir un autre mot de passe
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
