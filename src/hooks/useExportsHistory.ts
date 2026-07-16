import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OrgExportRow {
  id: string;
  organization_id: string;
  created_by: string;
  export_type: string;
  format: string;
  filters: any;
  filename: string;
  mime: string;
  created_at: string;
}

function downloadTextFile(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const useExportsHistory = (organizationId?: string) => {
  return useQuery({
    queryKey: ['org-exports', organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as OrgExportRow[];
      const { data, error } = await supabase
        .from('org_exports')
        .select('id, organization_id, created_by, export_type, format, filters, filename, mime, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as OrgExportRow[];
    },
    enabled: !!organizationId,
  });
};

export const useDownloadExport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ exportId }: { exportId: string }) => {
      const { data, error } = await supabase.functions.invoke('exports-download', {
        body: { export_id: exportId },
      });
      if (error) throw error;
      if (!data?.filename || !data?.content || !data?.mime) throw new Error('Invalid export response');
      downloadTextFile(data.filename, data.mime, data.content);
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['org-exports'] });
      qc.invalidateQueries({ queryKey: ['org-export', vars.exportId] });
    },
  });
};
