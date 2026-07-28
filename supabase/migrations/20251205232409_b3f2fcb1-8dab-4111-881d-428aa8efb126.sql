-- Phase 10.1: Table user_consents pour GDPR
CREATE TABLE public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  consent_type text NOT NULL CHECK (consent_type IN ('cookies_essential', 'cookies_analytics', 'cookies_marketing', 'data_processing')),
  consented boolean DEFAULT false,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own consents" ON public.user_consents
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage own consents" ON public.user_consents
FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Phase 10.5: Table audit_logs pour HIPAA
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('view', 'create', 'update', 'delete', 'export', 'login', 'logout', 'access')),
  resource_type text NOT NULL,
  resource_id uuid,
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_audit_logs_org ON public.audit_logs(organization_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

CREATE POLICY "Org admins can view audit logs" ON public.audit_logs
FOR SELECT USING (
  has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR is_super_admin(auth.uid())
);

CREATE POLICY "System can insert audit logs" ON public.audit_logs
FOR INSERT WITH CHECK (true);

-- Phase 10.7: Colonnes BAA sur organizations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS baa_signed_at timestamptz,
ADD COLUMN IF NOT EXISTS baa_signed_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS privacy_policy_url text,
ADD COLUMN IF NOT EXISTS terms_url text;

-- Phase 10.3: Colonne soft delete sur profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

-- Phase 10.6: Fonction pour logging automatique des changements
CREATE OR REPLACE FUNCTION public.log_table_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
BEGIN
  -- Get organization_id from the record
  IF TG_OP = 'DELETE' THEN
    org_id := OLD.organization_id;
  ELSE
    org_id := NEW.organization_id;
  END IF;

  -- Only log if HIPAA is enabled for this organization
  IF EXISTS (SELECT 1 FROM organizations WHERE id = org_id AND hipaa_enabled = true) THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
      VALUES (org_id, auth.uid(), 'create', TG_TABLE_NAME, NEW.id, jsonb_build_object('new', to_jsonb(NEW)));
    ELSIF TG_OP = 'UPDATE' THEN
      INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
      VALUES (org_id, auth.uid(), 'update', TG_TABLE_NAME, NEW.id, jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
      VALUES (org_id, auth.uid(), 'delete', TG_TABLE_NAME, OLD.id, jsonb_build_object('old', to_jsonb(OLD)));
    END IF;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers sur tables sensibles
DROP TRIGGER IF EXISTS audit_conversations ON public.conversations;
CREATE TRIGGER audit_conversations
AFTER INSERT OR UPDATE OR DELETE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION log_table_changes();

DROP TRIGGER IF EXISTS audit_clients ON public.clients;
CREATE TRIGGER audit_clients
AFTER INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION log_table_changes();

DROP TRIGGER IF EXISTS audit_agents ON public.agents;
CREATE TRIGGER audit_agents
AFTER INSERT OR UPDATE OR DELETE ON public.agents
FOR EACH ROW EXECUTE FUNCTION log_table_changes();