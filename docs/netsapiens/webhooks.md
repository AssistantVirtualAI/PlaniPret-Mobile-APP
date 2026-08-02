# NetSapiens NS-API v2 — Event Subscriptions (Webhooks)

Base URL for subscriptions: `https://ns-api.com/ns-api/v2/subscriptions`

## Overview
V2 subscriptions support redundancy (subscription can move between servers on failure), status visibility, post/error counters, and a preferred-server setting. Events are delivered as an HTTP POST of a JSON **array of objects** to your `post-url`.

**Important:** Subscription delivery is based on a DB poll of the relevant table, checked every **3 seconds** — not truly real-time.

## Create a Subscription
`POST /subscriptions`

| Field | Type | Required | Notes |
|---|---|---|---|
| model | string (enum) | yes | one of: `agent`, `auditlog`, `auditlog_lite`, `call`, `call_origid`, `cdr`, `message`, `messagesession`, `subscriber`, `presence`, `voicemail` |
| post-url | url | yes | HTTPS recommended (custom ports supported); HTTP allowed but not ideal for production; must have valid SSL if https |
| subscription-geo-support | string (enum) | no, default `yes` | `yes`/`no` — enables geo-redundant delivery/dedup handling |
| reseller | string | no | reseller scope filter; `*` = all resellers (Super User scope only) |
| domain | string | no, default `*` | domain filter; `*` = all domains (Super User scope only); resellers must request per-domain |
| user | string | no, default `*` | user filter; `*` = all users |
| subscription-expires-datetime | date-time | no | format `YYYY-MM-DD HH:MM:SS`; defaults to token's expiry, or 20 years out for API keys |
| preferred-server | string | no | hostname preferred to send events from; fails back after 60s stability |

Response 200: subscription object, e.g.:
```json
{
  "id": "f38d00a5eed9d15603922fe98db23600",
  "subscription-geo-support": "yes",
  "post-url": "https://local.netsapiens.com/log.php",
  "model": "call",
  "user-scope": "Super User",
  "reseller": "*",
  "domain": "*",
  "user": "*",
  "preferred-server": "eng0-san.netsapiens.com",
  "current-active-server": "",
  "status": "pending",
  "error-count": 0,
  "posts-count": 0,
  "subscription-creation-datetime": "2023-10-09 17:16:36",
  "subscription-expires-datetime": "2043-10-04 17:16:36"
}
```
Errors: 400, 401, 404, **409 (Subscription already exists)**.

## Read / Update / Delete Subscriptions
- `GET /subscriptions` — list subscriptions (supports pagination: `start`, `limit`)
- `GET /subscriptions/{id}` — read one
- `PUT /subscriptions/{id}` — update (same fields as create)
- `DELETE /subscriptions/{id}` — remove

## Event Models (types)
| Model | Description |
|---|---|
| agent | Fires on agent entry change: availability + queue changes; covers user- and device-based agents. |
| auditlog | 1 event per audit log entry (Super User scope only); domain filter uses `target_domain`. |
| auditlog_lite | Streamlined audit stream focused on create/delete of domain, user, reseller, callqueue, agent, conference, phonenumber. `phonenumber` only fires on API changes (v1/v2), not admin UI. |
| call | All active-call state changes (create/update/remove) matching filters. Look for `"remove": "yes"` for call teardown. |
| call_origid | Like `call` but keyed only off `orig_callid` changes — misses term-side events (e.g. multi-ring, transfers). |
| cdr | 1 event at call completion — good trigger for post-call workflows (transcriptions, recordings). |
| message | 1 event per chat/SMS message received; filter by user+domain. |
| messagesession | 1 event per session update (new message, or read-marker). |
| subscriber | Fires on subscriber/user update; includes most user fields. |
| presence | Like `subscriber` but limited to user, name, status, presence changes. |
| voicemail | 1 event per recorded voicemail; built-in delay to try to include transcription (not guaranteed) — re-GET voicemail if transcription needed. |

## Payload Format
All posts are JSON, structured as an **array of objects**; object schema is specific to the chosen `model` (matches the corresponding read/GET resource schema, e.g. message objects match the Messages resource, voicemail objects match the Voicemail resource).

## Authentication / Verification of Incoming Posts
- Restrict inbound traffic to known NetSapiens cluster IPs as the simplest safeguard.
- V2 adds an `X-Correlation-ID` HTTP header on each post containing the subscription ID — keep this value secret and use it to validate/match incoming posts (useful when multiple subscriptions share one post-url).
- No signature/HMAC scheme is documented; verification is IP allowlisting + correlation ID matching.

## Redundancy
- Server sync tracks nsnode app health; a server must be stable 60s continuously and have fewest active subscriptions to take over.
- Ties broken via deterministic random assignment for predictable failover.
- `preferred-server` and `current-active-server` fields expose/control this.
