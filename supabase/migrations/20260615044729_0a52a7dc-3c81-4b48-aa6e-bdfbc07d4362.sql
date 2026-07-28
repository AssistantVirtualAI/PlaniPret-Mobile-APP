DO $$
DECLARE
  jid int;
BEGIN
  FOREACH jid IN ARRAY ARRAY[1,15,16,17,18,19]
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobid = jid) THEN
      PERFORM cron.unschedule(jid);
    END IF;
  END LOOP;
END $$;