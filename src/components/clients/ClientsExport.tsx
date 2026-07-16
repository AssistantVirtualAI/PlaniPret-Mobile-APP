import { useState } from 'react';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { exportTableToPDF, exportMetricsToPDF } from '@/utils/pdfExport';
import { useClientsMetrics } from '@/hooks/useClientsMetrics';
import { toast } from 'sonner';

interface Client {
  id: string;
  name: string;
  email?: string | null;
  status?: string | null;
  username?: string | null;
  created_at: string;
  assigned_agent?: { name: string; platform: string } | null;
}

interface ClientsExportProps {
  clients: Client[];
}

const EXPORT_COLUMNS = [
  { key: 'name', label: 'Nom', default: true },
  { key: 'email', label: 'Email', default: true },
  { key: 'username', label: 'Identifiant', default: true },
  { key: 'status', label: 'Statut', default: true },
  { key: 'agent', label: 'Agent assigné', default: true },
  { key: 'created_at', label: 'Date de création', default: false },
];

export function ClientsExport({ clients }: ClientsExportProps) {
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    EXPORT_COLUMNS.filter(c => c.default).map(c => c.key)
  );
  const [exportType, setExportType] = useState<'pdf' | 'csv'>('pdf');
  const { data: metrics } = useClientsMetrics();

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const formatClientData = () => {
    return clients.map(client => ({
      name: client.name,
      email: client.email || '-',
      username: client.username || '-',
      status: client.status === 'active' ? 'Actif' : 'Inactif',
      agent: client.assigned_agent?.name || 'Non assigné',
      created_at: new Date(client.created_at).toLocaleDateString('fr-FR'),
    }));
  };

  const handleExportPDF = async () => {
    try {
      const data = formatClientData();
      const columns = EXPORT_COLUMNS
        .filter(c => selectedColumns.includes(c.key))
        .map(c => ({ key: c.key, label: c.label }));

      await exportTableToPDF(data, columns, {
        title: 'Liste des Clients',
        filename: `clients-${new Date().toISOString().split('T')[0]}.pdf`,
      });
      toast.success('Export PDF généré');
      setFilterDialogOpen(false);
    } catch (error) {
      toast.error('Erreur lors de l\'export PDF');
    }
  };

  const handleExportCSV = () => {
    try {
      const data = formatClientData();
      const columns = EXPORT_COLUMNS.filter(c => selectedColumns.includes(c.key));
      
      const headers = columns.map(c => c.label).join(';');
      const rows = data.map(row =>
        columns.map(c => `"${row[c.key as keyof typeof row] || ''}"`).join(';')
      );
      
      const csvContent = [headers, ...rows].join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `clients-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      
      URL.revokeObjectURL(url);
      toast.success('Export CSV généré');
      setFilterDialogOpen(false);
    } catch (error) {
      toast.error('Erreur lors de l\'export CSV');
    }
  };

  const handleExportMetricsPDF = async () => {
    try {
      if (!metrics) return;
      
      await exportMetricsToPDF({
        'Total Clients': metrics.totalClients,
        'Clients Actifs': metrics.activeClients,
        'Clients Inactifs': metrics.inactiveClients,
        'Agents Assignés': metrics.assignedAgents,
        'Clients sans Agent': metrics.clientsWithoutAgent,
        'Total Conversations': metrics.totalConversations,
        'Conversations Résolues': metrics.resolvedConversations,
        'Taux de Résolution': `${metrics.totalConversations ? Math.round(metrics.resolvedConversations / metrics.totalConversations * 100) : 0}%`,
        'Durée Moyenne': `${metrics.avgDuration.toFixed(1)} minutes`,
      }, {
        title: 'Rapport Statistiques Clients',
        filename: `stats-clients-${new Date().toISOString().split('T')[0]}.pdf`,
      });
      toast.success('Rapport PDF généré');
    } catch (error) {
      toast.error('Erreur lors de l\'export');
    }
  };

  const openExportDialog = (type: 'pdf' | 'csv') => {
    setExportType(type);
    setFilterDialogOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Exporter
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Liste des clients</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => openExportDialog('pdf')}>
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openExportDialog('csv')}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export CSV
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Statistiques</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleExportMetricsPDF}>
            <FileText className="h-4 w-4 mr-2" />
            Rapport PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              Export {exportType.toUpperCase()}
            </DialogTitle>
            <DialogDescription>
              Sélectionnez les colonnes à inclure dans l'export
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {EXPORT_COLUMNS.map(column => (
              <div key={column.key} className="flex items-center space-x-3">
                <Checkbox
                  id={column.key}
                  checked={selectedColumns.includes(column.key)}
                  onCheckedChange={() => toggleColumn(column.key)}
                />
                <Label htmlFor={column.key} className="cursor-pointer">
                  {column.label}
                </Label>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFilterDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={exportType === 'pdf' ? handleExportPDF : handleExportCSV}
              disabled={selectedColumns.length === 0}
            >
              Exporter
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
