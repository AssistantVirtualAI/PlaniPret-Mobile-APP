import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type ExportFormat = 'json' | 'csv';

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

export const useAuditLogsExport = () => {
  return useMutation({
    mutationFn: async (args: {
      organizationId: string;
      format: ExportFormat;
      filters: {
        action?: string;
        resource_type?: string;
        search?: string;
        date_from?: string;
        date_to?: string;
      };
    }) => {
      const { data, error } = await supabase.functions.invoke('export-audit-logs', {
        body: {
          organization_id: args.organizationId,
          format: args.format,
          filters: args.filters,
        },
      });
      if (error) throw error;
      if (!data?.filename || !data?.content || !data?.mime) throw new Error('Invalid export response');
      downloadTextFile(data.filename, data.mime, data.content);
      return data;
    },
  });
};
