# Calls: Originate, Control, Queues (v45.0)

## Originate a call
`POST /domains/{domain}/users/{user}/calls` — CallRequest body:
- `synchronous` (yes/no)
- `call-id` (string) — client-generated random id to correlate/read back the call later
- `dial-rule-application` (default `"call"`) — app for next-destination selection
- `call-term-user` (string) — destination/termination number, used once first leg connects
- `call-orig-user` (default `user@domain`) — device/user/number for the FIRST leg (origination); if blank, defaults to originating user — this is effectively "who gets called first" (e.g., ring your own phone, then bridge to term destination — classic click-to-call flow)
- `auto-answer-enabled` (default `no`; yes/no) — requests auto-answer headers on first leg
- `caller-id-number` (string) — CID presented on termination leg (defaults to user's configured CID)
- `callback-caller-id-number` (string) — CID used on the first leg/callback call (defaults to user's CID if empty)
- `call-term-added-sip-header` (string) — extra SIP header added to the destination leg

## Call control
- `GET /domains/{domain}/users/{user}/calls` — list active calls for user
- `GET /domains/{domain}/users/{user}/calls/{callid}` — read one active call
- `DELETE /domains/{domain}/users/{user}/calls/{call-id}` — hangup call
- `DELETE /domains/{domain}/users/{user}/calls/{call-id}/reject` — reject (vs hangup) an inbound ringing call
- `PATCH /domains/{domain}/users/{user}/calls/{call-id}/answer` — answer a ringing call via API
- `PATCH /domains/{domain}/users/{user}/calls/{call-id}/hold` — hold
- `PATCH /domains/{domain}/users/{user}/calls/{call-id}/unhold` — unhold
- `PATCH /domains/{domain}/users/{user}/calls/{call-id}/transfer` — transfer (see "Attended Transfer Guide" doc for blind/attended flow)
- `GET /domains/{domain}/calls` + `/count` — all active calls in domain
- `getcalltrace` — retrieve SIP trace for a call (see also X-NetSapiens-Log header / InSight on-demand logging guide)
- `agentsinglecall` — single call handling for queue agents

## Call Queues
- `POST /domains/{domain}/callqueues` (createcallqueue)
- `GET /domains/{domain}/callqueues` (readcallqueues) / `GET .../{queue}` (readcallqueue)
- `PUT /domains/{domain}/callqueues/{queue}` (updatecallqueue)
- `DELETE /domains/{domain}/callqueues/{queue}` (deletecallqueue)
- `GET /domains/{domain}/queuedcall/{queue}` — calls currently queued in a specific queue
- Numbers routed to a queue via `updatephonenumberqueue` (sets phonenumber's dial-rule-application to queue routing)

## Call Blocking
See "Call Blocking Guide" doc — uses `phone-numbers-to-reject` on Answerrules and dial-rule matching to block by CID/pattern.
