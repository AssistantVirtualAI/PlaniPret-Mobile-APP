CREATE TABLE IF NOT EXISTS public.planipret_recording_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL UNIQUE REFERENCES public.planipret_phone_calls(id) ON DELETE CASCADE,
  user_id uuid,
  maestro_call_id text,
  status text NOT NULL DEFAULT 'uploading',
  bytes integer,
  media_id text,
  content_hash text,
  uploaded_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.planipret_recording_uploads TO authenticated;
GRANT ALL ON public.planipret_recording_uploads TO service_role;

ALTER TABLE public.planipret_recording_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brokers read their own recording upload records"
ON public.planipret_recording_uploads
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service role manages recording upload records"
ON public.planipret_recording_uploads
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pp_recording_uploads_user ON public.planipret_recording_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_pp_recording_uploads_status ON public.planipret_recording_uploads(status);

CREATE TRIGGER trg_pp_recording_uploads_updated_at
BEFORE UPDATE ON public.planipret_recording_uploads
FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();