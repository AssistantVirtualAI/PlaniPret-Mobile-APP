import { supabase } from '@/integrations/supabase/client';

interface IntegrationConfig {
  platform: 'elevenlabs' | 'vapi' | 'retell';
  apiKey: string;
  agentId?: string;
  additionalConfig?: Record<string, any>;
}

export class IntegrationsService {
  // Save an integration (API key stored server-side with RLS protection)
  static async saveIntegration(config: IntegrationConfig) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('organization_integrations')
      .upsert({
        user_id: user.id,
        platform: config.platform,
        api_key: config.apiKey, // Stored in plain (table protected by RLS)
        agent_id: config.agentId,
        additional_config: config.additionalConfig || {},
        is_active: true,
        test_status: 'pending'
      }, {
        onConflict: 'user_id,platform'
      })
      .select()
      .single();

    if (error) throw error;

    // Test connection after save
    await this.testConnection(config.platform);

    return data;
  }

  // Test connection (via Edge Function for security)
  static async testConnection(platform: string) {
    const { data, error } = await supabase.functions.invoke('test-integration', {
      body: { platform }
    });

    if (error) throw error;
    return data;
  }

  // Get integrations using safe view (excludes API keys for security)
  static async getIntegrations() {
    const { data, error } = await supabase
      .from('organization_integrations_safe')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // Delete an integration
  static async deleteIntegration(platform: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('organization_integrations')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', platform);

    if (error) throw error;
  }
}
