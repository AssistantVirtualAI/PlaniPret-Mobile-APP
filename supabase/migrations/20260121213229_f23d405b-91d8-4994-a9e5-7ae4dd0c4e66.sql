-- Fix linter: ensure safe views run with invoker privileges
ALTER VIEW public.clients_safe SET (security_invoker = true);
ALTER VIEW public.client_members_safe SET (security_invoker = true);
