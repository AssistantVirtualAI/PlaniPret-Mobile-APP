-- Remove fake/seeded CDRs (test prefix +1514555xxxx)
DELETE FROM public.pbx_call_records
WHERE organization_id = '71755d33-ed64-4ad5-a828-61c9d2029eb7'
  AND (caller_number LIKE '+1514555%' OR destination_number LIKE '+1514555%' OR caller_number LIKE '1514555%');

-- Remove fake SMS messages then threads (555 test numbers)
DELETE FROM public.pbx_sms_messages
WHERE thread_id IN (
  SELECT id FROM public.pbx_sms_threads
  WHERE organization_id = '71755d33-ed64-4ad5-a828-61c9d2029eb7'
    AND (did_number LIKE '+1514555%' OR contact_phone LIKE '+1514555%')
);
DELETE FROM public.pbx_sms_threads
WHERE organization_id = '71755d33-ed64-4ad5-a828-61c9d2029eb7'
  AND (did_number LIKE '+1514555%' OR contact_phone LIKE '+1514555%');

-- Remove any orphaned recordings/transcripts/insights without a parent call record
DELETE FROM public.pbx_call_recordings WHERE call_record_id NOT IN (SELECT id FROM public.pbx_call_records);
DELETE FROM public.pbx_call_transcripts WHERE call_record_id NOT IN (SELECT id FROM public.pbx_call_records);
DELETE FROM public.pbx_ai_insights WHERE call_record_id NOT IN (SELECT id FROM public.pbx_call_records);