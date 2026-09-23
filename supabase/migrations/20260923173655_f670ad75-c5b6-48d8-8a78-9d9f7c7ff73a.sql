CREATE TABLE public.pp_feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL DEFAULT auth.uid(),
  reporter_name text,
  title text NOT NULL,
  description text,
  page text,
  source text NOT NULL DEFAULT 'portal',
  severity text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'new',
  screenshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pp_feedback_reports TO authenticated;
GRANT ALL ON public.pp_feedback_reports TO service_role;
ALTER TABLE public.pp_feedback_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppfb_select" ON public.pp_feedback_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_planipret_admin(auth.uid()));
CREATE POLICY "ppfb_insert" ON public.pp_feedback_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "ppfb_update" ON public.pp_feedback_reports FOR UPDATE TO authenticated
  USING (reporter_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
  WITH CHECK (reporter_id = auth.uid() OR public.is_planipret_admin(auth.uid()));
CREATE POLICY "ppfb_delete" ON public.pp_feedback_reports FOR DELETE TO authenticated
  USING (reporter_id = auth.uid() OR public.is_planipret_admin(auth.uid()));
CREATE TRIGGER trg_pp_feedback_reports_updated_at BEFORE UPDATE ON public.pp_feedback_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.pp_feedback_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.pp_feedback_reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pp_feedback_comments TO authenticated;
GRANT ALL ON public.pp_feedback_comments TO service_role;
ALTER TABLE public.pp_feedback_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppfbc_select" ON public.pp_feedback_comments FOR SELECT TO authenticated
  USING (public.is_planipret_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.pp_feedback_reports r WHERE r.id = report_id AND r.reporter_id = auth.uid()));
CREATE POLICY "ppfbc_insert" ON public.pp_feedback_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND (public.is_planipret_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.pp_feedback_reports r WHERE r.id = report_id AND r.reporter_id = auth.uid())));
CREATE POLICY "ppfbc_delete" ON public.pp_feedback_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_planipret_admin(auth.uid()));
CREATE INDEX idx_pp_feedback_comments_report ON public.pp_feedback_comments(report_id);
CREATE INDEX idx_pp_feedback_reports_reporter ON public.pp_feedback_reports(reporter_id);

CREATE POLICY "ppfb_shots_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pp-feedback-screenshots' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_planipret_admin(auth.uid())));
CREATE POLICY "ppfb_shots_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pp-feedback-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "ppfb_shots_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pp-feedback-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

ALTER PUBLICATION supabase_realtime ADD TABLE public.pp_feedback_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pp_feedback_comments;