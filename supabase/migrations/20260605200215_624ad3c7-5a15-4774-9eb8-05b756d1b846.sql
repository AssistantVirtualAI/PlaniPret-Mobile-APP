CREATE OR REPLACE FUNCTION public.increment_sms_unread(thread_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.pbx_sms_threads
  SET unread_count = COALESCE(unread_count, 0) + 1,
      last_message_at = now()
  WHERE id = thread_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_sms_unread(uuid) TO service_role, authenticated;