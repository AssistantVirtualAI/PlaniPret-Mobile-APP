
-- 1. Restrict public read on organization-assets to image files only
DROP POLICY IF EXISTS "Public read access for org assets" ON storage.objects;
CREATE POLICY "Public read image assets only"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'organization-assets'
  AND lower(storage.extension(name)) = ANY (ARRAY['png','jpg','jpeg','gif','webp','svg','ico'])
);

-- 2. Tighten is_lemtel_admin to canonical admin roles only
CREATE OR REPLACE FUNCTION public.is_lemtel_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_user_id, '71755d33-ed64-4ad5-a828-61c9d2029eb7'::uuid, 'org_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = _user_id
        AND org_id = '71755d33-ed64-4ad5-a828-61c9d2029eb7'::uuid
        AND role IN ('owner', 'admin', 'org_admin')
    )
    OR public.is_super_admin(_user_id)
$function$;

-- 3. Drop the conflicting ALL policy on planipret_did_assignments;
-- granular INSERT/UPDATE/DELETE policies using is_planipret_admin() already exist
DROP POLICY IF EXISTS "Planipret admins manage DID assignments" ON public.planipret_did_assignments;
