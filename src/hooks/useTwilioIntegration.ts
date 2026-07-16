import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

export interface TwilioPhoneNumber {
  sid: string;
  phone_number: string;
  friendly_name: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  voice_url: string | null;
  voice_method: string;
  voice_fallback_url: string | null;
  voice_fallback_method: string;
  status_callback: string | null;
  status_callback_method: string;
  sms_url: string | null;
  sms_method: string;
  sms_fallback_url: string | null;
  sms_fallback_method: string;
  voice_application_sid: string | null;
  sms_application_sid: string | null;
  date_created: string;
  date_updated: string;
}

export interface TwilioTwiMLApp {
  sid: string;
  friendly_name: string;
  voice_url: string | null;
  voice_method: string;
  voice_fallback_url: string | null;
  voice_fallback_method: string;
  status_callback: string | null;
  status_callback_method: string;
  sms_url: string | null;
  sms_method: string;
  sms_fallback_url: string | null;
  sms_fallback_method: string;
  sms_status_callback: string | null;
  date_created: string;
  date_updated: string;
}

export interface TwilioUsageRecord {
  category: string;
  description: string;
  count: number;
  count_unit: string;
  usage: number;
  usage_unit: string;
  price: number;
  price_unit: string;
  start_date: string;
  end_date: string;
}

export interface AvailableNumber {
  phone_number: string;
  friendly_name: string;
  locality: string;
  region: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
}

export interface TwilioCall {
  sid: string;
  from: string;
  to: string;
  direction: 'inbound' | 'outbound-api' | 'outbound-dial';
  status: string;
  duration: number;
  date_created: string;
  date_updated: string;
  answered_by: string | null;
  caller_name: string | null;
}

function mapPhoneNumber(raw: any): TwilioPhoneNumber {
  return {
    sid: raw.sid,
    phone_number: raw.phone_number,
    friendly_name: raw.friendly_name,
    capabilities: {
      voice: raw.capabilities?.voice || false,
      sms: raw.capabilities?.sms || raw.capabilities?.SMS || false,
      mms: raw.capabilities?.mms || raw.capabilities?.MMS || false,
    },
    voice_url: raw.voice_url,
    voice_method: raw.voice_method || 'POST',
    voice_fallback_url: raw.voice_fallback_url,
    voice_fallback_method: raw.voice_fallback_method || 'POST',
    status_callback: raw.status_callback,
    status_callback_method: raw.status_callback_method || 'POST',
    sms_url: raw.sms_url,
    sms_method: raw.sms_method || 'POST',
    sms_fallback_url: raw.sms_fallback_url,
    sms_fallback_method: raw.sms_fallback_method || 'POST',
    voice_application_sid: raw.voice_application_sid,
    sms_application_sid: raw.sms_application_sid,
    date_created: raw.date_created,
    date_updated: raw.date_updated,
  };
}

function mapTwiMLApp(raw: any): TwilioTwiMLApp {
  return {
    sid: raw.sid,
    friendly_name: raw.friendly_name,
    voice_url: raw.voice_url,
    voice_method: raw.voice_method || 'POST',
    voice_fallback_url: raw.voice_fallback_url,
    voice_fallback_method: raw.voice_fallback_method || 'POST',
    status_callback: raw.status_callback,
    status_callback_method: raw.status_callback_method || 'POST',
    sms_url: raw.sms_url,
    sms_method: raw.sms_method || 'POST',
    sms_fallback_url: raw.sms_fallback_url,
    sms_fallback_method: raw.sms_fallback_method || 'POST',
    sms_status_callback: raw.sms_status_callback,
    date_created: raw.date_created,
    date_updated: raw.date_updated,
  };
}

export function useTwilioIntegration() {
  const { selectedOrgId } = useOrganization();
  const queryClient = useQueryClient();

  const invokeProxy = async (action: string, params: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke('twilio-proxy', {
      body: { action, organizationId: selectedOrgId, ...params }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  // Check if Twilio is configured
  const { data: isConfigured, isLoading: checkingConfig } = useQuery({
    queryKey: ['twilio-config', selectedOrgId],
    queryFn: async () => {
      try {
        await invokeProxy('test_connection');
        return true;
      } catch {
        return false;
      }
    },
  });

  // List phone numbers
  const { data: phoneNumbers = [], isLoading: loadingNumbers, refetch: refetchNumbers } = useQuery({
    queryKey: ['twilio-numbers', selectedOrgId],
    queryFn: async () => {
      const result = await invokeProxy('list_numbers');
      return (result.incoming_phone_numbers || []).map(mapPhoneNumber);
    },
    enabled: !!isConfigured,
  });

  // List TwiML Apps
  const { data: twimlApps = [], isLoading: loadingApps, refetch: refetchApps } = useQuery({
    queryKey: ['twilio-apps', selectedOrgId],
    queryFn: async () => {
      const result = await invokeProxy('list_twiml_apps');
      return (result.applications || []).map(mapTwiMLApp);
    },
    enabled: !!isConfigured,
  });

  // Search available numbers
  const searchNumbers = useMutation({
    mutationFn: async (params: { country: string; areaCode?: string; contains?: string; type?: string }) => {
      const result = await invokeProxy('search_numbers', params);
      return (result.available_phone_numbers || []).map((n: any) => ({
        phone_number: n.phone_number,
        friendly_name: n.friendly_name,
        locality: n.locality,
        region: n.region,
        capabilities: {
          voice: n.capabilities?.voice || false,
          sms: n.capabilities?.sms || n.capabilities?.SMS || false,
          mms: n.capabilities?.mms || n.capabilities?.MMS || false,
        },
      })) as AvailableNumber[];
    },
  });

  // Purchase number
  const purchaseNumber = useMutation({
    mutationFn: async (params: { phoneNumber: string; friendlyName?: string; voiceUrl?: string; smsUrl?: string }) => {
      return invokeProxy('purchase_number', params);
    },
    onSuccess: () => {
      toast.success('Numéro acheté avec succès');
      queryClient.invalidateQueries({ queryKey: ['twilio-numbers'] });
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });

  // Update number
  const updateNumber = useMutation({
    mutationFn: async (params: { phoneSid: string } & Partial<TwilioPhoneNumber>) => {
      return invokeProxy('update_number', params);
    },
    onSuccess: () => {
      toast.success('Numéro mis à jour');
      queryClient.invalidateQueries({ queryKey: ['twilio-numbers'] });
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });

  // Release number
  const releaseNumber = useMutation({
    mutationFn: async (phoneSid: string) => {
      return invokeProxy('release_number', { phoneSid });
    },
    onSuccess: () => {
      toast.success('Numéro libéré');
      queryClient.invalidateQueries({ queryKey: ['twilio-numbers'] });
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });

  // Create TwiML App
  const createTwiMLApp = useMutation({
    mutationFn: async (params: Partial<TwilioTwiMLApp>) => {
      return invokeProxy('create_twiml_app', params);
    },
    onSuccess: () => {
      toast.success('Application TwiML créée');
      queryClient.invalidateQueries({ queryKey: ['twilio-apps'] });
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });

  // Update TwiML App
  const updateTwiMLApp = useMutation({
    mutationFn: async (params: { appSid: string } & Partial<TwilioTwiMLApp>) => {
      return invokeProxy('update_twiml_app', params);
    },
    onSuccess: () => {
      toast.success('Application TwiML mise à jour');
      queryClient.invalidateQueries({ queryKey: ['twilio-apps'] });
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });

  // Delete TwiML App
  const deleteTwiMLApp = useMutation({
    mutationFn: async (appSid: string) => {
      return invokeProxy('delete_twiml_app', { appSid });
    },
    onSuccess: () => {
      toast.success('Application TwiML supprimée');
      queryClient.invalidateQueries({ queryKey: ['twilio-apps'] });
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });

  // Get usage
  const getUsage = useMutation({
    mutationFn: async (params: { startDate?: string; endDate?: string; category?: string }) => {
      const result = await invokeProxy('get_usage', params);
      return (result.usage_records || []).map((r: any) => ({
        category: r.category,
        description: r.description,
        count: parseInt(r.count) || 0,
        count_unit: r.count_unit,
        usage: parseFloat(r.usage) || 0,
        usage_unit: r.usage_unit,
        price: parseFloat(r.price) || 0,
        price_unit: r.price_unit,
        start_date: r.start_date,
        end_date: r.end_date,
      })) as TwilioUsageRecord[];
    },
  });

  // Get account info
  const getAccount = useMutation({
    mutationFn: async () => {
      return invokeProxy('get_account');
    },
  });

  // Get calls
  const getCalls = useMutation({
    mutationFn: async (params: { startDate?: string; endDate?: string; status?: string; limit?: number }) => {
      const result = await invokeProxy('list_calls', params);
      return (result.calls || []).map((c: any) => ({
        sid: c.sid,
        from: c.from,
        to: c.to,
        direction: c.direction,
        status: c.status,
        duration: parseInt(c.duration) || 0,
        date_created: c.date_created,
        date_updated: c.date_updated,
        answered_by: c.answered_by,
        caller_name: c.caller_name,
      })) as TwilioCall[];
    },
  });

  return {
    isConfigured,
    checkingConfig,
    phoneNumbers,
    loadingNumbers,
    refetchNumbers,
    twimlApps,
    loadingApps,
    refetchApps,
    searchNumbers,
    purchaseNumber,
    updateNumber,
    releaseNumber,
    createTwiMLApp,
    updateTwiMLApp,
    deleteTwiMLApp,
    getUsage,
    getAccount,
    getCalls,
  };
}
