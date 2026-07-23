import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

/**
 * Returns the list of platform values the current organization is allowed to use.
 * If allowed_platforms is null/empty in the DB, all platforms are allowed.
 */
export const useAllowedPlatforms = () => {
  const { selectedOrgId } = useOrganization();

  const { data, isLoading } = useQuery({
    queryKey: ['allowed-platforms', selectedOrgId],
    enabled: !!selectedOrgId,
    queryFn: async (): Promise<string[] | null> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('allowed_platforms')
        .eq('id', selectedOrgId!)
        .maybeSingle();
      if (error) throw error;
      const list = (data as any)?.allowed_platforms as string[] | null;
      return list && list.length > 0 ? list : null;
    },
  });

  const isAllowed = (platform: string) => {
    if (!data) return true; // null => unrestricted
    return data.includes(platform);
  };

  return { allowedPlatforms: data, isAllowed, isLoading };
};
