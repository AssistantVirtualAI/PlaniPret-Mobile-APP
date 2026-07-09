export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agent_config: {
        Row: {
          created_at: string
          first_message: string | null
          id: string
          is_active: boolean | null
          max_tokens: number | null
          name: string
          organization_id: string | null
          system_prompt: string
          temperature: number | null
          updated_at: string
          user_id: string
          voice_id: string | null
          voice_similarity: number | null
          voice_stability: number | null
          voice_style: number | null
        }
        Insert: {
          created_at?: string
          first_message?: string | null
          id?: string
          is_active?: boolean | null
          max_tokens?: number | null
          name: string
          organization_id?: string | null
          system_prompt: string
          temperature?: number | null
          updated_at?: string
          user_id: string
          voice_id?: string | null
          voice_similarity?: number | null
          voice_stability?: number | null
          voice_style?: number | null
        }
        Update: {
          created_at?: string
          first_message?: string | null
          id?: string
          is_active?: boolean | null
          max_tokens?: number | null
          name?: string
          organization_id?: string | null
          system_prompt?: string
          temperature?: number | null
          updated_at?: string
          user_id?: string
          voice_id?: string | null
          voice_similarity?: number | null
          voice_stability?: number | null
          voice_style?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_daily_reports: {
        Row: {
          agent_id: string | null
          avg_duration_seconds: number | null
          avg_satisfaction: number | null
          conversations_analyzed: number | null
          created_at: string | null
          generated_at: string | null
          id: string
          kb_suggestions: string[] | null
          language: string
          organization_id: string | null
          period_days: string
          period_end: string | null
          period_start: string | null
          priority_actions: Json | null
          prompt_suggestions: string[] | null
          recommendations: Json | null
          report_date: string
          strengths: Json | null
          success_rate: number | null
          summary: string | null
          total_conversations: number | null
          updated_at: string | null
          weaknesses: Json | null
        }
        Insert: {
          agent_id?: string | null
          avg_duration_seconds?: number | null
          avg_satisfaction?: number | null
          conversations_analyzed?: number | null
          created_at?: string | null
          generated_at?: string | null
          id?: string
          kb_suggestions?: string[] | null
          language?: string
          organization_id?: string | null
          period_days?: string
          period_end?: string | null
          period_start?: string | null
          priority_actions?: Json | null
          prompt_suggestions?: string[] | null
          recommendations?: Json | null
          report_date?: string
          strengths?: Json | null
          success_rate?: number | null
          summary?: string | null
          total_conversations?: number | null
          updated_at?: string | null
          weaknesses?: Json | null
        }
        Update: {
          agent_id?: string | null
          avg_duration_seconds?: number | null
          avg_satisfaction?: number | null
          conversations_analyzed?: number | null
          created_at?: string | null
          generated_at?: string | null
          id?: string
          kb_suggestions?: string[] | null
          language?: string
          organization_id?: string | null
          period_days?: string
          period_end?: string | null
          period_start?: string | null
          priority_actions?: Json | null
          prompt_suggestions?: string[] | null
          recommendations?: Json | null
          report_date?: string
          strengths?: Json | null
          success_rate?: number | null
          summary?: string | null
          total_conversations?: number | null
          updated_at?: string | null
          weaknesses?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_daily_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_daily_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_daily_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_health_scores: {
        Row: {
          agent_id: string | null
          created_at: string | null
          id: string
          negative_sentiments: number | null
          organization_id: string | null
          overall_health_score: number | null
          period_end: string
          period_start: string
          positive_sentiments: number | null
          resolution_rate: number | null
          resolved_conversations: number | null
          satisfaction_score: number | null
          sentiment_score: number | null
          total_conversations: number | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          id?: string
          negative_sentiments?: number | null
          organization_id?: string | null
          overall_health_score?: number | null
          period_end: string
          period_start: string
          positive_sentiments?: number | null
          resolution_rate?: number | null
          resolved_conversations?: number | null
          satisfaction_score?: number | null
          sentiment_score?: number | null
          total_conversations?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          id?: string
          negative_sentiments?: number | null
          organization_id?: string | null
          overall_health_score?: number | null
          period_end?: string
          period_start?: string
          positive_sentiments?: number | null
          resolution_rate?: number | null
          resolved_conversations?: number | null
          satisfaction_score?: number | null
          sentiment_score?: number | null
          total_conversations?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_health_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_health_scores_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_health_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_insights: {
        Row: {
          agent_id: string | null
          alert_sent: boolean | null
          analyzed_at: string | null
          conversation_id: string
          created_at: string | null
          id: string
          improvements: Json | null
          language: string
          organization_id: string | null
          overall_sentiment: string | null
          satisfaction_score: number | null
          sentiment_timeline: Json | null
          smart_tags: string[] | null
        }
        Insert: {
          agent_id?: string | null
          alert_sent?: boolean | null
          analyzed_at?: string | null
          conversation_id: string
          created_at?: string | null
          id?: string
          improvements?: Json | null
          language?: string
          organization_id?: string | null
          overall_sentiment?: string | null
          satisfaction_score?: number | null
          sentiment_timeline?: Json | null
          smart_tags?: string[] | null
        }
        Update: {
          agent_id?: string | null
          alert_sent?: boolean | null
          analyzed_at?: string | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          improvements?: Json | null
          language?: string
          organization_id?: string | null
          overall_sentiment?: string | null
          satisfaction_score?: number | null
          sentiment_timeline?: Json | null
          smart_tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_insights_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_mcp_servers: {
        Row: {
          agent_id: string
          auth_config: Json | null
          auth_type: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_connected_at: string | null
          name: string
          organization_id: string
          server_type: string
          server_url: string
          tools_enabled: string[] | null
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          auth_config?: Json | null
          auth_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_connected_at?: string | null
          name: string
          organization_id: string
          server_type?: string
          server_url: string
          tools_enabled?: string[] | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          auth_config?: Json | null
          auth_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_connected_at?: string | null
          name?: string
          organization_id?: string
          server_type?: string
          server_url?: string
          tools_enabled?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_mcp_servers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_mcp_servers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_mcp_servers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_platform_webhooks: {
        Row: {
          agent_id: string
          created_at: string | null
          error_count: number | null
          events: string[]
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          organization_id: string
          platform: string
          updated_at: string | null
          webhook_secret: string | null
          webhook_url: string
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          error_count?: number | null
          events?: string[]
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          organization_id: string
          platform: string
          updated_at?: string | null
          webhook_secret?: string | null
          webhook_url: string
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          error_count?: number | null
          events?: string[]
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          organization_id?: string
          platform?: string
          updated_at?: string | null
          webhook_secret?: string | null
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_platform_webhooks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_platform_webhooks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_platform_webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          assigned_to: string | null
          avatar_url: string | null
          branding_url: string | null
          client_id: string | null
          config: Json | null
          created_at: string
          description: string | null
          id: string
          is_external: boolean | null
          name: string
          organization_id: string
          platform: string
          platform_agent_id: string | null
          platform_api_key: string | null
          slug: string | null
          theme_config: Json | null
          twilio_number: string | null
          updated_at: string
          widget_layout: string | null
        }
        Insert: {
          assigned_to?: string | null
          avatar_url?: string | null
          branding_url?: string | null
          client_id?: string | null
          config?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_external?: boolean | null
          name: string
          organization_id: string
          platform: string
          platform_agent_id?: string | null
          platform_api_key?: string | null
          slug?: string | null
          theme_config?: Json | null
          twilio_number?: string | null
          updated_at?: string
          widget_layout?: string | null
        }
        Update: {
          assigned_to?: string | null
          avatar_url?: string | null
          branding_url?: string | null
          client_id?: string | null
          config?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_external?: boolean | null
          name?: string
          organization_id?: string
          platform?: string
          platform_agent_id?: string | null
          platform_api_key?: string | null
          slug?: string | null
          theme_config?: Json | null
          twilio_number?: string | null
          updated_at?: string
          widget_layout?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_request_audit_log: {
        Row: {
          call_record_id: string | null
          created_at: string
          error_code: string | null
          http_status: number | null
          id: string
          latency_ms: number | null
          message: string | null
          metadata: Json | null
          model: string | null
          organization_id: string | null
          provider: string | null
          request_type: string
          status: string
          user_id: string | null
        }
        Insert: {
          call_record_id?: string | null
          created_at?: string
          error_code?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          message?: string | null
          metadata?: Json | null
          model?: string | null
          organization_id?: string | null
          provider?: string | null
          request_type: string
          status: string
          user_id?: string | null
        }
        Update: {
          call_record_id?: string | null
          created_at?: string
          error_code?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          message?: string | null
          metadata?: Json | null
          model?: string | null
          organization_id?: string | null
          provider?: string | null
          request_type?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      alert_notifications: {
        Row: {
          agent_id: string | null
          alert_type: string
          conversation_id: string
          created_at: string | null
          email_sent_to: string[] | null
          id: string
          organization_id: string | null
          satisfaction_score: number | null
        }
        Insert: {
          agent_id?: string | null
          alert_type: string
          conversation_id: string
          created_at?: string | null
          email_sent_to?: string[] | null
          id?: string
          organization_id?: string | null
          satisfaction_score?: number | null
        }
        Update: {
          agent_id?: string | null
          alert_type?: string
          conversation_id?: string
          created_at?: string | null
          email_sent_to?: string[] | null
          id?: string
          organization_id?: string | null
          satisfaction_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_notifications_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_notifications_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics: {
        Row: {
          avg_satisfaction: number | null
          created_at: string
          date: string
          id: string
          organization_id: string | null
          platform: string | null
          total_conversations: number | null
          total_duration: number | null
          user_id: string
        }
        Insert: {
          avg_satisfaction?: number | null
          created_at?: string
          date: string
          id?: string
          organization_id?: string | null
          platform?: string | null
          total_conversations?: number | null
          total_duration?: number | null
          user_id: string
        }
        Update: {
          avg_satisfaction?: number | null
          created_at?: string
          date?: string
          id?: string
          organization_id?: string | null
          platform?: string | null
          total_conversations?: number | null
          total_duration?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_login_tokens: {
        Row: {
          app: string
          consumed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          organization_id: string
          token_hash: string
          user_id: string
        }
        Insert: {
          app: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          organization_id: string
          token_hash: string
          user_id: string
        }
        Update: {
          app?: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          organization_id?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      app_releases: {
        Row: {
          assets: Json | null
          created_at: string | null
          id: string
          is_latest: boolean | null
          name: string | null
          platform_urls: Json | null
          published_at: string | null
          tag: string
          updated_at: string | null
          url: string | null
        }
        Insert: {
          assets?: Json | null
          created_at?: string | null
          id?: string
          is_latest?: boolean | null
          name?: string | null
          platform_urls?: Json | null
          published_at?: string | null
          tag: string
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          assets?: Json | null
          created_at?: string | null
          id?: string
          is_latest?: boolean | null
          name?: string | null
          platform_urls?: Json | null
          published_at?: string | null
          tag?: string
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      appointment_reminders: {
        Row: {
          appointment_id: string
          channel: string
          created_at: string
          error: string | null
          id: string
          offset_minutes: number
          organization_id: string
          sent_at: string
          status: string
        }
        Insert: {
          appointment_id: string
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          offset_minutes: number
          organization_id: string
          sent_at?: string
          status?: string
        }
        Update: {
          appointment_id?: string
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          offset_minutes?: number
          organization_id?: string
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          agent_id: string | null
          attendee_email: string | null
          attendee_name: string | null
          attendee_phone: string | null
          calendar_integration_id: string | null
          client_id: string | null
          conversation_id: string | null
          created_at: string
          description: string | null
          end_time: string
          external_event_id: string | null
          host_kind: string | null
          host_user_id: string | null
          id: string
          location_type: string | null
          meeting_url: string | null
          metadata: Json | null
          organization_id: string
          reminder_offsets: number[]
          start_time: string
          status: string
          timezone: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          attendee_email?: string | null
          attendee_name?: string | null
          attendee_phone?: string | null
          calendar_integration_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          end_time: string
          external_event_id?: string | null
          host_kind?: string | null
          host_user_id?: string | null
          id?: string
          location_type?: string | null
          meeting_url?: string | null
          metadata?: Json | null
          organization_id: string
          reminder_offsets?: number[]
          start_time: string
          status?: string
          timezone?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          attendee_email?: string | null
          attendee_name?: string | null
          attendee_phone?: string | null
          calendar_integration_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          end_time?: string
          external_event_id?: string | null
          host_kind?: string | null
          host_user_id?: string | null
          id?: string
          location_type?: string | null
          meeting_url?: string | null
          metadata?: Json | null
          organization_id?: string
          reminder_offsets?: number[]
          start_time?: string
          status?: string
          timezone?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_calendar_integration_id_fkey"
            columns: ["calendar_integration_id"]
            isOneToOne: false
            referencedRelation: "calendar_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_calendar_integration_id_fkey"
            columns: ["calendar_integration_id"]
            isOneToOne: false
            referencedRelation: "calendar_integrations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          impersonated_org_id: string | null
          impersonator_id: string | null
          ip_address: string | null
          metadata: Json | null
          org_id: string | null
          organization_id: string | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
          user_org_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          impersonated_org_id?: string | null
          impersonator_id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          org_id?: string | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
          user_org_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          impersonated_org_id?: string | null
          impersonator_id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          org_id?: string | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
          user_org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_config: {
        Row: {
          ai_credits: number | null
          created_at: string
          credits_limit: number | null
          credits_used: number | null
          organization_id: string
          performance_billing_enabled: boolean | null
          plan_tier: string | null
          price_per_appointment: number | null
          price_per_converted_lead: number | null
          price_per_qualified_lead: number | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_ends_at: string | null
          subscription_status: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          ai_credits?: number | null
          created_at?: string
          credits_limit?: number | null
          credits_used?: number | null
          organization_id: string
          performance_billing_enabled?: boolean | null
          plan_tier?: string | null
          price_per_appointment?: number | null
          price_per_converted_lead?: number | null
          price_per_qualified_lead?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_ends_at?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          ai_credits?: number | null
          created_at?: string
          credits_limit?: number | null
          credits_used?: number | null
          organization_id?: string
          performance_billing_enabled?: boolean | null
          plan_tier?: string | null
          price_per_appointment?: number | null
          price_per_converted_lead?: number | null
          price_per_qualified_lead?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_ends_at?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          created_at: string | null
          features: Json | null
          id: string
          max_dids: number | null
          max_extensions: number | null
          max_resellers: number | null
          max_storage_gb: number | null
          name: string
          price_monthly: number | null
        }
        Insert: {
          created_at?: string | null
          features?: Json | null
          id: string
          max_dids?: number | null
          max_extensions?: number | null
          max_resellers?: number | null
          max_storage_gb?: number | null
          name: string
          price_monthly?: number | null
        }
        Update: {
          created_at?: string | null
          features?: Json | null
          id?: string
          max_dids?: number | null
          max_extensions?: number | null
          max_resellers?: number | null
          max_storage_gb?: number | null
          name?: string
          price_monthly?: number | null
        }
        Relationships: []
      }
      business_hour_schedules: {
        Row: {
          assigned_to_id: string | null
          assigned_to_type: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          schedule_json: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          assigned_to_id?: string | null
          assigned_to_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          schedule_json?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          assigned_to_id?: string | null
          assigned_to_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          schedule_json?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_hour_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_integrations: {
        Row: {
          access_token: string | null
          calendar_id: string | null
          created_at: string
          id: string
          is_active: boolean | null
          organization_id: string
          provider: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          calendar_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id: string
          provider?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          calendar_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string
          provider?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_intelligence_audit: {
        Row: {
          ai_model: string | null
          call_record_id: string
          created_at: string
          duration_ms: number | null
          error: string | null
          event: string
          forced: boolean
          id: string
          idempotency_key: string | null
          metadata: Json
          organization_id: string
          pipeline: string | null
          prompt_version: string | null
          run_id: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          ai_model?: string | null
          call_record_id: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event: string
          forced?: boolean
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          organization_id: string
          pipeline?: string | null
          prompt_version?: string | null
          run_id: string
          status: string
          triggered_by?: string | null
        }
        Update: {
          ai_model?: string | null
          call_record_id?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event?: string
          forced?: boolean
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          organization_id?: string
          pipeline?: string | null
          prompt_version?: string | null
          run_id?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      campaign_calls: {
        Row: {
          called_at: string | null
          campaign_id: string
          created_at: string
          duration: number | null
          id: string
          metadata: Json | null
          outcome: string | null
          phone_number: string
          status: string
          transcript: string | null
        }
        Insert: {
          called_at?: string | null
          campaign_id: string
          created_at?: string
          duration?: number | null
          id?: string
          metadata?: Json | null
          outcome?: string | null
          phone_number: string
          status?: string
          transcript?: string | null
        }
        Update: {
          called_at?: string | null
          campaign_id?: string
          created_at?: string
          duration?: number | null
          id?: string
          metadata?: Json | null
          outcome?: string | null
          phone_number?: string
          status?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_calls_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outbound_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      cc_agent_activity: {
        Row: {
          activity_type: string | null
          agent_extension: string | null
          agent_id: string | null
          agent_name: string | null
          call_id: string | null
          caller_number: string | null
          created_at: string | null
          disposition: string | null
          duration_seconds: number | null
          id: string
          notes: string | null
          organization_id: string
          pause_reason: string | null
          queue_name: string | null
        }
        Insert: {
          activity_type?: string | null
          agent_extension?: string | null
          agent_id?: string | null
          agent_name?: string | null
          call_id?: string | null
          caller_number?: string | null
          created_at?: string | null
          disposition?: string | null
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          organization_id: string
          pause_reason?: string | null
          queue_name?: string | null
        }
        Update: {
          activity_type?: string | null
          agent_extension?: string | null
          agent_id?: string | null
          agent_name?: string | null
          call_id?: string | null
          caller_number?: string | null
          created_at?: string | null
          disposition?: string | null
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          organization_id?: string
          pause_reason?: string | null
          queue_name?: string | null
        }
        Relationships: []
      }
      cc_monitor_sessions: {
        Row: {
          agent_extension: string | null
          call_id: string | null
          ended_at: string | null
          id: string
          monitor_type: string | null
          organization_id: string
          started_at: string | null
          supervisor_extension: string | null
          supervisor_id: string | null
        }
        Insert: {
          agent_extension?: string | null
          call_id?: string | null
          ended_at?: string | null
          id?: string
          monitor_type?: string | null
          organization_id: string
          started_at?: string | null
          supervisor_extension?: string | null
          supervisor_id?: string | null
        }
        Update: {
          agent_extension?: string | null
          call_id?: string | null
          ended_at?: string | null
          id?: string
          monitor_type?: string | null
          organization_id?: string
          started_at?: string | null
          supervisor_extension?: string | null
          supervisor_id?: string | null
        }
        Relationships: []
      }
      cc_pause_reasons: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          is_productive: boolean | null
          organization_id: string
          reason: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_productive?: boolean | null
          organization_id: string
          reason: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_productive?: boolean | null
          organization_id?: string
          reason?: string
        }
        Relationships: []
      }
      cc_queue_stats: {
        Row: {
          agents_available: number | null
          agents_offline: number | null
          agents_on_call: number | null
          agents_paused: number | null
          agents_total: number | null
          avg_handle_time_seconds: number | null
          avg_wait_time_seconds: number | null
          calls_abandoned_today: number | null
          calls_answered_today: number | null
          calls_waiting: number | null
          id: string
          longest_wait_seconds: number | null
          organization_id: string
          queue_extension: string | null
          queue_name: string
          service_level_percent: number | null
          updated_at: string | null
        }
        Insert: {
          agents_available?: number | null
          agents_offline?: number | null
          agents_on_call?: number | null
          agents_paused?: number | null
          agents_total?: number | null
          avg_handle_time_seconds?: number | null
          avg_wait_time_seconds?: number | null
          calls_abandoned_today?: number | null
          calls_answered_today?: number | null
          calls_waiting?: number | null
          id?: string
          longest_wait_seconds?: number | null
          organization_id: string
          queue_extension?: string | null
          queue_name: string
          service_level_percent?: number | null
          updated_at?: string | null
        }
        Update: {
          agents_available?: number | null
          agents_offline?: number | null
          agents_on_call?: number | null
          agents_paused?: number | null
          agents_total?: number | null
          avg_handle_time_seconds?: number | null
          avg_wait_time_seconds?: number | null
          calls_abandoned_today?: number | null
          calls_answered_today?: number | null
          calls_waiting?: number | null
          id?: string
          longest_wait_seconds?: number | null
          organization_id?: string
          queue_extension?: string | null
          queue_name?: string
          service_level_percent?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cc_report_schedules: {
        Row: {
          cadence: string
          created_at: string | null
          enabled: boolean | null
          id: string
          last_sent_at: string | null
          organization_id: string
          recipients: string[]
          report_type: string
        }
        Insert: {
          cadence: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          last_sent_at?: string | null
          organization_id: string
          recipients?: string[]
          report_type: string
        }
        Update: {
          cadence?: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          last_sent_at?: string | null
          organization_id?: string
          recipients?: string[]
          report_type?: string
        }
        Relationships: []
      }
      client_agent_assignments: {
        Row: {
          agent_id: string
          can_edit_knowledge: boolean | null
          can_edit_prompt: boolean | null
          client_id: string
          created_at: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          can_edit_knowledge?: boolean | null
          can_edit_prompt?: boolean | null
          client_id: string
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          can_edit_knowledge?: boolean | null
          can_edit_prompt?: boolean | null
          client_id?: string
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_agent_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_agent_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_agent_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_agent_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      client_credentials: {
        Row: {
          client_id: string
          created_at: string
          password_hash: string | null
          password_reset_expires_at: string | null
          password_reset_token: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          password_hash?: string | null
          password_reset_expires_at?: string | null
          password_reset_token?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          password_hash?: string | null
          password_reset_expires_at?: string | null
          password_reset_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_credentials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_credentials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      client_member_credentials: {
        Row: {
          created_at: string
          member_id: string
          password_hash: string | null
          password_reset_expires_at: string | null
          password_reset_token: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          member_id: string
          password_hash?: string | null
          password_reset_expires_at?: string | null
          password_reset_token?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          member_id?: string
          password_hash?: string | null
          password_reset_expires_at?: string | null
          password_reset_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_member_credentials_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "client_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_member_credentials_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "client_members_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      client_members: {
        Row: {
          client_id: string
          created_at: string | null
          email: string
          id: string
          last_login_at: string | null
          login_id: string | null
          name: string | null
          role: string | null
          status: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          email: string
          id?: string
          last_login_at?: string | null
          login_id?: string | null
          name?: string | null
          role?: string | null
          status?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          email?: string
          id?: string
          last_login_at?: string | null
          login_id?: string | null
          name?: string | null
          role?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          access_controls: Json | null
          assigned_agent_id: string | null
          assigned_agents: number | null
          created_at: string
          created_by: string | null
          custom_css: string | null
          email: string | null
          id: string
          language: string | null
          login_id: string | null
          name: string
          organization_id: string
          status: string | null
          theme: string | null
          updated_at: string
          user_id: string | null
          username: string | null
        }
        Insert: {
          access_controls?: Json | null
          assigned_agent_id?: string | null
          assigned_agents?: number | null
          created_at?: string
          created_by?: string | null
          custom_css?: string | null
          email?: string | null
          id?: string
          language?: string | null
          login_id?: string | null
          name: string
          organization_id: string
          status?: string | null
          theme?: string | null
          updated_at?: string
          user_id?: string | null
          username?: string | null
        }
        Update: {
          access_controls?: Json | null
          assigned_agent_id?: string | null
          assigned_agents?: number | null
          created_at?: string
          created_by?: string | null
          custom_css?: string | null
          email?: string | null
          id?: string
          language?: string | null
          login_id?: string | null
          name?: string
          organization_id?: string
          status?: string | null
          theme?: string | null
          updated_at?: string
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_tags: {
        Row: {
          conversation_id: string
          tag_id: string
          tagged_at: string
          tagged_by: string | null
        }
        Insert: {
          conversation_id: string
          tag_id: string
          tagged_at?: string
          tagged_by?: string | null
        }
        Update: {
          conversation_id?: string
          tag_id?: string
          tagged_at?: string
          tagged_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_tags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "custom_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_topics: {
        Row: {
          analyzed_at: string
          category: string | null
          confidence: number | null
          conversation_id: string | null
          created_at: string
          frequency: number | null
          id: string
          organization_id: string
          sentiment: string | null
          topic: string
        }
        Insert: {
          analyzed_at?: string
          category?: string | null
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          frequency?: number | null
          id?: string
          organization_id: string
          sentiment?: string | null
          topic: string
        }
        Update: {
          analyzed_at?: string
          category?: string | null
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          frequency?: number | null
          id?: string
          organization_id?: string
          sentiment?: string | null
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_topics_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_topics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_id: string | null
          agent_messages: Json | null
          audio_url: string | null
          client_id: string | null
          created_at: string
          default_label: string | null
          duration: number | null
          external_id: string | null
          id: string
          keywords: string[] | null
          label_variable: string | null
          metadata: Json | null
          organization_id: string | null
          platform: string | null
          resolution_status: string | null
          satisfaction_score: number | null
          sentiment: string | null
          smart_tags: string[] | null
          status: string | null
          title: string
          transcript: string | null
          user_id: string
          user_messages: Json | null
        }
        Insert: {
          agent_id?: string | null
          agent_messages?: Json | null
          audio_url?: string | null
          client_id?: string | null
          created_at?: string
          default_label?: string | null
          duration?: number | null
          external_id?: string | null
          id?: string
          keywords?: string[] | null
          label_variable?: string | null
          metadata?: Json | null
          organization_id?: string | null
          platform?: string | null
          resolution_status?: string | null
          satisfaction_score?: number | null
          sentiment?: string | null
          smart_tags?: string[] | null
          status?: string | null
          title: string
          transcript?: string | null
          user_id: string
          user_messages?: Json | null
        }
        Update: {
          agent_id?: string | null
          agent_messages?: Json | null
          audio_url?: string | null
          client_id?: string | null
          created_at?: string
          default_label?: string | null
          duration?: number | null
          external_id?: string | null
          id?: string
          keywords?: string[] | null
          label_variable?: string | null
          metadata?: Json | null
          organization_id?: string | null
          platform?: string | null
          resolution_status?: string | null
          satisfaction_score?: number | null
          sentiment?: string | null
          smart_tags?: string[] | null
          status?: string | null
          title?: string
          transcript?: string | null
          user_id?: string
          user_messages?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string | null
          created_at: string | null
          greeting: string | null
          id: string
          organization_id: string
          subject: string | null
          template_type: string
          updated_at: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          greeting?: string | null
          id?: string
          organization_id: string
          subject?: string | null
          template_type: string
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          greeting?: string | null
          id?: string
          organization_id?: string
          subject?: string | null
          template_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      handoff_requests: {
        Row: {
          accepted_at: string | null
          agent_id: string | null
          chat_messages: Json | null
          completed_at: string | null
          conversation_id: string | null
          customer_info: Json | null
          human_agent_id: string | null
          id: string
          metadata: Json | null
          organization_id: string
          priority: string | null
          reason: string | null
          requested_at: string | null
          status: string | null
          transcript_snapshot: string | null
        }
        Insert: {
          accepted_at?: string | null
          agent_id?: string | null
          chat_messages?: Json | null
          completed_at?: string | null
          conversation_id?: string | null
          customer_info?: Json | null
          human_agent_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          priority?: string | null
          reason?: string | null
          requested_at?: string | null
          status?: string | null
          transcript_snapshot?: string | null
        }
        Update: {
          accepted_at?: string | null
          agent_id?: string | null
          chat_messages?: Json | null
          completed_at?: string | null
          conversation_id?: string | null
          customer_info?: Json | null
          human_agent_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          priority?: string | null
          reason?: string | null
          requested_at?: string | null
          status?: string | null
          transcript_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handoff_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoff_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoff_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoff_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      holiday_schedules: {
        Row: {
          active: boolean
          audio_url: string | null
          created_at: string
          created_by: string | null
          end_date: string
          greeting_text: string | null
          id: string
          name: string
          organization_id: string
          routing_action: string
          routing_target: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          audio_url?: string | null
          created_at?: string
          created_by?: string | null
          end_date: string
          greeting_text?: string | null
          id?: string
          name: string
          organization_id: string
          routing_action?: string
          routing_target?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          audio_url?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string
          greeting_text?: string | null
          id?: string
          name?: string
          organization_id?: string
          routing_action?: string
          routing_target?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holiday_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          synced_to_elevenlabs: boolean | null
          tags: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          id?: string
          synced_to_elevenlabs?: boolean | null
          tags?: string[] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          synced_to_elevenlabs?: boolean | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      knowledge_base_items: {
        Row: {
          category: string
          content: string
          created_at: string | null
          elevenlabs_id: string | null
          id: string
          is_synced: boolean | null
          last_synced_at: string | null
          organization_id: string | null
          search_vector: unknown
          tags: string[] | null
          title: string
          updated_at: string | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string | null
          elevenlabs_id?: string | null
          id?: string
          is_synced?: boolean | null
          last_synced_at?: string | null
          organization_id?: string | null
          search_vector?: unknown
          tags?: string[] | null
          title: string
          updated_at?: string | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          elevenlabs_id?: string | null
          id?: string
          is_synced?: boolean | null
          last_synced_at?: string | null
          organization_id?: string | null
          search_vector?: unknown
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          agent_id: string | null
          client_id: string | null
          conversation_id: string | null
          converted_at: string | null
          created_at: string
          email: string | null
          id: string
          metadata: Json | null
          name: string | null
          organization_id: string
          phone: string | null
          qualified_at: string | null
          score: number | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          converted_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          organization_id: string
          phone?: string | null
          qualified_at?: string | null
          score?: number | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          converted_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          organization_id?: string
          phone?: string | null
          qualified_at?: string | null
          score?: number | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lemtel_cdrs_cache: {
        Row: {
          ai_processing: boolean
          analyzed: boolean
          answer_stamp: string | null
          billsec: number
          call_uuid: string
          caller_destination: string | null
          caller_id_name: string | null
          caller_id_number: string | null
          created_at: string
          customer_id: string | null
          direction: string | null
          duration: number
          end_stamp: string | null
          id: string
          missed_call: boolean
          record_name: string | null
          record_path: string | null
          start_stamp: string | null
          transcribed: boolean
          voicemail_message: boolean
        }
        Insert: {
          ai_processing?: boolean
          analyzed?: boolean
          answer_stamp?: string | null
          billsec?: number
          call_uuid: string
          caller_destination?: string | null
          caller_id_name?: string | null
          caller_id_number?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string | null
          duration?: number
          end_stamp?: string | null
          id?: string
          missed_call?: boolean
          record_name?: string | null
          record_path?: string | null
          start_stamp?: string | null
          transcribed?: boolean
          voicemail_message?: boolean
        }
        Update: {
          ai_processing?: boolean
          analyzed?: boolean
          answer_stamp?: string | null
          billsec?: number
          call_uuid?: string
          caller_destination?: string | null
          caller_id_name?: string | null
          caller_id_number?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string | null
          duration?: number
          end_stamp?: string | null
          id?: string
          missed_call?: boolean
          record_name?: string | null
          record_path?: string | null
          start_stamp?: string | null
          transcribed?: boolean
          voicemail_message?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "lemtel_cdrs_cache_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "lemtel_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      lemtel_config: {
        Row: {
          created_at: string
          encrypted: boolean
          encryption_version: number | null
          id: string
          is_secret: boolean
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          encrypted?: boolean
          encryption_version?: number | null
          id?: string
          is_secret?: boolean
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          encrypted?: boolean
          encryption_version?: number | null
          id?: string
          is_secret?: boolean
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      lemtel_customers: {
        Row: {
          address: string | null
          admin_email: string | null
          company_name: string | null
          created_at: string
          domain_name: string | null
          domain_uuid: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          phone_numbers: string[]
          plan: string
          portal_enabled: boolean
          portal_user_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          admin_email?: string | null
          company_name?: string | null
          created_at?: string
          domain_name?: string | null
          domain_uuid?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          phone_numbers?: string[]
          plan?: string
          portal_enabled?: boolean
          portal_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          admin_email?: string | null
          company_name?: string | null
          created_at?: string
          domain_name?: string | null
          domain_uuid?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          phone_numbers?: string[]
          plan?: string
          portal_enabled?: boolean
          portal_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      lemtel_dids: {
        Row: {
          assigned_id: string | null
          assigned_type: string
          created_at: string
          customer_id: string | null
          id: string
          number: string
          sms_enabled: boolean
          status: string
          telnyx_enabled: boolean
          updated_at: string
        }
        Insert: {
          assigned_id?: string | null
          assigned_type?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          number: string
          sms_enabled?: boolean
          status?: string
          telnyx_enabled?: boolean
          updated_at?: string
        }
        Update: {
          assigned_id?: string | null
          assigned_type?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          number?: string
          sms_enabled?: boolean
          status?: string
          telnyx_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lemtel_dids_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "lemtel_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      lemtel_ivr_audio: {
        Row: {
          audio_url: string | null
          created_at: string
          customer_id: string | null
          elevenlabs_voice_id: string | null
          id: string
          ivr_menu_id: string | null
          script_text: string | null
          status: string
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          customer_id?: string | null
          elevenlabs_voice_id?: string | null
          id?: string
          ivr_menu_id?: string | null
          script_text?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          customer_id?: string | null
          elevenlabs_voice_id?: string | null
          id?: string
          ivr_menu_id?: string | null
          script_text?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lemtel_ivr_audio_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "lemtel_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      lemtel_sms_threads: {
        Row: {
          contact_name: string | null
          contact_number: string
          created_at: string
          customer_id: string | null
          did_number: string
          id: string
          last_message_at: string
          messages: Json
          unread_count: number
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          contact_number: string
          created_at?: string
          customer_id?: string | null
          did_number: string
          id?: string
          last_message_at?: string
          messages?: Json
          unread_count?: number
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          contact_number?: string
          created_at?: string
          customer_id?: string | null
          did_number?: string
          id?: string
          last_message_at?: string
          messages?: Json
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lemtel_sms_threads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "lemtel_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      lemtel_softphone_invites: {
        Row: {
          consumed_at: string | null
          created_at: string
          created_by: string | null
          email: string
          email_error: string | null
          email_sent: boolean
          expires_at: string
          id: string
          ip_address: unknown
          last_viewed_at: string | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          softphone_user_id: string
          token: string
          updated_at: string
          user_agent: string | null
          view_count: number
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          email_error?: string | null
          email_sent?: boolean
          expires_at?: string
          id?: string
          ip_address?: unknown
          last_viewed_at?: string | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          softphone_user_id: string
          token: string
          updated_at?: string
          user_agent?: string | null
          view_count?: number
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          email_error?: string | null
          email_sent?: boolean
          expires_at?: string
          id?: string
          ip_address?: unknown
          last_viewed_at?: string | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          softphone_user_id?: string
          token?: string
          updated_at?: string
          user_agent?: string | null
          view_count?: number
        }
        Relationships: []
      }
      lemtel_softphone_users: {
        Row: {
          created_at: string
          customer_id: string | null
          device_type: string
          display_name: string | null
          extension: string
          id: string
          last_seen: string | null
          portal_user_id: string | null
          sip_domain: string | null
          sip_password: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          device_type?: string
          display_name?: string | null
          extension: string
          id?: string
          last_seen?: string | null
          portal_user_id?: string | null
          sip_domain?: string | null
          sip_password?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          device_type?: string
          display_name?: string | null
          extension?: string
          id?: string
          last_seen?: string | null
          portal_user_id?: string | null
          sip_domain?: string | null
          sip_password?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lemtel_softphone_users_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "lemtel_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      lemtel_transcriptions: {
        Row: {
          action_items: string[] | null
          ai_model: string
          call_uuid: string
          created_at: string
          escalation_needed: boolean
          id: string
          key_phrases: string[] | null
          satisfaction_score: number | null
          sentiment: string | null
          summary: string | null
          topics: string[] | null
          transcript_text: string | null
        }
        Insert: {
          action_items?: string[] | null
          ai_model?: string
          call_uuid: string
          created_at?: string
          escalation_needed?: boolean
          id?: string
          key_phrases?: string[] | null
          satisfaction_score?: number | null
          sentiment?: string | null
          summary?: string | null
          topics?: string[] | null
          transcript_text?: string | null
        }
        Update: {
          action_items?: string[] | null
          ai_model?: string
          call_uuid?: string
          created_at?: string
          escalation_needed?: boolean
          id?: string
          key_phrases?: string[] | null
          satisfaction_score?: number | null
          sentiment?: string | null
          summary?: string | null
          topics?: string[] | null
          transcript_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lemtel_transcriptions_call_uuid_fkey"
            columns: ["call_uuid"]
            isOneToOne: false
            referencedRelation: "lemtel_cdrs_cache"
            referencedColumns: ["call_uuid"]
          },
        ]
      }
      lemtel_voice_agents: {
        Row: {
          avg_duration: number
          created_at: string
          customer_id: string | null
          description: string | null
          did_id: string | null
          elevenlabs_agent_id: string
          escalation_rate: number
          extension: string | null
          id: string
          name: string
          status: string
          total_calls: number
          updated_at: string
        }
        Insert: {
          avg_duration?: number
          created_at?: string
          customer_id?: string | null
          description?: string | null
          did_id?: string | null
          elevenlabs_agent_id: string
          escalation_rate?: number
          extension?: string | null
          id?: string
          name: string
          status?: string
          total_calls?: number
          updated_at?: string
        }
        Update: {
          avg_duration?: number
          created_at?: string
          customer_id?: string | null
          description?: string | null
          did_id?: string | null
          elevenlabs_agent_id?: string
          escalation_rate?: number
          extension?: string | null
          id?: string
          name?: string
          status?: string
          total_calls?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lemtel_voice_agents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "lemtel_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lemtel_voice_agents_did_id_fkey"
            columns: ["did_id"]
            isOneToOne: false
            referencedRelation: "lemtel_dids"
            referencedColumns: ["id"]
          },
        ]
      }
      mascot_messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parts?: Json
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mascot_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "mascot_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      mascot_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          organization_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          organization_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          organization_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mobile_push_tokens: {
        Row: {
          created_at: string
          extension: string | null
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extension?: string | null
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extension?: string | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      number_porting_requests: {
        Row: {
          account_number: string
          attachments: Json
          created_at: string
          current_carrier: string
          id: string
          notes: string | null
          numbers: string[]
          organization_id: string
          pin: string | null
          requested_by: string | null
          service_address: Json
          status: Database["public"]["Enums"]["porting_status"]
          updated_at: string
        }
        Insert: {
          account_number: string
          attachments?: Json
          created_at?: string
          current_carrier: string
          id?: string
          notes?: string | null
          numbers?: string[]
          organization_id: string
          pin?: string | null
          requested_by?: string | null
          service_address?: Json
          status?: Database["public"]["Enums"]["porting_status"]
          updated_at?: string
        }
        Update: {
          account_number?: string
          attachments?: Json
          created_at?: string
          current_carrier?: string
          id?: string
          notes?: string | null
          numbers?: string[]
          organization_id?: string
          pin?: string | null
          requested_by?: string | null
          service_address?: Json
          status?: Database["public"]["Enums"]["porting_status"]
          updated_at?: string
        }
        Relationships: []
      }
      org_business_hours: {
        Row: {
          closed_destination: string | null
          created_at: string
          fusionpbx_dialplan_uuid: string | null
          id: string
          name: string
          open_destination: string | null
          organization_id: string
          schedule: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          closed_destination?: string | null
          created_at?: string
          fusionpbx_dialplan_uuid?: string | null
          id?: string
          name?: string
          open_destination?: string | null
          organization_id: string
          schedule?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          closed_destination?: string | null
          created_at?: string
          fusionpbx_dialplan_uuid?: string | null
          id?: string
          name?: string
          open_destination?: string | null
          organization_id?: string
          schedule?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_business_hours_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_chat_blocks: {
        Row: {
          blocked_user_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_user_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_user_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      org_chat_channels: {
        Row: {
          archived_at: string | null
          channel_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          members: string[]
          name: string
          organization_id: string
          pinned_messages: string[]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          channel_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          members?: string[]
          name: string
          organization_id: string
          pinned_messages?: string[]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          channel_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          members?: string[]
          name?: string
          organization_id?: string
          pinned_messages?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      org_chat_message_edits: {
        Row: {
          edited_at: string
          edited_by: string | null
          id: string
          message_id: string
          new_content: string | null
          previous_content: string | null
        }
        Insert: {
          edited_at?: string
          edited_by?: string | null
          id?: string
          message_id: string
          new_content?: string | null
          previous_content?: string | null
        }
        Update: {
          edited_at?: string
          edited_by?: string | null
          id?: string
          message_id?: string
          new_content?: string | null
          previous_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_chat_message_edits_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "org_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      org_chat_message_pins: {
        Row: {
          channel_id: string
          id: string
          message_id: string
          organization_id: string
          pinned_at: string
          pinned_by: string | null
        }
        Insert: {
          channel_id: string
          id?: string
          message_id: string
          organization_id: string
          pinned_at?: string
          pinned_by?: string | null
        }
        Update: {
          channel_id?: string
          id?: string
          message_id?: string
          organization_id?: string
          pinned_at?: string
          pinned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_chat_message_pins_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "org_chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_chat_message_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "org_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      org_chat_message_receipts: {
        Row: {
          channel_id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_chat_message_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "org_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      org_chat_messages: {
        Row: {
          attachments: Json
          channel_id: string | null
          content: string
          created_at: string
          deleted_at: string | null
          edit_count: number
          edited_at: string | null
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          is_hidden: boolean
          last_reply_at: string | null
          message_type: string
          organization_id: string
          parent_message_id: string | null
          reactions: Json
          read_by: string[]
          recipient_id: string | null
          reply_count: number
          reply_to: string | null
          sender_extension: string | null
          sender_id: string | null
          sender_name: string | null
          tsv: unknown
        }
        Insert: {
          attachments?: Json
          channel_id?: string | null
          content: string
          created_at?: string
          deleted_at?: string | null
          edit_count?: number
          edited_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          last_reply_at?: string | null
          message_type?: string
          organization_id: string
          parent_message_id?: string | null
          reactions?: Json
          read_by?: string[]
          recipient_id?: string | null
          reply_count?: number
          reply_to?: string | null
          sender_extension?: string | null
          sender_id?: string | null
          sender_name?: string | null
          tsv?: unknown
        }
        Update: {
          attachments?: Json
          channel_id?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          edit_count?: number
          edited_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          last_reply_at?: string | null
          message_type?: string
          organization_id?: string
          parent_message_id?: string | null
          reactions?: Json
          read_by?: string[]
          recipient_id?: string | null
          reply_count?: number
          reply_to?: string | null
          sender_extension?: string | null
          sender_id?: string | null
          sender_name?: string | null
          tsv?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "org_chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "org_chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_chat_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "org_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      org_chat_reads: {
        Row: {
          channel_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_chat_reads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "org_chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      org_chat_reports: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          message_id: string
          organization_id: string
          reason: string
          reporter_id: string
          resolution: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          message_id: string
          organization_id: string
          reason: string
          reporter_id: string
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          message_id?: string
          organization_id?: string
          reason?: string
          reporter_id?: string
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_chat_reports_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "org_chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_chat_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "org_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      org_contacts: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          external_id: string | null
          favorite: boolean
          id: string
          name: string
          notes: string | null
          organization_id: string
          owner_user_id: string | null
          phone: string | null
          source: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          favorite?: boolean
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          owner_user_id?: string | null
          phone?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          favorite?: boolean
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          owner_user_id?: string | null
          phone?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      org_exports: {
        Row: {
          content: string
          created_at: string
          created_by: string
          export_type: string
          filename: string
          filters: Json
          format: string
          id: string
          mime: string
          organization_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          export_type: string
          filename: string
          filters?: Json
          format: string
          id?: string
          mime: string
          organization_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          export_type?: string
          filename?: string
          filters?: Json
          format?: string
          id?: string
          mime?: string
          organization_id?: string
        }
        Relationships: []
      }
      org_members: {
        Row: {
          access_all_children: boolean | null
          can_export_data: boolean | null
          can_listen_calls: boolean | null
          can_manage_billing: boolean | null
          can_manage_extensions: boolean | null
          can_manage_ivr: boolean | null
          can_manage_queues: boolean | null
          can_manage_resellers: boolean | null
          can_manage_users: boolean | null
          can_view_recordings: boolean | null
          can_white_label: boolean | null
          created_at: string | null
          id: string
          invited_by: string | null
          joined_at: string | null
          last_active_at: string | null
          org_id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_all_children?: boolean | null
          can_export_data?: boolean | null
          can_listen_calls?: boolean | null
          can_manage_billing?: boolean | null
          can_manage_extensions?: boolean | null
          can_manage_ivr?: boolean | null
          can_manage_queues?: boolean | null
          can_manage_resellers?: boolean | null
          can_manage_users?: boolean | null
          can_view_recordings?: boolean | null
          can_white_label?: boolean | null
          created_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          last_active_at?: string | null
          org_id: string
          role?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_all_children?: boolean | null
          can_export_data?: boolean | null
          can_listen_calls?: boolean | null
          can_manage_billing?: boolean | null
          can_manage_extensions?: boolean | null
          can_manage_ivr?: boolean | null
          can_manage_queues?: boolean | null
          can_manage_resellers?: boolean | null
          can_manage_users?: boolean | null
          can_view_recordings?: boolean | null
          can_white_label?: boolean | null
          created_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          last_active_at?: string | null
          org_id?: string
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          level: string
          metadata: Json
          organization_id: string
          read_at: string | null
          recipient_role: Database["public"]["Enums"]["app_role"] | null
          recipient_user_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          level?: string
          metadata?: Json
          organization_id: string
          read_at?: string | null
          recipient_role?: Database["public"]["Enums"]["app_role"] | null
          recipient_user_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          level?: string
          metadata?: Json
          organization_id?: string
          read_at?: string | null
          recipient_role?: Database["public"]["Enums"]["app_role"] | null
          recipient_user_id?: string | null
          title?: string
        }
        Relationships: []
      }
      org_retention_settings: {
        Row: {
          exports_retention_days: number
          notifications_retention_days: number
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          exports_retention_days?: number
          notifications_retention_days?: number
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          exports_retention_days?: number
          notifications_retention_days?: number
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      org_role_permissions: {
        Row: {
          allowed: boolean
          id: string
          organization_id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed?: boolean
          id?: string
          organization_id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed?: boolean
          id?: string
          organization_id?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      organization_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          organization_id: string
          scopes: string[] | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          organization_id: string
          scopes?: string[] | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          scopes?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_integrations: {
        Row: {
          additional_config: Json | null
          agent_id: string | null
          api_key: string
          created_at: string
          id: string
          is_active: boolean | null
          last_tested_at: string | null
          organization_id: string | null
          platform: string
          test_error: string | null
          test_status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_config?: Json | null
          agent_id?: string | null
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_tested_at?: string | null
          organization_id?: string | null
          platform: string
          test_error?: string | null
          test_status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_config?: Json | null
          agent_id?: string | null
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_tested_at?: string | null
          organization_id?: string | null
          platform?: string
          test_error?: string | null
          test_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          accepted_at: string | null
          id: string
          invited_at: string
          invited_by: string | null
          organization_id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          organization_id: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          allow_user_self_forwarding: boolean
          allowed_platforms: string[] | null
          api_key: string | null
          baa_signed_at: string | null
          baa_signed_by: string | null
          backend_domain: string | null
          billing_email: string | null
          billing_plan: string | null
          brand_accent_color: string | null
          brand_app_name: string | null
          brand_favicon_url: string | null
          brand_logo_url: string | null
          brand_name: string | null
          brand_portal_domain: string | null
          brand_primary_color: string | null
          brand_support_email: string | null
          brand_support_phone: string | null
          brand_website: string | null
          client_limit: number | null
          client_portal_favicon_url: string | null
          client_portal_logo_url: string | null
          client_portal_primary_color: string | null
          client_portal_title: string | null
          created_at: string
          domain: string | null
          email_domain: string | null
          email_logo_url: string | null
          email_sender: string | null
          email_sender_name: string | null
          favicon_url: string | null
          fusionpbx_domain_name: string | null
          fusionpbx_domain_uuid: string | null
          fusionpbx_server_url: string | null
          gdpr_enabled: boolean | null
          hipaa_enabled: boolean | null
          id: string
          is_active: boolean | null
          is_internal: boolean
          loading_icon: string | null
          loading_icon_size: string | null
          logo_dashboard_url: string | null
          logo_login_url: string | null
          logo_url: string | null
          max_dids: number | null
          max_extensions: number | null
          max_resellers: number | null
          max_storage_gb: number | null
          name: string
          onboarding_completed: boolean | null
          org_level: number | null
          org_type: string | null
          parent_org_id: string | null
          primary_color: string | null
          privacy_policy_url: string | null
          reseller_id: string | null
          root_org_id: string | null
          slug: string
          status: string | null
          stripe_customer_id: string | null
          terms_url: string | null
          trial_ends_at: string | null
          updated_at: string
          website_title: string | null
        }
        Insert: {
          allow_user_self_forwarding?: boolean
          allowed_platforms?: string[] | null
          api_key?: string | null
          baa_signed_at?: string | null
          baa_signed_by?: string | null
          backend_domain?: string | null
          billing_email?: string | null
          billing_plan?: string | null
          brand_accent_color?: string | null
          brand_app_name?: string | null
          brand_favicon_url?: string | null
          brand_logo_url?: string | null
          brand_name?: string | null
          brand_portal_domain?: string | null
          brand_primary_color?: string | null
          brand_support_email?: string | null
          brand_support_phone?: string | null
          brand_website?: string | null
          client_limit?: number | null
          client_portal_favicon_url?: string | null
          client_portal_logo_url?: string | null
          client_portal_primary_color?: string | null
          client_portal_title?: string | null
          created_at?: string
          domain?: string | null
          email_domain?: string | null
          email_logo_url?: string | null
          email_sender?: string | null
          email_sender_name?: string | null
          favicon_url?: string | null
          fusionpbx_domain_name?: string | null
          fusionpbx_domain_uuid?: string | null
          fusionpbx_server_url?: string | null
          gdpr_enabled?: boolean | null
          hipaa_enabled?: boolean | null
          id?: string
          is_active?: boolean | null
          is_internal?: boolean
          loading_icon?: string | null
          loading_icon_size?: string | null
          logo_dashboard_url?: string | null
          logo_login_url?: string | null
          logo_url?: string | null
          max_dids?: number | null
          max_extensions?: number | null
          max_resellers?: number | null
          max_storage_gb?: number | null
          name: string
          onboarding_completed?: boolean | null
          org_level?: number | null
          org_type?: string | null
          parent_org_id?: string | null
          primary_color?: string | null
          privacy_policy_url?: string | null
          reseller_id?: string | null
          root_org_id?: string | null
          slug: string
          status?: string | null
          stripe_customer_id?: string | null
          terms_url?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          website_title?: string | null
        }
        Update: {
          allow_user_self_forwarding?: boolean
          allowed_platforms?: string[] | null
          api_key?: string | null
          baa_signed_at?: string | null
          baa_signed_by?: string | null
          backend_domain?: string | null
          billing_email?: string | null
          billing_plan?: string | null
          brand_accent_color?: string | null
          brand_app_name?: string | null
          brand_favicon_url?: string | null
          brand_logo_url?: string | null
          brand_name?: string | null
          brand_portal_domain?: string | null
          brand_primary_color?: string | null
          brand_support_email?: string | null
          brand_support_phone?: string | null
          brand_website?: string | null
          client_limit?: number | null
          client_portal_favicon_url?: string | null
          client_portal_logo_url?: string | null
          client_portal_primary_color?: string | null
          client_portal_title?: string | null
          created_at?: string
          domain?: string | null
          email_domain?: string | null
          email_logo_url?: string | null
          email_sender?: string | null
          email_sender_name?: string | null
          favicon_url?: string | null
          fusionpbx_domain_name?: string | null
          fusionpbx_domain_uuid?: string | null
          fusionpbx_server_url?: string | null
          gdpr_enabled?: boolean | null
          hipaa_enabled?: boolean | null
          id?: string
          is_active?: boolean | null
          is_internal?: boolean
          loading_icon?: string | null
          loading_icon_size?: string | null
          logo_dashboard_url?: string | null
          logo_login_url?: string | null
          logo_url?: string | null
          max_dids?: number | null
          max_extensions?: number | null
          max_resellers?: number | null
          max_storage_gb?: number | null
          name?: string
          onboarding_completed?: boolean | null
          org_level?: number | null
          org_type?: string | null
          parent_org_id?: string | null
          primary_color?: string | null
          privacy_policy_url?: string | null
          reseller_id?: string | null
          root_org_id?: string | null
          slug?: string
          status?: string | null
          stripe_customer_id?: string | null
          terms_url?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          website_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_parent_org_id_fkey"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_root_org_id_fkey"
            columns: ["root_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_campaigns: {
        Row: {
          agent_id: string | null
          completed_at: string | null
          completed_calls: number | null
          created_at: string
          description: string | null
          failed_calls: number | null
          id: string
          name: string
          organization_id: string
          phone_numbers: Json
          schedule: Json | null
          started_at: string | null
          status: string
          successful_calls: number | null
          total_calls: number | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          completed_at?: string | null
          completed_calls?: number | null
          created_at?: string
          description?: string | null
          failed_calls?: number | null
          id?: string
          name: string
          organization_id: string
          phone_numbers?: Json
          schedule?: Json | null
          started_at?: string | null
          status?: string
          successful_calls?: number | null
          total_calls?: number | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          completed_at?: string | null
          completed_calls?: number | null
          created_at?: string
          description?: string | null
          failed_calls?: number | null
          id?: string
          name?: string
          organization_id?: string
          phone_numbers?: Json
          schedule?: Json | null
          started_at?: string | null
          status?: string
          successful_calls?: number | null
          total_calls?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_campaigns_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_campaigns_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_admin_actions: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          after_json: Json | null
          before_json: Json | null
          confirmed_at: string | null
          created_at: string
          diff_json: Json | null
          domain_uuid: string | null
          entity_id: string | null
          entity_type: string
          error: string | null
          id: string
          metadata: Json | null
          organization_id: string
          result: string | null
          rollback_of: string | null
          source: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          confirmed_at?: string | null
          created_at?: string
          diff_json?: Json | null
          domain_uuid?: string | null
          entity_id?: string | null
          entity_type: string
          error?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          result?: string | null
          rollback_of?: string | null
          source?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          confirmed_at?: string | null
          created_at?: string
          diff_json?: Json | null
          domain_uuid?: string | null
          entity_id?: string | null
          entity_type?: string
          error?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          result?: string | null
          rollback_of?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "pbx_admin_actions_rollback_of_fkey"
            columns: ["rollback_of"]
            isOneToOne: false
            referencedRelation: "pbx_admin_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_admin_users: {
        Row: {
          api_key_present: boolean
          created_at: string
          domain_uuid: string | null
          email: string | null
          enabled: boolean
          first_name: string | null
          groups: string[] | null
          id: string
          is_demo: boolean
          last_name: string | null
          last_pbx_seen_at: string | null
          organization_id: string
          pbx_uuid: string
          raw_data: Json | null
          source: string
          sync_status: string
          updated_at: string
          username: string
        }
        Insert: {
          api_key_present?: boolean
          created_at?: string
          domain_uuid?: string | null
          email?: string | null
          enabled?: boolean
          first_name?: string | null
          groups?: string[] | null
          id?: string
          is_demo?: boolean
          last_name?: string | null
          last_pbx_seen_at?: string | null
          organization_id: string
          pbx_uuid: string
          raw_data?: Json | null
          source?: string
          sync_status?: string
          updated_at?: string
          username: string
        }
        Update: {
          api_key_present?: boolean
          created_at?: string
          domain_uuid?: string | null
          email?: string | null
          enabled?: boolean
          first_name?: string | null
          groups?: string[] | null
          id?: string
          is_demo?: boolean
          last_name?: string | null
          last_pbx_seen_at?: string | null
          organization_id?: string
          pbx_uuid?: string
          raw_data?: Json | null
          source?: string
          sync_status?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "pbx_admin_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_ai_conversations: {
        Row: {
          created_at: string
          id: string
          messages: Json
          organization_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          organization_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          organization_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pbx_ai_insights: {
        Row: {
          action_items: string[] | null
          ai_model: string | null
          call_record_id: string | null
          client_id: string | null
          coaching_notes: string[]
          coaching_score: number | null
          created_at: string | null
          escalation_needed: boolean | null
          id: string
          intent: string | null
          key_phrases: string[] | null
          organization_id: string
          prompt_version: string | null
          quality_score: number | null
          risks: string[] | null
          sales_opportunities: string[] | null
          satisfaction_score: number | null
          sentiment: string | null
          summary: string | null
          topics: string[] | null
        }
        Insert: {
          action_items?: string[] | null
          ai_model?: string | null
          call_record_id?: string | null
          client_id?: string | null
          coaching_notes?: string[]
          coaching_score?: number | null
          created_at?: string | null
          escalation_needed?: boolean | null
          id?: string
          intent?: string | null
          key_phrases?: string[] | null
          organization_id: string
          prompt_version?: string | null
          quality_score?: number | null
          risks?: string[] | null
          sales_opportunities?: string[] | null
          satisfaction_score?: number | null
          sentiment?: string | null
          summary?: string | null
          topics?: string[] | null
        }
        Update: {
          action_items?: string[] | null
          ai_model?: string | null
          call_record_id?: string | null
          client_id?: string | null
          coaching_notes?: string[]
          coaching_score?: number | null
          created_at?: string | null
          escalation_needed?: boolean | null
          id?: string
          intent?: string | null
          key_phrases?: string[] | null
          organization_id?: string
          prompt_version?: string | null
          quality_score?: number | null
          risks?: string[] | null
          sales_opportunities?: string[] | null
          satisfaction_score?: number | null
          sentiment?: string | null
          summary?: string | null
          topics?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_ai_insights_call_record_id_fkey"
            columns: ["call_record_id"]
            isOneToOne: false
            referencedRelation: "pbx_call_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_ai_insights_call_record_id_fkey"
            columns: ["call_record_id"]
            isOneToOne: false
            referencedRelation: "telecom_cdr_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_ai_insights_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_ai_insights_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_ai_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_ai_jobs: {
        Row: {
          call_record_id: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          kind: string
          organization_id: string
          result: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          call_record_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          kind?: string
          organization_id: string
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          call_record_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          kind?: string
          organization_id?: string
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pbx_app_provision_queue: {
        Row: {
          created_at: string
          display_name: string | null
          error: string | null
          extension: string
          id: string
          organization_id: string
          processed_at: string | null
          sip_domain: string | null
          sip_password: string | null
          softphone_id: string
          status: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          error?: string | null
          extension: string
          id?: string
          organization_id: string
          processed_at?: string | null
          sip_domain?: string | null
          sip_password?: string | null
          softphone_id: string
          status?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          error?: string | null
          extension?: string
          id?: string
          organization_id?: string
          processed_at?: string | null
          sip_domain?: string | null
          sip_password?: string | null
          softphone_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pbx_app_provision_queue_softphone_id_fkey"
            columns: ["softphone_id"]
            isOneToOne: false
            referencedRelation: "pbx_softphone_link_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_app_provision_queue_softphone_id_fkey"
            columns: ["softphone_id"]
            isOneToOne: false
            referencedRelation: "pbx_softphone_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_app_provision_queue_softphone_id_fkey"
            columns: ["softphone_id"]
            isOneToOne: false
            referencedRelation: "pbx_softphone_users_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_call_forwarding: {
        Row: {
          allow_from: string
          always_enabled: boolean
          always_to: string | null
          busy_enabled: boolean
          busy_to: string | null
          dnd_enabled: boolean
          dnd_schedule: Json
          no_answer_enabled: boolean
          no_answer_seconds: number
          no_answer_to: string | null
          offline_enabled: boolean
          offline_to: string | null
          organization_id: string | null
          updated_at: string
          user_id: string
          whitelist: string[]
        }
        Insert: {
          allow_from?: string
          always_enabled?: boolean
          always_to?: string | null
          busy_enabled?: boolean
          busy_to?: string | null
          dnd_enabled?: boolean
          dnd_schedule?: Json
          no_answer_enabled?: boolean
          no_answer_seconds?: number
          no_answer_to?: string | null
          offline_enabled?: boolean
          offline_to?: string | null
          organization_id?: string | null
          updated_at?: string
          user_id: string
          whitelist?: string[]
        }
        Update: {
          allow_from?: string
          always_enabled?: boolean
          always_to?: string | null
          busy_enabled?: boolean
          busy_to?: string | null
          dnd_enabled?: boolean
          dnd_schedule?: Json
          no_answer_enabled?: boolean
          no_answer_seconds?: number
          no_answer_to?: string | null
          offline_enabled?: boolean
          offline_to?: string | null
          organization_id?: string | null
          updated_at?: string
          user_id?: string
          whitelist?: string[]
        }
        Relationships: []
      }
      pbx_call_live_transcripts: {
        Row: {
          call_record_id: string
          id: string
          organization_id: string
          segment_idx: number
          source: string
          speaker: string
          started_at: string
          status: string
          text: string
          updated_at: string
        }
        Insert: {
          call_record_id: string
          id?: string
          organization_id: string
          segment_idx?: number
          source?: string
          speaker?: string
          started_at?: string
          status?: string
          text?: string
          updated_at?: string
        }
        Update: {
          call_record_id?: string
          id?: string
          organization_id?: string
          segment_idx?: number
          source?: string
          speaker?: string
          started_at?: string
          status?: string
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      pbx_call_queues: {
        Row: {
          client_id: string | null
          created_at: string | null
          description: string | null
          enabled: boolean | null
          extension: string | null
          id: string
          max_wait_time: number | null
          music_on_hold: string | null
          name: string
          organization_id: string
          pbx_uuid: string | null
          raw_data: Json | null
          record_enabled: boolean | null
          strategy: string | null
          timeout_action: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          extension?: string | null
          id?: string
          max_wait_time?: number | null
          music_on_hold?: string | null
          name: string
          organization_id: string
          pbx_uuid?: string | null
          raw_data?: Json | null
          record_enabled?: boolean | null
          strategy?: string | null
          timeout_action?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          extension?: string | null
          id?: string
          max_wait_time?: number | null
          music_on_hold?: string | null
          name?: string
          organization_id?: string
          pbx_uuid?: string | null
          raw_data?: Json | null
          record_enabled?: boolean | null
          strategy?: string | null
          timeout_action?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_call_queues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_queues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_queues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_call_recording_rules: {
        Row: {
          announce: boolean
          record_all: boolean
          record_inbound: boolean
          record_outbound: boolean
          retention_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          announce?: boolean
          record_all?: boolean
          record_inbound?: boolean
          record_outbound?: boolean
          retention_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          announce?: boolean
          record_all?: boolean
          record_inbound?: boolean
          record_outbound?: boolean
          retention_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pbx_call_recordings: {
        Row: {
          access_status: string | null
          action_items: Json | null
          ai_summary: string | null
          analyzed: boolean | null
          available: boolean | null
          call_record_id: string | null
          client_id: string | null
          created_at: string | null
          direction: string | null
          duration_seconds: number | null
          file_url: string | null
          id: string
          language: string | null
          last_checked_at: string | null
          organization_id: string
          pbx_uuid: string | null
          raw_data: Json | null
          recorded_at: string | null
          recording_name: string | null
          recording_path: string | null
          recording_seconds: number | null
          recording_url: string | null
          sentiment: string | null
          sip_call_id: string | null
          storage_path: string | null
          summary: string | null
          summary_status: string | null
          topics: Json | null
          transcribed: boolean | null
          transcript_status: string | null
          transcription_status: string | null
        }
        Insert: {
          access_status?: string | null
          action_items?: Json | null
          ai_summary?: string | null
          analyzed?: boolean | null
          available?: boolean | null
          call_record_id?: string | null
          client_id?: string | null
          created_at?: string | null
          direction?: string | null
          duration_seconds?: number | null
          file_url?: string | null
          id?: string
          language?: string | null
          last_checked_at?: string | null
          organization_id: string
          pbx_uuid?: string | null
          raw_data?: Json | null
          recorded_at?: string | null
          recording_name?: string | null
          recording_path?: string | null
          recording_seconds?: number | null
          recording_url?: string | null
          sentiment?: string | null
          sip_call_id?: string | null
          storage_path?: string | null
          summary?: string | null
          summary_status?: string | null
          topics?: Json | null
          transcribed?: boolean | null
          transcript_status?: string | null
          transcription_status?: string | null
        }
        Update: {
          access_status?: string | null
          action_items?: Json | null
          ai_summary?: string | null
          analyzed?: boolean | null
          available?: boolean | null
          call_record_id?: string | null
          client_id?: string | null
          created_at?: string | null
          direction?: string | null
          duration_seconds?: number | null
          file_url?: string | null
          id?: string
          language?: string | null
          last_checked_at?: string | null
          organization_id?: string
          pbx_uuid?: string | null
          raw_data?: Json | null
          recorded_at?: string | null
          recording_name?: string | null
          recording_path?: string | null
          recording_seconds?: number | null
          recording_url?: string | null
          sentiment?: string | null
          sip_call_id?: string | null
          storage_path?: string | null
          summary?: string | null
          summary_status?: string | null
          topics?: Json | null
          transcribed?: boolean | null
          transcript_status?: string | null
          transcription_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_call_recordings_call_record_id_fkey"
            columns: ["call_record_id"]
            isOneToOne: false
            referencedRelation: "pbx_call_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_recordings_call_record_id_fkey"
            columns: ["call_record_id"]
            isOneToOne: false
            referencedRelation: "telecom_cdr_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_recordings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_recordings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_recordings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_call_records: {
        Row: {
          ai_processing: boolean | null
          ai_summary: string | null
          analyzed: boolean | null
          analyzed_at: string | null
          answer_at: string | null
          billsec: number | null
          call_score: number | null
          call_status: string | null
          caller_name: string | null
          caller_number: string | null
          client_id: string | null
          coaching_points: Json | null
          codec: string | null
          created_at: string | null
          crm_synced: boolean | null
          destination: string | null
          destination_number: string | null
          direction: string | null
          domain_name: string | null
          domain_uuid: string | null
          duration_seconds: number | null
          end_at: string | null
          extension: string | null
          extension_uuid: string | null
          hangup_cause: string | null
          has_recording: boolean | null
          id: string
          ivr_menu_uuid: string | null
          missed_call: boolean | null
          mos: number | null
          notes: string | null
          organization_id: string
          pbx_dedup_key: string | null
          pbx_uuid: string
          pdd: number | null
          pdd_ms: number | null
          raw_data: Json | null
          recording_id: string | null
          recording_name: string | null
          recording_path: string | null
          recording_url: string | null
          ring_group_uuid: string | null
          sentiment: string | null
          sip_call_id: string | null
          source_number: string | null
          start_at: string | null
          tags: string[] | null
          transcribed: boolean | null
          transcription: string | null
          tta: number | null
          voicemail_message: string | null
          waitsec: number | null
        }
        Insert: {
          ai_processing?: boolean | null
          ai_summary?: string | null
          analyzed?: boolean | null
          analyzed_at?: string | null
          answer_at?: string | null
          billsec?: number | null
          call_score?: number | null
          call_status?: string | null
          caller_name?: string | null
          caller_number?: string | null
          client_id?: string | null
          coaching_points?: Json | null
          codec?: string | null
          created_at?: string | null
          crm_synced?: boolean | null
          destination?: string | null
          destination_number?: string | null
          direction?: string | null
          domain_name?: string | null
          domain_uuid?: string | null
          duration_seconds?: number | null
          end_at?: string | null
          extension?: string | null
          extension_uuid?: string | null
          hangup_cause?: string | null
          has_recording?: boolean | null
          id?: string
          ivr_menu_uuid?: string | null
          missed_call?: boolean | null
          mos?: number | null
          notes?: string | null
          organization_id: string
          pbx_dedup_key?: string | null
          pbx_uuid: string
          pdd?: number | null
          pdd_ms?: number | null
          raw_data?: Json | null
          recording_id?: string | null
          recording_name?: string | null
          recording_path?: string | null
          recording_url?: string | null
          ring_group_uuid?: string | null
          sentiment?: string | null
          sip_call_id?: string | null
          source_number?: string | null
          start_at?: string | null
          tags?: string[] | null
          transcribed?: boolean | null
          transcription?: string | null
          tta?: number | null
          voicemail_message?: string | null
          waitsec?: number | null
        }
        Update: {
          ai_processing?: boolean | null
          ai_summary?: string | null
          analyzed?: boolean | null
          analyzed_at?: string | null
          answer_at?: string | null
          billsec?: number | null
          call_score?: number | null
          call_status?: string | null
          caller_name?: string | null
          caller_number?: string | null
          client_id?: string | null
          coaching_points?: Json | null
          codec?: string | null
          created_at?: string | null
          crm_synced?: boolean | null
          destination?: string | null
          destination_number?: string | null
          direction?: string | null
          domain_name?: string | null
          domain_uuid?: string | null
          duration_seconds?: number | null
          end_at?: string | null
          extension?: string | null
          extension_uuid?: string | null
          hangup_cause?: string | null
          has_recording?: boolean | null
          id?: string
          ivr_menu_uuid?: string | null
          missed_call?: boolean | null
          mos?: number | null
          notes?: string | null
          organization_id?: string
          pbx_dedup_key?: string | null
          pbx_uuid?: string
          pdd?: number | null
          pdd_ms?: number | null
          raw_data?: Json | null
          recording_id?: string | null
          recording_name?: string | null
          recording_path?: string | null
          recording_url?: string | null
          ring_group_uuid?: string | null
          sentiment?: string | null
          sip_call_id?: string | null
          source_number?: string | null
          start_at?: string | null
          tags?: string[] | null
          transcribed?: boolean | null
          transcription?: string | null
          tta?: number | null
          voicemail_message?: string | null
          waitsec?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_call_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_call_transcripts: {
        Row: {
          call_record_id: string | null
          client_id: string | null
          confidence: number | null
          created_at: string | null
          id: string
          language: string | null
          organization_id: string
          provider: string | null
          recording_id: string | null
          speaker_segments: Json | null
          transcript_text: string | null
        }
        Insert: {
          call_record_id?: string | null
          client_id?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          language?: string | null
          organization_id: string
          provider?: string | null
          recording_id?: string | null
          speaker_segments?: Json | null
          transcript_text?: string | null
        }
        Update: {
          call_record_id?: string | null
          client_id?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          language?: string | null
          organization_id?: string
          provider?: string | null
          recording_id?: string | null
          speaker_segments?: Json | null
          transcript_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_call_transcripts_call_record_id_fkey"
            columns: ["call_record_id"]
            isOneToOne: false
            referencedRelation: "pbx_call_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_transcripts_call_record_id_fkey"
            columns: ["call_record_id"]
            isOneToOne: false
            referencedRelation: "telecom_cdr_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_transcripts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_transcripts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_transcripts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_transcripts_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "pbx_call_recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_transcripts_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "telecom_recordings_v"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_conferences: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          extension: string | null
          id: string
          last_synced_at: string | null
          max_members: number | null
          moderator_pin: string | null
          name: string
          organization_id: string
          pbx_etag: string | null
          pbx_uuid: string | null
          pin: string | null
          record: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          extension?: string | null
          id?: string
          last_synced_at?: string | null
          max_members?: number | null
          moderator_pin?: string | null
          name: string
          organization_id: string
          pbx_etag?: string | null
          pbx_uuid?: string | null
          pin?: string | null
          record?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          extension?: string | null
          id?: string
          last_synced_at?: string | null
          max_members?: number | null
          moderator_pin?: string | null
          name?: string
          organization_id?: string
          pbx_etag?: string | null
          pbx_uuid?: string | null
          pin?: string | null
          record?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      pbx_destinations: {
        Row: {
          caller_id_name: string | null
          caller_id_number: string | null
          created_at: string
          description: string | null
          destination_action: string | null
          destination_app: string | null
          destination_number: string
          destination_prefix: string | null
          destination_type: string
          domain_uuid: string | null
          enabled: boolean
          id: string
          is_demo: boolean
          last_pbx_seen_at: string | null
          last_synced_at: string | null
          organization_id: string
          pbx_etag: string | null
          pbx_uuid: string | null
          source: string | null
          sync_status: string | null
          updated_at: string
        }
        Insert: {
          caller_id_name?: string | null
          caller_id_number?: string | null
          created_at?: string
          description?: string | null
          destination_action?: string | null
          destination_app?: string | null
          destination_number: string
          destination_prefix?: string | null
          destination_type?: string
          domain_uuid?: string | null
          enabled?: boolean
          id?: string
          is_demo?: boolean
          last_pbx_seen_at?: string | null
          last_synced_at?: string | null
          organization_id: string
          pbx_etag?: string | null
          pbx_uuid?: string | null
          source?: string | null
          sync_status?: string | null
          updated_at?: string
        }
        Update: {
          caller_id_name?: string | null
          caller_id_number?: string | null
          created_at?: string
          description?: string | null
          destination_action?: string | null
          destination_app?: string | null
          destination_number?: string
          destination_prefix?: string | null
          destination_type?: string
          domain_uuid?: string | null
          enabled?: boolean
          id?: string
          is_demo?: boolean
          last_pbx_seen_at?: string | null
          last_synced_at?: string | null
          organization_id?: string
          pbx_etag?: string | null
          pbx_uuid?: string | null
          source?: string | null
          sync_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pbx_devices: {
        Row: {
          assigned_extension_id: string | null
          client_id: string | null
          created_at: string | null
          domain_uuid: string | null
          enabled: boolean | null
          id: string
          is_demo: boolean
          label: string | null
          last_pbx_seen_at: string | null
          last_seen_at: string | null
          last_synced_at: string | null
          mac_address: string | null
          organization_id: string
          pbx_source: string | null
          pbx_uuid: string | null
          profile: string | null
          raw_data: Json | null
          registration_status: string | null
          source: string | null
          sync_status: string | null
          template: string | null
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          assigned_extension_id?: string | null
          client_id?: string | null
          created_at?: string | null
          domain_uuid?: string | null
          enabled?: boolean | null
          id?: string
          is_demo?: boolean
          label?: string | null
          last_pbx_seen_at?: string | null
          last_seen_at?: string | null
          last_synced_at?: string | null
          mac_address?: string | null
          organization_id: string
          pbx_source?: string | null
          pbx_uuid?: string | null
          profile?: string | null
          raw_data?: Json | null
          registration_status?: string | null
          source?: string | null
          sync_status?: string | null
          template?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          assigned_extension_id?: string | null
          client_id?: string | null
          created_at?: string | null
          domain_uuid?: string | null
          enabled?: boolean | null
          id?: string
          is_demo?: boolean
          label?: string | null
          last_pbx_seen_at?: string | null
          last_seen_at?: string | null
          last_synced_at?: string | null
          mac_address?: string | null
          organization_id?: string
          pbx_source?: string | null
          pbx_uuid?: string | null
          profile?: string | null
          raw_data?: Json | null
          registration_status?: string | null
          source?: string | null
          sync_status?: string | null
          template?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_devices_assigned_extension_id_fkey"
            columns: ["assigned_extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_assigned_extension_id_fkey"
            columns: ["assigned_extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_assigned_extension_id_fkey"
            columns: ["assigned_extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_real"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_assigned_extension_id_fkey"
            columns: ["assigned_extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_assigned_extension_id_fkey"
            columns: ["assigned_extension_id"]
            isOneToOne: false
            referencedRelation: "telecom_extensions_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_dialplans: {
        Row: {
          category: string | null
          context: string
          continue_flag: boolean
          created_at: string
          enabled: boolean
          id: string
          last_synced_at: string | null
          name: string
          number: string | null
          organization_id: string
          pbx_etag: string | null
          pbx_uuid: string | null
          sequence: number
          updated_at: string
          xml_definition: string | null
        }
        Insert: {
          category?: string | null
          context?: string
          continue_flag?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          name: string
          number?: string | null
          organization_id: string
          pbx_etag?: string | null
          pbx_uuid?: string | null
          sequence?: number
          updated_at?: string
          xml_definition?: string | null
        }
        Update: {
          category?: string | null
          context?: string
          continue_flag?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          name?: string
          number?: string | null
          organization_id?: string
          pbx_etag?: string | null
          pbx_uuid?: string | null
          sequence?: number
          updated_at?: string
          xml_definition?: string | null
        }
        Relationships: []
      }
      pbx_domain_users: {
        Row: {
          api_key: string | null
          created_at: string
          domain_uuid: string | null
          email: string | null
          groups: Json | null
          id: string
          last_login_at: string | null
          last_synced_at: string | null
          organization_id: string
          pbx_uuid: string | null
          raw_data: Json | null
          sync_status: string | null
          updated_at: string
          user_enabled: boolean | null
          user_status: string | null
          username: string
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          domain_uuid?: string | null
          email?: string | null
          groups?: Json | null
          id?: string
          last_login_at?: string | null
          last_synced_at?: string | null
          organization_id: string
          pbx_uuid?: string | null
          raw_data?: Json | null
          sync_status?: string | null
          updated_at?: string
          user_enabled?: boolean | null
          user_status?: string | null
          username: string
        }
        Update: {
          api_key?: string | null
          created_at?: string
          domain_uuid?: string | null
          email?: string | null
          groups?: Json | null
          id?: string
          last_login_at?: string | null
          last_synced_at?: string | null
          organization_id?: string
          pbx_uuid?: string | null
          raw_data?: Json | null
          sync_status?: string | null
          updated_at?: string
          user_enabled?: boolean | null
          user_status?: string | null
          username?: string
        }
        Relationships: []
      }
      pbx_domains: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          last_synced_at: string | null
          name: string
          organization_id: string
          pbx_etag: string | null
          pbx_uuid: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          name: string
          organization_id: string
          pbx_etag?: string | null
          pbx_uuid?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          pbx_etag?: string | null
          pbx_uuid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pbx_domains_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_domains_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_extensions: {
        Row: {
          absolute_codec_string: string | null
          accountcode: string | null
          assigned_user_ids: string[] | null
          auth_acl: string | null
          call_group: string | null
          call_recording: string | null
          call_screen: boolean | null
          call_timeout: number | null
          cidr: string | null
          client_id: string | null
          created_at: string | null
          description: string | null
          device_lines: Json | null
          directory_exten_visible: boolean | null
          directory_first_name: string | null
          directory_last_name: string | null
          directory_visible: boolean | null
          do_not_disturb: boolean | null
          domain_uuid: string | null
          effective_cid_name: string | null
          effective_cid_number: string | null
          emergency_cid_name: string | null
          emergency_cid_number: string | null
          enabled: boolean | null
          extension: string
          extension_dialect: string | null
          extension_language: string | null
          extension_type: string | null
          extension_voice: string | null
          force_ping: boolean | null
          forward_all_destination: string | null
          forward_all_enabled: boolean | null
          forward_busy_destination: string | null
          forward_busy_enabled: boolean | null
          forward_no_answer_destination: string | null
          forward_no_answer_enabled: boolean | null
          forward_user_not_registered_destination: string | null
          forward_user_not_registered_enabled: boolean | null
          hold_music: string | null
          id: string
          is_demo: boolean
          last_pbx_seen_at: string | null
          last_synced_at: string | null
          limit_destination: string | null
          limit_max: string | null
          max_registrations: number | null
          missed_call_app: string | null
          missed_call_data: string | null
          org_id: string | null
          organization_id: string
          outbound_cid_name: string | null
          outbound_cid_number: string | null
          password: string | null
          pbx_source: string | null
          pbx_uuid: string | null
          portal_user_id: string | null
          raw_data: Json | null
          sip_bypass_media: string | null
          sip_force_contact: string | null
          sip_force_expires: number | null
          source: string | null
          sync_status: string | null
          synced_at: string | null
          toll_allow: string | null
          updated_at: string | null
          user_record: string | null
          voicemail_custom_prompt: boolean | null
          voicemail_enabled: boolean | null
          voicemail_file: string | null
          voicemail_keep_local: boolean | null
          voicemail_mail_to: string | null
          voicemail_password: string | null
          voicemail_transcription: boolean | null
        }
        Insert: {
          absolute_codec_string?: string | null
          accountcode?: string | null
          assigned_user_ids?: string[] | null
          auth_acl?: string | null
          call_group?: string | null
          call_recording?: string | null
          call_screen?: boolean | null
          call_timeout?: number | null
          cidr?: string | null
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          device_lines?: Json | null
          directory_exten_visible?: boolean | null
          directory_first_name?: string | null
          directory_last_name?: string | null
          directory_visible?: boolean | null
          do_not_disturb?: boolean | null
          domain_uuid?: string | null
          effective_cid_name?: string | null
          effective_cid_number?: string | null
          emergency_cid_name?: string | null
          emergency_cid_number?: string | null
          enabled?: boolean | null
          extension: string
          extension_dialect?: string | null
          extension_language?: string | null
          extension_type?: string | null
          extension_voice?: string | null
          force_ping?: boolean | null
          forward_all_destination?: string | null
          forward_all_enabled?: boolean | null
          forward_busy_destination?: string | null
          forward_busy_enabled?: boolean | null
          forward_no_answer_destination?: string | null
          forward_no_answer_enabled?: boolean | null
          forward_user_not_registered_destination?: string | null
          forward_user_not_registered_enabled?: boolean | null
          hold_music?: string | null
          id?: string
          is_demo?: boolean
          last_pbx_seen_at?: string | null
          last_synced_at?: string | null
          limit_destination?: string | null
          limit_max?: string | null
          max_registrations?: number | null
          missed_call_app?: string | null
          missed_call_data?: string | null
          org_id?: string | null
          organization_id: string
          outbound_cid_name?: string | null
          outbound_cid_number?: string | null
          password?: string | null
          pbx_source?: string | null
          pbx_uuid?: string | null
          portal_user_id?: string | null
          raw_data?: Json | null
          sip_bypass_media?: string | null
          sip_force_contact?: string | null
          sip_force_expires?: number | null
          source?: string | null
          sync_status?: string | null
          synced_at?: string | null
          toll_allow?: string | null
          updated_at?: string | null
          user_record?: string | null
          voicemail_custom_prompt?: boolean | null
          voicemail_enabled?: boolean | null
          voicemail_file?: string | null
          voicemail_keep_local?: boolean | null
          voicemail_mail_to?: string | null
          voicemail_password?: string | null
          voicemail_transcription?: boolean | null
        }
        Update: {
          absolute_codec_string?: string | null
          accountcode?: string | null
          assigned_user_ids?: string[] | null
          auth_acl?: string | null
          call_group?: string | null
          call_recording?: string | null
          call_screen?: boolean | null
          call_timeout?: number | null
          cidr?: string | null
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          device_lines?: Json | null
          directory_exten_visible?: boolean | null
          directory_first_name?: string | null
          directory_last_name?: string | null
          directory_visible?: boolean | null
          do_not_disturb?: boolean | null
          domain_uuid?: string | null
          effective_cid_name?: string | null
          effective_cid_number?: string | null
          emergency_cid_name?: string | null
          emergency_cid_number?: string | null
          enabled?: boolean | null
          extension?: string
          extension_dialect?: string | null
          extension_language?: string | null
          extension_type?: string | null
          extension_voice?: string | null
          force_ping?: boolean | null
          forward_all_destination?: string | null
          forward_all_enabled?: boolean | null
          forward_busy_destination?: string | null
          forward_busy_enabled?: boolean | null
          forward_no_answer_destination?: string | null
          forward_no_answer_enabled?: boolean | null
          forward_user_not_registered_destination?: string | null
          forward_user_not_registered_enabled?: boolean | null
          hold_music?: string | null
          id?: string
          is_demo?: boolean
          last_pbx_seen_at?: string | null
          last_synced_at?: string | null
          limit_destination?: string | null
          limit_max?: string | null
          max_registrations?: number | null
          missed_call_app?: string | null
          missed_call_data?: string | null
          org_id?: string | null
          organization_id?: string
          outbound_cid_name?: string | null
          outbound_cid_number?: string | null
          password?: string | null
          pbx_source?: string | null
          pbx_uuid?: string | null
          portal_user_id?: string | null
          raw_data?: Json | null
          sip_bypass_media?: string | null
          sip_force_contact?: string | null
          sip_force_expires?: number | null
          source?: string | null
          sync_status?: string | null
          synced_at?: string | null
          toll_allow?: string | null
          updated_at?: string | null
          user_record?: string | null
          voicemail_custom_prompt?: boolean | null
          voicemail_enabled?: boolean | null
          voicemail_file?: string | null
          voicemail_keep_local?: boolean | null
          voicemail_mail_to?: string | null
          voicemail_password?: string | null
          voicemail_transcription?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_extensions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_extensions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_extensions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_extensions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_feature_codes: {
        Row: {
          activate_code: string | null
          deactivate_code: string | null
          dial_code: string | null
          enabled: boolean | null
          feature: string
          id: string
          organization_id: string
        }
        Insert: {
          activate_code?: string | null
          deactivate_code?: string | null
          dial_code?: string | null
          enabled?: boolean | null
          feature: string
          id?: string
          organization_id: string
        }
        Update: {
          activate_code?: string | null
          deactivate_code?: string | null
          dial_code?: string | null
          enabled?: boolean | null
          feature?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pbx_feature_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_gateways: {
        Row: {
          config: Json | null
          context: string | null
          created_at: string
          enabled: boolean
          expire_seconds: number | null
          from_domain: string | null
          from_user: string | null
          id: string
          last_synced_at: string | null
          name: string
          organization_id: string
          pbx_etag: string | null
          pbx_uuid: string | null
          profile: string | null
          proxy: string | null
          realm: string | null
          register: boolean | null
          status: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          config?: Json | null
          context?: string | null
          created_at?: string
          enabled?: boolean
          expire_seconds?: number | null
          from_domain?: string | null
          from_user?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          organization_id: string
          pbx_etag?: string | null
          pbx_uuid?: string | null
          profile?: string | null
          proxy?: string | null
          realm?: string | null
          register?: boolean | null
          status?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          config?: Json | null
          context?: string | null
          created_at?: string
          enabled?: boolean
          expire_seconds?: number | null
          from_domain?: string | null
          from_user?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          pbx_etag?: string | null
          pbx_uuid?: string | null
          profile?: string | null
          proxy?: string | null
          realm?: string | null
          register?: boolean | null
          status?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      pbx_hold_music: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_synced_at: string | null
          name: string
          organization_id: string
          path: string | null
          pbx_etag: string | null
          pbx_uuid: string | null
          rate: number | null
          shuffle: boolean | null
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          name: string
          organization_id: string
          path?: string | null
          pbx_etag?: string | null
          pbx_uuid?: string | null
          rate?: number | null
          shuffle?: boolean | null
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          path?: string | null
          pbx_etag?: string | null
          pbx_uuid?: string | null
          rate?: number | null
          shuffle?: boolean | null
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pbx_integrations: {
        Row: {
          base_url: string | null
          config: Json | null
          created_at: string | null
          domain: string | null
          id: string
          last_sync_at: string | null
          organization_id: string
          provider: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          base_url?: string | null
          config?: Json | null
          created_at?: string | null
          domain?: string | null
          id?: string
          last_sync_at?: string | null
          organization_id: string
          provider?: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          base_url?: string | null
          config?: Json | null
          created_at?: string | null
          domain?: string | null
          id?: string
          last_sync_at?: string | null
          organization_id?: string
          provider?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_ivr_audio: {
        Row: {
          audio_url: string | null
          client_id: string | null
          created_at: string | null
          elevenlabs_voice_id: string | null
          id: string
          ivr_id: string | null
          language: string | null
          organization_id: string
          script_text: string | null
          status: string | null
          storage_path: string | null
        }
        Insert: {
          audio_url?: string | null
          client_id?: string | null
          created_at?: string | null
          elevenlabs_voice_id?: string | null
          id?: string
          ivr_id?: string | null
          language?: string | null
          organization_id: string
          script_text?: string | null
          status?: string | null
          storage_path?: string | null
        }
        Update: {
          audio_url?: string | null
          client_id?: string | null
          created_at?: string | null
          elevenlabs_voice_id?: string | null
          id?: string
          ivr_id?: string | null
          language?: string | null
          organization_id?: string
          script_text?: string | null
          status?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_ivr_audio_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_ivr_audio_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_ivr_audio_ivr_id_fkey"
            columns: ["ivr_id"]
            isOneToOne: false
            referencedRelation: "pbx_ivrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_ivr_audio_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_ivr_options: {
        Row: {
          description: string | null
          destination_id: string | null
          destination_type: string | null
          digit: string
          id: string
          ivr_id: string
          pbx_uuid: string | null
          sort_order: number | null
        }
        Insert: {
          description?: string | null
          destination_id?: string | null
          destination_type?: string | null
          digit: string
          id?: string
          ivr_id: string
          pbx_uuid?: string | null
          sort_order?: number | null
        }
        Update: {
          description?: string | null
          destination_id?: string | null
          destination_type?: string | null
          digit?: string
          id?: string
          ivr_id?: string
          pbx_uuid?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_ivr_options_ivr_id_fkey"
            columns: ["ivr_id"]
            isOneToOne: false
            referencedRelation: "pbx_ivrs"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_ivrs: {
        Row: {
          client_id: string | null
          created_at: string | null
          description: string | null
          direct_dial: boolean | null
          enabled: boolean | null
          exit_action: string | null
          extension: string | null
          greet_long: string | null
          greet_short: string | null
          id: string
          name: string
          organization_id: string
          pbx_uuid: string | null
          raw_data: Json | null
          ringback: string | null
          timeout_ms: number | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          direct_dial?: boolean | null
          enabled?: boolean | null
          exit_action?: string | null
          extension?: string | null
          greet_long?: string | null
          greet_short?: string | null
          id?: string
          name: string
          organization_id: string
          pbx_uuid?: string | null
          raw_data?: Json | null
          ringback?: string | null
          timeout_ms?: number | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          direct_dial?: boolean | null
          enabled?: boolean | null
          exit_action?: string | null
          extension?: string | null
          greet_long?: string | null
          greet_short?: string | null
          id?: string
          name?: string
          organization_id?: string
          pbx_uuid?: string | null
          raw_data?: Json | null
          ringback?: string | null
          timeout_ms?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_ivrs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_ivrs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_ivrs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_object_owner: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          object_local_id: string | null
          object_pbx_uuid: string
          object_type: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          object_local_id?: string | null
          object_pbx_uuid: string
          object_type: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          object_local_id?: string | null
          object_pbx_uuid?: string
          object_type?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pbx_phone_number_assignments: {
        Row: {
          ai_enabled: boolean | null
          client_id: string | null
          created_at: string | null
          destination_id: string | null
          destination_type: string | null
          id: string
          organization_id: string
          phone_number_id: string | null
          routing_rules: Json | null
          sms_enabled: boolean | null
          updated_at: string | null
          voice_agent_id: string | null
        }
        Insert: {
          ai_enabled?: boolean | null
          client_id?: string | null
          created_at?: string | null
          destination_id?: string | null
          destination_type?: string | null
          id?: string
          organization_id: string
          phone_number_id?: string | null
          routing_rules?: Json | null
          sms_enabled?: boolean | null
          updated_at?: string | null
          voice_agent_id?: string | null
        }
        Update: {
          ai_enabled?: boolean | null
          client_id?: string | null
          created_at?: string | null
          destination_id?: string | null
          destination_type?: string | null
          id?: string
          organization_id?: string
          phone_number_id?: string | null
          routing_rules?: Json | null
          sms_enabled?: boolean | null
          updated_at?: string | null
          voice_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_phone_number_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_phone_number_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_phone_number_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_phone_number_assignments_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_phone_number_assignments_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers_unified"
            referencedColumns: ["phone_number_id"]
          },
          {
            foreignKeyName: "pbx_phone_number_assignments_voice_agent_id_fkey"
            columns: ["voice_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_phone_number_assignments_voice_agent_id_fkey"
            columns: ["voice_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_queue_agent_state: {
        Row: {
          id: string
          joined_at: string
          last_call_at: string | null
          organization_id: string | null
          paused: boolean
          queue_id: string
          queue_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          last_call_at?: string | null
          organization_id?: string | null
          paused?: boolean
          queue_id: string
          queue_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          last_call_at?: string | null
          organization_id?: string | null
          paused?: boolean
          queue_id?: string
          queue_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pbx_queue_agents: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          contact: string | null
          created_at: string
          extension: string | null
          extension_id: string | null
          id: string
          name: string | null
          organization_id: string | null
          pbx_uuid: string | null
          queue_id: string | null
          raw_data: Json | null
          status: string | null
          tier_level: number | null
          tier_position: number | null
          type: string | null
          updated_at: string
          wrap_up_time: number | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          contact?: string | null
          created_at?: string
          extension?: string | null
          extension_id?: string | null
          id?: string
          name?: string | null
          organization_id?: string | null
          pbx_uuid?: string | null
          queue_id?: string | null
          raw_data?: Json | null
          status?: string | null
          tier_level?: number | null
          tier_position?: number | null
          type?: string | null
          updated_at?: string
          wrap_up_time?: number | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          contact?: string | null
          created_at?: string
          extension?: string | null
          extension_id?: string | null
          id?: string
          name?: string | null
          organization_id?: string | null
          pbx_uuid?: string | null
          queue_id?: string | null
          raw_data?: Json | null
          status?: string | null
          tier_level?: number | null
          tier_position?: number | null
          type?: string | null
          updated_at?: string
          wrap_up_time?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_queue_agents_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_queue_agents_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_queue_agents_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_real"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_queue_agents_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_queue_agents_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "telecom_extensions_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_queue_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_queue_agents_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "pbx_call_queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_queue_agents_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "telecom_queues_v"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_queue_recording_rules: {
        Row: {
          announce: boolean
          created_at: string
          enabled: boolean
          id: string
          mode: string
          organization_id: string
          queue_id: string
          retention_days: number
          updated_at: string
        }
        Insert: {
          announce?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          mode?: string
          organization_id: string
          queue_id: string
          retention_days?: number
          updated_at?: string
        }
        Update: {
          announce?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          mode?: string
          organization_id?: string
          queue_id?: string
          retention_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pbx_queue_recording_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_queue_recording_rules_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: true
            referencedRelation: "pbx_call_queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_queue_recording_rules_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: true
            referencedRelation: "telecom_queues_v"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_ring_groups: {
        Row: {
          client_id: string | null
          created_at: string | null
          description: string | null
          enabled: boolean | null
          extension: string | null
          forwarding: string | null
          id: string
          name: string
          organization_id: string
          pbx_uuid: string | null
          raw_data: Json | null
          strategy: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          extension?: string | null
          forwarding?: string | null
          id?: string
          name: string
          organization_id: string
          pbx_uuid?: string | null
          raw_data?: Json | null
          strategy?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          extension?: string | null
          forwarding?: string | null
          id?: string
          name?: string
          organization_id?: string
          pbx_uuid?: string | null
          raw_data?: Json | null
          strategy?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_ring_groups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_ring_groups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_ring_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_sip_profiles: {
        Row: {
          bindings: Json | null
          codecs: string | null
          created_at: string
          enabled: boolean
          id: string
          last_synced_at: string | null
          name: string
          nat_settings: Json | null
          organization_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          bindings?: Json | null
          codecs?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          name: string
          nat_settings?: Json | null
          organization_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          bindings?: Json | null
          codecs?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          name?: string
          nat_settings?: Json | null
          organization_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pbx_sms_messages: {
        Row: {
          body: string | null
          direction: string
          from_number: string | null
          id: string
          media_urls: Json | null
          organization_id: string
          provider_message_id: string | null
          raw_data: Json | null
          sent_at: string | null
          status: string | null
          thread_id: string
          to_number: string | null
        }
        Insert: {
          body?: string | null
          direction: string
          from_number?: string | null
          id?: string
          media_urls?: Json | null
          organization_id: string
          provider_message_id?: string | null
          raw_data?: Json | null
          sent_at?: string | null
          status?: string | null
          thread_id: string
          to_number?: string | null
        }
        Update: {
          body?: string | null
          direction?: string
          from_number?: string | null
          id?: string
          media_urls?: Json | null
          organization_id?: string
          provider_message_id?: string | null
          raw_data?: Json | null
          sent_at?: string | null
          status?: string | null
          thread_id?: string
          to_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_sms_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_sms_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "pbx_sms_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_sms_threads: {
        Row: {
          assigned_agent_id: string | null
          assigned_user_id: string | null
          client_id: string | null
          contact_name: string | null
          contact_phone: string
          created_at: string | null
          did_number: string
          id: string
          last_message_at: string | null
          organization_id: string
          phone_number_id: string | null
          status: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          assigned_user_id?: string | null
          client_id?: string | null
          contact_name?: string | null
          contact_phone: string
          created_at?: string | null
          did_number: string
          id?: string
          last_message_at?: string | null
          organization_id: string
          phone_number_id?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          assigned_user_id?: string | null
          client_id?: string | null
          contact_name?: string | null
          contact_phone?: string
          created_at?: string | null
          did_number?: string
          id?: string
          last_message_at?: string | null
          organization_id?: string
          phone_number_id?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_sms_threads_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_sms_threads_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_sms_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_sms_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_sms_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_sms_threads_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_sms_threads_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers_unified"
            referencedColumns: ["phone_number_id"]
          },
        ]
      }
      pbx_softphone_portal_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          extension: string
          id: string
          metadata: Json
          new_portal_user_id: string | null
          old_portal_user_id: string | null
          organization_id: string
          softphone_user_id: string
          source: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          extension: string
          id?: string
          metadata?: Json
          new_portal_user_id?: string | null
          old_portal_user_id?: string | null
          organization_id: string
          softphone_user_id: string
          source?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          extension?: string
          id?: string
          metadata?: Json
          new_portal_user_id?: string | null
          old_portal_user_id?: string | null
          organization_id?: string
          softphone_user_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_softphone_portal_audit_softphone_user_id_fkey"
            columns: ["softphone_user_id"]
            isOneToOne: false
            referencedRelation: "pbx_softphone_link_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_portal_audit_softphone_user_id_fkey"
            columns: ["softphone_user_id"]
            isOneToOne: false
            referencedRelation: "pbx_softphone_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_portal_audit_softphone_user_id_fkey"
            columns: ["softphone_user_id"]
            isOneToOne: false
            referencedRelation: "pbx_softphone_users_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_softphone_users: {
        Row: {
          account_status: string
          active_platforms: string[]
          app_access_enabled: boolean
          cc_avg_handle_time: number | null
          cc_calls_today: number | null
          cc_logged_in_at: string | null
          cc_pause_reason: string | null
          cc_queues: string[] | null
          cc_role: string | null
          cc_skills: string[] | null
          cc_status: string | null
          client_id: string | null
          created_at: string | null
          custom_status: string | null
          desktop_access_enabled: boolean
          device_type: string | null
          display_name: string | null
          dnd_enabled: boolean
          domain_uuid: string | null
          extension: string
          extension_id: string | null
          forward_enabled: boolean
          forward_to: string | null
          id: string
          is_demo: boolean
          last_pbx_seen_at: string | null
          last_seen_android: string | null
          last_seen_at: string | null
          last_seen_ios: string | null
          last_seen_linux: string | null
          last_seen_mac: string | null
          last_seen_web: string | null
          last_seen_windows: string | null
          mobile_access_enabled: boolean
          organization_id: string
          out_of_office_until: string | null
          pbx_uuid: string | null
          portal_user_id: string | null
          sip_domain: string | null
          sip_password: string | null
          source: string | null
          status: string | null
          status_emoji: string | null
          sync_status: string | null
          total_calls: number
          updated_at: string | null
          wss_url: string | null
        }
        Insert: {
          account_status?: string
          active_platforms?: string[]
          app_access_enabled?: boolean
          cc_avg_handle_time?: number | null
          cc_calls_today?: number | null
          cc_logged_in_at?: string | null
          cc_pause_reason?: string | null
          cc_queues?: string[] | null
          cc_role?: string | null
          cc_skills?: string[] | null
          cc_status?: string | null
          client_id?: string | null
          created_at?: string | null
          custom_status?: string | null
          desktop_access_enabled?: boolean
          device_type?: string | null
          display_name?: string | null
          dnd_enabled?: boolean
          domain_uuid?: string | null
          extension: string
          extension_id?: string | null
          forward_enabled?: boolean
          forward_to?: string | null
          id?: string
          is_demo?: boolean
          last_pbx_seen_at?: string | null
          last_seen_android?: string | null
          last_seen_at?: string | null
          last_seen_ios?: string | null
          last_seen_linux?: string | null
          last_seen_mac?: string | null
          last_seen_web?: string | null
          last_seen_windows?: string | null
          mobile_access_enabled?: boolean
          organization_id: string
          out_of_office_until?: string | null
          pbx_uuid?: string | null
          portal_user_id?: string | null
          sip_domain?: string | null
          sip_password?: string | null
          source?: string | null
          status?: string | null
          status_emoji?: string | null
          sync_status?: string | null
          total_calls?: number
          updated_at?: string | null
          wss_url?: string | null
        }
        Update: {
          account_status?: string
          active_platforms?: string[]
          app_access_enabled?: boolean
          cc_avg_handle_time?: number | null
          cc_calls_today?: number | null
          cc_logged_in_at?: string | null
          cc_pause_reason?: string | null
          cc_queues?: string[] | null
          cc_role?: string | null
          cc_skills?: string[] | null
          cc_status?: string | null
          client_id?: string | null
          created_at?: string | null
          custom_status?: string | null
          desktop_access_enabled?: boolean
          device_type?: string | null
          display_name?: string | null
          dnd_enabled?: boolean
          domain_uuid?: string | null
          extension?: string
          extension_id?: string | null
          forward_enabled?: boolean
          forward_to?: string | null
          id?: string
          is_demo?: boolean
          last_pbx_seen_at?: string | null
          last_seen_android?: string | null
          last_seen_at?: string | null
          last_seen_ios?: string | null
          last_seen_linux?: string | null
          last_seen_mac?: string | null
          last_seen_web?: string | null
          last_seen_windows?: string | null
          mobile_access_enabled?: boolean
          organization_id?: string
          out_of_office_until?: string | null
          pbx_uuid?: string | null
          portal_user_id?: string | null
          sip_domain?: string | null
          sip_password?: string | null
          source?: string | null
          status?: string | null
          status_emoji?: string | null
          sync_status?: string | null
          total_calls?: number
          updated_at?: string | null
          wss_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_softphone_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_real"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "telecom_extensions_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          duration_ms: number | null
          endpoint: string | null
          error: string | null
          fetched: number | null
          id: string
          job_type: string
          organization_id: string
          skipped: number | null
          started_at: string | null
          stats: Json | null
          status: string | null
          upserted: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          endpoint?: string | null
          error?: string | null
          fetched?: number | null
          id?: string
          job_type: string
          organization_id: string
          skipped?: number | null
          started_at?: string | null
          stats?: Json | null
          status?: string | null
          upserted?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          endpoint?: string | null
          error?: string | null
          fetched?: number | null
          id?: string
          job_type?: string
          organization_id?: string
          skipped?: number | null
          started_at?: string | null
          stats?: Json | null
          status?: string | null
          upserted?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_sync_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_time_conditions: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          last_synced_at: string | null
          match_destination: string | null
          name: string
          nomatch_destination: string | null
          organization_id: string
          pbx_etag: string | null
          pbx_uuid: string | null
          rules: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          match_destination?: string | null
          name: string
          nomatch_destination?: string | null
          organization_id: string
          pbx_etag?: string | null
          pbx_uuid?: string | null
          rules?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          match_destination?: string | null
          name?: string
          nomatch_destination?: string | null
          organization_id?: string
          pbx_etag?: string | null
          pbx_uuid?: string | null
          rules?: Json
          updated_at?: string
        }
        Relationships: []
      }
      pbx_user_devices: {
        Row: {
          created_at: string
          current_session: boolean
          device_name: string | null
          id: string
          last_active_at: string
          platform: string
          push_token: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          current_session?: boolean
          device_name?: string | null
          id?: string
          last_active_at?: string
          platform: string
          push_token?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          current_session?: boolean
          device_name?: string | null
          id?: string
          last_active_at?: string
          platform?: string
          push_token?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pbx_voicemail_greeting_attempts: {
        Row: {
          attempt_number: number
          duration_ms: number | null
          error_message: string | null
          error_payload: Json | null
          finished_at: string | null
          greeting_id: string
          http_status: number | null
          id: string
          organization_id: string
          request_id: string | null
          started_at: string
          status: string
          user_id: string
          voice_id: string | null
        }
        Insert: {
          attempt_number?: number
          duration_ms?: number | null
          error_message?: string | null
          error_payload?: Json | null
          finished_at?: string | null
          greeting_id: string
          http_status?: number | null
          id?: string
          organization_id: string
          request_id?: string | null
          started_at?: string
          status: string
          user_id: string
          voice_id?: string | null
        }
        Update: {
          attempt_number?: number
          duration_ms?: number | null
          error_message?: string | null
          error_payload?: Json | null
          finished_at?: string | null
          greeting_id?: string
          http_status?: number | null
          id?: string
          organization_id?: string
          request_id?: string | null
          started_at?: string
          status?: string
          user_id?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_voicemail_greeting_attempts_greeting_id_fkey"
            columns: ["greeting_id"]
            isOneToOne: false
            referencedRelation: "pbx_voicemail_greetings"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_voicemail_greetings: {
        Row: {
          attempts: number
          canceled_at: string | null
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          extension: string | null
          id: string
          is_active: boolean
          last_attempt_at: string | null
          name: string
          organization_id: string
          source: string
          status: string
          storage_path: string
          text_script: string | null
          updated_at: string
          user_id: string
          voice_id: string | null
          voice_name: string | null
        }
        Insert: {
          attempts?: number
          canceled_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          extension?: string | null
          id?: string
          is_active?: boolean
          last_attempt_at?: string | null
          name: string
          organization_id: string
          source?: string
          status?: string
          storage_path: string
          text_script?: string | null
          updated_at?: string
          user_id: string
          voice_id?: string | null
          voice_name?: string | null
        }
        Update: {
          attempts?: number
          canceled_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          extension?: string | null
          id?: string
          is_active?: boolean
          last_attempt_at?: string | null
          name?: string
          organization_id?: string
          source?: string
          status?: string
          storage_path?: string
          text_script?: string | null
          updated_at?: string
          user_id?: string
          voice_id?: string | null
          voice_name?: string | null
        }
        Relationships: []
      }
      pbx_voicemail_settings: {
        Row: {
          ai_summary_enabled: boolean
          attach_audio_email: boolean
          greeting_audio_url: string | null
          greeting_storage_path: string | null
          greeting_tts_text: string | null
          greeting_type: string
          greeting_updated_at: string | null
          greeting_voice_id: string | null
          greeting_voice_name: string | null
          notify_email: boolean
          notify_email_address: string | null
          notify_push: boolean
          notify_sms: boolean
          notify_sms_number: string | null
          organization_id: string | null
          pin_hash: string | null
          transcription_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_summary_enabled?: boolean
          attach_audio_email?: boolean
          greeting_audio_url?: string | null
          greeting_storage_path?: string | null
          greeting_tts_text?: string | null
          greeting_type?: string
          greeting_updated_at?: string | null
          greeting_voice_id?: string | null
          greeting_voice_name?: string | null
          notify_email?: boolean
          notify_email_address?: string | null
          notify_push?: boolean
          notify_sms?: boolean
          notify_sms_number?: string | null
          organization_id?: string | null
          pin_hash?: string | null
          transcription_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_summary_enabled?: boolean
          attach_audio_email?: boolean
          greeting_audio_url?: string | null
          greeting_storage_path?: string | null
          greeting_tts_text?: string | null
          greeting_type?: string
          greeting_updated_at?: string | null
          greeting_voice_id?: string | null
          greeting_voice_name?: string | null
          notify_email?: boolean
          notify_email_address?: string | null
          notify_push?: boolean
          notify_sms?: boolean
          notify_sms_number?: string | null
          organization_id?: string | null
          pin_hash?: string | null
          transcription_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pbx_voicemails: {
        Row: {
          ai_summary: string | null
          ai_tags: string[]
          audio_storage_path: string | null
          caller_name: string | null
          caller_number: string | null
          created_at: string
          deleted_at: string | null
          duration_seconds: number
          extension: string
          folder: string
          fusionpbx_uuid: string | null
          id: string
          mailbox: string | null
          organization_id: string
          pbx_record_name: string | null
          pbx_record_path: string | null
          read_at: string | null
          received_at: string
          transcript: string | null
        }
        Insert: {
          ai_summary?: string | null
          ai_tags?: string[]
          audio_storage_path?: string | null
          caller_name?: string | null
          caller_number?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number
          extension: string
          folder?: string
          fusionpbx_uuid?: string | null
          id?: string
          mailbox?: string | null
          organization_id: string
          pbx_record_name?: string | null
          pbx_record_path?: string | null
          read_at?: string | null
          received_at?: string
          transcript?: string | null
        }
        Update: {
          ai_summary?: string | null
          ai_tags?: string[]
          audio_storage_path?: string | null
          caller_name?: string | null
          caller_number?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number
          extension?: string
          folder?: string
          fusionpbx_uuid?: string | null
          id?: string
          mailbox?: string | null
          organization_id?: string
          pbx_record_name?: string | null
          pbx_record_path?: string | null
          read_at?: string | null
          received_at?: string
          transcript?: string | null
        }
        Relationships: []
      }
      pbx_wss_health_checks: {
        Row: {
          checked_at: string
          created_at: string
          error: string | null
          host: string
          id: string
          latency_ms: number
          ok: boolean
          port: number
          url: string
        }
        Insert: {
          checked_at?: string
          created_at?: string
          error?: string | null
          host: string
          id?: string
          latency_ms?: number
          ok: boolean
          port: number
          url: string
        }
        Update: {
          checked_at?: string
          created_at?: string
          error?: string | null
          host?: string
          id?: string
          latency_ms?: number
          ok?: boolean
          port?: number
          url?: string
        }
        Relationships: []
      }
      performance_metrics: {
        Row: {
          appointments_booked: number | null
          appointments_completed: number | null
          billable_amount: number | null
          billed_at: string | null
          conversations_count: number | null
          created_at: string
          id: string
          leads_converted: number | null
          leads_generated: number | null
          leads_qualified: number | null
          organization_id: string
          period_end: string
          period_start: string
          stripe_invoice_id: string | null
          total_duration_minutes: number | null
          updated_at: string
        }
        Insert: {
          appointments_booked?: number | null
          appointments_completed?: number | null
          billable_amount?: number | null
          billed_at?: string | null
          conversations_count?: number | null
          created_at?: string
          id?: string
          leads_converted?: number | null
          leads_generated?: number | null
          leads_qualified?: number | null
          organization_id: string
          period_end: string
          period_start: string
          stripe_invoice_id?: string | null
          total_duration_minutes?: number | null
          updated_at?: string
        }
        Update: {
          appointments_booked?: number | null
          appointments_completed?: number | null
          billable_amount?: number | null
          billed_at?: string | null
          conversations_count?: number | null
          created_at?: string
          id?: string
          leads_converted?: number | null
          leads_generated?: number | null
          leads_qualified?: number | null
          organization_id?: string
          period_end?: string
          period_start?: string
          stripe_invoice_id?: string | null
          total_duration_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_numbers: {
        Row: {
          capabilities: Json | null
          created_at: string | null
          domain_uuid: string | null
          friendly_name: string | null
          id: string
          is_demo: boolean
          is_verified: boolean | null
          last_pbx_seen_at: string | null
          metadata: Json | null
          monthly_cost: number | null
          organization_id: string
          phone_number: string
          provider: string
          provider_sid: string | null
          recording_enabled: boolean | null
          source: string | null
          status: string | null
          sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          capabilities?: Json | null
          created_at?: string | null
          domain_uuid?: string | null
          friendly_name?: string | null
          id?: string
          is_demo?: boolean
          is_verified?: boolean | null
          last_pbx_seen_at?: string | null
          metadata?: Json | null
          monthly_cost?: number | null
          organization_id: string
          phone_number: string
          provider?: string
          provider_sid?: string | null
          recording_enabled?: boolean | null
          source?: string | null
          status?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          capabilities?: Json | null
          created_at?: string | null
          domain_uuid?: string | null
          friendly_name?: string | null
          id?: string
          is_demo?: boolean
          is_verified?: boolean | null
          last_pbx_seen_at?: string | null
          metadata?: Json | null
          monthly_cost?: number | null
          organization_id?: string
          phone_number?: string
          provider?: string
          provider_sid?: string | null
          recording_enabled?: boolean | null
          source?: string | null
          status?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_numbers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_ai_insights: {
        Row: {
          call_id: string | null
          coaching_notes: string | null
          created_at: string
          customer_intent: string | null
          id: string
          model: string | null
          organization_id: string
          raw_response: Json | null
          sentiment: string | null
          suggested_actions: Json
          summary: string | null
          topics: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          call_id?: string | null
          coaching_notes?: string | null
          created_at?: string
          customer_intent?: string | null
          id?: string
          model?: string | null
          organization_id?: string
          raw_response?: Json | null
          sentiment?: string | null
          suggested_actions?: Json
          summary?: string | null
          topics?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          call_id?: string | null
          coaching_notes?: string | null
          created_at?: string
          customer_intent?: string | null
          id?: string
          model?: string | null
          organization_id?: string
          raw_response?: Json | null
          sentiment?: string | null
          suggested_actions?: Json
          summary?: string | null
          topics?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planipret_ai_insights_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "planipret_phone_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planipret_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planipret_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_ava_action_log: {
        Row: {
          action_params: Json | null
          action_type: string
          analysis_id: string | null
          broker_id: string | null
          broker_user_id: string
          error: string | null
          executed_at: string
          execution_mode: string
          id: string
          modified_by_broker: boolean | null
          modified_content: string | null
          result: Json | null
          success: boolean | null
        }
        Insert: {
          action_params?: Json | null
          action_type: string
          analysis_id?: string | null
          broker_id?: string | null
          broker_user_id: string
          error?: string | null
          executed_at?: string
          execution_mode?: string
          id?: string
          modified_by_broker?: boolean | null
          modified_content?: string | null
          result?: Json | null
          success?: boolean | null
        }
        Update: {
          action_params?: Json | null
          action_type?: string
          analysis_id?: string | null
          broker_id?: string | null
          broker_user_id?: string
          error?: string | null
          executed_at?: string
          execution_mode?: string
          id?: string
          modified_by_broker?: boolean | null
          modified_content?: string | null
          result?: Json | null
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "planipret_ava_action_log_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "planipret_ava_email_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_ava_chat_sessions: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      planipret_ava_conversations: {
        Row: {
          audio_url: string | null
          created_at: string
          duration_ms: number | null
          id: string
          message: string | null
          role: string
          session_id: string | null
          tool_calls: Json | null
          tool_name: string | null
          tool_params: Json | null
          tool_result: Json | null
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          message?: string | null
          role: string
          session_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
          tool_params?: Json | null
          tool_result?: Json | null
          user_id: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          message?: string | null
          role?: string
          session_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
          tool_params?: Json | null
          tool_result?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      planipret_ava_email_analyses: {
        Row: {
          broker_id: string
          broker_user_id: string
          created_at: string
          email_from: string | null
          email_from_name: string | null
          email_subject: string | null
          id: string
          intent: string | null
          key_info: Json | null
          lead_score: number | null
          ms_message_id: string
          notification_summary: string | null
          proposed_actions: Json
          raw_ai_response: Json | null
          received_at: string | null
          urgency: string | null
        }
        Insert: {
          broker_id: string
          broker_user_id: string
          created_at?: string
          email_from?: string | null
          email_from_name?: string | null
          email_subject?: string | null
          id?: string
          intent?: string | null
          key_info?: Json | null
          lead_score?: number | null
          ms_message_id: string
          notification_summary?: string | null
          proposed_actions?: Json
          raw_ai_response?: Json | null
          received_at?: string | null
          urgency?: string | null
        }
        Update: {
          broker_id?: string
          broker_user_id?: string
          created_at?: string
          email_from?: string | null
          email_from_name?: string | null
          email_subject?: string | null
          id?: string
          intent?: string | null
          key_info?: Json | null
          lead_score?: number | null
          ms_message_id?: string
          notification_summary?: string | null
          proposed_actions?: Json
          raw_ai_response?: Json | null
          received_at?: string | null
          urgency?: string | null
        }
        Relationships: []
      }
      planipret_ava_feedback: {
        Row: {
          action_id: string | null
          action_type: string | null
          analysis_id: string | null
          broker_user_id: string
          comment: string | null
          created_at: string
          final_content: string | null
          id: string
          original_draft: string | null
          rating: string
        }
        Insert: {
          action_id?: string | null
          action_type?: string | null
          analysis_id?: string | null
          broker_user_id: string
          comment?: string | null
          created_at?: string
          final_content?: string | null
          id?: string
          original_draft?: string | null
          rating: string
        }
        Update: {
          action_id?: string | null
          action_type?: string | null
          analysis_id?: string | null
          broker_user_id?: string
          comment?: string | null
          created_at?: string
          final_content?: string | null
          id?: string
          original_draft?: string | null
          rating?: string
        }
        Relationships: [
          {
            foreignKeyName: "planipret_ava_feedback_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "planipret_ava_email_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_ava_mail_subscriptions: {
        Row: {
          broker_id: string | null
          broker_user_id: string
          client_state: string
          created_at: string
          expiration_datetime: string
          id: string
          last_notification_at: string | null
          last_renewed_at: string | null
          ms_subscription_id: string
          notification_url: string
          resource: string
          updated_at: string
        }
        Insert: {
          broker_id?: string | null
          broker_user_id: string
          client_state: string
          created_at?: string
          expiration_datetime: string
          id?: string
          last_notification_at?: string | null
          last_renewed_at?: string | null
          ms_subscription_id: string
          notification_url: string
          resource: string
          updated_at?: string
        }
        Update: {
          broker_id?: string | null
          broker_user_id?: string
          client_state?: string
          created_at?: string
          expiration_datetime?: string
          id?: string
          last_notification_at?: string | null
          last_renewed_at?: string | null
          ms_subscription_id?: string
          notification_url?: string
          resource?: string
          updated_at?: string
        }
        Relationships: []
      }
      planipret_ava_notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          data: Json
          deep_link: string | null
          delivered: boolean
          id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category?: string
          created_at?: string
          data?: Json
          deep_link?: string | null
          delivered?: boolean
          id?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          data?: Json
          deep_link?: string | null
          delivered?: boolean
          id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      planipret_ava_prompt_versions: {
        Row: {
          active: boolean
          broker_user_id: string
          generated_at: string
          id: string
          preferences_text: string
          sample_size: number
          version: number
        }
        Insert: {
          active?: boolean
          broker_user_id: string
          generated_at?: string
          id?: string
          preferences_text: string
          sample_size?: number
          version?: number
        }
        Update: {
          active?: boolean
          broker_user_id?: string
          generated_at?: string
          id?: string
          preferences_text?: string
          sample_size?: number
          version?: number
        }
        Relationships: []
      }
      planipret_calendar_sync: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          last_sync_at: string
          m365_event_id: string | null
          maestro_event_id: string | null
          status: string
          sync_direction: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_sync_at?: string
          m365_event_id?: string | null
          maestro_event_id?: string | null
          status?: string
          sync_direction?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_sync_at?: string
          m365_event_id?: string | null
          maestro_event_id?: string | null
          status?: string
          sync_direction?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planipret_calendar_sync_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_call_consents: {
        Row: {
          call_id: string
          consent_given: boolean
          consent_timestamp: string
          created_at: string
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          call_id: string
          consent_given?: boolean
          consent_timestamp?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          call_id?: string
          consent_given?: boolean
          consent_timestamp?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planipret_call_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_call_sessions: {
        Row: {
          answered_at: string | null
          answered_by: string | null
          broker_id: string
          call_id: string
          created_at: string
          direction: string
          ended_at: string | null
          ended_reason: string | null
          id: string
          remote_number: string | null
          started_at: string
          state: string
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          answered_by?: string | null
          broker_id: string
          call_id: string
          created_at?: string
          direction: string
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          remote_number?: string | null
          started_at?: string
          state?: string
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          answered_by?: string | null
          broker_id?: string
          call_id?: string
          created_at?: string
          direction?: string
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          remote_number?: string | null
          started_at?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planipret_call_sessions_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_consent_settings: {
        Row: {
          consent_delay_seconds: number
          consent_message_en: string
          consent_message_fr: string
          domain: string
          id: string
          recording_consent_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          consent_delay_seconds?: number
          consent_message_en?: string
          consent_message_fr?: string
          domain?: string
          id?: string
          recording_consent_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          consent_delay_seconds?: number
          consent_message_en?: string
          consent_message_fr?: string
          domain?: string
          id?: string
          recording_consent_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planipret_consent_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_contacts: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          external_id: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          last_synced_at: string | null
          metadata: Json
          mobile: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          phone_display: string | null
          phone_normalized: string | null
          photo_url: string | null
          source: string | null
          tags: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          last_synced_at?: string | null
          metadata?: Json
          mobile?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          phone_display?: string | null
          phone_normalized?: string | null
          photo_url?: string | null
          source?: string | null
          tags?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          last_synced_at?: string | null
          metadata?: Json
          mobile?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          phone_display?: string | null
          phone_normalized?: string | null
          photo_url?: string | null
          source?: string | null
          tags?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      planipret_edge_function_runs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          function_name: string
          id: string
          started_at: string
          status: string
          summary: Json | null
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          function_name: string
          id?: string
          started_at?: string
          status?: string
          summary?: Json | null
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          function_name?: string
          id?: string
          started_at?: string
          status?: string
          summary?: Json | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      planipret_elevenlabs_config: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      planipret_integration_config: {
        Row: {
          config_data: Json
          created_at: string
          id: string
          integration_key: string
          is_configured: boolean
          is_enabled: boolean
          last_test_result: string | null
          last_test_success: boolean | null
          last_tested_at: string | null
          updated_at: string
        }
        Insert: {
          config_data?: Json
          created_at?: string
          id?: string
          integration_key: string
          is_configured?: boolean
          is_enabled?: boolean
          last_test_result?: string | null
          last_test_success?: boolean | null
          last_tested_at?: string | null
          updated_at?: string
        }
        Update: {
          config_data?: Json
          created_at?: string
          id?: string
          integration_key?: string
          is_configured?: boolean
          is_enabled?: boolean
          last_test_result?: string | null
          last_test_success?: boolean | null
          last_tested_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      planipret_integration_secrets: {
        Row: {
          config: Json
          created_at: string
          id: string
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      planipret_maestro_clients: {
        Row: {
          cached_at: string
          company: string | null
          created_at: string
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_contact_at: string | null
          last_name: string | null
          lead_score_avg: number | null
          maestro_client_id: string
          mortgage_stage: string | null
          phone_e164: string | null
          preferred_lang: string | null
          tags: Json
          total_calls: number
          user_id: string
        }
        Insert: {
          cached_at?: string
          company?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_contact_at?: string | null
          last_name?: string | null
          lead_score_avg?: number | null
          maestro_client_id: string
          mortgage_stage?: string | null
          phone_e164?: string | null
          preferred_lang?: string | null
          tags?: Json
          total_calls?: number
          user_id: string
        }
        Update: {
          cached_at?: string
          company?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_contact_at?: string | null
          last_name?: string | null
          lead_score_avg?: number | null
          maestro_client_id?: string
          mortgage_stage?: string | null
          phone_e164?: string | null
          preferred_lang?: string | null
          tags?: Json
          total_calls?: number
          user_id?: string
        }
        Relationships: []
      }
      planipret_maestro_sync_log: {
        Row: {
          action: string | null
          created_at: string
          duration_ms: number | null
          id: string
          maestro_endpoint: string | null
          request_body: Json | null
          response_body: Json | null
          response_status: number | null
          success: boolean | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          maestro_endpoint?: string | null
          request_body?: Json | null
          response_body?: Json | null
          response_status?: number | null
          success?: boolean | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          maestro_endpoint?: string | null
          request_body?: Json | null
          response_body?: Json | null
          response_status?: number | null
          success?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      planipret_ns_migration_log: {
        Row: {
          broker_id: string | null
          created_at: string
          id: string
          match_confidence: string | null
          match_status: string
          notes: string | null
          ns_email_from_api: string | null
          ns_extension: string | null
          portal_email: string | null
          reviewed: boolean
          updated_at: string
        }
        Insert: {
          broker_id?: string | null
          created_at?: string
          id?: string
          match_confidence?: string | null
          match_status: string
          notes?: string | null
          ns_email_from_api?: string | null
          ns_extension?: string | null
          portal_email?: string | null
          reviewed?: boolean
          updated_at?: string
        }
        Update: {
          broker_id?: string | null
          created_at?: string
          id?: string
          match_confidence?: string | null
          match_status?: string
          notes?: string | null
          ns_email_from_api?: string | null
          ns_extension?: string | null
          portal_email?: string | null
          reviewed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planipret_ns_migration_log_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_ns_request_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          full_url: string | null
          function_name: string
          id: string
          method: string
          ok: boolean | null
          path: string
          query_params: Json | null
          status: number | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          full_url?: string | null
          function_name: string
          id?: string
          method?: string
          ok?: boolean | null
          path: string
          query_params?: Json | null
          status?: number | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          full_url?: string | null
          function_name?: string
          id?: string
          method?: string
          ok?: boolean | null
          path?: string
          query_params?: Json | null
          status?: number | null
        }
        Relationships: []
      }
      planipret_ns_server_capabilities: {
        Row: {
          created_at: string
          detail: string | null
          domain: string
          endpoint: string | null
          feature: string
          id: string
          last_probed_at: string
          metadata: Json
          sample_count: number | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          domain: string
          endpoint?: string | null
          feature: string
          id?: string
          last_probed_at?: string
          metadata?: Json
          sample_count?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          domain?: string
          endpoint?: string | null
          feature?: string
          id?: string
          last_probed_at?: string
          metadata?: Json
          sample_count?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      planipret_phone_calls: {
        Row: {
          ai_analysis_json: Json | null
          ai_client_insights: Json | null
          ai_coaching: Json | null
          ai_key_points: Json | null
          ai_summary: string | null
          ai_summary_short: string | null
          analysis_in_progress: boolean | null
          analysis_locked_at: string | null
          analysis_locked_by: string | null
          analyzed_at: string | null
          answered_at: string | null
          callback_reason: string | null
          coaching_score: number | null
          created_at: string
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          extension: string | null
          from_name: string | null
          from_number: string | null
          has_recording: boolean | null
          has_transcript: boolean | null
          id: string
          lead_score: number | null
          lead_score_reason: string | null
          lead_temperature: string | null
          maestro_appointments_created: Json
          maestro_call_id: string | null
          maestro_client_company: string | null
          maestro_client_id: string | null
          maestro_client_name: string | null
          maestro_mortgage_stage: string | null
          maestro_synced: boolean
          maestro_tasks_created: Json
          metadata: Json
          next_actions: Json | null
          ns_call_id: string | null
          ns_callid: string | null
          ns_cdr_id: string | null
          ns_domain: string | null
          ns_orig_callid: string | null
          ns_recording_url: string | null
          ns_term_callid: string | null
          organization_id: string
          pipeline_completed_at: string | null
          pipeline_error: string | null
          pipeline_started_at: string | null
          pipeline_state: Json
          pipeline_step: string | null
          recording_url: string | null
          started_at: string | null
          status: string | null
          suggested_callback_delay: string | null
          to_name: string | null
          to_number: string | null
          transcript: string | null
          transcript_confidence: number | null
          transcript_fetched_at: string | null
          transcript_language: string | null
          transcript_raw: string | null
          transcript_segments: Json | null
          transcript_source: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ai_analysis_json?: Json | null
          ai_client_insights?: Json | null
          ai_coaching?: Json | null
          ai_key_points?: Json | null
          ai_summary?: string | null
          ai_summary_short?: string | null
          analysis_in_progress?: boolean | null
          analysis_locked_at?: string | null
          analysis_locked_by?: string | null
          analyzed_at?: string | null
          answered_at?: string | null
          callback_reason?: string | null
          coaching_score?: number | null
          created_at?: string
          direction: string
          duration_seconds?: number | null
          ended_at?: string | null
          extension?: string | null
          from_name?: string | null
          from_number?: string | null
          has_recording?: boolean | null
          has_transcript?: boolean | null
          id?: string
          lead_score?: number | null
          lead_score_reason?: string | null
          lead_temperature?: string | null
          maestro_appointments_created?: Json
          maestro_call_id?: string | null
          maestro_client_company?: string | null
          maestro_client_id?: string | null
          maestro_client_name?: string | null
          maestro_mortgage_stage?: string | null
          maestro_synced?: boolean
          maestro_tasks_created?: Json
          metadata?: Json
          next_actions?: Json | null
          ns_call_id?: string | null
          ns_callid?: string | null
          ns_cdr_id?: string | null
          ns_domain?: string | null
          ns_orig_callid?: string | null
          ns_recording_url?: string | null
          ns_term_callid?: string | null
          organization_id?: string
          pipeline_completed_at?: string | null
          pipeline_error?: string | null
          pipeline_started_at?: string | null
          pipeline_state?: Json
          pipeline_step?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          suggested_callback_delay?: string | null
          to_name?: string | null
          to_number?: string | null
          transcript?: string | null
          transcript_confidence?: number | null
          transcript_fetched_at?: string | null
          transcript_language?: string | null
          transcript_raw?: string | null
          transcript_segments?: Json | null
          transcript_source?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ai_analysis_json?: Json | null
          ai_client_insights?: Json | null
          ai_coaching?: Json | null
          ai_key_points?: Json | null
          ai_summary?: string | null
          ai_summary_short?: string | null
          analysis_in_progress?: boolean | null
          analysis_locked_at?: string | null
          analysis_locked_by?: string | null
          analyzed_at?: string | null
          answered_at?: string | null
          callback_reason?: string | null
          coaching_score?: number | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          extension?: string | null
          from_name?: string | null
          from_number?: string | null
          has_recording?: boolean | null
          has_transcript?: boolean | null
          id?: string
          lead_score?: number | null
          lead_score_reason?: string | null
          lead_temperature?: string | null
          maestro_appointments_created?: Json
          maestro_call_id?: string | null
          maestro_client_company?: string | null
          maestro_client_id?: string | null
          maestro_client_name?: string | null
          maestro_mortgage_stage?: string | null
          maestro_synced?: boolean
          maestro_tasks_created?: Json
          metadata?: Json
          next_actions?: Json | null
          ns_call_id?: string | null
          ns_callid?: string | null
          ns_cdr_id?: string | null
          ns_domain?: string | null
          ns_orig_callid?: string | null
          ns_recording_url?: string | null
          ns_term_callid?: string | null
          organization_id?: string
          pipeline_completed_at?: string | null
          pipeline_error?: string | null
          pipeline_started_at?: string | null
          pipeline_state?: Json
          pipeline_step?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          suggested_callback_delay?: string | null
          to_name?: string | null
          to_number?: string | null
          transcript?: string | null
          transcript_confidence?: number | null
          transcript_fetched_at?: string | null
          transcript_language?: string | null
          transcript_raw?: string | null
          transcript_segments?: Json | null
          transcript_source?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_phone_calls_profile"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_phone_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          from_number: string | null
          id: string
          media_urls: Json
          metadata: Json
          ns_message_id: string | null
          organization_id: string
          read_at: string | null
          sent_at: string | null
          status: string | null
          thread_id: string | null
          to_number: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction: string
          from_number?: string | null
          id?: string
          media_urls?: Json
          metadata?: Json
          ns_message_id?: string | null
          organization_id?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
          thread_id?: string | null
          to_number?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          from_number?: string | null
          id?: string
          media_urls?: Json
          metadata?: Json
          ns_message_id?: string | null
          organization_id?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
          thread_id?: string | null
          to_number?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_phone_messages_profile"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_pipeline: {
        Row: {
          contact_name: string
          contact_number: string | null
          created_at: string
          id: string
          last_call_id: string | null
          maestro_contact_id: string | null
          next_reminder_at: string | null
          notes: string | null
          stage: string
          updated_at: string
          user_id: string
          value_estimate: number | null
        }
        Insert: {
          contact_name: string
          contact_number?: string | null
          created_at?: string
          id?: string
          last_call_id?: string | null
          maestro_contact_id?: string | null
          next_reminder_at?: string | null
          notes?: string | null
          stage?: string
          updated_at?: string
          user_id: string
          value_estimate?: number | null
        }
        Update: {
          contact_name?: string
          contact_number?: string | null
          created_at?: string
          id?: string
          last_call_id?: string | null
          maestro_contact_id?: string | null
          next_reminder_at?: string | null
          notes?: string | null
          stage?: string
          updated_at?: string
          user_id?: string
          value_estimate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "planipret_pipeline_last_call_id_fkey"
            columns: ["last_call_id"]
            isOneToOne: false
            referencedRelation: "planipret_phone_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planipret_pipeline_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_pipeline_logs: {
        Row: {
          call_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          payload: Json | null
          status: string
          step: string
          user_id: string | null
        }
        Insert: {
          call_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          status: string
          step: string
          user_id?: string | null
        }
        Update: {
          call_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          status?: string
          step?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planipret_pipeline_logs_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "planipret_phone_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_profiles: {
        Row: {
          auth_method: string | null
          ava_autonomy_mode: string
          ava_last_session_at: string | null
          ava_learned_preferences: string | null
          ava_learned_updated_at: string | null
          ava_preferred_lang: string
          ava_sessions_count: number
          avatar_url: string | null
          created_at: string
          dnd_auto_schedule: boolean
          dnd_enabled: boolean
          dnd_end_time: string
          dnd_message_fr: string
          dnd_start_time: string
          elevenlabs_agent_id: string | null
          elevenlabs_agent_status: string | null
          elevenlabs_last_session: string | null
          elevenlabs_session_count: number | null
          email: string | null
          extension: string | null
          first_login_at: string | null
          full_name: string | null
          id: string
          language: string
          last_eod_summary_at: string | null
          last_morning_brief_at: string | null
          login_email: string | null
          maestro_broker_id: string | null
          maestro_broker_token: string | null
          maestro_connected: boolean
          maestro_last_sync_at: string | null
          maestro_token_expires_at: string | null
          metadata: Json
          mobile_app_enabled: boolean
          ms365_access_token: string | null
          ms365_display_name: string | null
          ms365_email: string | null
          ms365_refresh_token: string | null
          ms365_scopes: string | null
          ms365_token_expiry: string | null
          notif_ai: boolean
          notif_appointment_reminder: boolean
          notif_calls: boolean
          notif_eod_summary: boolean
          notif_hot_leads: boolean
          notif_missed_call: boolean
          notif_morning_brief: boolean
          notif_reminders: boolean
          notif_sms: boolean
          notif_voicemails: boolean
          ns_domain: string | null
          ns_extension: string | null
          ns_jwt: string | null
          ns_jwt_expires_at: string | null
          ns_link_method: string | null
          ns_linked: boolean
          ns_linked_at: string | null
          ns_mobile_device_id: string | null
          ns_refresh_token: string | null
          ns_sip_password_ref: string | null
          ns_sip_password_ref_mobile: string | null
          ns_sip_username: string | null
          ns_user_id: string | null
          ns_widget_device_id: string | null
          onboarding_completed: boolean
          onboarding_email_sent_at: string | null
          onboarding_step: number
          organization_id: string
          phone: string | null
          privacy_accepted_at: string | null
          privacy_version: string | null
          recording_consent: boolean
          role: string
          sip_domain: string | null
          sip_password: string | null
          sip_proxy: string | null
          sip_username: string | null
          status: string
          updated_at: string
          user_id: string | null
          voice_agent_enabled: boolean
          voicemail_greeting_active: boolean
          voicemail_greeting_audio_url: string | null
          voicemail_greeting_text: string | null
          voicemail_greeting_updated_at: string | null
          voicemail_greeting_voice_id: string | null
          widget_enabled: boolean
        }
        Insert: {
          auth_method?: string | null
          ava_autonomy_mode?: string
          ava_last_session_at?: string | null
          ava_learned_preferences?: string | null
          ava_learned_updated_at?: string | null
          ava_preferred_lang?: string
          ava_sessions_count?: number
          avatar_url?: string | null
          created_at?: string
          dnd_auto_schedule?: boolean
          dnd_enabled?: boolean
          dnd_end_time?: string
          dnd_message_fr?: string
          dnd_start_time?: string
          elevenlabs_agent_id?: string | null
          elevenlabs_agent_status?: string | null
          elevenlabs_last_session?: string | null
          elevenlabs_session_count?: number | null
          email?: string | null
          extension?: string | null
          first_login_at?: string | null
          full_name?: string | null
          id?: string
          language?: string
          last_eod_summary_at?: string | null
          last_morning_brief_at?: string | null
          login_email?: string | null
          maestro_broker_id?: string | null
          maestro_broker_token?: string | null
          maestro_connected?: boolean
          maestro_last_sync_at?: string | null
          maestro_token_expires_at?: string | null
          metadata?: Json
          mobile_app_enabled?: boolean
          ms365_access_token?: string | null
          ms365_display_name?: string | null
          ms365_email?: string | null
          ms365_refresh_token?: string | null
          ms365_scopes?: string | null
          ms365_token_expiry?: string | null
          notif_ai?: boolean
          notif_appointment_reminder?: boolean
          notif_calls?: boolean
          notif_eod_summary?: boolean
          notif_hot_leads?: boolean
          notif_missed_call?: boolean
          notif_morning_brief?: boolean
          notif_reminders?: boolean
          notif_sms?: boolean
          notif_voicemails?: boolean
          ns_domain?: string | null
          ns_extension?: string | null
          ns_jwt?: string | null
          ns_jwt_expires_at?: string | null
          ns_link_method?: string | null
          ns_linked?: boolean
          ns_linked_at?: string | null
          ns_mobile_device_id?: string | null
          ns_refresh_token?: string | null
          ns_sip_password_ref?: string | null
          ns_sip_password_ref_mobile?: string | null
          ns_sip_username?: string | null
          ns_user_id?: string | null
          ns_widget_device_id?: string | null
          onboarding_completed?: boolean
          onboarding_email_sent_at?: string | null
          onboarding_step?: number
          organization_id?: string
          phone?: string | null
          privacy_accepted_at?: string | null
          privacy_version?: string | null
          recording_consent?: boolean
          role?: string
          sip_domain?: string | null
          sip_password?: string | null
          sip_proxy?: string | null
          sip_username?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          voice_agent_enabled?: boolean
          voicemail_greeting_active?: boolean
          voicemail_greeting_audio_url?: string | null
          voicemail_greeting_text?: string | null
          voicemail_greeting_updated_at?: string | null
          voicemail_greeting_voice_id?: string | null
          widget_enabled?: boolean
        }
        Update: {
          auth_method?: string | null
          ava_autonomy_mode?: string
          ava_last_session_at?: string | null
          ava_learned_preferences?: string | null
          ava_learned_updated_at?: string | null
          ava_preferred_lang?: string
          ava_sessions_count?: number
          avatar_url?: string | null
          created_at?: string
          dnd_auto_schedule?: boolean
          dnd_enabled?: boolean
          dnd_end_time?: string
          dnd_message_fr?: string
          dnd_start_time?: string
          elevenlabs_agent_id?: string | null
          elevenlabs_agent_status?: string | null
          elevenlabs_last_session?: string | null
          elevenlabs_session_count?: number | null
          email?: string | null
          extension?: string | null
          first_login_at?: string | null
          full_name?: string | null
          id?: string
          language?: string
          last_eod_summary_at?: string | null
          last_morning_brief_at?: string | null
          login_email?: string | null
          maestro_broker_id?: string | null
          maestro_broker_token?: string | null
          maestro_connected?: boolean
          maestro_last_sync_at?: string | null
          maestro_token_expires_at?: string | null
          metadata?: Json
          mobile_app_enabled?: boolean
          ms365_access_token?: string | null
          ms365_display_name?: string | null
          ms365_email?: string | null
          ms365_refresh_token?: string | null
          ms365_scopes?: string | null
          ms365_token_expiry?: string | null
          notif_ai?: boolean
          notif_appointment_reminder?: boolean
          notif_calls?: boolean
          notif_eod_summary?: boolean
          notif_hot_leads?: boolean
          notif_missed_call?: boolean
          notif_morning_brief?: boolean
          notif_reminders?: boolean
          notif_sms?: boolean
          notif_voicemails?: boolean
          ns_domain?: string | null
          ns_extension?: string | null
          ns_jwt?: string | null
          ns_jwt_expires_at?: string | null
          ns_link_method?: string | null
          ns_linked?: boolean
          ns_linked_at?: string | null
          ns_mobile_device_id?: string | null
          ns_refresh_token?: string | null
          ns_sip_password_ref?: string | null
          ns_sip_password_ref_mobile?: string | null
          ns_sip_username?: string | null
          ns_user_id?: string | null
          ns_widget_device_id?: string | null
          onboarding_completed?: boolean
          onboarding_email_sent_at?: string | null
          onboarding_step?: number
          organization_id?: string
          phone?: string | null
          privacy_accepted_at?: string | null
          privacy_version?: string | null
          recording_consent?: boolean
          role?: string
          sip_domain?: string | null
          sip_password?: string | null
          sip_proxy?: string | null
          sip_username?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          voice_agent_enabled?: boolean
          voicemail_greeting_active?: boolean
          voicemail_greeting_audio_url?: string | null
          voicemail_greeting_text?: string | null
          voicemail_greeting_updated_at?: string | null
          voicemail_greeting_voice_id?: string | null
          widget_enabled?: boolean
        }
        Relationships: []
      }
      planipret_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planipret_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_reminders: {
        Row: {
          ai_suggested: boolean
          call_id: string | null
          contact_name: string | null
          contact_number: string | null
          created_at: string
          id: string
          note: string | null
          reminder_type: string
          scheduled_at: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_suggested?: boolean
          call_id?: string | null
          contact_name?: string | null
          contact_number?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reminder_type?: string
          scheduled_at: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_suggested?: boolean
          call_id?: string | null
          contact_name?: string | null
          contact_number?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reminder_type?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planipret_reminders_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "planipret_phone_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planipret_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_retention_policy: {
        Row: {
          ai_insights_retention_days: number
          audit_logs_retention_days: number
          calls_retention_days: number
          id: string
          last_run_at: string | null
          messages_retention_days: number
          recordings_retention_days: number
          transcripts_retention_days: number
          updated_at: string
          updated_by: string | null
          voicemails_retention_days: number
        }
        Insert: {
          ai_insights_retention_days?: number
          audit_logs_retention_days?: number
          calls_retention_days?: number
          id?: string
          last_run_at?: string | null
          messages_retention_days?: number
          recordings_retention_days?: number
          transcripts_retention_days?: number
          updated_at?: string
          updated_by?: string | null
          voicemails_retention_days?: number
        }
        Update: {
          ai_insights_retention_days?: number
          audit_logs_retention_days?: number
          calls_retention_days?: number
          id?: string
          last_run_at?: string | null
          messages_retention_days?: number
          recordings_retention_days?: number
          transcripts_retention_days?: number
          updated_at?: string
          updated_by?: string | null
          voicemails_retention_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "planipret_retention_policy_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_settings: {
        Row: {
          created_at: string
          id: string
          language: string | null
          m365_connected: boolean
          maestro_connected: boolean
          manual_checklist_state: Json
          max_concurrent_sessions: number
          notifications_enabled: boolean
          organization_id: string
          preferences: Json
          ringtone: string | null
          session_timeout_enabled: boolean
          session_timeout_minutes: number
          theme: string | null
          updated_at: string
          user_id: string
          voice_agent_lang: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string | null
          m365_connected?: boolean
          maestro_connected?: boolean
          manual_checklist_state?: Json
          max_concurrent_sessions?: number
          notifications_enabled?: boolean
          organization_id?: string
          preferences?: Json
          ringtone?: string | null
          session_timeout_enabled?: boolean
          session_timeout_minutes?: number
          theme?: string | null
          updated_at?: string
          user_id: string
          voice_agent_lang?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          language?: string | null
          m365_connected?: boolean
          maestro_connected?: boolean
          manual_checklist_state?: Json
          max_concurrent_sessions?: number
          notifications_enabled?: boolean
          organization_id?: string
          preferences?: Json
          ringtone?: string | null
          session_timeout_enabled?: boolean
          session_timeout_minutes?: number
          theme?: string | null
          updated_at?: string
          user_id?: string
          voice_agent_lang?: string | null
        }
        Relationships: []
      }
      planipret_sms_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_shared: boolean
          title: string
          updated_at: string
          use_count: number
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_shared?: boolean
          title: string
          updated_at?: string
          use_count?: number
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_shared?: boolean
          title?: string
          updated_at?: string
          use_count?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planipret_sms_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_sync_progress: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          job_id: string
          kind: string
          message: string | null
          metadata: Json
          processed: number
          started_at: string
          status: string
          step: string | null
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          job_id: string
          kind: string
          message?: string | null
          metadata?: Json
          processed?: number
          started_at?: string
          status?: string
          step?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          job_id?: string
          kind?: string
          message?: string | null
          metadata?: Json
          processed?: number
          started_at?: string
          status?: string
          step?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      planipret_team_messages: {
        Row: {
          attachments: Json
          channel: string
          created_at: string
          id: string
          is_pinned: boolean
          message: string
          reactions: Json
          reply_to: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          attachments?: Json
          channel?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          message: string
          reactions?: Json
          reply_to?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          attachments?: Json
          channel?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          message?: string
          reactions?: Json
          reply_to?: string | null
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planipret_team_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "planipret_team_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planipret_team_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_voicemails: {
        Row: {
          audio_url: string | null
          created_at: string
          duration_seconds: number | null
          folder: string
          from_name: string | null
          from_number: string | null
          id: string
          is_read: boolean
          metadata: Json
          ns_vm_id: string | null
          organization_id: string
          received_at: string | null
          transcript: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          folder?: string
          from_name?: string | null
          from_number?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json
          ns_vm_id?: string | null
          organization_id?: string
          received_at?: string | null
          transcript?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          folder?: string
          from_name?: string | null
          from_number?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json
          ns_vm_id?: string | null
          organization_id?: string
          received_at?: string | null
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_voicemails_profile"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "planipret_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_branding: {
        Row: {
          client_portal_favicon_url: string | null
          client_portal_logo_url: string | null
          client_portal_primary_color: string | null
          client_portal_title: string | null
          created_at: string
          favicon_url: string | null
          id: string
          logo_url: string | null
          primary_color: string | null
          singleton: boolean
          updated_at: string
          updated_by: string | null
          website_title: string | null
        }
        Insert: {
          client_portal_favicon_url?: string | null
          client_portal_logo_url?: string | null
          client_portal_primary_color?: string | null
          client_portal_title?: string | null
          created_at?: string
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
          website_title?: string | null
        }
        Update: {
          client_portal_favicon_url?: string | null
          client_portal_logo_url?: string | null
          client_portal_primary_color?: string | null
          client_portal_title?: string | null
          created_at?: string
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
          website_title?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          deletion_requested_at: string | null
          email: string
          full_name: string | null
          id: string
          locale: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          email: string
          full_name?: string | null
          id: string
          locale?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          locale?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          created_at: string
          description: string | null
          first_message: string | null
          id: string
          is_default: boolean | null
          max_tokens: number | null
          name: string
          organization_id: string | null
          system_prompt: string
          tags: string[] | null
          temperature: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          first_message?: string | null
          id?: string
          is_default?: boolean | null
          max_tokens?: number | null
          name: string
          organization_id?: string | null
          system_prompt: string
          tags?: string[] | null
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          first_message?: string | null
          id?: string
          is_default?: boolean | null
          max_tokens?: number | null
          name?: string
          organization_id?: string | null
          system_prompt?: string
          tags?: string[] | null
          temperature?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_credentials_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          field_changed: string | null
          id: string
          ip: string | null
          metadata: Json | null
          organization_id: string | null
          provider: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          field_changed?: string | null
          id?: string
          ip?: string | null
          metadata?: Json | null
          organization_id?: string | null
          provider: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          field_changed?: string | null
          id?: string
          ip?: string | null
          metadata?: Json | null
          organization_id?: string | null
          provider?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      security_access_violations: {
        Row: {
          action: string
          attempted_org_id: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          occurred_at: string
          resource: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_org_ids: string[] | null
        }
        Insert: {
          action: string
          attempted_org_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          occurred_at?: string
          resource?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_org_ids?: string[] | null
        }
        Update: {
          action?: string
          attempted_org_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          occurred_at?: string
          resource?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_org_ids?: string[] | null
        }
        Relationships: []
      }
      security_audit_runs: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          results: Json
          run_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          results?: Json
          run_by: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          results?: Json
          run_by?: string
        }
        Relationships: []
      }
      sms_templates: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          updated_at: string
          variables: string[] | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          updated_at?: string
          variables?: string[] | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          updated_at?: string
          variables?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_exceptions: {
        Row: {
          created_at: string | null
          email: string
          id: string
          unlimited_clients: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          unlimited_clients?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          unlimited_clients?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      telecom_admin_ai_actions: {
        Row: {
          admin_user_id: string
          confirmation_status: string
          created_at: string
          executed_at: string | null
          execution_result_json: Json | null
          execution_status: string
          id: string
          interpreted_action: string | null
          organization_id: string
          prompt: string
          proposed_changes_json: Json
          source: string
        }
        Insert: {
          admin_user_id: string
          confirmation_status?: string
          created_at?: string
          executed_at?: string | null
          execution_result_json?: Json | null
          execution_status?: string
          id?: string
          interpreted_action?: string | null
          organization_id: string
          prompt: string
          proposed_changes_json?: Json
          source?: string
        }
        Update: {
          admin_user_id?: string
          confirmation_status?: string
          created_at?: string
          executed_at?: string | null
          execution_result_json?: Json | null
          execution_status?: string
          id?: string
          interpreted_action?: string | null
          organization_id?: string
          prompt?: string
          proposed_changes_json?: Json
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "telecom_admin_ai_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telecom_audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          ip_address: string | null
          organization_id: string
          reason: string | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          organization_id: string
          reason?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          organization_id?: string
          reason?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telecom_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telecom_live_calls: {
        Row: {
          answered_at: string | null
          caller_name: string | null
          caller_number: string | null
          channel_uuid: string | null
          created_at: string
          destination_number: string | null
          direction: string | null
          extension: string | null
          id: string
          last_event_at: string
          organization_id: string
          queue: string | null
          raw: Json | null
          sip_call_id: string | null
          started_at: string
          state: string | null
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          caller_name?: string | null
          caller_number?: string | null
          channel_uuid?: string | null
          created_at?: string
          destination_number?: string | null
          direction?: string | null
          extension?: string | null
          id?: string
          last_event_at?: string
          organization_id: string
          queue?: string | null
          raw?: Json | null
          sip_call_id?: string | null
          started_at?: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          caller_name?: string | null
          caller_number?: string | null
          channel_uuid?: string | null
          created_at?: string
          destination_number?: string | null
          direction?: string | null
          extension?: string | null
          id?: string
          last_event_at?: string
          organization_id?: string
          queue?: string | null
          raw?: Json | null
          sip_call_id?: string | null
          started_at?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telecom_live_calls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telecom_sync_health: {
        Row: {
          consecutive_failures: number | null
          id: string
          last_error: string | null
          last_error_at: string | null
          last_success_at: string | null
          metadata: Json | null
          organization_id: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          metadata?: Json | null
          organization_id?: string | null
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          metadata?: Json | null
          organization_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telecom_sync_health_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telecom_sync_jobs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          metadata: Json | null
          organization_id: string | null
          retries: number | null
          rows_in: number | null
          rows_out: number | null
          source: string
          started_at: string
          status: string
          target: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          retries?: number | null
          rows_in?: number | null
          rows_out?: number | null
          source: string
          started_at?: string
          status?: string
          target: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          retries?: number | null
          rows_in?: number | null
          rows_out?: number | null
          source?: string
          started_at?: string
          status?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "telecom_sync_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_aggregates: {
        Row: {
          avg_sentiment: number | null
          category: string | null
          created_at: string
          id: string
          last_mentioned_at: string
          organization_id: string
          topic: string
          total_mentions: number | null
          updated_at: string
        }
        Insert: {
          avg_sentiment?: number | null
          category?: string | null
          created_at?: string
          id?: string
          last_mentioned_at?: string
          organization_id: string
          topic: string
          total_mentions?: number | null
          updated_at?: string
        }
        Update: {
          avg_sentiment?: number | null
          category?: string | null
          created_at?: string
          id?: string
          last_mentioned_at?: string
          organization_id?: string
          topic?: string
          total_mentions?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_aggregates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      twilio_active_calls: {
        Row: {
          agent_id: string | null
          call_sid: string
          direction: string
          duration: number | null
          ended_at: string | null
          from_number: string
          id: string
          organization_id: string | null
          recording_sid: string | null
          recording_url: string | null
          started_at: string | null
          status: string
          to_number: string
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          call_sid: string
          direction?: string
          duration?: number | null
          ended_at?: string | null
          from_number: string
          id?: string
          organization_id?: string | null
          recording_sid?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string
          to_number: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          call_sid?: string
          direction?: string
          duration?: number | null
          ended_at?: string | null
          from_number?: string
          id?: string
          organization_id?: string | null
          recording_sid?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string
          to_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "twilio_active_calls_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "twilio_active_calls_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "twilio_active_calls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      two_factor_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          organization_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          organization_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: []
      }
      user_call_handling: {
        Row: {
          after_hours_action: Database["public"]["Enums"]["after_hours_action"]
          availability: Database["public"]["Enums"]["user_availability"]
          created_at: string
          forward_target: string | null
          id: string
          last_synced_at: string | null
          organization_id: string
          sync_error: string | null
          sync_status: Database["public"]["Enums"]["telecom_sync_status"]
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          after_hours_action?: Database["public"]["Enums"]["after_hours_action"]
          availability?: Database["public"]["Enums"]["user_availability"]
          created_at?: string
          forward_target?: string | null
          id?: string
          last_synced_at?: string | null
          organization_id: string
          sync_error?: string | null
          sync_status?: Database["public"]["Enums"]["telecom_sync_status"]
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          after_hours_action?: Database["public"]["Enums"]["after_hours_action"]
          availability?: Database["public"]["Enums"]["user_availability"]
          created_at?: string
          forward_target?: string | null
          id?: string
          last_synced_at?: string | null
          organization_id?: string
          sync_error?: string | null
          sync_status?: Database["public"]["Enums"]["telecom_sync_status"]
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          consent_type: string
          consented: boolean | null
          created_at: string | null
          id: string
          ip_address: string | null
          organization_id: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          consent_type: string
          consented?: boolean | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          consent_type?: string
          consented?: boolean | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_consents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_prefs: {
        Row: {
          email_dm: boolean
          email_mentions: boolean
          email_missed_call: boolean
          email_voicemail: boolean
          inapp_mentions: boolean
          prefs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          email_dm?: boolean
          email_mentions?: boolean
          email_missed_call?: boolean
          email_voicemail?: boolean
          inapp_mentions?: boolean
          prefs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          email_dm?: boolean
          email_mentions?: boolean
          email_missed_call?: boolean
          email_voicemail?: boolean
          inapp_mentions?: boolean
          prefs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          call_state: string
          extension: string | null
          last_seen_at: string
          organization_id: string | null
          platform: string | null
          return_at: string | null
          status: string
          status_emoji: string | null
          status_message: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          call_state?: string
          extension?: string | null
          last_seen_at?: string
          organization_id?: string | null
          platform?: string | null
          return_at?: string | null
          status?: string
          status_emoji?: string | null
          status_message?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          call_state?: string
          extension?: string | null
          last_seen_at?: string
          organization_id?: string | null
          platform?: string | null
          return_at?: string | null
          status?: string
          status_emoji?: string | null
          status_message?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_working_hours: {
        Row: {
          break_end: string | null
          break_start: string | null
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_working_day: boolean
          organization_id: string
          start_time: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string
          day_of_week: number
          end_time?: string
          id?: string
          is_working_day?: boolean
          organization_id: string
          start_time?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_working_day?: boolean
          organization_id?: string
          start_time?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_agent_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          client_id: string | null
          id: string
          organization_id: string
          phone_client_id: string | null
          source: string
          voice_agent_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          client_id?: string | null
          id?: string
          organization_id: string
          phone_client_id?: string | null
          source: string
          voice_agent_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          client_id?: string | null
          id?: string
          organization_id?: string
          phone_client_id?: string | null
          source?: string
          voice_agent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_agent_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "voice_agent_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_agent_assignments_phone_client_id_fkey"
            columns: ["phone_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_agent_assignments_phone_client_id_fkey"
            columns: ["phone_client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_agent_bindings: {
        Row: {
          active: boolean
          after_hours_only: boolean
          binding_type: Database["public"]["Enums"]["voice_agent_binding_type"]
          business_hours_id: string | null
          client_id: string | null
          config: Json | null
          created_at: string
          id: string
          last_synced_at: string | null
          organization_id: string
          pbx_dialplan_uuid: string | null
          priority: number
          target_ref: string
          updated_at: string
          voice_agent_id: string
        }
        Insert: {
          active?: boolean
          after_hours_only?: boolean
          binding_type: Database["public"]["Enums"]["voice_agent_binding_type"]
          business_hours_id?: string | null
          client_id?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          organization_id: string
          pbx_dialplan_uuid?: string | null
          priority?: number
          target_ref: string
          updated_at?: string
          voice_agent_id: string
        }
        Update: {
          active?: boolean
          after_hours_only?: boolean
          binding_type?: Database["public"]["Enums"]["voice_agent_binding_type"]
          business_hours_id?: string | null
          client_id?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          organization_id?: string
          pbx_dialplan_uuid?: string | null
          priority?: number
          target_ref?: string
          updated_at?: string
          voice_agent_id?: string
        }
        Relationships: []
      }
      voice_agent_clients: {
        Row: {
          company: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      voice_agent_conversations: {
        Row: {
          audio_url: string | null
          callee_number: string | null
          caller_number: string | null
          conversation_id: string
          created_at: string
          duration_seconds: number | null
          elevenlabs_agent_id: string | null
          ended_at: string | null
          ended_reason: string | null
          has_audio: boolean
          id: string
          metadata: Json | null
          organization_id: string
          started_at: string | null
          status: string | null
          updated_at: string
          voice_agent_id: string | null
        }
        Insert: {
          audio_url?: string | null
          callee_number?: string | null
          caller_number?: string | null
          conversation_id: string
          created_at?: string
          duration_seconds?: number | null
          elevenlabs_agent_id?: string | null
          ended_at?: string | null
          ended_reason?: string | null
          has_audio?: boolean
          id?: string
          metadata?: Json | null
          organization_id: string
          started_at?: string | null
          status?: string | null
          updated_at?: string
          voice_agent_id?: string | null
        }
        Update: {
          audio_url?: string | null
          callee_number?: string | null
          caller_number?: string | null
          conversation_id?: string
          created_at?: string
          duration_seconds?: number | null
          elevenlabs_agent_id?: string | null
          ended_at?: string | null
          ended_reason?: string | null
          has_audio?: boolean
          id?: string
          metadata?: Json | null
          organization_id?: string
          started_at?: string | null
          status?: string | null
          updated_at?: string
          voice_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_agent_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_agent_conversations_voice_agent_id_fkey"
            columns: ["voice_agent_id"]
            isOneToOne: false
            referencedRelation: "lemtel_voice_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_agent_gateway_routes: {
        Row: {
          agent_id: string | null
          auto_bound: boolean
          created_at: string
          did_e164: string
          direction: string
          elevenlabs_phone_id: string | null
          id: string
          manual_override: boolean
          metadata: Json
          organization_id: string
          pbx_gateway_uuid: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          auto_bound?: boolean
          created_at?: string
          did_e164: string
          direction?: string
          elevenlabs_phone_id?: string | null
          id?: string
          manual_override?: boolean
          metadata?: Json
          organization_id: string
          pbx_gateway_uuid?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          auto_bound?: boolean
          created_at?: string
          did_e164?: string
          direction?: string
          elevenlabs_phone_id?: string | null
          id?: string
          manual_override?: boolean
          metadata?: Json
          organization_id?: string
          pbx_gateway_uuid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_agent_gateway_routes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_agent_gateway_routes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_agent_gateway_routes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_agent_transcripts: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          message: string
          metadata: Json | null
          organization_id: string
          sequence: number
          speaker: string | null
          timestamp_seconds: number | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          organization_id: string
          sequence?: number
          speaker?: string | null
          timestamp_seconds?: number | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          organization_id?: string
          sequence?: number
          speaker?: string | null
          timestamp_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_agent_transcripts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "voice_agent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_agent_transcripts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_delivery_logs: {
        Row: {
          attempt_count: number | null
          created_at: string | null
          delivered_at: string | null
          endpoint_id: string | null
          event_type: string
          id: string
          payload: Json
          response_body: string | null
          response_status: number | null
        }
        Insert: {
          attempt_count?: number | null
          created_at?: string | null
          delivered_at?: string | null
          endpoint_id?: string | null
          event_type: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
        }
        Update: {
          attempt_count?: number | null
          created_at?: string | null
          delivered_at?: string | null
          endpoint_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_delivery_logs_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          created_at: string | null
          events: string[] | null
          id: string
          is_active: boolean | null
          organization_id: string | null
          secret: string
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          events?: string[] | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          secret: string
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          events?: string[] | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          secret?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          connector: string
          created_at: string
          event_type: string
          id: string
          organization_id: string
          payload: Json
          processed: boolean | null
          signature: string | null
        }
        Insert: {
          connector: string
          created_at?: string
          event_type: string
          id?: string
          organization_id: string
          payload?: Json
          processed?: boolean | null
          signature?: string | null
        }
        Update: {
          connector?: string
          created_at?: string
          event_type?: string
          id?: string
          organization_id?: string
          payload?: Json
          processed?: boolean | null
          signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          app_name: string
          config: Json | null
          id: string
          installed_at: string | null
          is_active: boolean | null
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          app_name: string
          config?: Json | null
          id?: string
          installed_at?: string | null
          is_active?: boolean | null
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          app_name?: string
          config?: Json | null
          id?: string
          installed_at?: string | null
          is_active?: boolean | null
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      agents_safe: {
        Row: {
          assigned_to: string | null
          avatar_url: string | null
          branding_url: string | null
          client_id: string | null
          config: Json | null
          created_at: string | null
          description: string | null
          id: string | null
          is_external: boolean | null
          name: string | null
          organization_id: string | null
          platform: string | null
          platform_agent_id: string | null
          slug: string | null
          theme_config: Json | null
          twilio_number: string | null
          updated_at: string | null
          widget_layout: string | null
        }
        Insert: {
          assigned_to?: string | null
          avatar_url?: string | null
          branding_url?: string | null
          client_id?: string | null
          config?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_external?: boolean | null
          name?: string | null
          organization_id?: string | null
          platform?: string | null
          platform_agent_id?: string | null
          slug?: string | null
          theme_config?: Json | null
          twilio_number?: string | null
          updated_at?: string | null
          widget_layout?: string | null
        }
        Update: {
          assigned_to?: string | null
          avatar_url?: string | null
          branding_url?: string | null
          client_id?: string | null
          config?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_external?: boolean | null
          name?: string | null
          organization_id?: string | null
          platform?: string | null
          platform_agent_id?: string | null
          slug?: string | null
          theme_config?: Json | null
          twilio_number?: string | null
          updated_at?: string | null
          widget_layout?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_integrations_safe: {
        Row: {
          calendar_id: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          is_token_valid: boolean | null
          organization_id: string | null
          provider: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          calendar_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          is_token_valid?: never
          organization_id?: string | null
          provider?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          calendar_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          is_token_valid?: never
          organization_id?: string | null
          provider?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_intel_failure_reasons: {
        Row: {
          count: number | null
          day: string | null
          error: string | null
          organization_id: string | null
          pipeline: string | null
        }
        Relationships: []
      }
      call_intel_pipeline_stats: {
        Row: {
          count: number | null
          day: string | null
          organization_id: string | null
          status: string | null
        }
        Relationships: []
      }
      client_members_safe: {
        Row: {
          client_id: string | null
          created_at: string | null
          email: string | null
          has_password: boolean | null
          id: string | null
          last_login_at: string | null
          login_id: string | null
          name: string | null
          role: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      clients_safe: {
        Row: {
          access_controls: Json | null
          assigned_agent_id: string | null
          assigned_agents: number | null
          created_at: string | null
          created_by: string | null
          custom_css: string | null
          email: string | null
          has_password: boolean | null
          id: string | null
          language: string | null
          login_id: string | null
          name: string | null
          organization_id: string | null
          status: string | null
          theme: string | null
          updated_at: string | null
          user_id: string | null
          username: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lemtel_config_safe: {
        Row: {
          id: string | null
          is_secret: boolean | null
          key: string | null
          updated_at: string | null
          value: string | null
        }
        Insert: {
          id?: string | null
          is_secret?: boolean | null
          key?: string | null
          updated_at?: string | null
          value?: never
        }
        Update: {
          id?: string | null
          is_secret?: boolean | null
          key?: string | null
          updated_at?: string | null
          value?: never
        }
        Relationships: []
      }
      organization_integrations_safe: {
        Row: {
          additional_config: Json | null
          agent_id: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          last_tested_at: string | null
          organization_id: string | null
          platform: string | null
          test_error: string | null
          test_status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          additional_config?: Json | null
          agent_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          last_tested_at?: string | null
          organization_id?: string | null
          platform?: string | null
          test_error?: string | null
          test_status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          additional_config?: Json | null
          agent_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          last_tested_at?: string | null
          organization_id?: string | null
          platform?: string | null
          test_error?: string | null
          test_status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_destinations_real: {
        Row: {
          caller_id_name: string | null
          caller_id_number: string | null
          created_at: string | null
          description: string | null
          destination_action: string | null
          destination_app: string | null
          destination_number: string | null
          destination_prefix: string | null
          destination_type: string | null
          domain_uuid: string | null
          enabled: boolean | null
          id: string | null
          is_demo: boolean | null
          last_pbx_seen_at: string | null
          last_synced_at: string | null
          organization_id: string | null
          pbx_etag: string | null
          pbx_uuid: string | null
          source: string | null
          sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          caller_id_name?: string | null
          caller_id_number?: string | null
          created_at?: string | null
          description?: string | null
          destination_action?: string | null
          destination_app?: string | null
          destination_number?: string | null
          destination_prefix?: string | null
          destination_type?: string | null
          domain_uuid?: string | null
          enabled?: boolean | null
          id?: string | null
          is_demo?: boolean | null
          last_pbx_seen_at?: string | null
          last_synced_at?: string | null
          organization_id?: string | null
          pbx_etag?: string | null
          pbx_uuid?: string | null
          source?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          caller_id_name?: string | null
          caller_id_number?: string | null
          created_at?: string | null
          description?: string | null
          destination_action?: string | null
          destination_app?: string | null
          destination_number?: string | null
          destination_prefix?: string | null
          destination_type?: string | null
          domain_uuid?: string | null
          enabled?: boolean | null
          id?: string | null
          is_demo?: boolean | null
          last_pbx_seen_at?: string | null
          last_synced_at?: string | null
          organization_id?: string | null
          pbx_etag?: string | null
          pbx_uuid?: string | null
          source?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pbx_devices_real: {
        Row: {
          assigned_extension_id: string | null
          client_id: string | null
          created_at: string | null
          domain_uuid: string | null
          enabled: boolean | null
          id: string | null
          is_demo: boolean | null
          label: string | null
          last_pbx_seen_at: string | null
          last_seen_at: string | null
          mac_address: string | null
          organization_id: string | null
          pbx_uuid: string | null
          profile: string | null
          raw_data: Json | null
          registration_status: string | null
          source: string | null
          sync_status: string | null
          template: string | null
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          assigned_extension_id?: string | null
          client_id?: string | null
          created_at?: string | null
          domain_uuid?: string | null
          enabled?: boolean | null
          id?: string | null
          is_demo?: boolean | null
          label?: string | null
          last_pbx_seen_at?: string | null
          last_seen_at?: string | null
          mac_address?: string | null
          organization_id?: string | null
          pbx_uuid?: string | null
          profile?: string | null
          raw_data?: Json | null
          registration_status?: string | null
          source?: string | null
          sync_status?: string | null
          template?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          assigned_extension_id?: string | null
          client_id?: string | null
          created_at?: string | null
          domain_uuid?: string | null
          enabled?: boolean | null
          id?: string | null
          is_demo?: boolean | null
          label?: string | null
          last_pbx_seen_at?: string | null
          last_seen_at?: string | null
          mac_address?: string | null
          organization_id?: string | null
          pbx_uuid?: string | null
          profile?: string | null
          raw_data?: Json | null
          registration_status?: string | null
          source?: string | null
          sync_status?: string | null
          template?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_devices_assigned_extension_id_fkey"
            columns: ["assigned_extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_assigned_extension_id_fkey"
            columns: ["assigned_extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_assigned_extension_id_fkey"
            columns: ["assigned_extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_real"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_assigned_extension_id_fkey"
            columns: ["assigned_extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_assigned_extension_id_fkey"
            columns: ["assigned_extension_id"]
            isOneToOne: false
            referencedRelation: "telecom_extensions_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_devices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_extensions_directory: {
        Row: {
          description: string | null
          display_name: string | null
          domain_uuid: string | null
          enabled: boolean | null
          extension: string | null
          extension_type: string | null
          id: string | null
          last_pbx_seen_at: string | null
          organization_id: string | null
          portal_user_id: string | null
        }
        Insert: {
          description?: string | null
          display_name?: string | null
          domain_uuid?: string | null
          enabled?: boolean | null
          extension?: string | null
          extension_type?: string | null
          id?: string | null
          last_pbx_seen_at?: string | null
          organization_id?: string | null
          portal_user_id?: string | null
        }
        Update: {
          description?: string | null
          display_name?: string | null
          domain_uuid?: string | null
          enabled?: boolean | null
          extension?: string | null
          extension_type?: string | null
          id?: string | null
          last_pbx_seen_at?: string | null
          organization_id?: string | null
          portal_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_extensions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_extensions_real: {
        Row: {
          absolute_codec_string: string | null
          accountcode: string | null
          assigned_user_ids: string[] | null
          auth_acl: string | null
          call_group: string | null
          call_recording: string | null
          call_screen: boolean | null
          call_timeout: number | null
          cidr: string | null
          client_id: string | null
          created_at: string | null
          description: string | null
          device_lines: Json | null
          directory_exten_visible: boolean | null
          directory_first_name: string | null
          directory_last_name: string | null
          directory_visible: boolean | null
          do_not_disturb: boolean | null
          domain_uuid: string | null
          effective_cid_name: string | null
          effective_cid_number: string | null
          emergency_cid_name: string | null
          emergency_cid_number: string | null
          enabled: boolean | null
          extension: string | null
          extension_dialect: string | null
          extension_language: string | null
          extension_type: string | null
          extension_voice: string | null
          force_ping: boolean | null
          forward_all_destination: string | null
          forward_all_enabled: boolean | null
          forward_busy_destination: string | null
          forward_busy_enabled: boolean | null
          forward_no_answer_destination: string | null
          forward_no_answer_enabled: boolean | null
          forward_user_not_registered_destination: string | null
          forward_user_not_registered_enabled: boolean | null
          hold_music: string | null
          id: string | null
          is_demo: boolean | null
          last_pbx_seen_at: string | null
          limit_destination: string | null
          limit_max: string | null
          max_registrations: number | null
          missed_call_app: string | null
          missed_call_data: string | null
          org_id: string | null
          organization_id: string | null
          outbound_cid_name: string | null
          outbound_cid_number: string | null
          password: string | null
          pbx_uuid: string | null
          portal_user_id: string | null
          raw_data: Json | null
          sip_bypass_media: string | null
          sip_force_contact: string | null
          sip_force_expires: number | null
          source: string | null
          sync_status: string | null
          synced_at: string | null
          toll_allow: string | null
          updated_at: string | null
          user_record: string | null
          voicemail_custom_prompt: boolean | null
          voicemail_enabled: boolean | null
          voicemail_file: string | null
          voicemail_keep_local: boolean | null
          voicemail_mail_to: string | null
          voicemail_password: string | null
          voicemail_transcription: boolean | null
        }
        Insert: {
          absolute_codec_string?: string | null
          accountcode?: string | null
          assigned_user_ids?: string[] | null
          auth_acl?: string | null
          call_group?: string | null
          call_recording?: string | null
          call_screen?: boolean | null
          call_timeout?: number | null
          cidr?: string | null
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          device_lines?: Json | null
          directory_exten_visible?: boolean | null
          directory_first_name?: string | null
          directory_last_name?: string | null
          directory_visible?: boolean | null
          do_not_disturb?: boolean | null
          domain_uuid?: string | null
          effective_cid_name?: string | null
          effective_cid_number?: string | null
          emergency_cid_name?: string | null
          emergency_cid_number?: string | null
          enabled?: boolean | null
          extension?: string | null
          extension_dialect?: string | null
          extension_language?: string | null
          extension_type?: string | null
          extension_voice?: string | null
          force_ping?: boolean | null
          forward_all_destination?: string | null
          forward_all_enabled?: boolean | null
          forward_busy_destination?: string | null
          forward_busy_enabled?: boolean | null
          forward_no_answer_destination?: string | null
          forward_no_answer_enabled?: boolean | null
          forward_user_not_registered_destination?: string | null
          forward_user_not_registered_enabled?: boolean | null
          hold_music?: string | null
          id?: string | null
          is_demo?: boolean | null
          last_pbx_seen_at?: string | null
          limit_destination?: string | null
          limit_max?: string | null
          max_registrations?: number | null
          missed_call_app?: string | null
          missed_call_data?: string | null
          org_id?: string | null
          organization_id?: string | null
          outbound_cid_name?: string | null
          outbound_cid_number?: string | null
          password?: string | null
          pbx_uuid?: string | null
          portal_user_id?: string | null
          raw_data?: Json | null
          sip_bypass_media?: string | null
          sip_force_contact?: string | null
          sip_force_expires?: number | null
          source?: string | null
          sync_status?: string | null
          synced_at?: string | null
          toll_allow?: string | null
          updated_at?: string | null
          user_record?: string | null
          voicemail_custom_prompt?: boolean | null
          voicemail_enabled?: boolean | null
          voicemail_file?: string | null
          voicemail_keep_local?: boolean | null
          voicemail_mail_to?: string | null
          voicemail_password?: string | null
          voicemail_transcription?: boolean | null
        }
        Update: {
          absolute_codec_string?: string | null
          accountcode?: string | null
          assigned_user_ids?: string[] | null
          auth_acl?: string | null
          call_group?: string | null
          call_recording?: string | null
          call_screen?: boolean | null
          call_timeout?: number | null
          cidr?: string | null
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          device_lines?: Json | null
          directory_exten_visible?: boolean | null
          directory_first_name?: string | null
          directory_last_name?: string | null
          directory_visible?: boolean | null
          do_not_disturb?: boolean | null
          domain_uuid?: string | null
          effective_cid_name?: string | null
          effective_cid_number?: string | null
          emergency_cid_name?: string | null
          emergency_cid_number?: string | null
          enabled?: boolean | null
          extension?: string | null
          extension_dialect?: string | null
          extension_language?: string | null
          extension_type?: string | null
          extension_voice?: string | null
          force_ping?: boolean | null
          forward_all_destination?: string | null
          forward_all_enabled?: boolean | null
          forward_busy_destination?: string | null
          forward_busy_enabled?: boolean | null
          forward_no_answer_destination?: string | null
          forward_no_answer_enabled?: boolean | null
          forward_user_not_registered_destination?: string | null
          forward_user_not_registered_enabled?: boolean | null
          hold_music?: string | null
          id?: string | null
          is_demo?: boolean | null
          last_pbx_seen_at?: string | null
          limit_destination?: string | null
          limit_max?: string | null
          max_registrations?: number | null
          missed_call_app?: string | null
          missed_call_data?: string | null
          org_id?: string | null
          organization_id?: string | null
          outbound_cid_name?: string | null
          outbound_cid_number?: string | null
          password?: string | null
          pbx_uuid?: string | null
          portal_user_id?: string | null
          raw_data?: Json | null
          sip_bypass_media?: string | null
          sip_force_contact?: string | null
          sip_force_expires?: number | null
          source?: string | null
          sync_status?: string | null
          synced_at?: string | null
          toll_allow?: string | null
          updated_at?: string | null
          user_record?: string | null
          voicemail_custom_prompt?: boolean | null
          voicemail_enabled?: boolean | null
          voicemail_file?: string | null
          voicemail_keep_local?: boolean | null
          voicemail_mail_to?: string | null
          voicemail_password?: string | null
          voicemail_transcription?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_extensions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_extensions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_extensions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_extensions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_extensions_safe: {
        Row: {
          absolute_codec_string: string | null
          accountcode: string | null
          assigned_user_ids: string[] | null
          auth_acl: string | null
          call_group: string | null
          call_recording: string | null
          call_screen: boolean | null
          call_timeout: number | null
          cidr: string | null
          client_id: string | null
          created_at: string | null
          description: string | null
          device_lines: Json | null
          directory_exten_visible: boolean | null
          directory_first_name: string | null
          directory_last_name: string | null
          directory_visible: boolean | null
          do_not_disturb: boolean | null
          domain_uuid: string | null
          effective_cid_name: string | null
          effective_cid_number: string | null
          emergency_cid_name: string | null
          emergency_cid_number: string | null
          enabled: boolean | null
          extension: string | null
          extension_dialect: string | null
          extension_language: string | null
          extension_type: string | null
          extension_voice: string | null
          force_ping: boolean | null
          forward_all_destination: string | null
          forward_all_enabled: boolean | null
          forward_busy_destination: string | null
          forward_busy_enabled: boolean | null
          forward_no_answer_destination: string | null
          forward_no_answer_enabled: boolean | null
          forward_user_not_registered_destination: string | null
          forward_user_not_registered_enabled: boolean | null
          hold_music: string | null
          id: string | null
          is_demo: boolean | null
          last_pbx_seen_at: string | null
          last_synced_at: string | null
          limit_destination: string | null
          limit_max: string | null
          max_registrations: number | null
          missed_call_app: string | null
          missed_call_data: string | null
          org_id: string | null
          organization_id: string | null
          outbound_cid_name: string | null
          outbound_cid_number: string | null
          pbx_source: string | null
          pbx_uuid: string | null
          portal_user_id: string | null
          sip_bypass_media: string | null
          sip_force_contact: string | null
          sip_force_expires: number | null
          source: string | null
          sync_status: string | null
          synced_at: string | null
          toll_allow: string | null
          updated_at: string | null
          user_record: string | null
          voicemail_custom_prompt: boolean | null
          voicemail_enabled: boolean | null
          voicemail_file: string | null
          voicemail_keep_local: boolean | null
          voicemail_mail_to: string | null
          voicemail_transcription: boolean | null
        }
        Insert: {
          absolute_codec_string?: string | null
          accountcode?: string | null
          assigned_user_ids?: string[] | null
          auth_acl?: string | null
          call_group?: string | null
          call_recording?: string | null
          call_screen?: boolean | null
          call_timeout?: number | null
          cidr?: string | null
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          device_lines?: Json | null
          directory_exten_visible?: boolean | null
          directory_first_name?: string | null
          directory_last_name?: string | null
          directory_visible?: boolean | null
          do_not_disturb?: boolean | null
          domain_uuid?: string | null
          effective_cid_name?: string | null
          effective_cid_number?: string | null
          emergency_cid_name?: string | null
          emergency_cid_number?: string | null
          enabled?: boolean | null
          extension?: string | null
          extension_dialect?: string | null
          extension_language?: string | null
          extension_type?: string | null
          extension_voice?: string | null
          force_ping?: boolean | null
          forward_all_destination?: string | null
          forward_all_enabled?: boolean | null
          forward_busy_destination?: string | null
          forward_busy_enabled?: boolean | null
          forward_no_answer_destination?: string | null
          forward_no_answer_enabled?: boolean | null
          forward_user_not_registered_destination?: string | null
          forward_user_not_registered_enabled?: boolean | null
          hold_music?: string | null
          id?: string | null
          is_demo?: boolean | null
          last_pbx_seen_at?: string | null
          last_synced_at?: string | null
          limit_destination?: string | null
          limit_max?: string | null
          max_registrations?: number | null
          missed_call_app?: string | null
          missed_call_data?: string | null
          org_id?: string | null
          organization_id?: string | null
          outbound_cid_name?: string | null
          outbound_cid_number?: string | null
          pbx_source?: string | null
          pbx_uuid?: string | null
          portal_user_id?: string | null
          sip_bypass_media?: string | null
          sip_force_contact?: string | null
          sip_force_expires?: number | null
          source?: string | null
          sync_status?: string | null
          synced_at?: string | null
          toll_allow?: string | null
          updated_at?: string | null
          user_record?: string | null
          voicemail_custom_prompt?: boolean | null
          voicemail_enabled?: boolean | null
          voicemail_file?: string | null
          voicemail_keep_local?: boolean | null
          voicemail_mail_to?: string | null
          voicemail_transcription?: boolean | null
        }
        Update: {
          absolute_codec_string?: string | null
          accountcode?: string | null
          assigned_user_ids?: string[] | null
          auth_acl?: string | null
          call_group?: string | null
          call_recording?: string | null
          call_screen?: boolean | null
          call_timeout?: number | null
          cidr?: string | null
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          device_lines?: Json | null
          directory_exten_visible?: boolean | null
          directory_first_name?: string | null
          directory_last_name?: string | null
          directory_visible?: boolean | null
          do_not_disturb?: boolean | null
          domain_uuid?: string | null
          effective_cid_name?: string | null
          effective_cid_number?: string | null
          emergency_cid_name?: string | null
          emergency_cid_number?: string | null
          enabled?: boolean | null
          extension?: string | null
          extension_dialect?: string | null
          extension_language?: string | null
          extension_type?: string | null
          extension_voice?: string | null
          force_ping?: boolean | null
          forward_all_destination?: string | null
          forward_all_enabled?: boolean | null
          forward_busy_destination?: string | null
          forward_busy_enabled?: boolean | null
          forward_no_answer_destination?: string | null
          forward_no_answer_enabled?: boolean | null
          forward_user_not_registered_destination?: string | null
          forward_user_not_registered_enabled?: boolean | null
          hold_music?: string | null
          id?: string | null
          is_demo?: boolean | null
          last_pbx_seen_at?: string | null
          last_synced_at?: string | null
          limit_destination?: string | null
          limit_max?: string | null
          max_registrations?: number | null
          missed_call_app?: string | null
          missed_call_data?: string | null
          org_id?: string | null
          organization_id?: string | null
          outbound_cid_name?: string | null
          outbound_cid_number?: string | null
          pbx_source?: string | null
          pbx_uuid?: string | null
          portal_user_id?: string | null
          sip_bypass_media?: string | null
          sip_force_contact?: string | null
          sip_force_expires?: number | null
          source?: string | null
          sync_status?: string | null
          synced_at?: string | null
          toll_allow?: string | null
          updated_at?: string | null
          user_record?: string | null
          voicemail_custom_prompt?: boolean | null
          voicemail_enabled?: boolean | null
          voicemail_file?: string | null
          voicemail_keep_local?: boolean | null
          voicemail_mail_to?: string | null
          voicemail_transcription?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_extensions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_extensions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_extensions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_extensions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_gateways_safe: {
        Row: {
          context: string | null
          created_at: string | null
          enabled: boolean | null
          expire_seconds: number | null
          from_domain: string | null
          from_user: string | null
          id: string | null
          last_synced_at: string | null
          name: string | null
          organization_id: string | null
          pbx_uuid: string | null
          profile: string | null
          proxy: string | null
          realm: string | null
          register: boolean | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          enabled?: boolean | null
          expire_seconds?: number | null
          from_domain?: string | null
          from_user?: string | null
          id?: string | null
          last_synced_at?: string | null
          name?: string | null
          organization_id?: string | null
          pbx_uuid?: string | null
          profile?: string | null
          proxy?: string | null
          realm?: string | null
          register?: boolean | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string | null
          enabled?: boolean | null
          expire_seconds?: number | null
          from_domain?: string | null
          from_user?: string | null
          id?: string | null
          last_synced_at?: string | null
          name?: string | null
          organization_id?: string | null
          pbx_uuid?: string | null
          profile?: string | null
          proxy?: string | null
          realm?: string | null
          register?: boolean | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pbx_softphone_link_status: {
        Row: {
          display_name: string | null
          extension: string | null
          id: string | null
          link_status: string | null
          organization_id: string | null
          portal_email: string | null
          portal_full_name: string | null
          portal_user_id: string | null
          sip_domain: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_softphone_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pbx_softphone_users_safe: {
        Row: {
          account_status: string | null
          active_platforms: string[] | null
          app_access_enabled: boolean | null
          cc_avg_handle_time: number | null
          cc_calls_today: number | null
          cc_logged_in_at: string | null
          cc_pause_reason: string | null
          cc_queues: string[] | null
          cc_role: string | null
          cc_skills: string[] | null
          cc_status: string | null
          client_id: string | null
          created_at: string | null
          custom_status: string | null
          desktop_access_enabled: boolean | null
          device_type: string | null
          display_name: string | null
          dnd_enabled: boolean | null
          domain_uuid: string | null
          extension: string | null
          extension_id: string | null
          forward_enabled: boolean | null
          forward_to: string | null
          id: string | null
          is_demo: boolean | null
          last_pbx_seen_at: string | null
          last_seen_android: string | null
          last_seen_at: string | null
          last_seen_ios: string | null
          last_seen_linux: string | null
          last_seen_mac: string | null
          last_seen_web: string | null
          last_seen_windows: string | null
          mobile_access_enabled: boolean | null
          organization_id: string | null
          out_of_office_until: string | null
          pbx_uuid: string | null
          portal_user_id: string | null
          sip_domain: string | null
          source: string | null
          status: string | null
          status_emoji: string | null
          sync_status: string | null
          total_calls: number | null
          updated_at: string | null
          wss_url: string | null
        }
        Insert: {
          account_status?: string | null
          active_platforms?: string[] | null
          app_access_enabled?: boolean | null
          cc_avg_handle_time?: number | null
          cc_calls_today?: number | null
          cc_logged_in_at?: string | null
          cc_pause_reason?: string | null
          cc_queues?: string[] | null
          cc_role?: string | null
          cc_skills?: string[] | null
          cc_status?: string | null
          client_id?: string | null
          created_at?: string | null
          custom_status?: string | null
          desktop_access_enabled?: boolean | null
          device_type?: string | null
          display_name?: string | null
          dnd_enabled?: boolean | null
          domain_uuid?: string | null
          extension?: string | null
          extension_id?: string | null
          forward_enabled?: boolean | null
          forward_to?: string | null
          id?: string | null
          is_demo?: boolean | null
          last_pbx_seen_at?: string | null
          last_seen_android?: string | null
          last_seen_at?: string | null
          last_seen_ios?: string | null
          last_seen_linux?: string | null
          last_seen_mac?: string | null
          last_seen_web?: string | null
          last_seen_windows?: string | null
          mobile_access_enabled?: boolean | null
          organization_id?: string | null
          out_of_office_until?: string | null
          pbx_uuid?: string | null
          portal_user_id?: string | null
          sip_domain?: string | null
          source?: string | null
          status?: string | null
          status_emoji?: string | null
          sync_status?: string | null
          total_calls?: number | null
          updated_at?: string | null
          wss_url?: string | null
        }
        Update: {
          account_status?: string | null
          active_platforms?: string[] | null
          app_access_enabled?: boolean | null
          cc_avg_handle_time?: number | null
          cc_calls_today?: number | null
          cc_logged_in_at?: string | null
          cc_pause_reason?: string | null
          cc_queues?: string[] | null
          cc_role?: string | null
          cc_skills?: string[] | null
          cc_status?: string | null
          client_id?: string | null
          created_at?: string | null
          custom_status?: string | null
          desktop_access_enabled?: boolean | null
          device_type?: string | null
          display_name?: string | null
          dnd_enabled?: boolean | null
          domain_uuid?: string | null
          extension?: string | null
          extension_id?: string | null
          forward_enabled?: boolean | null
          forward_to?: string | null
          id?: string | null
          is_demo?: boolean | null
          last_pbx_seen_at?: string | null
          last_seen_android?: string | null
          last_seen_at?: string | null
          last_seen_ios?: string | null
          last_seen_linux?: string | null
          last_seen_mac?: string | null
          last_seen_web?: string | null
          last_seen_windows?: string | null
          mobile_access_enabled?: boolean | null
          organization_id?: string | null
          out_of_office_until?: string | null
          pbx_uuid?: string | null
          portal_user_id?: string | null
          sip_domain?: string | null
          source?: string | null
          status?: string | null
          status_emoji?: string | null
          sync_status?: string | null
          total_calls?: number | null
          updated_at?: string | null
          wss_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_softphone_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_real"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "pbx_extensions_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_extension_id_fkey"
            columns: ["extension_id"]
            isOneToOne: false
            referencedRelation: "telecom_extensions_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_softphone_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_sync_retry_metrics: {
        Row: {
          avg_attempts: number | null
          avg_success_latency_ms: number | null
          bucket_hour: string | null
          completed_after_retries: number | null
          failed_runs: number | null
          max_attempts_observed: number | null
          max_retries_exhausted: number | null
          organization_id: string | null
          retries_scheduled: number | null
          retries_succeeded: number | null
        }
        Relationships: []
      }
      phone_numbers_unified: {
        Row: {
          capabilities: Json | null
          destination_action: string | null
          destination_app: string | null
          destination_enabled: boolean | null
          destination_id: string | null
          destination_is_demo: boolean | null
          destination_number: string | null
          destination_pbx_uuid: string | null
          destination_type: string | null
          destination_updated_at: string | null
          e164: string | null
          friendly_name: string | null
          link_status: string | null
          organization_id: string | null
          phone_is_demo: boolean | null
          phone_number_id: string | null
          phone_updated_at: string | null
          provider: string | null
          provider_sid: string | null
          provider_status: string | null
          recording_enabled: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_numbers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      planipret_ava_stats: {
        Row: {
          actions_err_30d: number | null
          actions_modified_30d: number | null
          actions_ok_30d: number | null
          analyses_30d: number | null
          leads_30d: number | null
          urgent_30d: number | null
          user_id: string | null
        }
        Relationships: []
      }
      planipret_broker_stats: {
        Row: {
          agent_ia_active: number | null
          app_mobile_active: number | null
          maestro_connected: number | null
          ms365_connected: number | null
          ns_linked: number | null
          total_courtiers: number | null
        }
        Relationships: []
      }
      telecom_cdr_v: {
        Row: {
          ai_processing: boolean | null
          analyzed: boolean | null
          answer_at: string | null
          billsec: number | null
          call_status: string | null
          caller_name: string | null
          caller_number: string | null
          client_id: string | null
          created_at: string | null
          crm_synced: boolean | null
          destination: string | null
          destination_number: string | null
          direction: string | null
          duration_seconds: number | null
          end_at: string | null
          extension: string | null
          hangup_cause: string | null
          has_recording: boolean | null
          id: string | null
          ivr_menu_uuid: string | null
          missed_call: boolean | null
          notes: string | null
          organization_id: string | null
          pbx_uuid: string | null
          ring_group_uuid: string | null
          sip_call_id: string | null
          source_number: string | null
          start_at: string | null
          tags: string[] | null
          transcribed: boolean | null
          waitsec: number | null
        }
        Insert: {
          ai_processing?: boolean | null
          analyzed?: boolean | null
          answer_at?: string | null
          billsec?: number | null
          call_status?: string | null
          caller_name?: string | null
          caller_number?: string | null
          client_id?: string | null
          created_at?: string | null
          crm_synced?: boolean | null
          destination?: string | null
          destination_number?: string | null
          direction?: string | null
          duration_seconds?: number | null
          end_at?: string | null
          extension?: string | null
          hangup_cause?: string | null
          has_recording?: boolean | null
          id?: string | null
          ivr_menu_uuid?: string | null
          missed_call?: boolean | null
          notes?: string | null
          organization_id?: string | null
          pbx_uuid?: string | null
          ring_group_uuid?: string | null
          sip_call_id?: string | null
          source_number?: string | null
          start_at?: string | null
          tags?: string[] | null
          transcribed?: boolean | null
          waitsec?: number | null
        }
        Update: {
          ai_processing?: boolean | null
          analyzed?: boolean | null
          answer_at?: string | null
          billsec?: number | null
          call_status?: string | null
          caller_name?: string | null
          caller_number?: string | null
          client_id?: string | null
          created_at?: string | null
          crm_synced?: boolean | null
          destination?: string | null
          destination_number?: string | null
          direction?: string | null
          duration_seconds?: number | null
          end_at?: string | null
          extension?: string | null
          hangup_cause?: string | null
          has_recording?: boolean | null
          id?: string | null
          ivr_menu_uuid?: string | null
          missed_call?: boolean | null
          notes?: string | null
          organization_id?: string | null
          pbx_uuid?: string | null
          ring_group_uuid?: string | null
          sip_call_id?: string | null
          source_number?: string | null
          start_at?: string | null
          tags?: string[] | null
          transcribed?: boolean | null
          waitsec?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_call_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telecom_extensions_v: {
        Row: {
          call_group: string | null
          call_recording: string | null
          call_timeout: number | null
          client_id: string | null
          created_at: string | null
          description: string | null
          directory_first_name: string | null
          directory_last_name: string | null
          directory_visible: boolean | null
          do_not_disturb: boolean | null
          effective_cid_name: string | null
          effective_cid_number: string | null
          enabled: boolean | null
          extension: string | null
          extension_language: string | null
          extension_type: string | null
          forward_all_destination: string | null
          forward_all_enabled: boolean | null
          forward_busy_enabled: boolean | null
          forward_no_answer_enabled: boolean | null
          id: string | null
          organization_id: string | null
          outbound_cid_name: string | null
          outbound_cid_number: string | null
          pbx_uuid: string | null
          portal_user_id: string | null
          softphone_display_name: string | null
          softphone_last_seen_at: string | null
          softphone_status: string | null
          synced_at: string | null
          updated_at: string | null
          voicemail_enabled: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_extensions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_extensions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_extensions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telecom_queues_v: {
        Row: {
          agent_count: number | null
          available_agents: number | null
          client_id: string | null
          created_at: string | null
          description: string | null
          enabled: boolean | null
          extension: string | null
          id: string | null
          max_wait_time: number | null
          music_on_hold: string | null
          name: string | null
          organization_id: string | null
          pbx_uuid: string | null
          record_enabled: boolean | null
          strategy: string | null
          timeout_action: string | null
          updated_at: string | null
        }
        Insert: {
          agent_count?: never
          available_agents?: never
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          extension?: string | null
          id?: string | null
          max_wait_time?: number | null
          music_on_hold?: string | null
          name?: string | null
          organization_id?: string | null
          pbx_uuid?: string | null
          record_enabled?: boolean | null
          strategy?: string | null
          timeout_action?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_count?: never
          available_agents?: never
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          extension?: string | null
          id?: string | null
          max_wait_time?: number | null
          music_on_hold?: string | null
          name?: string | null
          organization_id?: string | null
          pbx_uuid?: string | null
          record_enabled?: boolean | null
          strategy?: string | null
          timeout_action?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_call_queues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_queues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_queues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telecom_recordings_v: {
        Row: {
          call_record_id: string | null
          client_id: string | null
          created_at: string | null
          direction: string | null
          duration_seconds: number | null
          has_audio: boolean | null
          id: string | null
          organization_id: string | null
          pbx_uuid: string | null
          recorded_at: string | null
          transcription_status: string | null
        }
        Insert: {
          call_record_id?: string | null
          client_id?: string | null
          created_at?: string | null
          direction?: string | null
          duration_seconds?: number | null
          has_audio?: never
          id?: string | null
          organization_id?: string | null
          pbx_uuid?: string | null
          recorded_at?: string | null
          transcription_status?: string | null
        }
        Update: {
          call_record_id?: string | null
          client_id?: string | null
          created_at?: string | null
          direction?: string | null
          duration_seconds?: number | null
          has_audio?: never
          id?: string | null
          organization_id?: string | null
          pbx_uuid?: string | null
          recorded_at?: string | null
          transcription_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbx_call_recordings_call_record_id_fkey"
            columns: ["call_record_id"]
            isOneToOne: false
            referencedRelation: "pbx_call_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_recordings_call_record_id_fkey"
            columns: ["call_record_id"]
            isOneToOne: false
            referencedRelation: "telecom_cdr_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_recordings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_recordings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pbx_call_recordings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telecom_routing_v: {
        Row: {
          always_enabled: boolean | null
          always_to: string | null
          busy_enabled: boolean | null
          busy_to: string | null
          dnd_enabled: boolean | null
          dnd_schedule: Json | null
          no_answer_enabled: boolean | null
          no_answer_seconds: number | null
          no_answer_to: string | null
          offline_enabled: boolean | null
          offline_to: string | null
          organization_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          always_enabled?: boolean | null
          always_to?: string | null
          busy_enabled?: boolean | null
          busy_to?: string | null
          dnd_enabled?: boolean | null
          dnd_schedule?: Json | null
          no_answer_enabled?: boolean | null
          no_answer_seconds?: number | null
          no_answer_to?: string | null
          offline_enabled?: boolean | null
          offline_to?: string | null
          organization_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          always_enabled?: boolean | null
          always_to?: string | null
          busy_enabled?: boolean | null
          busy_to?: string | null
          dnd_enabled?: boolean | null
          dnd_schedule?: Json | null
          no_answer_enabled?: boolean | null
          no_answer_seconds?: number | null
          no_answer_to?: string | null
          offline_enabled?: boolean | null
          offline_to?: string | null
          organization_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      telecom_voicemails_v: {
        Row: {
          ai_summary: string | null
          ai_tags: string[] | null
          caller_name: string | null
          caller_number: string | null
          created_at: string | null
          deleted_at: string | null
          duration_seconds: number | null
          extension: string | null
          folder: string | null
          fusionpbx_uuid: string | null
          has_audio: boolean | null
          id: string | null
          mailbox: string | null
          organization_id: string | null
          read_at: string | null
          received_at: string | null
          transcript: string | null
        }
        Insert: {
          ai_summary?: string | null
          ai_tags?: string[] | null
          caller_name?: string | null
          caller_number?: string | null
          created_at?: string | null
          deleted_at?: string | null
          duration_seconds?: number | null
          extension?: string | null
          folder?: string | null
          fusionpbx_uuid?: string | null
          has_audio?: never
          id?: string | null
          mailbox?: string | null
          organization_id?: string | null
          read_at?: string | null
          received_at?: string | null
          transcript?: string | null
        }
        Update: {
          ai_summary?: string | null
          ai_tags?: string[] | null
          caller_name?: string | null
          caller_number?: string | null
          created_at?: string | null
          deleted_at?: string | null
          duration_seconds?: number | null
          extension?: string | null
          folder?: string | null
          fusionpbx_uuid?: string | null
          has_audio?: never
          id?: string | null
          mailbox?: string | null
          organization_id?: string | null
          read_at?: string | null
          received_at?: string | null
          transcript?: string | null
        }
        Relationships: []
      }
      voice_agent_bindings_safe: {
        Row: {
          active: boolean | null
          after_hours_only: boolean | null
          binding_type:
            | Database["public"]["Enums"]["voice_agent_binding_type"]
            | null
          business_hours_id: string | null
          client_id: string | null
          created_at: string | null
          id: string | null
          last_synced_at: string | null
          organization_id: string | null
          priority: number | null
          target_ref: string | null
          updated_at: string | null
          voice_agent_id: string | null
        }
        Insert: {
          active?: boolean | null
          after_hours_only?: boolean | null
          binding_type?:
            | Database["public"]["Enums"]["voice_agent_binding_type"]
            | null
          business_hours_id?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string | null
          last_synced_at?: string | null
          organization_id?: string | null
          priority?: number | null
          target_ref?: string | null
          updated_at?: string | null
          voice_agent_id?: string | null
        }
        Update: {
          active?: boolean | null
          after_hours_only?: boolean | null
          binding_type?:
            | Database["public"]["Enums"]["voice_agent_binding_type"]
            | null
          business_hours_id?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string | null
          last_synced_at?: string | null
          organization_id?: string | null
          priority?: number | null
          target_ref?: string | null
          updated_at?: string | null
          voice_agent_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_link_softphone_by_email: {
        Args: { _email: string; _softphone_id: string }
        Returns: Json
      }
      admin_link_softphone_by_extension_email: {
        Args: { _email: string; _extension: string; _org_id: string }
        Returns: Json
      }
      assert_org_access: {
        Args: { _action?: string; _resource?: string; _target_org: string }
        Returns: undefined
      }
      audit_my_extension_isolation: { Args: never; Returns: Json }
      audit_my_pbx_extensions_access: {
        Args: { _org_id?: string }
        Returns: Json
      }
      audit_my_recordings_access: { Args: never; Returns: Json }
      can_access_chat_channel: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_voicemail: {
        Args: { _user_id: string; _vm_id: string }
        Returns: boolean
      }
      can_manage_org_members: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_pbx_for_client: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      create_group_chat: {
        Args: { _member_ids: string[]; _name: string }
        Returns: {
          archived_at: string | null
          channel_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          members: string[]
          name: string
          organization_id: string
          pinned_messages: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "org_chat_channels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_organization_for_user: {
        Args: { _name: string; _slug: string }
        Returns: string
      }
      create_planipret_sip_secret: {
        Args: { _broker_id: string; _name: string; _value: string }
        Returns: string
      }
      current_user_internal_org_ids: { Args: never; Returns: string[] }
      current_user_org_ids: { Args: never; Returns: string[] }
      current_user_softphone_domain_uuids: {
        Args: never
        Returns: {
          domain_uuid: string
          organization_id: string
        }[]
      }
      ensure_general_channel: {
        Args: { _org_id: string; _user_id: string }
        Returns: string
      }
      generate_agent_slug: { Args: { agent_name: string }; Returns: string }
      generate_api_key: { Args: never; Returns: string }
      generate_unique_username: { Args: { base_name: string }; Returns: string }
      get_accessible_org_ids: { Args: { _user_id: string }; Returns: string[] }
      get_message_edit_history: {
        Args: { _message_id: string }
        Returns: {
          edited_at: string
          edited_by: string
          editor_name: string
          id: string
          new_content: string
          previous_content: string
        }[]
      }
      get_message_receipts: {
        Args: { _message_id: string }
        Returns: {
          avatar_url: string
          full_name: string
          read_at: string
          user_id: string
        }[]
      }
      get_my_extension_summary: { Args: never; Returns: Json }
      get_org_by_fusionpbx_domain: {
        Args: { _domain_uuid: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      get_org_pbx_mapping: {
        Args: never
        Returns: {
          fusionpbx_domain_uuid: string
          id: string
          name: string
        }[]
      }
      get_unread_counts: {
        Args: never
        Returns: {
          channel_id: string
          last_message_at: string
          unread_count: number
        }[]
      }
      get_user_organization_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_user_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hide_chat_message: {
        Args: { _message_id: string; _reason: string }
        Returns: undefined
      }
      increment_sms_unread: { Args: { thread_id: string }; Returns: undefined }
      is_cc_supervisor: { Args: { _user_id: string }; Returns: boolean }
      is_lemtel_admin: { Args: { _user_id: string }; Returns: boolean }
      is_lemtel_member: { Args: { _user_id: string }; Returns: boolean }
      is_lemtel_only: { Args: { _user_id: string }; Returns: boolean }
      is_master_admin: { Args: { _user_id: string }; Returns: boolean }
      is_member_of_org: { Args: { _org: string }; Returns: boolean }
      is_my_extension_call:
        | {
            Args: {
              _caller: string
              _destination: string
              _extension: string
              _org_id: string
              _source: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _caller: string
              _destination: string
              _destination_number: string
              _extension: string
              _org_id: string
              _source: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _caller: string
              _destination: string
              _destination_number: string
              _extension: string
              _extension_uuid: string
              _org_id: string
              _source: string
            }
            Returns: boolean
          }
      is_planipret_admin: { Args: { _user_id: string }; Returns: boolean }
      is_planipret_member: { Args: { _user_id: string }; Returns: boolean }
      is_planipret_only: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      lemtel_can_grant_app_access: { Args: { _uid: string }; Returns: boolean }
      log_access_violation: {
        Args: {
          _action: string
          _metadata?: Json
          _resource?: string
          _target_org: string
        }
        Returns: string
      }
      log_agent_access: {
        Args: { _action: string; _metadata?: Json; _org_id: string }
        Returns: undefined
      }
      log_softphone_call: {
        Args: {
          _direction: string
          _duration_seconds: number
          _ended_at: string
          _hangup_cause?: string
          _remote_number: string
          _sip_call_id?: string
          _started_at: string
        }
        Returns: string
      }
      mark_channel_read: { Args: { _channel_id: string }; Returns: undefined }
      mark_messages_read: {
        Args: { _channel_id: string; _up_to?: string }
        Returns: number
      }
      mark_voicemail_read: { Args: { _id: string }; Returns: undefined }
      my_app_access_allowed: { Args: never; Returns: boolean }
      my_platform_access_allowed: {
        Args: { _platform: string }
        Returns: boolean
      }
      pin_chat_message: { Args: { _message_id: string }; Returns: undefined }
      planipret_ava_org_id: { Args: never; Returns: string }
      pp_audit_realtime_check: { Args: never; Returns: Json }
      pp_claim_call: {
        Args: { _answered_by: string; _call_id: string }
        Returns: boolean
      }
      read_planipret_sip_secret: { Args: { _name: string }; Returns: string }
      reconcile_pbx_call_records: { Args: { _org_id: string }; Returns: Json }
      relink_my_softphone_user: { Args: never; Returns: Json }
      resolve_org_by_domain_name: {
        Args: { _domain_name: string }
        Returns: {
          fusionpbx_domain_uuid: string
          id: string
          name: string
          slug: string
        }[]
      }
      rollback_admin_action: { Args: { _action_id: string }; Returns: Json }
      run_security_audit: { Args: { _org_id: string }; Returns: Json }
      search_chat: {
        Args: { _limit?: number; _q: string }
        Returns: {
          channel_id: string
          channel_name: string
          channel_type: string
          content: string
          created_at: string
          id: string
          sender_id: string
          sender_name: string
          snippet: string
        }[]
      }
      search_chat_users: {
        Args: { _limit?: number; _q: string }
        Returns: {
          avatar_url: string
          email: string
          extension: string
          full_name: string
          user_id: string
        }[]
      }
      set_call_notes: {
        Args: { _call_id: string; _notes: string; _tags?: string[] }
        Returns: undefined
      }
      set_softphone_app_access: {
        Args: { _enabled: boolean; _softphone_id: string }
        Returns: Json
      }
      set_softphone_platform_access: {
        Args: { _desktop: boolean; _mobile: boolean; _softphone_id: string }
        Returns: Json
      }
      setup_customer_organization: {
        Args: {
          _admin_email?: string
          _domain_name: string
          _domain_uuid: string
          _name: string
          _slug: string
        }
        Returns: string
      }
      setup_new_user_organization: {
        Args: { _full_name?: string; _user_email: string; _user_id: string }
        Returns: string
      }
      toggle_queue_pause: {
        Args: { _paused: boolean; _queue_id: string }
        Returns: undefined
      }
      try_lock_call_intel: { Args: { _call_id: string }; Returns: boolean }
      unhide_chat_message: { Args: { _message_id: string }; Returns: undefined }
      unlock_call_intel: { Args: { _call_id: string }; Returns: boolean }
      unpin_chat_message: { Args: { _message_id: string }; Returns: undefined }
      update_platform_seen: { Args: { p_platform: string }; Returns: undefined }
      upsert_user_presence: {
        Args: {
          _call_state?: string
          _emoji?: string
          _message?: string
          _platform?: string
          _status: string
        }
        Returns: undefined
      }
      verify_org_isolation: { Args: never; Returns: Json }
      verify_tenant_isolation: { Args: { _org_id: string }; Returns: Json }
    }
    Enums: {
      after_hours_action:
        | "voicemail"
        | "forward_extension"
        | "forward_external"
        | "follow_org_default"
      app_role:
        | "super_admin"
        | "org_admin"
        | "manager"
        | "agent"
        | "viewer"
        | "planipret_admin"
        | "planipret_broker"
      porting_status:
        | "submitted"
        | "in_review"
        | "approved"
        | "rejected"
        | "completed"
      telecom_sync_status: "pending" | "synced" | "failed"
      user_availability: "available" | "busy" | "dnd" | "away" | "vacation"
      voice_agent_binding_type:
        | "did"
        | "extension"
        | "ivr_option"
        | "queue_overflow"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      after_hours_action: [
        "voicemail",
        "forward_extension",
        "forward_external",
        "follow_org_default",
      ],
      app_role: [
        "super_admin",
        "org_admin",
        "manager",
        "agent",
        "viewer",
        "planipret_admin",
        "planipret_broker",
      ],
      porting_status: [
        "submitted",
        "in_review",
        "approved",
        "rejected",
        "completed",
      ],
      telecom_sync_status: ["pending", "synced", "failed"],
      user_availability: ["available", "busy", "dnd", "away", "vacation"],
      voice_agent_binding_type: [
        "did",
        "extension",
        "ivr_option",
        "queue_overflow",
      ],
    },
  },
} as const
