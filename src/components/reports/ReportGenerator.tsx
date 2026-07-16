import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { 
  FileText, 
  Mail, 
  Download, 
  Calendar,
  Bot,
  TrendingUp,
  Sparkles,
  Loader2,
  CheckCircle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { exportMetricsToPDF, exportTableToPDF } from '@/utils/pdfExport';
import { AgentReportsData } from '@/hooks/useAgentReports';
import { DashboardMetrics } from '@/hooks/useDashboardMetrics';

interface ReportGeneratorProps {
  reportsData?: AgentReportsData | null;
  dashboardMetrics?: DashboardMetrics | null;
  agents?: { id: string; name: string }[];
  dateRange?: { start: Date; end: Date } | null;
  onDateRangeChange?: (range: { start: Date; end: Date }) => void;
}

type PeriodPreset = 'week' | 'month' | 'lastMonth' | 'custom';

export const ReportGenerator = ({ 
  reportsData, 
  dashboardMetrics,
  agents = [],
  dateRange,
  onDateRangeChange
}: ReportGeneratorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportType, setReportType] = useState<'summary' | 'detailed'>('summary');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [includeAIInsights, setIncludeAIInsights] = useState(true);
  const [includeCharts, setIncludeCharts] = useState(true);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('week');

  const handlePeriodChange = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    const now = new Date();
    let newRange: { start: Date; end: Date };

    switch (preset) {
      case 'week':
        newRange = { start: subDays(now, 7), end: now };
        break;
      case 'month':
        newRange = { start: startOfMonth(now), end: endOfMonth(now) };
        break;
      case 'lastMonth':
        const lastMonth = subMonths(now, 1);
        newRange = { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
        break;
      default:
        return;
    }

    onDateRangeChange?.(newRange);
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds(prev => 
      prev.includes(agentId) 
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleGeneratePDF = async () => {
    setIsGenerating(true);
    
    try {
      const periodLabel = dateRange 
        ? `${format(dateRange.start, 'dd/MM/yyyy', { locale: fr })} - ${format(dateRange.end, 'dd/MM/yyyy', { locale: fr })}`
        : 'Période sélectionnée';

      if (reportType === 'summary') {
        // Generate summary metrics PDF
        const metrics: Record<string, string | number> = {
          'Période': periodLabel,
          'Total Conversations': reportsData?.globalMetrics.totalConversations || dashboardMetrics?.totalConversations || 0,
          'Satisfaction Moyenne': `${(reportsData?.globalMetrics.avgSatisfaction || dashboardMetrics?.avgSatisfaction || 0).toFixed(1)}/10`,
          'Minutes Vocales': reportsData?.globalMetrics.totalVoiceMinutes || dashboardMetrics?.totalDurationMinutes || 0,
          'Taux de Résolution': `${dashboardMetrics?.resolutionRate || 0}%`,
          'Score Qualité': `${dashboardMetrics?.qualityScore || 0}%`,
          'Agents Actifs': reportsData?.agents.length || dashboardMetrics?.totalAgents || 0,
          'Clients Actifs': dashboardMetrics?.activeClients || 0,
          'Meilleur Agent': reportsData?.globalMetrics.bestPerformingAgent || 'N/A',
          'Heure de Pointe': reportsData?.peakHour || 'N/A',
          'Jour le Plus Actif': reportsData?.busiestDay || 'N/A',
        };

        if (includeAIInsights && dashboardMetrics) {
          metrics['Sentiments Positifs'] = dashboardMetrics.sentimentBreakdown.positive;
          metrics['Sentiments Neutres'] = dashboardMetrics.sentimentBreakdown.neutral;
          metrics['Sentiments Négatifs'] = dashboardMetrics.sentimentBreakdown.negative;
        }

        await exportMetricsToPDF(metrics, {
          title: `Rapport ${reportType === 'summary' ? 'Résumé' : 'Détaillé'} - Agents IA`,
          filename: `rapport-agents-${format(new Date(), 'yyyy-MM-dd')}.pdf`
        });
      } else {
        // Generate detailed table PDF with agent data
        const agentsToExport = selectedAgentIds.length > 0
          ? reportsData?.agents.filter(a => selectedAgentIds.includes(a.agentId))
          : reportsData?.agents;

        const tableData = (agentsToExport || []).map(agent => ({
          'Agent': agent.agentName,
          'Conversations': agent.totalConversations,
          'Satisfaction': agent.avgSatisfaction.toFixed(1),
          'Durée Moy.': `${Math.round(agent.avgDuration / 60)}min`,
          'Résolution': `${agent.resolutionRate.toFixed(0)}%`,
          'Positifs': agent.sentimentDistribution.positive,
          'Neutres': agent.sentimentDistribution.neutral,
          'Négatifs': agent.sentimentDistribution.negative,
        }));

        await exportTableToPDF(tableData, [
          { key: 'Agent', label: 'Agent' },
          { key: 'Conversations', label: 'Conv.' },
          { key: 'Satisfaction', label: 'Satisfaction' },
          { key: 'Durée Moy.', label: 'Durée Moy.' },
          { key: 'Résolution', label: 'Résolution' },
          { key: 'Positifs', label: '😊' },
          { key: 'Neutres', label: '😐' },
          { key: 'Négatifs', label: '😔' },
        ], {
          title: `Rapport Détaillé par Agent - ${periodLabel}`,
          filename: `rapport-detaille-agents-${format(new Date(), 'yyyy-MM-dd')}.pdf`
        });
      }

      toast.success('Rapport généré avec succès !');
      setIsOpen(false);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Erreur lors de la génération du rapport');
    } finally {
      setIsGenerating(false);
    }
  };

  const periodOptions = [
    { value: 'week', label: '7 derniers jours' },
    { value: 'month', label: 'Ce mois' },
    { value: 'lastMonth', label: 'Mois dernier' },
    { value: 'custom', label: 'Personnalisé' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileText className="h-4 w-4" />
          Générer un rapport
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Générer un Rapport
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Period Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Période
            </label>
            <Select value={periodPreset} onValueChange={(v) => handlePeriodChange(v as PeriodPreset)}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une période" />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {dateRange && (
              <p className="text-xs text-muted-foreground">
                {format(dateRange.start, 'dd MMMM yyyy', { locale: fr })} - {format(dateRange.end, 'dd MMMM yyyy', { locale: fr })}
              </p>
            )}
          </div>

          {/* Report Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Type de rapport</label>
            <div className="grid grid-cols-2 gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setReportType('summary')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  reportType === 'summary' 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <TrendingUp className="h-5 w-5 mb-1 text-primary" />
                <p className="font-medium text-sm">Résumé</p>
                <p className="text-xs text-muted-foreground">Métriques globales</p>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setReportType('detailed')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  reportType === 'detailed' 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Bot className="h-5 w-5 mb-1 text-primary" />
                <p className="font-medium text-sm">Détaillé</p>
                <p className="text-xs text-muted-foreground">Par agent</p>
              </motion.button>
            </div>
          </div>

          {/* Agent Selection (for detailed reports) */}
          {reportType === 'detailed' && agents.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                Agents à inclure
              </label>
              <div className="max-h-32 overflow-y-auto space-y-2 border rounded-lg p-2">
                {agents.map(agent => (
                  <div key={agent.id} className="flex items-center gap-2">
                    <Checkbox
                      id={agent.id}
                      checked={selectedAgentIds.includes(agent.id)}
                      onCheckedChange={() => toggleAgent(agent.id)}
                    />
                    <label htmlFor={agent.id} className="text-sm cursor-pointer">
                      {agent.name}
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedAgentIds.length === 0 ? 'Tous les agents seront inclus' : `${selectedAgentIds.length} agent(s) sélectionné(s)`}
              </p>
            </div>
          )}

          {/* Options */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Options</label>
            <div className="flex items-center gap-2">
              <Checkbox 
                id="ai-insights" 
                checked={includeAIInsights}
                onCheckedChange={(checked) => setIncludeAIInsights(!!checked)}
              />
              <label htmlFor="ai-insights" className="text-sm flex items-center gap-1 cursor-pointer">
                <Sparkles className="h-3 w-3 text-primary" />
                Inclure les insights IA
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox 
                id="charts" 
                checked={includeCharts}
                onCheckedChange={(checked) => setIncludeCharts(!!checked)}
              />
              <label htmlFor="charts" className="text-sm flex items-center gap-1 cursor-pointer">
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
                Inclure les graphiques
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <Button 
              onClick={handleGeneratePDF}
              disabled={isGenerating}
              className="flex-1 gap-2"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Télécharger PDF
            </Button>
            <Button 
              variant="outline"
              disabled={isGenerating}
              className="gap-2"
              onClick={() => toast.info('Fonctionnalité bientôt disponible')}
            >
              <Mail className="h-4 w-4" />
              Email
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
