import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useSuperAdminException() {
  const { user } = useAuth();

  // Check super admin status server-side using database function
  const { data: isSuperAdminData } = useQuery({
    queryKey: ['is-super-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase.rpc('is_super_admin', { _user_id: user.id });
      if (error) return false;
      return data === true;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-exception', user?.email],
    queryFn: async () => {
      if (!user?.email) return { hasException: false, unlimitedClients: false };

      // Check if this user's email is in the super_admin_exceptions table
      const { data: exception, error } = await supabase
        .from('super_admin_exceptions')
        .select('unlimited_clients')
        .eq('email', user.email)
        .maybeSingle();

      if (error) {
        return { hasException: false, unlimitedClients: false };
      }

      return {
        hasException: !!exception,
        unlimitedClients: exception?.unlimited_clients || false,
      };
    },
    enabled: !!user?.email,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    hasException: data?.hasException || false,
    unlimitedClients: data?.unlimitedClients || false,
    isLoading,
    // Server-side validated super admin check
    isSuperAdmin: isSuperAdminData || false,
  };
}
