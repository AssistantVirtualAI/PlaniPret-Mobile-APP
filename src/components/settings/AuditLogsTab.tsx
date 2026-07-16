import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Download, Search, Filter, Shield, AlertTriangle } from 'lucide-react';
import { useOrganization } from '@/context/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLogsExport } from '@/hooks/useAuditLogsExport';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  ip_address: string;
  user_agent: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  view: { label: 'Consultation', variant: 'secondary' },
  create: { label: 'Création', variant: 'default' },
  update: { label: 'Modification', variant: 'outline' },
  delete: { label: 'Suppression', variant: 'destructive' },
  export: { label: 'Export', variant: 'secondary' },
  login: { label: 'Connexion', variant: 'default' },
  logout: { label: 'Déconnexion', variant: 'outline' },
  access: { label: 'Accès', variant: 'secondary' },
};

const RESOURCE_LABELS: Record<string, string> = {
  conversations: 'Conversation',
  clients: 'Client',
  agents: 'Agent',
  organization_members: 'Membre',
  settings: 'Paramètres',
  billing: 'Facturation',
};

export const AuditLogsTab = () => {
  const { selectedOrg } = useOrganization();
  const { can, isSuperAdmin } = usePermissions();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [resourceFilter, setResourceFilter] = useState<string>('all');
  const [hipaaEnabled, setHipaaEnabled] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const exporter = useAuditLogsExport();

  const canServerExport = isSuperAdmin || can('export:audit_logs');

  useEffect(() => {
    if (selectedOrg) {
      checkHipaaStatus();
      fetchLogs();
    }
  }, [selectedOrg, actionFilter, resourceFilter]);

  const checkHipaaStatus = async () => {
    if (!selectedOrg) return;
    const { data } = await supabase
      .from('organizations')
      .select('hipaa_enabled')
      .eq('id', selectedOrg.id)
      .single();
    setHipaaEnabled(data?.hipaa_enabled || false);
  };

  const fetchLogs = async () => {
    if (!selectedOrg) return;
    setIsLoading(true);

    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('organization_id', selectedOrg.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (actionFilter !== 'all') {
      query = query.eq('action', actionFilter);
    }
    if (resourceFilter !== 'all') {
      query = query.eq('resource_type', resourceFilter);
    }

    const { data, error } = await query;

    if (!error && data) {
      setLogs(data as AuditLog[]);
    }
    setIsLoading(false);
  };

  const handleClientExportLogs = () => {
    const csv = [
      ['Date', 'Action', 'Ressource', 'ID Ressource', 'IP', 'User Agent'].join(','),
      ...logs.map(log => [
        format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
        log.action,
        log.resource_type,
        log.resource_id || '',
        log.ip_address || '',
        `"${(log.user_agent || '').replace(/"/g, '""')}"`,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleServerExport = async () => {
    if (!selectedOrg) return;
    await exporter.mutateAsync({
      organizationId: selectedOrg.id,
      format: exportFormat,
      filters: {
        action: actionFilter !== 'all' ? actionFilter : undefined,
        resource_type: resourceFilter !== 'all' ? resourceFilter : undefined,
        search: search || undefined,
      },
    });
  };

  const filteredLogs = logs.filter(log => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(searchLower) ||
      log.resource_type.toLowerCase().includes(searchLower) ||
      (log.resource_id && log.resource_id.toLowerCase().includes(searchLower))
    );
  });

  if (!hipaaEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Journaux d'audit HIPAA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Les journaux d'audit sont disponibles uniquement avec l'add-on HIPAA Compliance. 
              Activez HIPAA dans la configuration SaaS pour activer le logging automatique.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Journaux d'audit
            </CardTitle>
            <CardDescription>
              Historique de toutes les actions effectuées dans votre organisation
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClientExportLogs} className="gap-2">
              <Download className="w-4 h-4" />
              Exporter (local)
            </Button>
            {canServerExport && (
              <Tabs value={exportFormat} onValueChange={(v) => setExportFormat(v as any)}>
                <TabsList>
                  <TabsTrigger value="csv">CSV</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                </TabsList>
                <TabsContent value={exportFormat} className="hidden" />
              </Tabs>
            )}
            {canServerExport && (
              <Button
                onClick={handleServerExport}
                disabled={!selectedOrg || exporter.isPending}
                className="gap-2"
              >
                <Download className={exporter.isPending ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
                Exporter (serveur)
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Rechercher..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les actions</SelectItem>
              {Object.entries(ACTION_LABELS).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={resourceFilter} onValueChange={setResourceFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Ressource" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les ressources</SelectItem>
              {Object.entries(RESOURCE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="h-[500px] rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Ressource</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Chargement...
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Aucun log trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">
                      {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: fr })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ACTION_LABELS[log.action]?.variant || 'secondary'}>
                        {ACTION_LABELS[log.action]?.label || log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {RESOURCE_LABELS[log.resource_type] || log.resource_type}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.resource_id?.slice(0, 8) || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.ip_address || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
