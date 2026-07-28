ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_action_check
  CHECK (action ~ '^[a-z0-9_.-]+$' AND length(action) BETWEEN 1 AND 100);