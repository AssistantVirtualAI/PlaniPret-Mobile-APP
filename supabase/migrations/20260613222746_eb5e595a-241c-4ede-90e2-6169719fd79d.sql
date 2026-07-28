ALTER TABLE public.pbx_ivr_options ADD COLUMN IF NOT EXISTS pbx_uuid text;
CREATE UNIQUE INDEX IF NOT EXISTS pbx_ivr_options_ivr_pbx_uuid_uidx
  ON public.pbx_ivr_options(ivr_id, pbx_uuid) WHERE pbx_uuid IS NOT NULL;