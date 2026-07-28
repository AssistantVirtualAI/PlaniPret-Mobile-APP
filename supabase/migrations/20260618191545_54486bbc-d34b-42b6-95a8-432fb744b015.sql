
CREATE OR REPLACE VIEW public.pending_sync_retry_metrics AS
SELECT
  organization_id,
  date_trunc('hour', created_at) AS bucket_hour,
  count(*) FILTER (WHERE status = 'retry_scheduled')        AS retries_scheduled,
  count(*) FILTER (WHERE status = 'retry_success')          AS retries_succeeded,
  count(*) FILTER (WHERE status = 'completed_after_retries') AS completed_after_retries,
  count(*) FILTER (WHERE status = 'max_retries_exhausted')  AS max_retries_exhausted,
  count(*) FILTER (WHERE status = 'failed')                 AS failed_runs,
  avg(latency_ms) FILTER (WHERE status IN ('retry_success','completed_after_retries')) AS avg_success_latency_ms,
  avg((metadata->>'attempts')::int) FILTER (WHERE status IN ('retry_success','completed_after_retries','max_retries_exhausted')) AS avg_attempts,
  max((metadata->>'attempts')::int) AS max_attempts_observed
FROM public.ai_request_audit_log
WHERE request_type = 'pending_sync_retry'
GROUP BY organization_id, date_trunc('hour', created_at);

GRANT SELECT ON public.pending_sync_retry_metrics TO authenticated;
GRANT SELECT ON public.pending_sync_retry_metrics TO service_role;
