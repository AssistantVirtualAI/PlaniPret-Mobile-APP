import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type ExportType = 'topics' | 'prompt_templates' | 'both';
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

export const useOrgDataExport = () => {
  return useMutation({
    mutationFn: async ({ organizationId, exportType, format }: { organizationId: string; exportType: ExportType; format: ExportFormat }) => {
      const { data, error } = await supabase.functions.invoke('export-org-data', {
        body: {
          organization_id: organizationId,
          export_type: exportType,
          format,
        },
      });

      if (error) throw error;
      if (!data?.filename || !data?.content || !data?.mime) {
        throw new Error('Invalid export response');
      }

      downloadTextFile(data.filename, data.mime, data.content);
      return data;
    },
  });
};
