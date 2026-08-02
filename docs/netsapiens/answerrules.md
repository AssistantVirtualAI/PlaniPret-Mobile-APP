# Answer Rules (v45.0)

Base path: `/domains/{domain}/users/{user}/answerrules`

## Endpoints
- `GET /domains/{domain}/users/{user}/answerrules` — list all answer rules (one per time-frame) for user
- `GET /domains/{domain}/users/{user}/answerrules/{timeframe}` — read one rule by time-frame
- `POST /domains/{domain}/users/{user}/answerrules` — create/add answer rule (body includes `synchronous`)
- `PUT /domains/{domain}/users/{user}/answerrules/{timeframe}` — update rule for a timeframe
- `PUT /domains/{domain}/users/{user}/answerrules/reorder` — reorder rules (priority)
- `DELETE /domains/{domain}/users/{user}/answerrules/{timeframe}` — delete rule
- `GET /domains/{reseller-or-system}/users/answerrules` (get_domains-users-answerrules) — broader/bulk read variant

## Answerrule object fields
- `domain`, `user`
- `time-frame` (string) — required; identifies the rule; `*` = default/always rule used when no custom timeframes configured
- `enabled` (yes/no, default **yes**)
- `is-active` (boolean, read-only) — true if this timeframe is currently active given date/time + all timeframes
- `order` (integer, default 99, read-only in some contexts) — priority: lower number = higher priority; `*` timeframe defaults to 99 (lowest) if not set
- `simultaneous-ring` → `AnswerruleFeatureSimRing` (see below) — SimRing/Forward feature
- `do-not-disturb` → object `{ enabled: yes/no }` — blocks all inbound ringing, sends straight to voicemail if enabled
- `forward-always` → `AnswerruleFeature`
- `forward-on-active` → `AnswerruleFeature` (forward when user already on a call)
- `forward-on-busy` → `AnswerruleFeature`
- `forward-no-answer` → `AnswerruleFeature` (used with ring-no-answer-timeout-seconds on the User object)
- `forward-when-unregistered` → `AnswerruleFeature` (KEY for mobile devices: fires when no device is registered)
- `forward-on-dnd` → `AnswerruleFeature`
- `forward-on-spam-call` → `AnswerruleFeature`
- `call-screening` → object `{ enabled: yes/no }` — prompts caller to record name before connecting
- `phone-numbers-to-allow` → `AnswerruleFeatureWithRemove` — bypass DND/call-screening for listed numbers
- `phone-numbers-to-reject` → `AnswerruleFeatureWithRemove` — reject listed numbers/callerids (e.g. `"anonymous"`, `"unknown"`)
- `new-position` (write-only) — `top` | `bottom`, moves rule to top (highest priority) or bottom (lowest) of the list
- `time_range_data` (read-only array of `Timeframe`) — calendar/day/time windows tied to this rule

## AnswerruleFeature schema (generic forward-type feature)
```json
{ "enabled": "yes|no", "parameters": [ /* strings or numbers */ ] }
```
`parameters` items can be:
- extension/user strings: `"park_1234"`, `"user_5555"`, `"queue_234"`, `"aa_AutoAttendantName"`, `"vmail_5555"`, `"phone_5555"`
- phone numbers as numbers, e.g. `18005551234`

## AnswerruleFeatureSimRing (simultaneous-ring) — special syntax
`parameters` array items support:
- `"1234wp"` — extension with wp suffix (waiting/parking? — device/extension format)
- `"3456;delay=15"` — ring a destination with a delay in seconds before it starts ringing (staggered ring)
- `"confirm_18005551234;delay=20"` — ring external number with confirm-on-answer (press key) prefix and delay
- `"<OwnDevices>"` — **literal special token** meaning "ring all of this user's own registered devices simultaneously" (this is the SimRing "OwnDevices" syntax) — commonly combined with other extensions/numbers in the same parameters array to ring own devices + other endpoints together
- plain numbers, e.g. `1234`, `18005551234`

Example from docs:
```json
"simultaneous-ring": {
  "enabled": "no",
  "parameters": [1234, 3245, "1231wp", 18587645200]
}
```
To simring the user's own devices plus an external number:
```json
"simultaneous-ring": {
  "enabled": "yes",
  "parameters": ["<OwnDevices>", "confirm_18005551234;delay=5"]
}
```

## Timeframe / Timerange objects
`Timeframe`: `time-frame` (name), `domain`, `user`, `time-range-data` (array of `Timerange`).
`Timerange` fields include:
- `ordinal-order` (integer) — unique index/order within the timeframe
- `start-date` (date, default `"now"`) — `YYYY-MM-DD` or `"now"` to disable start bound
- `end-date` (date, examples `"2023-09-15"`, `"never"`) — end of calendar range, or `"never"`
- (additional day-of-week / time-of-day range fields follow the same pattern as dial-rule matching fields — `*` wildcards typically usable)

## ring-no-answer-timeout-seconds
This setting lives on the **User** object (not the Answerrule): `ring-no-answer-timeout-seconds` — controls how long (seconds) an inbound call attempt rings before the platform stops trying that destination and moves to the next configured option (e.g., `forward-no-answer` target or voicemail). No documented default value was shown explicitly in the field description; verify per-domain default via `GET /domains/{domain}/users/{user}`.

## POST create example payload
```json
{
  "time-frame": "Vacation",
  "enabled": "yes",
  "forward-always": { "enabled": "no", "parameters": [18587645226] },
  "forward-on-busy": { "enabled": "no", "parameters": [] },
  "do-not-disturb": { "enabled": "no" },
  "forward-when-unregistered": { "enabled": "yes", "parameters": [18585551354] },
  "phone-numbers-to-reject": { "enabled": "yes", "parameters": ["anonymous", "unknown"] },
  "forward-on-active": { "enabled": "no", "parameters": [] },
  "forward-no-answer": { "enabled": "no", "parameters": [6154343] },
  "forward-on-spam-call": { "enabled": "yes", "parameters": ["vmail_1000"] },
  "call-screening": { "enabled": "no" },
  "simultaneous-ring": { "enabled": "no", "parameters": [1234, 3245, "1231wp", 18587645200] }
}
```

## Responses
- POST returns **202 Accepted** (async) with empty body typically.
- 400/401/404 use standard `ErrorResponse`.
