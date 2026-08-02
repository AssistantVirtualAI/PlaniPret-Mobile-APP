# NetSapiens NS-API v2 — Messaging (SMS/MMS/Chat)

Base URL: `https://ns-api.com/ns-api/v2`

## Concepts
- A **messagesession** groups messages between participants (chat, SMS, or group MMS).
- **messages** are individual sent/received items within a session.
- `domain` and `user` path params accept `~` to mean "my domain"/"my account" (derived from token).

## Endpoints

### Start a new Message Session
`POST /domains/{domain}/users/{user}/messages`
Use when you don't yet have a messagesession ID.

### Send a message (Chat/SMS/MMS) into existing session
`POST /domains/{domain}/users/{user}/messagesessions/{messagesession}/messages`

Request body fields:
| Field | Type | Required | Notes |
|---|---|---|---|
| type | string | yes | message type (chat/sms/mms) |
| message | string | yes | text body of the message |
| destination | string \| array | yes | single user (chat) or phone number (SMS); array for multiple recipients |
| from-number | string | no | SMS only — the sending user's outbound number |
| data | string \| null | no | base64 media data (media chat / MMS) |
| mime-type | MimeTypes \| null | no | MIME type of media file (media chat/MMS) |
| size | integer \| null | no | media file size in bytes |

`messagesession` path param: ID of session, ≥32 chars, alphanumeric + underscore only, random.

Response: **202 Accepted** — `{ "code": 202, "message": "Accepted" }` (async, see limits_errors.md).

### Update Messagesession (Session Name)
`PUT/PATCH /domains/{domain}/users/{user}/messagesessions/{messagesession}` — renames chat session name. Cannot rename an MMS group session.

### Get Messages for a Messagesession
`GET /domains/{domain}/users/{user}/messagesessions/{messagesession}/messages`
Query params:
| Param | Type | Range | Default | Notes |
|---|---|---|---|---|
| limit | number | 1–1000 | 100 | max objects returned; use with `start` for pagination |

Response: 200, array of message objects. Message object fields:
| Field | Type | Notes |
|---|---|---|
| id | string/int | message ID |
| timestamp | string (enum-ish datetime) | sent/received time |
| type | string | e.g. `chat`, `sms`, `mms` |
| domain | string | ≤64 chars |
| direction | string | `term` (outbound) or `orig` (inbound) |
| from-number | string/int/null | SMS sending number (unset for chat) |
| from-user-id | string/null | sender's user ID (unset for offnet numbers) |
| from-video-attendee-id | string/null | if sent within a video call |
| from-user-agent | string/null | HTTP User-Agent of sender |
| dialed | string/null | destination number(s), comma-separated for group MMS; null for chat |
| text | string/int/number/array/bool/object/null | message body |
| terminating-user-id | string/null | receiving user ID |
| terminating-number | string/null | receiving number(s), comma-separated for group MMS; null for chat |
| status | string | e.g. `sending`, delivery status |
| video-instance-id | string/null | if from video session |
| media-type | string/null | MIME type if MMS/media |
| media-size | integer/null | media size in bytes |
| deleted-datetime | timestamp/null | set if deleted by video-meeting host |
| messagesession-reciever-hostname | string | server handling the session |
| messagesession-id | string | parent session ID |
| messagesession-participants | string/null | comma-separated participant list |

Errors: 400, 401, 404.

## Media / Attachments
- MMS/media-chat: send media as base64 in `data`, with `mime-type` and `size` fields on the send-message call.
- `media-type` / `media-size` are reported back on message read.

## Participants
- `messagesession-participants`: comma-separated list of participants tied to a messagesession; used for group MMS/chat.
- `destination` can be an array to start a session with multiple participants.

## Notes
- Chat destinations are user IDs; SMS/MMS destinations are phone numbers.
- `from-number` is required only for SMS sends (selects the outbound-capable number owned by the user).
