ALTER TABLE public.planipret_task_mutations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_task_mutations;