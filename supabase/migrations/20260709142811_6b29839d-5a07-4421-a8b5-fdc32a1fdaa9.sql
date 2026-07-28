
-- 1) lemtel_softphone_invites: remove member-visible SELECT policy so only admins can read invite tokens
DROP POLICY IF EXISTS "lemtel_invites_member_view" ON public.lemtel_softphone_invites;

-- 2) organizations: revoke api_key column read access from anon/authenticated (admin-only via edge functions / service_role)
REVOKE SELECT (api_key) ON public.organizations FROM anon, authenticated;

-- 3) planipret_team_messages: replace overly broad SELECT with a policy that enforces
-- channel membership by shared organization between reader and sender.
DROP POLICY IF EXISTS "Brokers can read team messages" ON public.planipret_team_messages;

CREATE POLICY "Brokers can read team messages in their org"
ON public.planipret_team_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.planipret_profiles reader
    JOIN public.planipret_profiles sender
      ON sender.id = planipret_team_messages.sender_id
    WHERE reader.user_id = auth.uid()
      AND reader.organization_id IS NOT NULL
      AND reader.organization_id = sender.organization_id
  )
);
