# NS-API v2 Devices (v45.0)

Base path: `/domains/{domain}/users/{user}/devices`

## Endpoints
- `GET /domains/{domain}/users/{user}/devices` — GetDevices (list all devices for user)
- `GET /domains/{domain}/users/{user}/devices/{device}` — GetDevice (single device)
- `POST /domains/{domain}/users/{user}/devices` — CreateDevice
- `PUT /domains/{domain}/users/{user}/devices/{device}` — UpdateDevice
- `DELETE /domains/{domain}/users/{user}/devices/{device}` — DeleteDevice
- `GET /domains/{domain}/users/{user}/devices?count` or count endpoint — CountDevices

Path params:
- `domain` (string, required, ≤64 chars, default `~` = domain of token/key)
- `user` (string, required, 0–16 chars, default `~` = user of token/key)
- `device` (string) — the device id; forms first part of `device-sip-registration-uri` (`sip:[device]@[domain]`)

Create body requires only `device` (all other fields optional with system defaults/randoms). Body also accepts top-level `synchronous` (yes/no) to control sync/async apply (POST can return 200 sync or 202 async accepted).

## Device object — full field reference

| Field | Type | Default | Enum | Notes |
|---|---|---|---|---|
| `device` | string | — | — | Device id; required on create |
| `user` | string | — | — | owning user |
| `domain` | string | — | — | owning domain |
| `device-sip-registration-uri` | string, read-only | — | — | Full SIP URI, `sip:[device]@[domain]` |
| `device-sip-registration-state` | string, read-only | — | `registered`, `unregistered` | Current reg status within valid time window |
| `device-sip-registration-password` | string (password) | random 16-char if unset | — | SIP registration password |
| `caller-id-number-emergency` | string | `[*]` | — | Per-device override of emergency CID |
| `device-force-notify-new-voicemails-enabled` | yes/no | `no` | yes/no | (doc text mislabeled but controls forced VM notify) |
| `device-level-call-recording-enabled` | yes/no | `no` | yes/no | Per-device recording |
| `device-push-enabled` | yes/no | **yes** | yes/no | Enables mobile/web push notifications to wake app for incoming calls — CRITICAL for mobile/soft clients using push instead of persistent SIP registration |
| `device-sip-registration-contact` | string, read-only | — | — | Contact URI from last successful registration |
| `device-sip-registration-core-server` | string (hostname), read-only | — | — | Server handling last registration; used to route inbound calls to this device |
| `device-sip-registration-datetime` | datetime/null, read-only | — | — | Last registration time (may lag for replication) |
| `device-sip-registration-expires-datetime` | datetime/null, read-only | — | — | When device is considered unregistered; must be future for active devices |
| `device-sip-registration-expiry-seconds` | integer | **60** | — | Requested re-register period; device treated unregistered if it doesn't re-register within this window + system grace period. Mobile clients with intermittent connectivity should register well before this |
| `device-sip-registration-ignore-for-presence-calculation` | yes/no | `no` | yes/no | Exclude this device reg state from user's aggregate presence |
| `device-sip-registration-ignore-report-enabled` | yes/no | `no` | yes/no | |
| `device-sip-registration-ip-address` | string, read-only | — | — | IP:port of last successful registration |
| `device-sip-registration-user-agent` | string, read-only | — | — | e.g. "Yealink T48 2.3.232", "SnapMobile Web 44.0.2" |
| `device-sip-no-to-tag-in-cancel` | yes/no | `no` | yes/no | Compatibility flag for some UAs |
| `device-srtp-enabled` | string | `no` | `yes`, `no`, `opportunistic` | `yes` forces SRTP; `opportunistic` will use SRTP if far end supports, else fallback |
| `auto-answer-enabled` | yes/no | `no` | yes/no | |
| `recording-configuration` | object ($ref RecordingConfiguration) | — | — | |
| `device-sip-allowed-user-agent` | string | — | — | Restrict registration to matching/partial User-Agent string (extra security) |
| `device-sip-nat-traversal-enabled` | string | **automatic** | `automatic`, `none`, `never`, `fixed` | NAT traversal mode; "automatic" correct for most devices/mobile behind NAT |
| `device-sip-latency-seconds-current` | number, read-only | — | — | Latency of latest registration (407 challenge → 200 OK w/ auth) |
| `device-sip-latency-seconds-average` | number, read-only | — | — | Average of last 5 registration attempts |
| `emergency-address-id` | string/null | — | — | Overrides address-id for E911/DLR for this device |
| `error-reading-from-endpoint-module` | string, read-only | — | — | "yes" = API had issue accessing NDP for mac-specific data |
| `login-username` | string, read-only | — | — | Owning user's login |
| `name-full-name` | string, read-only | — | — | Owning user's full name |
| `device-models-model` | string | — | — | Provisioning model, e.g. "Polycom VVX500"; used with mac address to link provisioning |
| `device-provisioning-mac-address` | string | — | — | MAC address to link device to provisioning platform (requires `device-models-model`) |
| `device-provisioning-registration-core-server` | string | — | — | Primary SipBx server config to provision to |
| `device-provisioning-sip-transport-protocol` | string | `udp` | `udp`, `tcp`, `tls` | Transport requested for provisioning; mobile/web devices commonly use `tls` |
| `device-provisioning-username` | string/null | — | — | Auth for provisioning config request |
| `device-provisioning-password` | string/null | — | — | Auth for provisioning config request |
| `device-provisioning-line` | integer | — | — | Which line is used when provisioning by mac/model |
| `device-provisioning-overrides` | string | — | — | Overrides in provisioning server config for linked mac |

### Example CreateDevice payload
```json
{
  "device": "{{user}}x",
  "device-srtp-enabled": "yes",
  "device-sip-registration-ignore-for-presence-calculation": "no",
  "device-push-enabled": "yes",
  "device-level-call-recording-enabled": "yes",
  "device-sip-auto-answer-enabled": "no",
  "mac": "5588665412",
  "model": "Polcom VVX500"
}
```

### Web/Mobile device conventions
- Web/softphone/mobile app registrations commonly use a device id suffix convention (e.g., `{user}x` for a soft client vs. numeric extension for hardware), and `device-sip-registration-user-agent` examples show mobile/web clients like "SnapMobile Web 44.0.2".
- Mobile clients relying on push (rather than staying registered in background) should set `device-push-enabled=yes` (default). When push is used, the OS may kill the SIP registration in the background — the platform pairs `device-push-enabled` with push notification services to wake the app to re-register/answer. If push isn't properly configured/enabled and the OS suspends the app, `device-sip-registration-state` will read `unregistered` and calls will not route to that device (falling through to next answer-rule step, e.g., voicemail).
- `device-sip-registration-expiry-seconds` (default 60s) is short; mobile networks with NAT/carrier timeouts shorter than this can cause registration to lapse — consider a lower re-register interval on constrained networks, but note this increases signaling traffic/battery use.

### Responses
- 200 OK — full Device object.
- 202 Accepted — on async create/update (when not synchronous), body may be empty pending processing.
- 400 Bad Request / 401 Authentication Required / 404 Record not found — `ErrorResponse {code, message}`.
