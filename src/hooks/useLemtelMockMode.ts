import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const LEMTEL_ORG_ID = '71755d33-ed64-4ad5-a828-61c9d2029eb7';

/**
 * Returns whether mock data mode is enabled for Lemtel.
 * Reads `use_mock_data` from `lemtel_config_safe` view, defaults to true.
 */
export function useLemtelMockMode() {
  const [useMock, setUseMock] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('lemtel_config_safe' as any)
          .select('use_mock_data')
          .eq('organization_id', LEMTEL_ORG_ID)
          .maybeSingle();
        const row = data as { use_mock_data?: boolean } | null;
        if (active) setUseMock(row?.use_mock_data ?? true);
      } catch {
        if (active) setUseMock(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return { useMock, loading };
}
