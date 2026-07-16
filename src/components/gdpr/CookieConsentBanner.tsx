import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Cookie, Settings, Shield } from 'lucide-react';
import { useGdprConsent, ConsentType } from '@/hooks/useGdprConsent';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CookieConsentBannerProps {
  organizationId?: string;
  gdprEnabled?: boolean;
}

export const CookieConsentBanner = ({ organizationId, gdprEnabled = true }: CookieConsentBannerProps) => {
  const { consents, hasInteracted, acceptAll, acceptEssential, updateConsent, saveConsents } = useGdprConsent(organizationId);
  const [showSettings, setShowSettings] = useState(false);
  const [localConsents, setLocalConsents] = useState(consents);

  if (!gdprEnabled || hasInteracted) return null;

  const handleSaveCustom = async () => {
    const consentList: { type: ConsentType; consented: boolean }[] = [
      { type: 'cookies_essential', consented: true },
      { type: 'cookies_analytics', consented: localConsents.cookies_analytics },
      { type: 'cookies_marketing', consented: localConsents.cookies_marketing },
      { type: 'data_processing', consented: localConsents.data_processing },
    ];
    await saveConsents(consentList);
    setShowSettings(false);
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur-sm border-t border-border shadow-lg">
        <Card className="max-w-4xl mx-auto p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-primary/10">
              <Cookie className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-2">Nous respectons votre vie privée</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Nous utilisons des cookies pour améliorer votre expérience, analyser le trafic et personnaliser le contenu. 
                Vous pouvez accepter tous les cookies ou personnaliser vos préférences.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={acceptAll} className="gap-2">
                  <Shield className="w-4 h-4" />
                  Accepter tout
                </Button>
                <Button variant="outline" onClick={acceptEssential}>
                  Essentiels uniquement
                </Button>
                <Button variant="ghost" onClick={() => setShowSettings(true)} className="gap-2">
                  <Settings className="w-4 h-4" />
                  Personnaliser
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Préférences de cookies</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Cookies essentiels</Label>
                <p className="text-xs text-muted-foreground">Requis pour le fonctionnement du site</p>
              </div>
              <Switch checked disabled />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Cookies analytiques</Label>
                <p className="text-xs text-muted-foreground">Nous aident à améliorer le site</p>
              </div>
              <Switch 
                checked={localConsents.cookies_analytics}
                onCheckedChange={(v) => setLocalConsents(prev => ({ ...prev, cookies_analytics: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Cookies marketing</Label>
                <p className="text-xs text-muted-foreground">Personnalisent les publicités</p>
              </div>
              <Switch 
                checked={localConsents.cookies_marketing}
                onCheckedChange={(v) => setLocalConsents(prev => ({ ...prev, cookies_marketing: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Traitement des données</Label>
                <p className="text-xs text-muted-foreground">Autoriser le traitement de vos données</p>
              </div>
              <Switch 
                checked={localConsents.data_processing}
                onCheckedChange={(v) => setLocalConsents(prev => ({ ...prev, data_processing: v }))}
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowSettings(false)}>Annuler</Button>
            <Button onClick={handleSaveCustom}>Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
