import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Trash2, AlertTriangle, Shield, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

export const PrivacyTab = () => {
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteConfirmWord = language === 'fr' ? 'SUPPRIMER' : 'DELETE';

  const handleExportData = async () => {
    if (!user) return;
    setIsExporting(true);

    try {
      const { data, error } = await supabase.functions.invoke('export-user-data');
      
      if (error) throw error;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${language === 'fr' ? 'mes-donnees' : 'my-data'}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(t('messages.dataExported'));
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('messages.dataExportError'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmation !== deleteConfirmWord) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase.functions.invoke('delete-user-data');
      
      if (error) throw error;

      toast.success(t('messages.deletionRequested'));
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(t('messages.deletionError'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {t('pages.privacy.gdprRights')}
          </CardTitle>
          <CardDescription>
            {t('pages.privacy.gdprDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <h4 className="font-medium mb-2">{t('pages.privacy.accessRight')}</h4>
              <p className="text-sm text-muted-foreground mb-4">
                {t('pages.privacy.accessDescription')}
              </p>
              <Button onClick={handleExportData} disabled={isExporting} className="gap-2">
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {t('pages.privacy.exportMyData')}
              </Button>
            </Card>

            <Card className="p-4">
              <h4 className="font-medium mb-2">{t('pages.privacy.erasureRight')}</h4>
              <p className="text-sm text-muted-foreground mb-4">
                {t('pages.privacy.erasureDescription')}
              </p>
              <Button variant="destructive" onClick={() => setShowDeleteDialog(true)} className="gap-2">
                <Trash2 className="w-4 h-4" />
                {t('pages.privacy.deleteAccount')}
              </Button>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {t('pages.privacy.legalDocuments')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button variant="outline" asChild>
              <a href="/privacy" target="_blank">{t('pages.privacy.privacyPolicy')}</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="/terms" target="_blank">{t('pages.privacy.termsOfUse')}</a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {t('pages.privacy.deleteAccountTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('pages.privacy.deleteWarning')}
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('pages.privacy.deleteConsequences')}
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>{t('pages.privacy.typeToConfirm')}</Label>
            <Input 
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder={deleteConfirmWord}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteAccount}
              disabled={deleteConfirmation !== deleteConfirmWord || isDeleting}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t('pages.privacy.confirmDeletion')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};