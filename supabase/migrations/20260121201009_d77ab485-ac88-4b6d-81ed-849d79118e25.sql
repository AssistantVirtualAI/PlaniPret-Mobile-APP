-- Reduce permissive RLS warnings for newly added/modified service policies by making conditions explicit

-- security_audit_runs: tighten insert policy
DROP POLICY IF EXISTS "System can insert security audit runs" ON public.security_audit_runs;
CREATE POLICY "System can insert security audit runs"
ON public.security_audit_runs
FOR INSERT
TO service_role
WITH CHECK (auth.role() = 'service_role');

-- topic_aggregates: tighten service manage policy (created earlier)
DROP POLICY IF EXISTS "System can manage topic aggregates" ON public.topic_aggregates;
CREATE POLICY "System can manage topic aggregates"
ON public.topic_aggregates
FOR ALL
TO service_role
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
