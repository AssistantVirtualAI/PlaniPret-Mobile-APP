
-- voicemail-audio (read for authenticated; writes via service role)
CREATE POLICY "auth read voicemail audio" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'voicemail-audio');

-- voicemail-greetings (owner CRUD; folder = user_id)
CREATE POLICY "owner read greetings" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'voicemail-greetings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner write greetings" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'voicemail-greetings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner update greetings" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'voicemail-greetings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner delete greetings" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'voicemail-greetings' AND auth.uid()::text = (storage.foldername(name))[1]);

-- chat-attachments (auth read; owner write to own folder)
CREATE POLICY "auth read chat attach" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'chat-attachments');
CREATE POLICY "owner write chat attach" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner update chat attach" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner delete chat attach" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
