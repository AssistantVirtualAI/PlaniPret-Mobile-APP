ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS ns_sip_password_ref_mobile text,
  ADD COLUMN IF NOT EXISTS ns_mobile_device_id text,
  ADD COLUMN IF NOT EXISTS ns_widget_device_id text;