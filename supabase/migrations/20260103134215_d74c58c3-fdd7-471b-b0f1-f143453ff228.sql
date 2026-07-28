-- Ensure agent_insights upsert by conversation_id works
-- This unique index is required for ON CONFLICT (conversation_id)
CREATE UNIQUE INDEX IF NOT EXISTS agent_insights_conversation_id_uidx
ON public.agent_insights (conversation_id);
