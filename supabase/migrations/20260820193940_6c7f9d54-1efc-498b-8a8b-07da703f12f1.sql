WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, dedupe_key
           ORDER BY (maestro_call_id IS NOT NULL) DESC, created_at ASC, id ASC
         ) AS rn
  FROM public.planipret_maestro_call_dedupe
)
DELETE FROM public.planipret_maestro_call_dedupe d
USING ranked r
WHERE d.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX planipret_maestro_call_dedupe_user_key_uidx
ON public.planipret_maestro_call_dedupe (user_id, dedupe_key)
WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX planipret_maestro_call_dedupe_anonymous_key_uidx
ON public.planipret_maestro_call_dedupe (dedupe_key)
WHERE user_id IS NULL;