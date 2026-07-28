-- Fix stale extension mismatch: align planipret_profiles.extension with ns_extension for all brokers and mark them as linked where an NS extension exists.
UPDATE public.planipret_profiles
SET extension = ns_extension,
    ns_linked = TRUE
WHERE ns_extension IS NOT NULL
  AND (extension IS DISTINCT FROM ns_extension OR ns_linked IS NOT TRUE);