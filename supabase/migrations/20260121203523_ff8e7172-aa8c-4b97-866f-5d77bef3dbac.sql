-- Security hardening: replace permissive "true" RLS policies with service_role-only checks

-- 1) Fix function search_path
CREATE OR REPLACE FUNCTION public.set_updated_at_org_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- 2) Replace permissive system policies

-- agent_daily_reports
DROP POLICY IF EXISTS "System can manage agent reports" ON public.agent_daily_reports;
CREATE POLICY "Service role can manage agent reports"
ON public.agent_daily_reports
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- agent_health_scores
DROP POLICY IF EXISTS "System can manage health scores" ON public.agent_health_scores;
CREATE POLICY "Service role can manage health scores"
ON public.agent_health_scores
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- agent_insights
DROP POLICY IF EXISTS "System can insert agent insights" ON public.agent_insights;
DROP POLICY IF EXISTS "System can manage insights" ON public.agent_insights;
DROP POLICY IF EXISTS "System can update agent insights" ON public.agent_insights;
CREATE POLICY "Service role can manage agent insights"
ON public.agent_insights
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- alert_notifications
DROP POLICY IF EXISTS "System can manage alerts" ON public.alert_notifications;
CREATE POLICY "Service role can manage alerts"
ON public.alert_notifications
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- audit_logs
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "Service role can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- conversation_topics
DROP POLICY IF EXISTS "System can insert topics" ON public.conversation_topics;
CREATE POLICY "Service role can insert topics"
ON public.conversation_topics
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- performance_metrics
DROP POLICY IF EXISTS "System can manage performance metrics" ON public.performance_metrics;
CREATE POLICY "Service role can manage performance metrics"
ON public.performance_metrics
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- twilio_active_calls
DROP POLICY IF EXISTS "System can manage calls" ON public.twilio_active_calls;
CREATE POLICY "Service role can manage calls"
ON public.twilio_active_calls
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- webhook_events
DROP POLICY IF EXISTS "Service role can insert webhook events" ON public.webhook_events;
CREATE POLICY "Service role can insert webhook events"
ON public.webhook_events
FOR INSERT
WITH CHECK (auth.role() = 'service_role');
