import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/context/OrganizationContext";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";

export interface SmsTemplate {
  id: string;
  organization_id: string;
  name: string;
  content: string;
  category: string | null;
  variables: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useSmsTemplates() {
  const { selectedOrg } = useOrganization();
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTemplates = async () => {
    if (!selectedOrg?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_templates")
        .select("*")
        .eq("organization_id", selectedOrg.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTemplates((data as SmsTemplate[]) || []);
    } catch (error) {
      console.error("Error fetching SMS templates:", error);
      toast.error(t('messages.templateLoadError'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [selectedOrg?.id]);

  const createTemplate = async (templateData: Partial<SmsTemplate>) => {
    if (!selectedOrg?.id) return;

    try {
      const { error } = await supabase.from("sms_templates").insert([{
        name: templateData.name || "",
        content: templateData.content || "",
        category: templateData.category,
        variables: templateData.variables,
        is_active: templateData.is_active,
        organization_id: selectedOrg.id,
      }]);

      if (error) throw error;
      toast.success(t('messages.templateCreated'));
      fetchTemplates();
    } catch (error) {
      console.error("Error creating SMS template:", error);
      toast.error(t('messages.createError'));
    }
  };

  const updateTemplate = async (id: string, updates: Partial<SmsTemplate>) => {
    try {
      const { error } = await supabase
        .from("sms_templates")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
      toast.success(t('messages.templateUpdated'));
      fetchTemplates();
    } catch (error) {
      console.error("Error updating SMS template:", error);
      toast.error(t('messages.updateError'));
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const { error } = await supabase
        .from("sms_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success(t('messages.templateDeleted'));
      fetchTemplates();
    } catch (error) {
      console.error("Error deleting SMS template:", error);
      toast.error(t('messages.deleteError'));
    }
  };

  return {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    refetch: fetchTemplates,
  };
}
