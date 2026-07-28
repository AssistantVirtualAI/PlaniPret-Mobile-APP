
-- 1) OAuth PKCE states: enforce expiry on INSERT + auto-purge stale rows
ALTER TABLE public.planipret_maestro_oauth_states
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes');

CREATE INDEX IF NOT EXISTS idx_pp_maestro_oauth_states_expires
  ON public.planipret_maestro_oauth_states(expires_at);

CREATE OR REPLACE FUNCTION public.planipret_maestro_oauth_states_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Force a bounded lifetime — clients can't set a far-future expires_at.
  NEW.expires_at := LEAST(
    COALESCE(NEW.expires_at, now() + interval '15 minutes'),
    now() + interval '15 minutes'
  );
  IF NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'oauth state expires_at must be in the future';
  END IF;

  -- Purge expired rows on every write to keep table clean without cron.
  DELETE FROM public.planipret_maestro_oauth_states
   WHERE expires_at <= now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planipret_maestro_oauth_states_guard_trg
  ON public.planipret_maestro_oauth_states;
CREATE TRIGGER planipret_maestro_oauth_states_guard_trg
BEFORE INSERT OR UPDATE ON public.planipret_maestro_oauth_states
FOR EACH ROW EXECUTE FUNCTION public.planipret_maestro_oauth_states_guard();

-- Tighten SELECT to also honour expires_at, not just created_at.
DROP POLICY IF EXISTS "users read own non-expired oauth states"
  ON public.planipret_maestro_oauth_states;
CREATE POLICY "users read own non-expired oauth states"
  ON public.planipret_maestro_oauth_states
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND expires_at > now()
    AND created_at > (now() - interval '15 minutes')
  );

-- 2) org_chat_channels: audit trail for members[] changes
CREATE TABLE IF NOT EXISTS public.org_chat_channel_member_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.org_chat_channels(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL CHECK (action IN ('added','removed','created')),
  target_user_id uuid NOT NULL,
  channel_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.org_chat_channel_member_audit TO authenticated;
GRANT ALL ON public.org_chat_channel_member_audit TO service_role;

ALTER TABLE public.org_chat_channel_member_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org admins read channel member audit"
  ON public.org_chat_channel_member_audit;
CREATE POLICY "org admins read channel member audit"
  ON public.org_chat_channel_member_audit
  FOR SELECT
  USING (
    public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_org_chat_channel_member_audit_channel
  ON public.org_chat_channel_member_audit(channel_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.audit_org_chat_channel_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  added uuid[];
  removed uuid[];
  u uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.members IS NOT NULL THEN
      FOREACH u IN ARRAY NEW.members LOOP
        INSERT INTO public.org_chat_channel_member_audit
          (channel_id, organization_id, actor_id, action, target_user_id, channel_type)
        VALUES (NEW.id, NEW.organization_id, actor, 'created', u, NEW.channel_type);
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: diff members[]
  added   := ARRAY(SELECT unnest(COALESCE(NEW.members,'{}'::uuid[]))
                   EXCEPT SELECT unnest(COALESCE(OLD.members,'{}'::uuid[])));
  removed := ARRAY(SELECT unnest(COALESCE(OLD.members,'{}'::uuid[]))
                   EXCEPT SELECT unnest(COALESCE(NEW.members,'{}'::uuid[])));

  IF added IS NOT NULL THEN
    FOREACH u IN ARRAY added LOOP
      INSERT INTO public.org_chat_channel_member_audit
        (channel_id, organization_id, actor_id, action, target_user_id, channel_type)
      VALUES (NEW.id, NEW.organization_id, actor, 'added', u, NEW.channel_type);
    END LOOP;
  END IF;

  IF removed IS NOT NULL THEN
    FOREACH u IN ARRAY removed LOOP
      INSERT INTO public.org_chat_channel_member_audit
        (channel_id, organization_id, actor_id, action, target_user_id, channel_type)
      VALUES (NEW.id, NEW.organization_id, actor, 'removed', u, NEW.channel_type);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_org_chat_channel_members_trg
  ON public.org_chat_channels;
CREATE TRIGGER audit_org_chat_channel_members_trg
AFTER INSERT OR UPDATE OF members ON public.org_chat_channels
FOR EACH ROW EXECUTE FUNCTION public.audit_org_chat_channel_members();

-- Additional validation: on private/announcement channels, only creator or
-- org_admin can add members (i.e. mutate members[]). Prevents a self-added
-- rogue member from silently pulling others in later.
CREATE OR REPLACE FUNCTION public.enforce_org_chat_channel_member_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  changed boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    changed := (COALESCE(NEW.members,'{}'::uuid[]) <> COALESCE(OLD.members,'{}'::uuid[]));
    IF changed AND NEW.channel_type IN ('private','announcement','dm') THEN
      IF NOT (
        actor = OLD.created_by
        OR public.has_role(actor, NEW.organization_id, 'org_admin'::app_role)
        OR public.is_super_admin(actor)
      ) THEN
        RAISE EXCEPTION 'Only the channel creator or an org admin can modify members of a % channel', NEW.channel_type;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_org_chat_channel_member_changes_trg
  ON public.org_chat_channels;
CREATE TRIGGER enforce_org_chat_channel_member_changes_trg
BEFORE UPDATE OF members ON public.org_chat_channels
FOR EACH ROW EXECUTE FUNCTION public.enforce_org_chat_channel_member_changes();
