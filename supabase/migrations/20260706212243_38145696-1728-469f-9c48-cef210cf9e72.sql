CREATE TABLE IF NOT EXISTS public.mobile_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios','android','web')),
  extension text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobile_push_tokens TO authenticated;
GRANT ALL ON public.mobile_push_tokens TO service_role;

ALTER TABLE public.mobile_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_tokens_select" ON public.mobile_push_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_tokens_insert" ON public.mobile_push_tokens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_tokens_update" ON public.mobile_push_tokens
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_tokens_delete" ON public.mobile_push_tokens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.mobile_push_tokens_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_mobile_push_tokens_touch ON public.mobile_push_tokens;
CREATE TRIGGER trg_mobile_push_tokens_touch BEFORE UPDATE ON public.mobile_push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.mobile_push_tokens_touch();

CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_user ON public.mobile_push_tokens(user_id);