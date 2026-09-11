
CREATE INDEX IF NOT EXISTS idx_pbx_call_records_org_start ON public.pbx_call_records (organization_id, start_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_maestro_activity_occurred ON public.planipret_maestro_activity (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_audit_log_created ON public.planipret_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_phone_calls_user_started ON public.planipret_phone_calls (user_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.lemtel_dashboard_daily_calls(_org uuid, _since timestamptz)
RETURNS TABLE(day date, total bigint, missed bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (start_at AT TIME ZONE 'UTC')::date AS day,
         count(*)::bigint AS total,
         count(*) FILTER (WHERE missed_call)::bigint AS missed
  FROM public.pbx_call_records
  WHERE organization_id = _org
    AND start_at >= _since
    AND (public.can_view_org(auth.uid(), _org) OR public.is_master_admin(auth.uid()))
  GROUP BY 1
  ORDER BY 1
$$;

GRANT EXECUTE ON FUNCTION public.lemtel_dashboard_daily_calls(uuid, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.planipret_broker_activity_stats(_since timestamptz)
RETURNS TABLE(
  user_id uuid,
  calls bigint,
  texts bigint,
  calls_synced bigint,
  texts_synced bigint,
  ai_calls bigint,
  talk_seconds bigint,
  last_activity timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.user_id,
         count(*) FILTER (WHERE a.kind = 'call')::bigint,
         count(*) FILTER (WHERE a.kind <> 'call')::bigint,
         count(*) FILTER (WHERE a.kind = 'call' AND a.maestro_status = 'synced')::bigint,
         count(*) FILTER (WHERE a.kind <> 'call' AND a.maestro_status = 'synced')::bigint,
         count(*) FILTER (WHERE a.kind = 'call' AND a.is_ai)::bigint,
         coalesce(sum(a.duration_seconds) FILTER (WHERE a.kind = 'call'), 0)::bigint,
         max(a.occurred_at)
  FROM public.planipret_maestro_activity a
  WHERE a.occurred_at >= _since
    AND (public.is_planipret_admin(auth.uid()) OR public.is_master_admin(auth.uid()) OR a.user_id = auth.uid())
  GROUP BY a.user_id
$$;

GRANT EXECUTE ON FUNCTION public.planipret_broker_activity_stats(timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.planipret_broker_task_stats()
RETURNS TABLE(user_id uuid, open_tasks bigint, overdue_tasks bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.user_id,
         count(*)::bigint,
         count(*) FILTER (WHERE t.due_at IS NOT NULL AND t.due_at < now())::bigint
  FROM public.planipret_tasks_projection t
  WHERE t.deleted_at IS NULL
    AND lower(coalesce(t.status, '')) NOT IN ('done','completed','complete','closed','termine','terminé','3','4')
    AND (public.is_planipret_admin(auth.uid()) OR public.is_master_admin(auth.uid()) OR t.user_id = auth.uid())
  GROUP BY t.user_id
$$;

GRANT EXECUTE ON FUNCTION public.planipret_broker_task_stats() TO authenticated;
