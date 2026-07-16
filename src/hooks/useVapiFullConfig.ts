import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VapiHookParams {
  organizationId?: string;
  apiKey?: string | null;
  assistantId?: string | null;
}

async function invokeVapi(action: string, params: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke('vapi-proxy', {
    body: { action, ...params },
  });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Unknown error');
  return data.data;
}

// ==================== ASSISTANTS ====================
export function useVapiAssistants({ organizationId, apiKey }: VapiHookParams) {
  return useQuery({
    queryKey: ['vapi', 'assistants', organizationId],
    queryFn: () => invokeVapi('listAssistants', { organizationId, apiKey }),
    enabled: !!(organizationId || apiKey),
  });
}

export function useVapiAssistant({ organizationId, apiKey, assistantId }: VapiHookParams & { assistantId?: string | null }) {
  return useQuery({
    queryKey: ['vapi', 'assistant', assistantId],
    queryFn: () => invokeVapi('getAssistant', { organizationId, apiKey, assistantId }),
    enabled: !!assistantId && !!(organizationId || apiKey),
  });
}

export function useUpdateVapiAssistant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { organizationId?: string; apiKey?: string; assistantId: string; config: Record<string, any> }) =>
      invokeVapi('updateAssistant', p),
    onSuccess: () => { toast.success('Assistant mis à jour'); qc.invalidateQueries({ queryKey: ['vapi'] }); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteVapiAssistant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { organizationId?: string; apiKey?: string; assistantId: string }) =>
      invokeVapi('deleteAssistant', p),
    onSuccess: () => { toast.success('Assistant supprimé'); qc.invalidateQueries({ queryKey: ['vapi'] }); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ==================== SQUADS ====================
export function useVapiSquads({ organizationId, apiKey }: VapiHookParams) {
  return useQuery({
    queryKey: ['vapi', 'squads', organizationId],
    queryFn: () => invokeVapi('listSquads', { organizationId, apiKey }),
    enabled: !!(organizationId || apiKey),
  });
}

export function useCreateVapiSquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { organizationId?: string; apiKey?: string; config: any }) =>
      invokeVapi('createSquad', p),
    onSuccess: () => { toast.success('Squad créé'); qc.invalidateQueries({ queryKey: ['vapi', 'squads'] }); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteVapiSquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { organizationId?: string; apiKey?: string; squadId: string }) =>
      invokeVapi('deleteSquad', p),
    onSuccess: () => { toast.success('Squad supprimé'); qc.invalidateQueries({ queryKey: ['vapi', 'squads'] }); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ==================== CALLS ====================
export function useVapiCalls({ organizationId, apiKey, assistantId }: VapiHookParams) {
  return useQuery({
    queryKey: ['vapi', 'calls', organizationId, assistantId],
    queryFn: () => invokeVapi('listCalls', { organizationId, apiKey, assistantId, limit: 100 }),
    enabled: !!(organizationId || apiKey),
  });
}

// ==================== CAMPAIGNS ====================
export function useVapiCampaigns({ organizationId, apiKey }: VapiHookParams) {
  return useQuery({
    queryKey: ['vapi', 'campaigns', organizationId],
    queryFn: () => invokeVapi('listCampaigns', { organizationId, apiKey }),
    enabled: !!(organizationId || apiKey),
  });
}

export function useCreateVapiCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { organizationId?: string; apiKey?: string; config: any }) =>
      invokeVapi('createCampaign', p),
    onSuccess: () => { toast.success('Campagne créée'); qc.invalidateQueries({ queryKey: ['vapi', 'campaigns'] }); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteVapiCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { organizationId?: string; apiKey?: string; campaignId: string }) =>
      invokeVapi('deleteCampaign', p),
    onSuccess: () => { toast.success('Campagne supprimée'); qc.invalidateQueries({ queryKey: ['vapi', 'campaigns'] }); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ==================== SESSIONS ====================
export function useVapiSessions({ organizationId, apiKey }: VapiHookParams) {
  return useQuery({
    queryKey: ['vapi', 'sessions', organizationId],
    queryFn: () => invokeVapi('listSessions', { organizationId, apiKey }),
    enabled: !!(organizationId || apiKey),
  });
}

// ==================== PHONE NUMBERS ====================
export function useVapiPhoneNumbers({ organizationId, apiKey }: VapiHookParams) {
  return useQuery({
    queryKey: ['vapi', 'phoneNumbers', organizationId],
    queryFn: () => invokeVapi('listPhoneNumbers', { organizationId, apiKey }),
    enabled: !!(organizationId || apiKey),
  });
}

export function useDeleteVapiPhoneNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { organizationId?: string; apiKey?: string; phoneNumberId: string }) =>
      invokeVapi('deletePhoneNumber', p),
    onSuccess: () => { toast.success('Numéro supprimé'); qc.invalidateQueries({ queryKey: ['vapi', 'phoneNumbers'] }); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ==================== TOOLS ====================
export function useVapiTools({ organizationId, apiKey }: VapiHookParams) {
  return useQuery({
    queryKey: ['vapi', 'tools', organizationId],
    queryFn: () => invokeVapi('listTools', { organizationId, apiKey }),
    enabled: !!(organizationId || apiKey),
  });
}

export function useDeleteVapiTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { organizationId?: string; apiKey?: string; toolId: string }) =>
      invokeVapi('deleteTool', p),
    onSuccess: () => { toast.success('Outil supprimé'); qc.invalidateQueries({ queryKey: ['vapi', 'tools'] }); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ==================== BLOCKS ====================
export function useVapiBlocks({ organizationId, apiKey }: VapiHookParams) {
  return useQuery({
    queryKey: ['vapi', 'blocks', organizationId],
    queryFn: () => invokeVapi('listBlocks', { organizationId, apiKey }),
    enabled: !!(organizationId || apiKey),
  });
}

export function useDeleteVapiBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { organizationId?: string; apiKey?: string; blockId: string }) =>
      invokeVapi('deleteBlock', p),
    onSuccess: () => { toast.success('Bloc supprimé'); qc.invalidateQueries({ queryKey: ['vapi', 'blocks'] }); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ==================== FILES ====================
export function useVapiFiles({ organizationId, apiKey }: VapiHookParams) {
  return useQuery({
    queryKey: ['vapi', 'files', organizationId],
    queryFn: () => invokeVapi('listFiles', { organizationId, apiKey }),
    enabled: !!(organizationId || apiKey),
  });
}

export function useDeleteVapiFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { organizationId?: string; apiKey?: string; fileId: string }) =>
      invokeVapi('deleteFile', p),
    onSuccess: () => { toast.success('Fichier supprimé'); qc.invalidateQueries({ queryKey: ['vapi', 'files'] }); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ==================== ANALYTICS ====================
export function useVapiAnalytics({ organizationId, apiKey, assistantId }: VapiHookParams, timeframe = '7d') {
  return useQuery({
    queryKey: ['vapi', 'analytics', organizationId, assistantId, timeframe],
    queryFn: () => invokeVapi('getAnalytics', { organizationId, apiKey, assistantId, timeframe }),
    enabled: !!(organizationId || apiKey),
  });
}

// ==================== LOGS ====================
export function useVapiLogs({ organizationId, apiKey, assistantId }: VapiHookParams, filters?: { callId?: string; level?: string }) {
  return useQuery({
    queryKey: ['vapi', 'logs', organizationId, filters],
    queryFn: () => invokeVapi('getLogs', { organizationId, apiKey, assistantId, ...filters }),
    enabled: !!(organizationId || apiKey),
  });
}

// ==================== KNOWLEDGE BASES ====================
export function useVapiKnowledgeBases({ organizationId, apiKey }: VapiHookParams) {
  return useQuery({
    queryKey: ['vapi', 'knowledgeBases', organizationId],
    queryFn: () => invokeVapi('listKnowledgeBases', { organizationId, apiKey }),
    enabled: !!(organizationId || apiKey),
  });
}

export function useDeleteVapiKnowledgeBase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { organizationId?: string; apiKey?: string; knowledgeBaseId: string }) =>
      invokeVapi('deleteKnowledgeBase', p),
    onSuccess: () => { toast.success('Base supprimée'); qc.invalidateQueries({ queryKey: ['vapi', 'knowledgeBases'] }); },
    onError: (e: any) => toast.error(e.message),
  });
}
