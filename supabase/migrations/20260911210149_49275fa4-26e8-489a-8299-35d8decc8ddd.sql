REVOKE EXECUTE ON FUNCTION public.lemtel_dashboard_daily_calls(uuid, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.planipret_broker_activity_stats(timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.planipret_broker_task_stats() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lemtel_dashboard_daily_calls(uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planipret_broker_activity_stats(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planipret_broker_task_stats() TO authenticated, service_role;