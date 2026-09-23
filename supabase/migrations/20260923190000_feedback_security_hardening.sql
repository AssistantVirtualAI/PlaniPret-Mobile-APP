-- Feedback Planiprêt : confidentialité, intégrité et livraison fiable.
-- Cette migration complète la création initiale du module Feedback.

CREATE OR REPLACE FUNCTION public.is_planipret_feedback_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND organization_id = public.planipret_ava_org_id()
      AND role IN ('planipret_admin', 'org_admin', 'super_admin')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_planipret_feedback_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_planipret_feedback_admin(uuid) TO authenticated, service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pp-feedback-screenshots',
  'pp-feedback-screenshots',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.planipret_ava_action_confirmations
  ADD COLUMN IF NOT EXISTS confirmation_token uuid,
  ADD COLUMN IF NOT EXISTS confirmation_expires_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS planipret_ava_action_confirmations_confirmation_token_idx
  ON public.planipret_ava_action_confirmations (confirmation_token)
  WHERE confirmation_token IS NOT NULL;

ALTER TABLE public.pp_feedback_reports
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS notification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS notification_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_last_error text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days');

UPDATE public.pp_feedback_reports
SET idempotency_key = id::text
WHERE idempotency_key IS NULL OR btrim(idempotency_key) = '';

ALTER TABLE public.pp_feedback_reports
  ALTER COLUMN idempotency_key SET NOT NULL;

ALTER TABLE public.pp_feedback_reports
  DROP CONSTRAINT IF EXISTS pp_feedback_reports_title_check,
  DROP CONSTRAINT IF EXISTS pp_feedback_reports_description_check,
  DROP CONSTRAINT IF EXISTS pp_feedback_reports_page_check,
  DROP CONSTRAINT IF EXISTS pp_feedback_reports_source_check,
  DROP CONSTRAINT IF EXISTS pp_feedback_reports_severity_check,
  DROP CONSTRAINT IF EXISTS pp_feedback_reports_status_check,
  DROP CONSTRAINT IF EXISTS pp_feedback_reports_screenshots_check,
  DROP CONSTRAINT IF EXISTS pp_feedback_reports_notification_status_check,
  DROP CONSTRAINT IF EXISTS pp_feedback_reports_notification_attempts_check;

ALTER TABLE public.pp_feedback_reports
  ADD CONSTRAINT pp_feedback_reports_title_check CHECK (char_length(title) BETWEEN 1 AND 200 AND title !~ '[\r\n]'),
  ADD CONSTRAINT pp_feedback_reports_description_check CHECK (description IS NULL OR char_length(description) <= 5000),
  ADD CONSTRAINT pp_feedback_reports_page_check CHECK (page IS NULL OR (char_length(page) <= 200 AND page !~ '[\r\n]')),
  ADD CONSTRAINT pp_feedback_reports_source_check CHECK (source IN ('portal', 'mobile', 'ava_chat', 'ava_voice')),
  ADD CONSTRAINT pp_feedback_reports_severity_check CHECK (severity IN ('low', 'normal', 'high', 'blocker')),
  ADD CONSTRAINT pp_feedback_reports_status_check CHECK (status IN ('new', 'in_progress', 'waiting', 'resolved')),
  ADD CONSTRAINT pp_feedback_reports_screenshots_check CHECK (jsonb_typeof(screenshots) = 'array' AND jsonb_array_length(screenshots) <= 6),
  ADD CONSTRAINT pp_feedback_reports_notification_status_check CHECK (notification_status IN ('pending', 'sending', 'sent', 'failed')),
  ADD CONSTRAINT pp_feedback_reports_notification_attempts_check CHECK (notification_attempts BETWEEN 0 AND 3);

CREATE UNIQUE INDEX IF NOT EXISTS pp_feedback_reports_reporter_idempotency_idx
  ON public.pp_feedback_reports (reporter_id, idempotency_key);
CREATE INDEX IF NOT EXISTS pp_feedback_reports_notification_retry_idx
  ON public.pp_feedback_reports (notification_status, notification_next_retry_at)
  WHERE notification_status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS pp_feedback_reports_expiry_idx
  ON public.pp_feedback_reports (expires_at);

CREATE OR REPLACE FUNCTION public.claim_pp_feedback_notification(_report_id uuid)
RETURNS public.pp_feedback_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed public.pp_feedback_reports;
BEGIN
  UPDATE public.pp_feedback_reports
  SET notification_status = 'sending',
      notification_attempts = notification_attempts + 1,
      notification_last_error = NULL,
      notification_next_retry_at = NULL
  WHERE id = _report_id
    AND notification_status IN ('pending', 'failed')
    AND notification_attempts < 3
    AND (notification_next_retry_at IS NULL OR notification_next_retry_at <= now())
  RETURNING * INTO claimed;
  RETURN claimed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_pp_feedback_notification(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pp_feedback_notification(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pp_feedback_reports_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count integer;
  shot text;
BEGIN
  NEW.title := btrim(NEW.title);
  NEW.reporter_name := NULLIF(btrim(COALESCE(NEW.reporter_name, '')), '');
  NEW.description := NULLIF(btrim(COALESCE(NEW.description, '')), '');
  NEW.page := NULLIF(btrim(COALESCE(NEW.page, '')), '');
  NEW.idempotency_key := btrim(COALESCE(NEW.idempotency_key, ''));
  NEW.screenshots := COALESCE(NEW.screenshots, '[]'::jsonb);

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'new';
    NEW.notification_status := 'pending';
    NEW.notification_attempts := 0;
    NEW.notification_next_retry_at := NULL;
    NEW.notification_sent_at := NULL;
    NEW.notification_last_error := NULL;
    NEW.expires_at := now() + interval '90 days';
  END IF;

  IF NOT public.is_planipret_member(NEW.reporter_id) THEN
    RAISE EXCEPTION 'feedback_member_required' USING ERRCODE = '42501';
  END IF;

  IF char_length(NEW.idempotency_key) < 8 OR char_length(NEW.idempotency_key) > 160 THEN
    RAISE EXCEPTION 'feedback_idempotency_key_invalid' USING ERRCODE = '22023';
  END IF;

  IF NEW.reporter_name IS NOT NULL AND (char_length(NEW.reporter_name) > 160 OR NEW.reporter_name ~ '[\r\n]') THEN
    RAISE EXCEPTION 'feedback_reporter_name_invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(NEW.screenshots) <> 'array' THEN
    RAISE EXCEPTION 'feedback_screenshots_invalid' USING ERRCODE = '22023';
  END IF;

  FOR shot IN SELECT value FROM jsonb_array_elements_text(NEW.screenshots)
  LOOP
    IF shot !~ ('^' || NEW.reporter_id::text || '/[A-Za-z0-9._/-]+$') OR position('..' IN shot) > 0 THEN
      RAISE EXCEPTION 'feedback_screenshot_not_owned' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO recent_count
    FROM public.pp_feedback_reports
    WHERE reporter_id = NEW.reporter_id
      AND created_at >= now() - interval '15 minutes';
    IF recent_count >= 5 THEN
      RAISE EXCEPTION 'feedback_rate_limited' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pp_feedback_reports_guard ON public.pp_feedback_reports;
CREATE TRIGGER trg_pp_feedback_reports_guard
  BEFORE INSERT OR UPDATE ON public.pp_feedback_reports
  FOR EACH ROW EXECUTE FUNCTION public.pp_feedback_reports_guard();

REVOKE UPDATE ON public.pp_feedback_reports FROM authenticated;
GRANT UPDATE ON public.pp_feedback_reports TO authenticated;

DROP POLICY IF EXISTS "ppfb_select" ON public.pp_feedback_reports;
DROP POLICY IF EXISTS "ppfb_insert" ON public.pp_feedback_reports;
DROP POLICY IF EXISTS "ppfb_update" ON public.pp_feedback_reports;
DROP POLICY IF EXISTS "ppfb_delete" ON public.pp_feedback_reports;
CREATE POLICY "ppfb_select" ON public.pp_feedback_reports FOR SELECT TO authenticated
  USING ((reporter_id = auth.uid() AND public.is_planipret_member(auth.uid())) OR public.is_planipret_feedback_admin(auth.uid()));
CREATE POLICY "ppfb_insert" ON public.pp_feedback_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND public.is_planipret_member(auth.uid()));
CREATE POLICY "ppfb_update_admin" ON public.pp_feedback_reports FOR UPDATE TO authenticated
  USING (public.is_planipret_feedback_admin(auth.uid()))
  WITH CHECK (public.is_planipret_feedback_admin(auth.uid()));
CREATE POLICY "ppfb_delete" ON public.pp_feedback_reports FOR DELETE TO authenticated
  USING ((reporter_id = auth.uid() AND public.is_planipret_member(auth.uid())) OR public.is_planipret_feedback_admin(auth.uid()));

DROP POLICY IF EXISTS "ppfbc_select" ON public.pp_feedback_comments;
DROP POLICY IF EXISTS "ppfbc_insert" ON public.pp_feedback_comments;
DROP POLICY IF EXISTS "ppfbc_delete" ON public.pp_feedback_comments;
CREATE POLICY "ppfbc_select" ON public.pp_feedback_comments FOR SELECT TO authenticated
  USING (
    public.is_planipret_feedback_admin(auth.uid())
    OR (public.is_planipret_member(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.pp_feedback_reports r WHERE r.id = report_id AND r.reporter_id = auth.uid()
    ))
  );
CREATE POLICY "ppfbc_insert" ON public.pp_feedback_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_planipret_member(auth.uid())
    AND (public.is_planipret_feedback_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.pp_feedback_reports r WHERE r.id = report_id AND r.reporter_id = auth.uid()
    ))
  );
CREATE POLICY "ppfbc_delete" ON public.pp_feedback_comments FOR DELETE TO authenticated
  USING ((author_id = auth.uid() AND public.is_planipret_member(auth.uid())) OR public.is_planipret_feedback_admin(auth.uid()));

DROP POLICY IF EXISTS "ppfb_shots_read" ON storage.objects;
DROP POLICY IF EXISTS "ppfb_shots_insert" ON storage.objects;
DROP POLICY IF EXISTS "ppfb_shots_delete" ON storage.objects;
CREATE POLICY "ppfb_shots_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pp-feedback-screenshots'
    AND (public.is_planipret_feedback_admin(auth.uid()) OR (
      public.is_planipret_member(auth.uid())
      AND (storage.foldername(name))[1] = auth.uid()::text
    ))
  );
CREATE POLICY "ppfb_shots_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pp-feedback-screenshots'
    AND public.is_planipret_member(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "ppfb_shots_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pp-feedback-screenshots'
    AND (public.is_planipret_feedback_admin(auth.uid()) OR (
      public.is_planipret_member(auth.uid())
      AND (storage.foldername(name))[1] = auth.uid()::text
    ))
  );
