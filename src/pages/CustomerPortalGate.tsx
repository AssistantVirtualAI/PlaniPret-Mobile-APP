import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

export default function CustomerPortalGate() {
  const { domain = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!domain) return;
      const { data, error: e } = await (supabase as any).rpc('resolve_org_by_domain_name', { _domain_name: domain });
      if (e) { setError(e.message); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { setError(`No customer found for domain ${domain}`); return; }
      sessionStorage.setItem('lemtel.activeDomain', JSON.stringify({
        name: domain, uuid: row.fusionpbx_domain_uuid, org_id: row.id,
      }));
      const { data: sess } = await supabase.auth.getSession();
      navigate(sess?.session ? '/console' : '/auth?next=/console', { replace: true });
    })();
  }, [domain, navigate]);


  return (
    <div className="min-h-screen flex items-center justify-center">
      {error ? (
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">{error}</p>
          <a className="text-primary underline text-sm" href="/auth">Sign in</a>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading customer portal…
        </div>
      )}
    </div>
  );
}
