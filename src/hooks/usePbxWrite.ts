import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PbxWriteInput = {
  organizationId: string;
  clientId?: string;
  action: string;
  params?: Record<string, any>;
  mirror?: { table: string; row: Record<string, any>; onConflict?: string };
  objectType?: string;
  objectPbxUuid?: string;
};

export function usePbxWrite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PbxWriteInput) => {
      const { data, error } = await supabase.functions.invoke("pbx-write", { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pbx"] });
    },
    onError: (e: any) => toast.error(e?.message || "PBX action failed"),
  });
}
