ALTER TABLE public.user_presence DROP CONSTRAINT IF EXISTS user_presence_status_check;
ALTER TABLE public.user_presence ADD CONSTRAINT user_presence_status_check
  CHECK (status = ANY (ARRAY['available','busy','away','dnd','offline','out_of_office','on_call','meeting','lunch','break']));