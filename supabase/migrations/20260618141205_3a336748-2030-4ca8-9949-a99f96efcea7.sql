REVOKE SELECT (cidr, auth_acl, toll_allow, domain_uuid, device_lines)
  ON public.pbx_extensions FROM authenticated;
GRANT ALL ON public.pbx_extensions TO service_role;