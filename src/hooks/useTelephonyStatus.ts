import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LEMTEL_ORG } from '@/hooks/usePbxData';

export type ServiceStatus = { ok: boolean; latency_ms?: number; error?: string; detail?: string };
export type TelephonyStatus = {
  mock_mode: boolean;
  services: { fusionpbx: ServiceStatus; telnyx: ServiceStatus; elevenlabs: ServiceStatus; ai: ServiceStatus };
  checked_at: string;
};

export function useTelephonyStatus() {
  return useQuery<TelephonyStatus>({
    queryKey: ['telephony-status', LEMTEL_ORG],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('telephony-ping', {
        body: { organization_id: LEMTEL_ORG },
      });
      if (error) throw error;
      return data as TelephonyStatus;
    },
  });
}
