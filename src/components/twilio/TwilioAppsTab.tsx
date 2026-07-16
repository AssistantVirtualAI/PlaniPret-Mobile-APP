import { useState } from 'react';
import { AppWindow, Plus, Settings, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTwilioIntegration, TwilioTwiMLApp } from '@/hooks/useTwilioIntegration';
import { TwiMLAppModal } from './TwiMLAppModal';
import { useTranslation } from '@/hooks/useTranslation';
import { format } from 'date-fns';
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

export function TwilioAppsTab() {
  const { t } = useTranslation();
  const { twimlApps, loadingApps, refetchApps, deleteTwiMLApp } = useTwilioIntegration();

  const [showModal, setShowModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState<TwilioTwiMLApp | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const openEdit = (app: TwilioTwiMLApp) => {
    setSelectedApp(app);
    setShowModal(true);
  };

  const openCreate = () => {
    setSelectedApp(null);
    setShowModal(true);
  };

  const handleDelete = async (appSid: string) => {
    await deleteTwiMLApp.mutateAsync(appSid);
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t('twilio.apps.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('twilio.apps.description')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchApps()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('common.refresh')}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            {t('twilio.apps.create')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AppWindow className="w-5 h-5" />
            {t('twilio.apps.yourApps')}
          </CardTitle>
          <CardDescription>
            {twimlApps.length} {t('twilio.apps.appsCount')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingApps ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : twimlApps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AppWindow className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('twilio.apps.noApps')}</p>
              <Button variant="link" onClick={openCreate}>
                {t('twilio.apps.createFirst')}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('twilio.apps.name')}</TableHead>
                  <TableHead>{t('twilio.apps.voiceUrl')}</TableHead>
                  <TableHead>{t('twilio.apps.smsUrl')}</TableHead>
                  <TableHead>{t('twilio.apps.created')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {twimlApps.map((app) => (
                  <TableRow key={app.sid}>
                    <TableCell className="font-medium">{app.friendly_name}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {app.voice_url || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {app.sms_url || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      {format(new Date(app.date_created), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Settings className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(app)}>
                            <Settings className="w-4 h-4 mr-2" />
                            {t('twilio.apps.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setDeleteConfirm(app.sid)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t('twilio.apps.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <TwiMLAppModal
        open={showModal}
        onOpenChange={setShowModal}
        app={selectedApp}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('twilio.apps.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('twilio.apps.deleteConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('twilio.apps.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
