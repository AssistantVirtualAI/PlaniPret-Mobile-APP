# NetSapiens NS-API v2 — Voicemail

Base URL: `https://ns-api.com/ns-api/v2`
Tag: **Media/Voicemail**

## Folders
Voicemail messages live in one of three folders: `new`, `save`, `trash`.

## Endpoints

### List Voicemail for User by Folder
`GET /domains/{domain}/users/{user}/voicemails/{folder}`

### Count Voicemail for User by Folder
`GET /domains/{domain}/users/{user}/voicemails/{folder}/count`

### Read Specific Voicemail (metadata + transcription)
`GET /domains/{domain}/users/{user}/voicemails/{folder}/{filename}`

Path params:
| Param | Type | Notes |
|---|---|---|
| domain | string | ≤64 chars, `~` = caller's domain |
| user | string | 0–16 chars, `~` = caller's account |
| folder | string, required | `new`, `save`, or `trash` |
| filename | string, required | voicemail audio filename (ends `.wav`) |

Response 200 fields (array of objects):
| Field | Type | Notes |
|---|---|---|
| filename | string | e.g. `vm-20230306200014008354-....wav` |
| index | string | ID/index derived from filename |
| ordinal-order | integer | index/position of the audio file |
| length / file-duration-seconds | integer | duration in seconds |
| filesize / file-size-kilobytes | string | formatted file size |
| filedate / created-datetime | string | creation timestamp |
| remotepath / file-access-url | string | URL for remote playback (signed, time-limited auth param) |
| moh_script / file-script-text | string | script text if generated via TTS |
| source_type / file-source | string | origin of file (recorded vs TTS, etc.) |
| voice_id / text-to-speech-voice-id | string | default `en-US-Wavenet-C` |
| voice_language / text-to-speech-language | string | default `en_US` |
| FromName | string | caller name |
| FromUser | string | caller user extension |
| FromHost | string | caller's domain/host |
| NmsAni | string | ANI info |
| RecordTime / recorded-datetime | string | when recorded |
| NmsRecStartTime | string | recording start timestamp |
| NmsRecDuration | string | recording duration |
| TimeZone | string | e.g. `US/Pacific` |
| transcription | string | speech-to-text transcript of the voicemail (delivered when available; not guaranteed instantly — vendor latency) |

Example `file-access-url`:
`https://vb.netsapiens.com/ns-api/?object=audio&action=play&domain=portal&user=2000&type=vmail&time=...&auth=...&file=....wav`

Errors: 400, 401, 404.

### Delete / Move Voicemail
Standard REST DELETE on the voicemail resource path moves/removes a message (e.g. moving folder `new`→`trash` or permanent delete from `trash`).

## Voicemail Reminders (vmailnag)
- `GET /domains/{domain}/users/{user}/vmailnag` — read reminder settings
- `PUT /domains/{domain}/users/{user}/vmailnag` — update reminder settings
- `DELETE /domains/{domain}/users/{user}/vmailnag` — remove reminder settings

## Voicemail Enable/Settings on User
Voicemail on/off and delivery behavior are managed via user/device settings (Answering Rules / User resource), including:
- Enabling voicemail box for a user (`subscription-geo-support`-style yes/no toggles referenced elsewhere in Subscribers settings — general User PUT includes voicemail box enable flags).
- Greetings are managed as audio files uploaded/recorded via the **Audio (Moh/Greeting) upload/tts** endpoints (supports synchronous 200 create, see limits_errors.md), with fields for TTS voice-id/language mirroring the voicemail object (`text-to-speech-voice-id`, `text-to-speech-language`).

## Email Delivery
- Voicemail-to-email (and email-with-attachment / notify-only) is configured through the user's voicemail/email settings on the User resource (email address + delivery mode fields); the voicemail message object's `file-access-url` and `transcription` are the fields typically included in email/webhook payloads for delivery workflows.

## Transcription
- Transcription is returned in the `transcription` field of the voicemail object.
- Not guaranteed to be immediately available — vendor latency applies; for the `voicemail` event-subscription model, re-GET the voicemail if the transcription is required and not yet present in the event payload.
