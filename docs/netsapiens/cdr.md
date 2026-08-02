# Call Detail Records (CDR) v2 (v45.0)

## Endpoints
- `GET /cdrs` + `GET /cdrs/count`
- `GET /domains/{domain}/cdrs` (+ two documented variants "cdrs-1"/"cdrs-2", likely different filter/format modes) and `GET /domains/{domain}/cdrs/count`
- `GET /domains/{domain}/users/{user}/cdrs` + `/count`
- `GET /domains/{domain}/recordings/{callid}` and `/domains/{domain}/users/{user}/recordings/{callid}` — fetch call recording for a CDR
- `GET /domains/{domain}/calls` / `/calls/count` — active/live calls, distinct from historical CDRs
- Guide: "CDR Field Mappings" doc explains legacy v1 → v2 CDR field name mapping.

## CDR (`CdrD`) fields (subset; dense)
id, domain, reseller, call-account-code,
call-answer-datetime, call-audio-codec,
call-audio-relay-side-a-local-port, call-audio-relay-side-a-packet-count, call-audio-relay-side-a-remote-ip,
call-audio-relay-side-b-packet-count, call-audio-relay-side-b-remote-ip,
call-batch-answer-datetime, call-batch-on-hold-duration-seconds, call-batch-sequence-marker, call-batch-start-datetime, call-batch-total-duration-seconds,
call-direction, call-disconnect-datetime, call-disconnect-reason-text,
call-disposition, call-disposition-notes, call-disposition-reason, call-disposition-submitted-datetime, call-disposition-type,
call-fax-codec, call-fax-relay-side-a-local-port, call-fax-relay-side-a-packet-count, call-fax-relay-side-a-remote-ip, call-fax-relay-side-b-packet-count, call-fax-relay-side-b-remote-ip,
call-intelligence-job-id, call-intelligence-percent-negative, call-intelligence-percent-neutral, call-intelligence-percent-positive, call-intelligence-topics-top,
call-leg-ordinal-index, call-on-hold-duration-seconds,
call-orig-call-id, call-orig-caller-id, call-orig-department, call-orig-domain, call-orig-from-host, call-orig-from-name, call-orig-from-uri, call-orig-from-user, call-orig-ip-address, call-orig-match-uri, call-orig-pre-routing-uri, call-orig-request-host, call-orig-request-uri, call-orig-request-user, call-orig-reseller, call-orig-site, call-orig-to-host, call-orig-to-uri, call-orig-to-user, call-orig-user,
call-parent-call-id, call-parent-cdr-id, call-record-creation-datetime, call-ringing-datetime, call-routing-class, call-routing-match-uri, call-start-datetime, call-tag, call-talking-duration-seconds,
call-term-call-id, call-term-caller-id, call-term-department, call-term-domain, call-term-ip-address, call-term-match-uri, call-term-pre-reouting-uri (sic), call-term-reseller, call-term-site, call-term-to-uri, call-term-user,
call-through-action, call-through-call-id, call-through-caller-id, call-through-department, call-through-domain, call-through-reseller, call-through-site, call-through-uri, call-through-user,
call-total-duration-seconds,
call-video-codec, call-video-relay-side-a-local-port, call-video-relay-side-a-packet-count, call-video-relay-side-a-remote-ip, call-video-relay-side-b-packet-count, call-video-relay-side-b-remote-ip,
call-server-mac-address, core-server, hide-from-results, is-trace-expected, prefilled-trace-api, prefilled-transcription-api.

Note the `orig`/`term`/`through` prefix pattern: each CDR leg records origination, termination, and pass-through party details separately, plus batch aggregation fields for multi-segment call sessions (e.g., after transfers/forwards) via `call-batch-*` and `call-parent-call-id`/`call-parent-cdr-id`.

## Notes
- Use `/count` variants for pagination totals before paging through large date ranges (see "Pagination and API data" guide).
- `call-disposition` / `call-disposition-type` / `call-disposition-reason` capture end-state classification (e.g., answered, no-answer, failed, voicemail).
