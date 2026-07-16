import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, CheckCircle2, AlertTriangle, Shield, Loader2 } from 'lucide-react';
import { useOrganization } from '@/context/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useTranslation } from '@/hooks/useTranslation';

const BAAgreement = () => {
  const { t, language } = useTranslation();
  const { selectedOrg } = useOrganization();
  const { user } = useAuth();
  const [isAgreed, setIsAgreed] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [baaData, setBaaData] = useState<{ baa_signed_at: string | null; baa_signed_by: string | null; hipaa_enabled: boolean } | null>(null);

  const dateLocale = language === 'fr' ? fr : enUS;

  useEffect(() => {
    if (selectedOrg) {
      fetchBaaStatus();
    }
  }, [selectedOrg]);

  const fetchBaaStatus = async () => {
    if (!selectedOrg) return;
    const { data } = await supabase
      .from('organizations')
      .select('baa_signed_at, baa_signed_by, hipaa_enabled')
      .eq('id', selectedOrg.id)
      .single();
    setBaaData(data);
  };

  const handleSignBaa = async () => {
    if (!selectedOrg || !user || !isAgreed) return;
    setIsSigning(true);

    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          baa_signed_at: new Date().toISOString(),
        baa_signed_by: user.id,
      })
      .eq('id', selectedOrg.id);

      if (error) throw error;

      toast.success(t('messages.baaSignedSuccess'));
      fetchBaaStatus();
    } catch (error) {
      console.error('Error signing BAA:', error);
      toast.error(t('messages.baaSignedError'));
    } finally {
      setIsSigning(false);
    }
  };

  const handleDownloadBaa = () => {
    const baaContent = `
BUSINESS ASSOCIATE AGREEMENT (BAA)

This Business Associate Agreement ("Agreement") is entered into by and between:

Organization: ${selectedOrg?.name || 'N/A'}
Date: ${baaData?.baa_signed_at ? format(new Date(baaData.baa_signed_at), 'dd MMMM yyyy', { locale: dateLocale }) : 'Not signed'}

HIPAA COMPLIANCE TERMS

1. DEFINITIONS
   - "Protected Health Information" or "PHI" means individually identifiable health information.
   - "Business Associate" means a person or entity that performs functions involving PHI.

2. OBLIGATIONS OF BUSINESS ASSOCIATE
   - Not use or disclose PHI other than as permitted by this Agreement
   - Use appropriate safeguards to prevent unauthorized use or disclosure of PHI
   - Report to Covered Entity any unauthorized use or disclosure of PHI
   - Ensure that any subcontractors agree to the same restrictions

3. SECURITY MEASURES
   - Encryption at rest (AES-256)
   - Encryption in transit (TLS 1.3)
   - Audit logging of all access to PHI
   - Access controls and authentication

4. TERMINATION
   - Upon termination, Business Associate shall return or destroy all PHI

This agreement is electronically signed and legally binding.
    `;

    const blob = new Blob([baaContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BAA-${selectedOrg?.name || 'agreement'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!baaData?.hipaa_enabled) {
    return (
      <AppLayout>
        <div className="container mx-auto px-6 py-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                {t('pages.baa.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t('pages.baa.hipaaOnly')}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 gradient-text">{t('pages.baa.title')}</h1>
          <p className="text-muted-foreground text-lg">
            {t('pages.baa.subtitle')}
          </p>
        </div>

        {baaData?.baa_signed_at ? (
          <Card className="border-green-500/50 bg-green-500/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-5 h-5" />
                  {t('pages.baa.signed')}
                </CardTitle>
                <Badge variant="outline" className="text-green-600 border-green-600">
                  {t('pages.baa.hipaaCompliant')}
                </Badge>
              </div>
              <CardDescription>
                {t('pages.baa.signedOn')} {format(new Date(baaData.baa_signed_at), 'dd MMMM yyyy', { locale: dateLocale })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={handleDownloadBaa} className="gap-2">
                <Download className="w-4 h-4" />
                {t('pages.baa.downloadBaa')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {t('pages.baa.signBaa')}
              </CardTitle>
              <CardDescription>
                {t('pages.baa.documentDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/50 p-6 rounded-lg max-h-96 overflow-y-auto">
                <h3>BUSINESS ASSOCIATE AGREEMENT</h3>
                
                <h4>1. {language === 'fr' ? 'DÉFINITIONS' : 'DEFINITIONS'}</h4>
                <p>
                  {language === 'fr' 
                    ? '"Protected Health Information" ou "PHI" désigne les informations de santé individuellement identifiables transmises ou maintenues sous toute forme.'
                    : '"Protected Health Information" or "PHI" means individually identifiable health information transmitted or maintained in any form.'}
                </p>

                <h4>2. {language === 'fr' ? 'OBLIGATIONS DU BUSINESS ASSOCIATE' : 'OBLIGATIONS OF BUSINESS ASSOCIATE'}</h4>
                <ul>
                  <li>{language === 'fr' ? 'Ne pas utiliser ou divulguer les PHI autrement que permis par cet Accord' : 'Not use or disclose PHI other than as permitted by this Agreement'}</li>
                  <li>{language === 'fr' ? 'Utiliser des mesures de protection appropriées pour prévenir l\'utilisation non autorisée' : 'Use appropriate safeguards to prevent unauthorized use'}</li>
                  <li>{language === 'fr' ? 'Signaler toute utilisation ou divulgation non autorisée' : 'Report any unauthorized use or disclosure'}</li>
                  <li>{language === 'fr' ? 'S\'assurer que les sous-traitants acceptent les mêmes restrictions' : 'Ensure subcontractors agree to the same restrictions'}</li>
                </ul>

                <h4>3. {language === 'fr' ? 'MESURES DE SÉCURITÉ' : 'SECURITY MEASURES'}</h4>
                <ul>
                  <li>{language === 'fr' ? 'Chiffrement au repos (AES-256)' : 'Encryption at rest (AES-256)'}</li>
                  <li>{language === 'fr' ? 'Chiffrement en transit (TLS 1.3)' : 'Encryption in transit (TLS 1.3)'}</li>
                  <li>{language === 'fr' ? 'Journalisation d\'audit de tous les accès aux PHI' : 'Audit logging of all PHI access'}</li>
                  <li>{language === 'fr' ? 'Contrôles d\'accès et authentification' : 'Access controls and authentication'}</li>
                </ul>

                <h4>4. {language === 'fr' ? 'RÉSILIATION' : 'TERMINATION'}</h4>
                <p>
                  {language === 'fr' 
                    ? 'À la résiliation, le Business Associate devra retourner ou détruire tous les PHI.'
                    : 'Upon termination, Business Associate shall return or destroy all PHI.'}
                </p>
              </div>

              <div className="flex items-start space-x-3 p-4 border rounded-lg">
                <Checkbox 
                  id="agree" 
                  checked={isAgreed}
                  onCheckedChange={(checked) => setIsAgreed(checked as boolean)}
                />
                <Label htmlFor="agree" className="text-sm leading-relaxed cursor-pointer">
                  {t('pages.baa.agreementText')}
                </Label>
              </div>

              <div className="flex gap-4">
                <Button onClick={handleSignBaa} disabled={!isAgreed || isSigning} className="gap-2">
                  {isSigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  {t('pages.baa.signBaa')}
                </Button>
                <Button variant="outline" onClick={handleDownloadBaa} className="gap-2">
                  <Download className="w-4 h-4" />
                  {t('pages.baa.downloadUnsigned')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default BAAgreement;