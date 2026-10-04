-- Planiprêt mobile: a broker may update only their own visual availability status.
-- This repairs the client-side `permission denied for table planipret_profiles`
-- without granting access to any telephony, Maestro, OAuth, device or other profile fields.

GRANT UPDATE (status, updated_at)
ON public.planipret_profiles
TO authenticated;

-- The existing `planipret_profiles_update_own` RLS policy remains authoritative:
-- authenticated users can update only rows where user_id = auth.uid().
