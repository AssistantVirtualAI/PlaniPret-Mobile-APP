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
import { exportTableToPDF } from '@/utils/pdfExport';
import { ElevenLabsConversation } from '@/hooks/useAllAgentsConversations';

interface ConversationExportProps {
  conversations: ElevenLabsConversation[];
  filename?: string;
}

export function ConversationExport({ conversations, filename = 'conversations' }: ConversationExportProps) {
  const [isExporting, setIsExporting] = useState(false);

  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const exportToCSV = () => {
    if (!conversations.length) {
      toast.error('Aucune donnée à exporter');
      return;
    }

    setIsExporting(true);

    try {
      const headers = ['ID', 'Agent', 'Durée', 'Satisfaction', 'Sentiment', 'Résumé', 'Date'];
      const csvContent = [
        headers.join(','),
        ...conversations.map(conv => {
          const duration = conv.call_duration_secs || conv.duration || 0;
          const satisfaction = conv.analysis?.satisfaction_score 
            ? `${(conv.analysis.satisfaction_score * 100).toFixed(0)}%` 
            : 'N/A';
          const sentiment = conv.analysis?.sentiment || 'N/A';
          const summary = (conv.analysis?.summary || '').replace(/"/g, '""').substring(0, 100);
          const date = conv.start_time 
            ? format(new Date(conv.start_time), 'dd/MM/yyyy HH:mm', { locale: fr })
            : 'N/A';

          return [
            conv.conversation_id,
            `"${conv.agent_name}"`,
            formatDuration(duration),
            satisfaction,
            sentiment,
            `"${summary}"`,
            date
          ].join(',');
        })
      ].join('\n');

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
    if (!conversations.length) {
      toast.error('Aucune donnée à exporter');
      return;
    }

    setIsExporting(true);

    try {
      const data = conversations.map(conv => {
        const duration = conv.call_duration_secs || conv.duration || 0;
        return {
          id: conv.conversation_id.substring(0, 8),
          agent: conv.agent_name,
          duration: formatDuration(duration),
          satisfaction: conv.analysis?.satisfaction_score 
            ? `${(conv.analysis.satisfaction_score * 100).toFixed(0)}%` 
            : 'N/A',
          sentiment: conv.analysis?.sentiment || 'N/A',
          date: conv.start_time 
            ? format(new Date(conv.start_time), 'dd/MM/yy', { locale: fr })
            : 'N/A',
        };
      });

      const columns = [
        { key: 'id', label: 'ID' },
        { key: 'agent', label: 'Agent' },
        { key: 'duration', label: 'Durée' },
        { key: 'satisfaction', label: 'Satisfaction' },
        { key: 'sentiment', label: 'Sentiment' },
        { key: 'date', label: 'Date' },
      ];

      await exportTableToPDF(data, columns, {
        title: 'Rapport des Conversations',
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
