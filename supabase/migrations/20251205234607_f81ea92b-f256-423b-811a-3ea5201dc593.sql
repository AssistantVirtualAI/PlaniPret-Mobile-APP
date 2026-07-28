-- Add onboarding_completed column to organizations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Add trial_ends_at to billing_config for trial tracking
ALTER TABLE public.billing_config 
ADD COLUMN IF NOT EXISTS trial_ends_at timestamp with time zone;

-- Update billing_config to support trial plan tier
-- (plan_tier already exists, just need to allow 'trial' value)