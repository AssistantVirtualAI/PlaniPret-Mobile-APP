
-- SMS templates
CREATE TABLE IF NOT EXISTS public.planipret_sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.planipret_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  created_by uuid,
  use_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_sms_templates TO authenticated;
GRANT ALL ON public.planipret_sms_templates TO service_role;
ALTER TABLE public.planipret_sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker reads own and shared templates"
ON public.planipret_sms_templates FOR SELECT TO authenticated
USING (is_shared = true OR user_id = auth.uid() OR public.is_planipret_admin(auth.uid()));

CREATE POLICY "broker inserts own templates"
ON public.planipret_sms_templates FOR INSERT TO authenticated
WITH CHECK (
  (is_shared = false AND user_id = auth.uid())
  OR (is_shared = true AND public.is_planipret_admin(auth.uid()))
);

CREATE POLICY "broker updates own; admin updates shared"
ON public.planipret_sms_templates FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR (is_shared = true AND public.is_planipret_admin(auth.uid())))
WITH CHECK (user_id = auth.uid() OR (is_shared = true AND public.is_planipret_admin(auth.uid())));

CREATE POLICY "broker deletes own; admin deletes shared"
ON public.planipret_sms_templates FOR DELETE TO authenticated
USING (user_id = auth.uid() OR (is_shared = true AND public.is_planipret_admin(auth.uid())));

CREATE TRIGGER planipret_sms_templates_updated_at BEFORE UPDATE ON public.planipret_sms_templates
FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

-- Push subscriptions
CREATE TABLE IF NOT EXISTS public.planipret_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.planipret_profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_push_subscriptions TO authenticated;
GRANT ALL ON public.planipret_push_subscriptions TO service_role;
ALTER TABLE public.planipret_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker manages own push subs"
ON public.planipret_push_subscriptions FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Notification preference columns
ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS notif_calls boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_sms boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_voicemails boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_ai boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_reminders boolean NOT NULL DEFAULT true;

-- Default shared templates (idempotent)
INSERT INTO public.planipret_sms_templates (user_id, title, body, is_shared)
SELECT NULL, t.title, t.body, true
FROM (VALUES
  ('Rappel 15min', 'Je vous rappelle dans 15 minutes.'),
  ('Documents requis', 'Merci pour votre appel. Voici les documents requis: [liste]'),
  ('Rendez-vous confirmé', 'Votre rendez-vous est confirmé pour le {date} à {heure}.'),
  ('Prochaines étapes', 'Bonjour, suite à notre conversation, voici les prochaines étapes...'),
  ('Suivi documents', 'Avez-vous eu l''occasion de consulter les documents que je vous ai envoyés?')
) AS t(title, body)
WHERE NOT EXISTS (
  SELECT 1 FROM public.planipret_sms_templates WHERE is_shared = true AND title = t.title
);
