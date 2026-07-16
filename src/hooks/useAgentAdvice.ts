import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

export interface AgentDailyReport {
  id: string;
  agent_id: string;
  organization_id: string;
  report_date: string;
  total_conversations: number;
  avg_satisfaction: number | null;
  avg_duration_seconds: number | null;
  success_rate: number | null;
  summary: string | null;
  strengths: string[];
  weaknesses: string[];
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    action: string;
    impact: string;
  }>;
  prompt_suggestions: string[];
  kb_suggestions: string[];
  priority_actions: Array<{
    action: string;
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
  }>;
  conversations_analyzed: number;
  generated_at: string;
  created_at: string;
}

export function useAgentDailyReports(agentId?: string) {
  const { selectedOrg } = useOrganization();

  return useQuery({
    queryKey: ['agent-daily-reports', selectedOrg?.id, agentId],
    queryFn: async (): Promise<AgentDailyReport[]> => {
      if (!selectedOrg?.id) return [];

      let query = supabase
        .from('agent_daily_reports')
        .select('*')
        .eq('organization_id', selectedOrg.id)
        .order('report_date', { ascending: false })
        .limit(30);

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching daily reports:', error);
        throw error;
      }

      return (data || []).map(r => ({
        ...r,
        strengths: Array.isArray(r.strengths) ? r.strengths as string[] : [],
        weaknesses: Array.isArray(r.weaknesses) ? r.weaknesses as string[] : [],
        recommendations: Array.isArray(r.recommendations) ? r.recommendations as AgentDailyReport['recommendations'] : [],
        prompt_suggestions: (r.prompt_suggestions || []) as string[],
        kb_suggestions: (r.kb_suggestions || []) as string[],
        priority_actions: Array.isArray(r.priority_actions) ? r.priority_actions as AgentDailyReport['priority_actions'] : [],
      })) as AgentDailyReport[];
    },
    enabled: !!selectedOrg?.id,
  });
}

export function useLatestAgentAdvice(agentId: string, period?: number | 'all') {
  const { selectedOrg } = useOrganization();
  const { language } = useTranslation();

  return useQuery({
    queryKey: ['agent-latest-advice', selectedOrg?.id, agentId, language, period],
    queryFn: async (): Promise<AgentDailyReport | null> => {
      if (!selectedOrg?.id || !agentId) return null;

      // Build query to get latest report matching language and period if specified
      let query = supabase
        .from('agent_daily_reports')
        .select('*')
        .eq('organization_id', selectedOrg.id)
        .eq('agent_id', agentId)
        .eq('language', language);
      
      if (period !== undefined) {
        query = query.eq('period_days', period === 'all' ? 'all' : String(period));
      }

      const { data, error } = await query
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching latest advice:', error);
        throw error;
      }

      if (!data) return null;

      return {
        ...data,
        strengths: Array.isArray(data.strengths) ? data.strengths as string[] : [],
        weaknesses: Array.isArray(data.weaknesses) ? data.weaknesses as string[] : [],
        recommendations: Array.isArray(data.recommendations) ? data.recommendations as AgentDailyReport['recommendations'] : [],
        prompt_suggestions: (data.prompt_suggestions || []) as string[],
        kb_suggestions: (data.kb_suggestions || []) as string[],
        priority_actions: Array.isArray(data.priority_actions) ? data.priority_actions as AgentDailyReport['priority_actions'] : [],
      } as AgentDailyReport;
    },
    enabled: !!selectedOrg?.id && !!agentId,
  });
}

export function useGenerateAgentAdvice() {
  const queryClient = useQueryClient();
  const { language } = useTranslation();

  return useMutation({
    mutationFn: async ({ agentId, days = 1, language: langOverride }: { agentId: string; days?: number | 'all'; language?: string }) => {
      const { data, error } = await supabase.functions.invoke('generate-agent-advice', {
        body: { agentId, days, language: langOverride || language }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const message = language === 'en' ? 'AI advice generated successfully' : 'Conseils IA générés avec succès';
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ['agent-daily-reports'] });
      queryClient.invalidateQueries({ queryKey: ['agent-latest-advice'] });
    },
    onError: (error) => {
      console.error('Error generating advice:', error);
      const message = language === 'en' ? 'Error generating advice' : 'Erreur lors de la génération des conseils';
      toast.error(message);
    }
  });
}

export function useSyncElevenLabsConversations() {
  const queryClient = useQueryClient();
  const { language } = useTranslation();

  return useMutation({
    mutationFn: async ({
      agentId,
      limit = 100,
      mode = 'recent',
    }: {
      agentId?: string;
      limit?: number;
      mode?: 'recent' | 'all';
    }) => {
      // In "all" mode, sync in chunks to avoid request timeouts.
      let cursor: string | undefined = undefined;
      let total = { synced: 0, created: 0, updated: 0, analyzed: 0 };

      // Safety cap: don’t loop forever if API cursor misbehaves
      const maxIterations = mode === 'all' ? 50 : 1;

      for (let i = 0; i < maxIterations; i++) {
        const { data, error } = await supabase.functions.invoke('sync-elevenlabs-conversations', {
          body: { action: 'sync', agentId, limit, mode, language, cursor },
        });

        if (error) throw error;

        total.synced += Number(data?.synced || 0);
        total.created += Number(data?.created || 0);
        total.updated += Number(data?.updated || 0);
        total.analyzed += Number(data?.analyzed || 0);

        // If the function supports paging, it should return nextCursor + hasMore
        if (mode !== 'all' || !data?.hasMore || !data?.nextCursor) {
          return { ...data, ...total };
        }

        cursor = data.nextCursor;
      }

      return total;
    },
    onSuccess: (data) => {
      const message = language === 'en'
        ? `Sync complete: ${data.synced} conversations (${data.created} new, ${data.updated} updated)`
        : `Synchronisation terminée: ${data.synced} conversations (${data.created} nouvelles, ${data.updated} mises à jour)`;
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ['agent-reports'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error) => {
      console.error('Sync error:', error);
      const message = language === 'en' ? 'Sync error' : 'Erreur lors de la synchronisation';
      toast.error(message);
    }
  });
}
