import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Sparkles, 
  Wand2, 
  Check, 
  X, 
  Loader2, 
  Lightbulb, 
  AlertTriangle,
  Info,
  Zap,
  Phone,
  Bot,
  Settings,
  Volume2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { VoiceSettings, TurnSettings } from '@/hooks/useCreatePlatformAgent';

interface PromptEditorProps {
  systemPrompt: string;
  firstMessage: string;
  onSystemPromptChange: (value: string) => void;
  onFirstMessageChange: (value: string) => void;
  language?: string;
  platform?: 'elevenlabs' | 'vapi' | 'retell';
  organizationId?: string;
  voiceSettings?: VoiceSettings;
  turnSettings?: TurnSettings;
  onVoiceSettingsChange?: (settings: Partial<VoiceSettings>) => void;
  onTurnSettingsChange?: (settings: Partial<TurnSettings>) => void;
}

interface Improvement {
  category: string;
  issue: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
}

interface PlatformRecommendations {
  voiceSettings?: Partial<VoiceSettings>;
  turnSettings?: Partial<TurnSettings>;
  notes?: string;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  clarity: Lightbulb,
  voice_optimization: Volume2,
  turn_taking: Settings,
  edge_cases: AlertTriangle,
  platform_specific: Zap,
};

const CATEGORY_LABELS: Record<string, string> = {
  clarity: 'Clarity',
  voice_optimization: 'Voice',
  turn_taking: 'Turns',
  edge_cases: 'Edge Cases',
  platform_specific: 'Platform',
};

export function PromptEditor({
  systemPrompt,
  firstMessage,
  onSystemPromptChange,
  onFirstMessageChange,
  language = 'fr',
  platform = 'elevenlabs',
  organizationId,
  voiceSettings,
  turnSettings,
  onVoiceSettingsChange,
  onTurnSettingsChange,
}: PromptEditorProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [improvedPrompt, setImprovedPrompt] = useState<string>('');
  const [improvedFirstMessage, setImprovedFirstMessage] = useState<string>('');
  const [platformRecommendations, setPlatformRecommendations] = useState<PlatformRecommendations | null>(null);
  const [summary, setSummary] = useState<string>('');

  // Fetch platform guidelines
  const { data: platformGuidelines } = useQuery({
    queryKey: ['platform-guidelines', platform],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('improve-prompt', {
        body: {
          action: 'get_platform_guidelines',
          platform,
        },
      });
      if (error) throw error;
      return data?.guidelines;
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('improve-prompt', {
        body: {
          action: 'analyze_and_suggest',
          currentPrompt: systemPrompt,
          currentFirstMessage: firstMessage,
          language,
          platform,
          organizationId,
          voiceSettings,
          turnSettings,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Analysis failed');

      return data.suggestions;
    },
    onSuccess: (data) => {
      setImprovements(data.improvements || []);
      setImprovedPrompt(data.improvedPrompt || '');
      setImprovedFirstMessage(data.improvedFirstMessage || '');
      setPlatformRecommendations(data.platformRecommendations || null);
      setSummary(data.summary || '');
      setShowSuggestions(true);
    },
    onError: (error: Error) => {
      toast.error(`Failed to analyze prompt: ${error.message}`);
    },
  });

  const improveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('improve-prompt', {
        body: {
          action: 'quick_improve',
          currentPrompt: systemPrompt,
          currentFirstMessage: firstMessage,
          language,
          platform,
          organizationId,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Improvement failed');

      return {
        improvedPrompt: data.improvedPrompt,
        improvedFirstMessage: data.improvedFirstMessage,
      };
    },
    onSuccess: (data) => {
      setImprovedPrompt(data.improvedPrompt || systemPrompt);
      setImprovedFirstMessage(data.improvedFirstMessage || firstMessage);
      setImprovements([]);
      setPlatformRecommendations(null);
      setSummary('Quick improvement applied based on platform best practices.');
      setShowSuggestions(true);
    },
    onError: (error: Error) => {
      toast.error(`Failed to improve prompt: ${error.message}`);
    },
  });

  const handleApplyImproved = () => {
    if (improvedPrompt) {
      onSystemPromptChange(improvedPrompt);
    }
    if (improvedFirstMessage) {
      onFirstMessageChange(improvedFirstMessage);
    }
    
    // Apply platform recommendations if provided
    if (platformRecommendations) {
      if (platformRecommendations.voiceSettings && onVoiceSettingsChange) {
        onVoiceSettingsChange(platformRecommendations.voiceSettings);
      }
      if (platformRecommendations.turnSettings && onTurnSettingsChange) {
        onTurnSettingsChange(platformRecommendations.turnSettings);
      }
    }
    
    setShowSuggestions(false);
    toast.success('Improved prompt applied!');
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-destructive/10 text-destructive border-destructive/30';
      case 'medium':
        return 'bg-warning/10 text-warning border-warning/30';
      default:
        return 'bg-muted text-muted-foreground border-muted';
    }
  };

  const getPlatformIcon = () => {
    switch (platform) {
      case 'elevenlabs': return <Zap className="h-4 w-4" />;
      case 'vapi': return <Phone className="h-4 w-4" />;
      case 'retell': return <Bot className="h-4 w-4" />;
    }
  };

  const getPlatformName = () => {
    switch (platform) {
      case 'elevenlabs': return 'ElevenLabs';
      case 'vapi': return 'Vapi';
      case 'retell': return 'Retell AI';
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform indicator */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
        {getPlatformIcon()}
        <span className="text-sm">
          Optimizing for <span className="font-medium">{getPlatformName()}</span>
        </span>
        {platformGuidelines && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {platformGuidelines.promptBestPractices?.length || 0} best practices loaded
          </Badge>
        )}
      </div>

      {/* System Prompt */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="systemPrompt" className="text-base font-medium">
            System Prompt
          </Label>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending || !systemPrompt.trim()}
            >
              {analyzeMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Deep Analysis
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => improveMutation.mutate()}
              disabled={improveMutation.isPending || !systemPrompt.trim()}
              className="bg-gradient-to-r from-primary to-secondary"
            >
              {improveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              Quick Improve
            </Button>
          </div>
        </div>
        <Textarea
          id="systemPrompt"
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          placeholder={`You are a helpful ${getPlatformName()} voice assistant that...`}
          className="min-h-[200px] font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Define the personality, behavior, and capabilities of your agent. 
          The AI will optimize this for {getPlatformName()}'s voice capabilities.
        </p>
      </div>

      {/* First Message */}
      <div className="space-y-3">
        <Label htmlFor="firstMessage" className="text-base font-medium">
          First Message
        </Label>
        <Textarea
          id="firstMessage"
          value={firstMessage}
          onChange={(e) => onFirstMessageChange(e.target.value)}
          placeholder="Hello! How can I help you today?"
          className="min-h-[80px]"
        />
        <p className="text-xs text-muted-foreground">
          Keep it short and natural for voice. This is what users hear first.
        </p>
      </div>

      {/* Platform Tips */}
      {platformGuidelines && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              {getPlatformName()} Tips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-xs text-muted-foreground space-y-1">
              {platformGuidelines.promptBestPractices?.slice(0, 3).map((tip: string, idx: number) => (
                <li key={idx} className="flex items-start gap-2">
                  <Check className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Suggestions Dialog */}
      <Dialog open={showSuggestions} onOpenChange={setShowSuggestions}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Analysis for {getPlatformName()}
            </DialogTitle>
            <DialogDescription>
              Platform-optimized improvements for your voice agent
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="improvements" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="improvements">
                Issues ({improvements.length})
              </TabsTrigger>
              <TabsTrigger value="prompt">
                Improved Prompt
              </TabsTrigger>
              <TabsTrigger value="settings">
                Settings
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 mt-4">
              <TabsContent value="improvements" className="space-y-3 mt-0">
                {improvements.length > 0 ? (
                  improvements.map((improvement, idx) => {
                    const IconComponent = CATEGORY_ICONS[improvement.category] || Lightbulb;
                    return (
                      <Card 
                        key={idx} 
                        className={cn(
                          "border-l-4",
                          improvement.priority === 'high' && "border-l-destructive",
                          improvement.priority === 'medium' && "border-l-warning",
                          improvement.priority === 'low' && "border-l-muted-foreground"
                        )}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "p-2 rounded-lg",
                              improvement.priority === 'high' && "bg-destructive/10",
                              improvement.priority === 'medium' && "bg-warning/10",
                              improvement.priority === 'low' && "bg-muted"
                            )}>
                              <IconComponent className="h-4 w-4" />
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-xs">
                                  {CATEGORY_LABELS[improvement.category] || improvement.category}
                                </Badge>
                                <Badge 
                                  variant="secondary" 
                                  className={cn("text-xs", getPriorityColor(improvement.priority))}
                                >
                                  {improvement.priority}
                                </Badge>
                              </div>
                              <p className="text-sm font-medium">{improvement.issue}</p>
                              <p className="text-sm text-muted-foreground">{improvement.suggestion}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Check className="h-8 w-8 mx-auto mb-2 text-success" />
                    <p>No major issues found!</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="prompt" className="space-y-4 mt-0">
                {summary && (
                  <Card className="bg-muted/50">
                    <CardContent className="p-4">
                      <p className="text-sm">{summary}</p>
                    </CardContent>
                  </Card>
                )}
                
                {improvedPrompt && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Improved System Prompt</Label>
                    <div className="bg-muted/50 p-4 rounded-lg border">
                      <pre className="text-sm whitespace-pre-wrap font-mono">
                        {improvedPrompt}
                      </pre>
                    </div>
                  </div>
                )}

                {improvedFirstMessage && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Improved First Message</Label>
                    <div className="bg-muted/50 p-4 rounded-lg border">
                      <p className="text-sm">{improvedFirstMessage}</p>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="settings" className="space-y-4 mt-0">
                {platformRecommendations ? (
                  <>
                    {platformRecommendations.notes && (
                      <Card className="bg-muted/50">
                        <CardContent className="p-4">
                          <p className="text-sm">{platformRecommendations.notes}</p>
                        </CardContent>
                      </Card>
                    )}
                    
                    {platformRecommendations.voiceSettings && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Volume2 className="h-4 w-4" />
                            Recommended Voice Settings
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            {Object.entries(platformRecommendations.voiceSettings).map(([key, value]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-sm text-muted-foreground capitalize">
                                  {key.replace(/_/g, ' ')}
                                </span>
                                <span className="text-sm font-mono">
                                  {typeof value === 'number' ? value.toFixed(2) : value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {platformRecommendations.turnSettings && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            Recommended Turn Settings
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            {Object.entries(platformRecommendations.turnSettings).map(([key, value]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-sm text-muted-foreground capitalize">
                                  {key.replace(/_/g, ' ')}
                                </span>
                                <span className="text-sm font-mono">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No setting recommendations available</p>
                    <p className="text-xs mt-1">Run a deep analysis to get platform-specific recommendations</p>
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowSuggestions(false)}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            {(improvedPrompt || improvedFirstMessage) && (
              <Button onClick={handleApplyImproved} className="bg-gradient-to-r from-primary to-secondary">
                <Check className="mr-2 h-4 w-4" />
                Apply All Improvements
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
