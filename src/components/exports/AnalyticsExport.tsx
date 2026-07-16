import { useState } from 'react';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { exportMetricsToPDF } from '@/utils/pdfExport';
import { AllAgentsAnalyticsData } from '@/hooks/useAllAgentsAnalytics';

interface AnalyticsExportProps {
  analytics: AllAgentsAnalyticsData;
  timeframe: string;
  filename?: string;
}

export function AnalyticsExport({ analytics, timeframe, filename = 'analytics' }: AnalyticsExportProps) {
  const [isExporting, setIsExporting] = useState(false);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const getTimeframeLabel = () => {
    switch (timeframe) {
      case '24h': return 'Dernières 24h';
      case '7days': return '7 derniers jours';
      case '30days': return '30 derniers jours';
      case '90days': return '90 derniers jours';
      default: return timeframe;
    }
  };

  const exportToCSV = () => {
    setIsExporting(true);

    try {
      // Global metrics
      const globalMetrics = [
        ['Métrique', 'Valeur', 'Tendance'],
        ['Total Conversations', analytics.metrics.total_conversations, `${analytics.trends.conversations_change > 0 ? '+' : ''}${analytics.trends.conversations_change}%`],
        ['Conversations Réussies', analytics.metrics.successful_conversations, ''],
        ['Conversations Échouées', analytics.metrics.failed_conversations, ''],
        ['Durée Moyenne', formatDuration(analytics.metrics.avg_conversation_duration), `${analytics.trends.duration_change > 0 ? '+' : ''}${analytics.trends.duration_change}%`],
        ['Minutes Vocales', analytics.metrics.total_voice_minutes, ''],
        ['Satisfaction', `${analytics.metrics.satisfaction_score.toFixed(1)}/5`, `${analytics.trends.satisfaction_change > 0 ? '+' : ''}${analytics.trends.satisfaction_change}`],
        ['Taux de Succès', `${analytics.metrics.success_rate.toFixed(1)}%`, `${analytics.trends.success_rate_change > 0 ? '+' : ''}${analytics.trends.success_rate_change}%`],
      ];

      let csvContent = `Rapport Analytics - ${getTimeframeLabel()}\n`;
      csvContent += `Généré le ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: fr })}\n\n`;
      csvContent += 'MÉTRIQUES GLOBALES\n';
      csvContent += globalMetrics.map(row => row.join(',')).join('\n');

      // Per agent metrics
      if (analytics.perAgent.length > 0) {
        csvContent += '\n\nMÉTRIQUES PAR AGENT\n';
        csvContent += 'Agent,Conversations,Durée Moyenne,Satisfaction,Taux de Succès\n';
        analytics.perAgent.forEach(agent => {
          csvContent += [
            `"${agent.name}"`,
            agent.metrics.total_conversations,
            formatDuration(agent.metrics.avg_duration),
            `${agent.metrics.satisfaction_score.toFixed(1)}/5`,
            `${agent.metrics.success_rate.toFixed(1)}%`,
          ].join(',') + '\n';
        });
      }

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success('Export CSV téléchargé');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Erreur lors de l\'export');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);

    try {
      const metrics = {
        'Période': getTimeframeLabel(),
        'Total Conversations': analytics.metrics.total_conversations.toString(),
        'Conversations Réussies': analytics.metrics.successful_conversations.toString(),
        'Conversations Échouées': analytics.metrics.failed_conversations.toString(),
        'Durée Moyenne': formatDuration(analytics.metrics.avg_conversation_duration),
        'Minutes Vocales Totales': analytics.metrics.total_voice_minutes.toString(),
        'Score de Satisfaction': `${analytics.metrics.satisfaction_score.toFixed(1)} / 5`,
        'Taux de Succès': `${analytics.metrics.success_rate.toFixed(1)}%`,
        '': '', // Separator
        'Nombre d\'Agents': analytics.perAgent.length.toString(),
      };

      // Add per-agent summary
      analytics.perAgent.forEach((agent, index) => {
        metrics[`Agent ${index + 1} - ${agent.name}`] = `${agent.metrics.total_conversations} conv., ${agent.metrics.satisfaction_score.toFixed(1)}/5`;
      });

      await exportMetricsToPDF(metrics, {
        title: `Rapport Analytics - ${getTimeframeLabel()}`,
        filename: `${filename}_${format(new Date(), 'yyyy-MM-dd')}.pdf`,
      });

      toast.success('Export PDF téléchargé');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Erreur lors de l\'export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2" disabled={isExporting}>
          <Download className="w-4 h-4" />
          {isExporting ? 'Export...' : 'Exporter'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportToCSV} className="gap-2">
          <FileSpreadsheet className="w-4 h-4" />
          Exporter en CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToPDF} className="gap-2">
          <FileText className="w-4 h-4" />
          Exporter en PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
