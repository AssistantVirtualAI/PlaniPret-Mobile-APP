import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useOrganization } from '@/context/OrganizationContext';
import { useOrgDataExport } from '@/hooks/useOrgDataExport';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useDownloadExport, useExportsHistory } from '@/hooks/useExportsHistory';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRetentionSettings, useUpsertRetentionSettings } from '@/hooks/useRetentionSettings';

export const DataExportTab = () => {
  const { selectedOrgId } = useOrganization();
  const { toast } = useToast();
  const { can, isSuperAdmin } = usePermissions();
  const exporter = useOrgDataExport();
  const history = useExportsHistory(selectedOrgId || undefined);
  const downloadExport = useDownloadExport();
  const retention = useRetentionSettings(selectedOrgId || undefined);
  const saveRetention = useUpsertRetentionSettings();

  const canExport = isSuperAdmin || can('export:org_data');
  const canSeeHistory = isSuperAdmin || can('read:exports');
  const canManageRetention = isSuperAdmin || can('manage:organization');

  const exportsDays = retention.data?.exports_retention_days ?? 90;
  const notificationsDays = retention.data?.notifications_retention_days ?? 90;

  const runExport = async (exportType: 'topics' | 'prompt_templates' | 'both', format: 'json' | 'csv') => {
    if (!selectedOrgId) return;
    try {
      await exporter.mutateAsync({ organizationId: selectedOrgId, exportType, format });
      toast({ title: 'Export généré', description: 'Le téléchargement a démarré.' });
    } catch (e: any) {
      toast({ title: 'Erreur', description: e?.message || 'Impossible de générer l’export', variant: 'destructive' });
    }
  };

  if (!canExport) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Export des données</CardTitle>
          <CardDescription>Disponible uniquement pour les administrateurs.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {canManageRetention && (
        <Card>
          <CardHeader>
            <CardTitle>Rétention</CardTitle>
            <CardDescription>Conserver exports & notifications pendant 7/30/90 jours (purge automatique côté serveur).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Exports</div>
              <Select
                value={String(exportsDays)}
                onValueChange={(v) =>
                  selectedOrgId &&
                  saveRetention.mutate({
                    organizationId: selectedOrgId,
                    exportsRetentionDays: Number(v),
                    notificationsRetentionDays: notificationsDays,
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 jours</SelectItem>
                  <SelectItem value="30">30 jours</SelectItem>
                  <SelectItem value="90">90 jours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Notifications</div>
              <Select
                value={String(notificationsDays)}
                onValueChange={(v) =>
                  selectedOrgId &&
                  saveRetention.mutate({
                    organizationId: selectedOrgId,
                    exportsRetentionDays: exportsDays,
                    notificationsRetentionDays: Number(v),
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 jours</SelectItem>
                  <SelectItem value="30">30 jours</SelectItem>
                  <SelectItem value="90">90 jours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export des données
          </CardTitle>
          <CardDescription>
            Export sécurisé des sujets et des templates (contrôles côté serveur, journalisation incluse).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={!selectedOrgId || exporter.isPending}
            onClick={() => runExport('topics', 'json')}
          >
            Export Topics (JSON)
          </Button>
          <Button
            variant="outline"
            disabled={!selectedOrgId || exporter.isPending}
            onClick={() => runExport('prompt_templates', 'json')}
          >
            Export Prompts (JSON)
          </Button>
          <Button disabled={!selectedOrgId || exporter.isPending} onClick={() => runExport('both', 'json')}>
            Export Tout (JSON)
          </Button>
          <Button
            variant="secondary"
            disabled={!selectedOrgId || exporter.isPending}
            onClick={() => runExport('both', 'csv')}
          >
            Export Tout (CSV)
          </Button>
        </CardContent>
      </Card>

      {canSeeHistory && (
        <Card>
          <CardHeader>
            <CardTitle>Historique des exports</CardTitle>
            <CardDescription>Les 20 derniers exports (re-téléchargement inclus).</CardDescription>
          </CardHeader>
          <CardContent>
            {history.isLoading ? (
              <div className="text-sm text-muted-foreground">Chargement…</div>
            ) : (history.data || []).length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucun export enregistré.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Fichier</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(history.data || []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{new Date(e.created_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{e.export_type}</Badge></TableCell>
                      <TableCell className="uppercase text-xs text-muted-foreground">{e.format}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.filename}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloadExport.isPending}
                          onClick={() => downloadExport.mutate({ exportId: e.id })}
                        >
                          Re-télécharger
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

