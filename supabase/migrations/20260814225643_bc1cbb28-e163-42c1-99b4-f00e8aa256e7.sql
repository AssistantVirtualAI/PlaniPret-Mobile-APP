DROP INDEX IF EXISTS public.planipret_contacts_user_source_phone_uidx;
CREATE UNIQUE INDEX planipret_contacts_user_source_phone_uidx
  ON public.planipret_contacts (user_id, source, phone_normalized);