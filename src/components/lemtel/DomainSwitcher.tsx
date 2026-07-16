import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveDomain, setActiveDomain } from '@/hooks/useActiveDomain';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe } from 'lucide-react';

type Row = { domain_uuid: string; domain_name: string; organization_id?: string };

export default function DomainSwitcher() {
  const active = useActiveDomain();
  const [rows, setRows] = useState<Row[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: roles } = await (supabase as any)
        .from('user_roles').select('role').eq('user_id', u.user.id);
      const admin = (roles || []).some((r: any) => r.role === 'super_admin');
      setIsAdmin(admin);
      if (!admin) return;
      const { data } = await (supabase as any)
        .from('pbx_domains').select('domain_uuid,domain_name,organization_id').order('domain_name');
      setRows(data || []);
    })();
  }, []);

  if (!isAdmin || rows.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Globe className="w-4 h-4 text-muted-foreground" />
      <Select
        value={active?.uuid || ''}
        onValueChange={async (uuid) => {
          const row = rows.find(r => r.domain_uuid === uuid);
          if (!row) return;
          let org_id = row.organization_id;
          if (!org_id) {
            const { data } = await (supabase as any).rpc('get_org_by_fusionpbx_domain', { _domain_uuid: uuid });
            org_id = Array.isArray(data) ? data[0]?.id : data?.id;
          }
          if (!org_id) return;
          setActiveDomain({ uuid, name: row.domain_name, org_id });
          window.location.reload();
        }}
      >
        <SelectTrigger className="w-[220px] h-8 text-xs">
          <SelectValue placeholder="Select customer domain…" />
        </SelectTrigger>
        <SelectContent>
          {rows.map(r => (
            <SelectItem key={r.domain_uuid} value={r.domain_uuid}>{r.domain_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
