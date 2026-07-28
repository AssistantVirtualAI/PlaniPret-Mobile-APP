
DROP INDEX IF EXISTS public.idx_pp_calls_ns;
CREATE UNIQUE INDEX idx_pp_calls_ns ON public.planipret_phone_calls(ns_call_id) WHERE ns_call_id IS NOT NULL;
