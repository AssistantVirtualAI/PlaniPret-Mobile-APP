CREATE OR REPLACE FUNCTION public.is_my_extension_call(_org_id uuid, _extension text, _caller text, _destination_number text, _destination text, _source text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.pbx_softphone_users s
    WHERE s.portal_user_id = auth.uid()
      AND s.organization_id = _org_id
      AND s.extension = _extension
  )
$function$;