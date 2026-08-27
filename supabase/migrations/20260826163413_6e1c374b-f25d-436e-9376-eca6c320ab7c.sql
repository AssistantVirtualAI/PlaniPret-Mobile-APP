-- Clear duplicated Maestro broker identities so they are re-resolved on next sign-in
UPDATE public.planipret_profiles p
SET maestro_broker_id = NULL
WHERE coalesce(p.maestro_broker_id,'') <> ''
  AND coalesce(p.maestro_telecom_user_id::text,'') = ''
  AND EXISTS (
    SELECT 1 FROM public.planipret_profiles q
    WHERE q.id <> p.id AND q.maestro_broker_id = p.maestro_broker_id
  );