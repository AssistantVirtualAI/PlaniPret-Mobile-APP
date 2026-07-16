import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { getPostLoginRoute } from '@/lib/postLoginRoute';

/**
 * Three-portal post-login routing:
 *  - super_admin / ava_admin / master_admin           → /platform
 *  - reseller_admin / customer_admin / org_admin / manager → /customer
 *  - agent / user / everyone else                     → /my
 */
export default function PostLoginRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const route = await getPostLoginRoute(user.id);
      navigate(route, { replace: true });
    })();
  }, [user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      Redirecting…
    </div>
  );
}
