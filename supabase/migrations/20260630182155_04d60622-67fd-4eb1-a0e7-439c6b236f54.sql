
CREATE UNIQUE INDEX IF NOT EXISTS planipret_phone_calls_ns_call_id_unique
  ON public.planipret_phone_calls (ns_call_id) WHERE ns_call_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS planipret_phone_messages_ns_message_id_unique
  ON public.planipret_phone_messages (ns_message_id) WHERE ns_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS planipret_voicemails_ns_vm_id_unique
  ON public.planipret_voicemails (ns_vm_id) WHERE ns_vm_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS planipret_profiles_org_email_unique
  ON public.planipret_profiles (organization_id, lower(email)) WHERE email IS NOT NULL AND email <> '';

NOTIFY pgrst, 'reload schema';
