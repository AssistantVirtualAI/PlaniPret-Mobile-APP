import { ReactNode, useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { setActiveDomain, useActiveDomain } from '@/hooks/useActiveDomain';
import { AdminPortalLayout } from '@/components/portal/LemtelPortalShells';
import { ImpersonationProvider } from '@/contexts/ImpersonationContext';

/**
 * Resolves :slug → organization + pbx_domain, pins it in sessionStorage as the
 * activeDomain, then renders the existing Lemtel admin pages scoped to that
 * customer. Super-admins and members of that org are allowed.
 */
export default function CustomerDomainGate({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const active = useActiveDomain();
  const [status, setStatus] = useState<'loading' | 'ready' | 'forbidden' | 'notfound'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) { setStatus('notfound'); return; }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      // Resolve org by slug
      const { data: org } = await (supabase as any)
        .from('organizations')
        .select('id,name,slug')
        .eq('slug', slug)
        .maybeSingle();
      if (!org) { if (!cancelled) setStatus('notfound'); return; }

      // Authorize: super_admin OR member of org
      const { data: roles } = await (supabase as any)
        .from('user_roles').select('role,organization_id').eq('user_id', u.user.id);
      const isSuper = (roles || []).some((r: any) => r.role === 'super_admin');
      const isMember = (roles || []).some((r: any) => r.organization_id === org.id);
      if (!isSuper && !isMember) { if (!cancelled) setStatus('forbidden'); return; }

      // Resolve linked pbx_domain
      const { data: dom } = await (supabase as any)
        .from('pbx_domains')
        .select('domain_uuid,domain_name')
        .eq('organization_id', org.id)
        .maybeSingle();

      const next = {
        uuid: dom?.domain_uuid || '',
        name: dom?.domain_name || org.name,
        org_id: org.id,
      };
      if (!active || active.org_id !== next.org_id || active.uuid !== next.uuid) {
        setActiveDomain(next);
        // Reload so module-level LEMTEL_ORG picks up the new org
        window.location.reload();
        return;
      }
      if (!cancelled) setStatus('ready');
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (status === 'loading') {
    return <div className="p-8 text-sm text-muted-foreground">Loading domain…</div>;
  }
  if (status === 'forbidden') return <Navigate to="/" replace />;
  if (status === 'notfound') return <Navigate to="/" replace />;

  return (
    <ImpersonationProvider>
      <AdminPortalLayout>{children}</AdminPortalLayout>
    </ImpersonationProvider>
  );
}
