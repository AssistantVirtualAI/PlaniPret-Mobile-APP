# Phone Numbers / DIDs (v45.0)

## Endpoints
- `GET /phonenumbers` (system/reseller scope, getphonenumbers)
- `GET /domains/{domain}/phonenumbers` — list for domain
- `POST /domains/{domain}/phonenumbers` — add a number
- `GET /domains/{domain}/phonenumbers/{phonenumber}` — read one
- `PUT /domains/{domain}/phonenumbers/{phonenumber}` — update
- `DELETE /domains/{domain}/phonenumbers/{phonenumber}` — remove from domain
- `PUT .../{phonenumber}` variants for routing (all use dial-rule fields under the hood):
  - `updatephonenumberqueue` — send number to a call queue
  - `updatephonenumberuser` — send number to a user
  - `updatephonenumberoffnet` — forward to an offnet/external number (supports adding a SIP header + responder app for call ownership/billing)
  - `updatephonenumberavailable` — return number to "available" inventory state
- Count: `countdomainphonenumbers`

## Phonenumber object
- `phonenumber` (e.g. E.164 format, e.g. US 10/11-digit)
- `enabled` (yes/no)
- `domain`
- `dial-rule-application`, `dial-rule-parameter` — routing action + its parameter (e.g., app=`user`, param=`user_1000`; app could route to queue/offnet/etc.)
- `dial-rule-translation-destination-user`, `dial-rule-translation-destination-host` (default `[*]`)
- `dial-rule-translation-source-name` (default `[*]`)
- `dial-rule-description`

## DialRule object (dialtranslations) — full routing/translation rule
- `domain`, `dial-rule-dial-plan` (dial plan name this rule belongs to)
- `dial-rule-matching-to-uri` — main digit-string match for translation
- `dialrule` — id for read/update/delete of an individual rule
- `enabled`
- `dial-rule-matching-from-uri` (default `*`) — match by caller as well as forward destination
- `dial-rule-matching-day-of-week` (default `*`)
- `dial-rule-matching-start-date` / `dial-rule-matching-end-date` (default `*`)
- `dial-rule-matching-start-time` / `dial-rule-matching-end-time` (default `*`, format HH:MM)
- `dial-rule-application` — routing action/app to invoke
- `dial-rule-parameter` — parameter for the application (default empty)
- `dial-rule-translation-destination-scheme` (default `[*]`; enum `[*]`, `sip:`, `<Null>`)
- `dial-rule-translation-destination-user`
- `dial-rule-translation-destination-host` (default `[*]`)
- `dial-rule-translation-source-name` (default `[*]`)
- `dial-rule-translation-source-scheme` (default `[*]`; enum same as destination scheme)
- `dial-rule-translation-source-user` (default `[*]`)
- `dial-rule-translation-source-host` (default `[*]`)
- `dial-rule-description`
