import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Sparkles, 
  RefreshCw, 
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
  Wand2,
  Check,
  X,
  ArrowRight,
  Brain
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import { useLatestAgentAdvice, AgentDailyReport } from '@/hooks/useAgentAdvice';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface PromptAIAssistantProps {
  agentId: string;
  agentName?: string;
  currentPrompt: string;
  currentFirstMessage: string;
  organizationId?: string;
  onApplyPrompt: (newPrompt: string) => void;
  onApplyFirstMessage: (newFirstMessage: string) => void;
  canEdit?: boolean;
}

interface PromptImprovement {
  issue: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
}

interface AISuggestions {
  improvements: PromptImprovement[];
  improvedPrompt: string;
  improvedFirstMessage: string;
  summary: string;
}

const priorityColors = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
};

export function PromptAIAssistant({
  agentId,
  agentName,
  currentPrompt,
  currentFirstMessage,
  organizationId,
  onApplyPrompt,
  onApplyFirstMessage,
  canEdit = true,
}: PromptAIAssistantProps) {
  const { t, language } = useTranslation();
  const [showPreview, setShowPreview] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestions | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Get latest AI advice for this agent
  const { data: advice, isLoading: adviceLoading } = useLatestAgentAdvice(agentId);

  // Mutation to generate AI suggestions
  const generateSuggestions = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('improve-prompt', {
        body: {
          action: 'analyze_and_suggest',
          agentId,
          currentPrompt,
          currentFirstMessage,
          organizationId,
          language,
          promptSuggestions: advice?.prompt_suggestions || [],
          weaknesses: advice?.weaknesses || [],
          recommendations: advice?.recommendations || [],
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to generate suggestions');
      
      return data.suggestions as AISuggestions;
    },
    onSuccess: (data) => {
      setSuggestions(data);
      toast.success(
        language === 'en' 
          ? 'AI suggestions generated!' 
          : 'Suggestions IA générées!'
      );
    },
    onError: (error: any) => {
      console.error('Generate suggestions error:', error);
      toast.error(
        language === 'en'
          ? 'Error generating suggestions'
          : 'Erreur lors de la génération des suggestions'
      );
    },
  });

  // Quick improve mutation
  const quickImprove = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('improve-prompt', {
        body: {
          action: 'quick_improve',
          currentPrompt,
          language,
        },
      });

      if (error) throw error;
      return data.improvedPrompt as string;
    },
    onSuccess: (improvedPrompt) => {
      setSuggestions({
        improvements: [],
        improvedPrompt,
        improvedFirstMessage: currentFirstMessage,
        summary: language === 'en' ? 'Quick improvement applied' : 'Amélioration rapide appliquée',
      });
      toast.success(
        language === 'en' 
          ? 'Prompt improved!' 
          : 'Prompt amélioré!'
      );
    },
    onError: (error: any) => {
      console.error('Quick improve error:', error);
      toast.error(
        language === 'en'
          ? 'Error improving prompt'
          : 'Erreur lors de l\'amélioration du prompt'
      );
    },
  });

  const handleApplyPrompt = () => {
    if (suggestions?.improvedPrompt) {
      onApplyPrompt(suggestions.improvedPrompt);
      toast.success(
        language === 'en'
          ? 'Improved prompt applied - don\'t forget to save!'
          : 'Prompt amélioré appliqué - n\'oubliez pas de sauvegarder!'
      );
    }
  };

  const handleApplyFirstMessage = () => {
    if (suggestions?.improvedFirstMessage) {
      onApplyFirstMessage(suggestions.improvedFirstMessage);
      toast.success(
        language === 'en'
          ? 'First message applied - don\'t forget to save!'
          : 'Premier message appliqué - n\'oubliez pas de sauvegarder!'
      );
    }
  };

  const handleApplyAll = () => {
    if (suggestions?.improvedPrompt) {
      onApplyPrompt(suggestions.improvedPrompt);
    }
    if (suggestions?.improvedFirstMessage && suggestions.improvedFirstMessage !== currentFirstMessage) {
      onApplyFirstMessage(suggestions.improvedFirstMessage);
    }
    setShowPreview(false);
    toast.success(
      language === 'en'
        ? 'All improvements applied - don\'t forget to save!'
        : 'Toutes les améliorations appliquées - n\'oubliez pas de sauvegarder!'
    );
  };

  const isLoading = generateSuggestions.isPending || quickImprove.isPending;
  const hasAdvice = advice && (
    (advice.prompt_suggestions?.length || 0) > 0 ||
    (advice.weaknesses?.length || 0) > 0 ||
    (advice.recommendations?.length || 0) > 0
  );

  return (
    <Card className="glass-card border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              {language === 'en' ? 'AI Prompt Assistant' : 'Assistant IA Prompt'}
            </CardTitle>
            <CardDescription>
              {language === 'en' 
                ? 'Get AI-powered suggestions to improve your prompt based on conversation analysis'
                : 'Obtenez des suggestions IA pour améliorer votre prompt basées sur l\'analyse des conversations'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Show AI Advice Summary if available */}
        {adviceLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : hasAdvice ? (
          <div className="space-y-3">
            {/* Prompt Suggestions from Analysis */}
            {(advice?.prompt_suggestions?.length || 0) > 0 && (
              <Collapsible 
                open={expandedSection === 'suggestions'}
                onOpenChange={() => setExpandedSection(expandedSection === 'suggestions' ? null : 'suggestions')}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-3 h-auto bg-primary/5 hover:bg-primary/10">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <span className="font-medium">
                        {language === 'en' ? 'Prompt Suggestions from Analysis' : 'Suggestions de Prompt de l\'Analyse'}
                      </span>
                      <Badge variant="secondary" className="ml-2">
                        {advice?.prompt_suggestions?.length || 0}
                      </Badge>
                    </div>
                    <ArrowRight className={`h-4 w-4 transition-transform ${expandedSection === 'suggestions' ? 'rotate-90' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <ul className="space-y-2 pl-4">
                    {advice?.prompt_suggestions?.map((suggestion, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm p-2 rounded bg-muted/50">
                        <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Weaknesses that could be addressed in prompt */}
            {(advice?.weaknesses?.length || 0) > 0 && (
              <Collapsible
                open={expandedSection === 'weaknesses'}
                onOpenChange={() => setExpandedSection(expandedSection === 'weaknesses' ? null : 'weaknesses')}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-3 h-auto bg-yellow-500/5 hover:bg-yellow-500/10">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span className="font-medium">
                        {language === 'en' ? 'Weaknesses to Address' : 'Faiblesses à Corriger'}
                      </span>
                      <Badge variant="secondary" className="ml-2">
                        {advice?.weaknesses?.length || 0}
                      </Badge>
                    </div>
                    <ArrowRight className={`h-4 w-4 transition-transform ${expandedSection === 'weaknesses' ? 'rotate-90' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <ul className="space-y-2 pl-4">
                    {advice?.weaknesses?.map((weakness, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm p-2 rounded bg-muted/50">
                        <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                        <span>{weakness}</span>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>
              {language === 'en' 
                ? 'No conversation analysis available yet. Generate AI advice first to get data-driven suggestions.'
                : 'Aucune analyse de conversation disponible. Générez d\'abord des conseils IA pour obtenir des suggestions basées sur les données.'}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {canEdit && (
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button
              onClick={() => generateSuggestions.mutate()}
              disabled={isLoading || !currentPrompt}
              className="gap-2"
            >
              {generateSuggestions.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {language === 'en' ? 'Analyze & Suggest Improvements' : 'Analyser & Suggérer des Améliorations'}
            </Button>
            
            <Button
              variant="outline"
              onClick={() => quickImprove.mutate()}
              disabled={isLoading || !currentPrompt}
              className="gap-2"
            >
              {quickImprove.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {language === 'en' ? 'Quick Improve' : 'Amélioration Rapide'}
            </Button>
          </div>
        )}

        {/* Suggestions Display */}
        {suggestions && (
          <div className="space-y-4 pt-4 border-t">
            {/* Summary */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-medium text-green-600 dark:text-green-400">
                  {language === 'en' ? 'Suggestions Ready' : 'Suggestions Prêtes'}
                </span>
              </div>
              <Button size="sm" onClick={() => setShowPreview(true)}>
                {language === 'en' ? 'Review & Apply' : 'Réviser & Appliquer'}
              </Button>
            </div>

            {/* Improvements List */}
            {suggestions.improvements?.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  {language === 'en' ? 'Suggested Improvements' : 'Améliorations Suggérées'}
                </h4>
                <div className="space-y-2">
                  {suggestions.improvements.map((improvement, i) => (
                    <div key={i} className="p-3 rounded-lg bg-muted/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{improvement.issue}</span>
                        <Badge className={priorityColors[improvement.priority]}>
                          {improvement.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{improvement.suggestion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            {suggestions.summary && (
              <p className="text-sm text-muted-foreground italic">
                {suggestions.summary}
              </p>
            )}
          </div>
        )}
      </CardContent>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {language === 'en' ? 'Review AI Improvements' : 'Réviser les Améliorations IA'}
            </DialogTitle>
            <DialogDescription>
              {language === 'en' 
                ? 'Review the suggested changes before applying them. You can apply individual improvements or all at once.'
                : 'Révisez les changements suggérés avant de les appliquer. Vous pouvez appliquer les améliorations individuellement ou toutes à la fois.'}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6">
              {/* Improved Prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">
                    {language === 'en' ? 'Improved System Prompt' : 'Prompt Système Amélioré'}
                  </h4>
                  <Button size="sm" variant="outline" onClick={handleApplyPrompt}>
                    <Check className="h-4 w-4 mr-1" />
                    {language === 'en' ? 'Apply This' : 'Appliquer'}
                  </Button>
                </div>
                <div className="relative">
                  <Textarea
                    value={suggestions?.improvedPrompt || ''}
                    readOnly
                    className="min-h-[200px] font-mono text-sm bg-muted/30"
                  />
                </div>
              </div>

              {/* Improved First Message */}
              {suggestions?.improvedFirstMessage && suggestions.improvedFirstMessage !== currentFirstMessage && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">
                      {language === 'en' ? 'Improved First Message' : 'Premier Message Amélioré'}
                    </h4>
                    <Button size="sm" variant="outline" onClick={handleApplyFirstMessage}>
                      <Check className="h-4 w-4 mr-1" />
                      {language === 'en' ? 'Apply This' : 'Appliquer'}
                    </Button>
                  </div>
                  <Textarea
                    value={suggestions?.improvedFirstMessage || ''}
                    readOnly
                    className="min-h-[100px] bg-muted/30"
                  />
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="flex gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              <X className="h-4 w-4 mr-1" />
              {language === 'en' ? 'Cancel' : 'Annuler'}
            </Button>
            <Button onClick={handleApplyAll}>
              <CheckCircle className="h-4 w-4 mr-1" />
              {language === 'en' ? 'Apply All Improvements' : 'Appliquer Toutes les Améliorations'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
