# Users, Subscribers, Domains (v45.0)

## Domains
- `GET /domains` — list (Super User/Reseller scoped)
- `POST /domains` — create domain (v2 also auto-creates "domain" subscriber for defaults + dialplan)
- `GET /domains/{domain}` — read one; `GET /domains/~` = my domain (getmydomain)
- `PUT /domains/{domain}` — update
- `DELETE /domains/{domain}` — delete
- `GET /domains/{domain}?billing` (domainbilling) — domain with billing summary
- `GET /domains/count` (countdomains) / existence check (countdomain)
- `domain` path param: string ≤64 chars, default `~` = domain linked to caller's token/key; `*` = all domains (Super User/Reseller only)

## Users
- `GET /domains/{domain}/users` — list users (getusers), supports search (searchusers), count (countusers)
- `GET /domains/{domain}/users/{user}` — read one; `user` param 0–16 chars, default `~` = token's own user
- `GET /domains/{domain}/users/~` / `getmyuser` — current user
- `POST /domains/{domain}/users` — create
- `PUT /domains/{domain}/users/{user}` — update
- `DELETE /domains/{domain}/users/{user}` — delete

### Key User fields (subset)
- `name-first-name`, `name-last-name`, `login-username` (default `[user]@[domain]`), `email-address` (semicolon-separated list)
- `department`, `site`, `time-zone`, `dial-plan`, `dial-policy`
- `voicemail-login-pin`, `voicemail-enabled`, `voicemail-user-control-enabled`, `voicemail-greeting-index`, `voicemail-receive-broadcast-enabled`
- `voicemail-playback-announce-datetime-received`, `voicemail-playback-announce-caller-id`, `voicemail-playback-sort-newest-to-oldest`
- `voicemail-transcription-enabled` — default `no`; enum: `no`, `Deepgram`, `Google`, `Mutare`, `Voicebase`
- `email-send-alert-new-voicemail-behavior` — default `no`; enum: `no,yes,attnew,attsave,atttrash,brief,briefattnew,briefattsave,briefatttrash`
- `email-send-alert-new-voicemail-enabled`, `email-send-alert-new-missed-call-enabled`, `email-send-alert-data-storage-limit-reached-enabled`
- `email-send-alert-new-voicemail-cc-list-csv`
- `caller-id-number`, `caller-id-name`, `caller-id-number-emergency`, `area-code`
- `ring-no-answer-timeout-seconds` — governs how long inbound rings before moving to next option/voicemail (see answerrules.md)
- `privacy`, `reject-anonymous-calls-enabled`
- `phone-numbers-to-allow-enabled`, `phone-numbers-to-reject-enabled`, `call-screening-enabled`
- `directory-name-number-dtmf-mapping`, `directory-annouce-in-dial-by-name-enabled`, `directory-name-visible-in-list-enabled`, `directory-override-order-duplicate-dtmf-mapping`
- `limits-max-data-storage-kilobytes`, `limits-max-active-calls-total`, `active-calls-total-current` (read-only)
- `user-presence-status` (read-only, computed from registration/answer-rules/active calls)
- `recording-configuration`, `call-recordings-hide-from-others-enabled`
- `music-on-hold-randomized-enabled`, `music-on-hold-comfort-message-repeat-interval-seconds`
- `emergency-address-id`, `service-code`, `language-token` (default `en_US`)
- `account-status` (read-only) — enum `standard, reset, new, pwd reset`
- `created-datetime`, `last-modified-datetime` (read-only)
- `user-scope`, `status-message`

## Sites (under domain)
- `GET/POST /domains/{domain}/sites`, `GET/PUT /domains/{domain}/sites/{site}`, count variant.
