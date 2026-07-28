-- Migration: Maestro OAuth PKCE support
-- Adds code_verifier column to planipret_maestro_oauth_states (for mobile PKCE flow)
-- Adds maestro_oauth_client column to planipret_profiles (to track web vs mobile token)

-- Add code_verifier to oauth states table (nullable — only set for mobile PKCE flows)
ALTER TABLE planipret_maestro_oauth_states
  ADD COLUMN IF NOT EXISTS code_verifier TEXT;

-- Add maestro_oauth_client to profiles (tracks which client was used: 'web' | 'mobile')
ALTER TABLE planipret_profiles
  ADD COLUMN IF NOT EXISTS maestro_oauth_client TEXT DEFAULT 'web';
