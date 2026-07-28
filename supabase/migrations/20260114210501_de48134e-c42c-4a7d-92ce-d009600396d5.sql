-- Fix: Restrict alert_notifications SELECT policy to managers/admins only
-- This prevents all organization members from seeing customer email addresses

-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Users can view organization alerts" ON alert_notifications;

-- Create a new policy that restricts access to managers/admins only
CREATE POLICY "Managers and admins can view alerts"
ON alert_notifications FOR SELECT
USING (
  public.has_role(auth.uid(), organization_id, 'manager') OR
  public.has_role(auth.uid(), organization_id, 'org_admin') OR
  public.is_super_admin(auth.uid())
);