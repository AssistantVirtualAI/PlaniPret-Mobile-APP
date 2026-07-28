-- Create webhook_events table for storing incoming webhook events
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature TEXT,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view webhook events from their organizations
CREATE POLICY "Users can view organization webhook events"
  ON public.webhook_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = webhook_events.organization_id
        AND user_id = auth.uid()
    )
  );

-- RLS: System (service role) can insert webhook events
CREATE POLICY "Service role can insert webhook events"
  ON public.webhook_events FOR INSERT
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_webhook_events_org_id ON public.webhook_events(organization_id);
CREATE INDEX idx_webhook_events_connector ON public.webhook_events(connector);
CREATE INDEX idx_webhook_events_event_type ON public.webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON public.webhook_events(processed);
CREATE INDEX idx_webhook_events_created_at ON public.webhook_events(created_at DESC);