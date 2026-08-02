# NetSapiens NS-API v2 — Pagination, Errors, Rate Limits, Sync/Async

Base URL: `https://ns-api.com/ns-api/v2` (per-cluster hosts also exist, e.g. `https://dev1.ns-api.com/ns-api/v2`)

## Pagination
- Supported on virtually every GET that returns a list (not on GETs for a single specific resource, and not on `/count` endpoints).
- Query params: `start` and `limit`.
- Example: `GET /domains?start=1&limit=100`
- To page forward, increment `start` by your `limit` (e.g. next page `start=101` with `limit=100`).
- Per-endpoint limit caps vary; e.g. messages list: `limit` accepts 1–1000, default 100.
- Recommended technique for exploring output: set `limit=1` and increment `start`.

## Sorting
- Sorting/`sort` params exist on many list endpoints (endpoint-specific field names) but no single global sort spec is documented; check individual endpoint's OpenAPI parameters for a `sort` field where supported.

## Synchronous vs Asynchronous (200 vs 202)
- By default, writes (Create/POST, Update/PUT, Delete/DELETE) go through the internal service bus for replication to all nodes/DBs and return **202 Accepted** — treated as a full success with immediate usability of the resource, but the response body does not include the full resulting resource.
- To get the full resource back (including system-applied defaults) synchronously, request the **Synchronous** variant, which returns **200 OK** with the full JSON representation identical in shape to a GET/read of that resource. Synchronous mode is currently only available on **Creates (POST)**, and only for these resource types:
  - Resellers
  - Domains
  - Users
  - Devices
  - Callqueues
  - Agents
  - Answerrules
  - Contacts
  - Dialrules
  - Audio (MOH/Greeting) upload/tts
  - Timeframes
  - Event Subscriptions
  - Calls — Click-to-Call requests
- Sending a message (`POST .../messages`) returns **202** with `{ "code": 202, "message": "Accepted" }` — messaging send is async-only (not in the sync-supported list above).

## Common HTTP Status / Error Codes
| Code | Meaning |
|---|---|
| 200 | OK — synchronous success with full resource body |
| 202 | Accepted — async success, resource applied but full body not returned |
| 400 | Bad Request — validation/format error in request |
| 401 | Unauthorized — missing/invalid/expired auth token or key |
| 403 | Forbidden — authenticated but insufficient scope/permission |
| 404 | Not Found — resource/path does not exist |
| 409 | Conflict — e.g. duplicate subscription ("Subscription already exists") |
| 429 | Too Many Requests — rate limiting (see below) |

Note: exact error-code sets are documented per-endpoint in the reference (commonly 400/401/404; some endpoints add 403/409).

## Authentication (context for errors/limits)
Three supported auth methods:
1. **OAuth2 access/refresh tokens** — legacy-compatible, username/password grant, timed tokens.
2. **JWT tokens** — timed, parseable, non-session (lighter load), good for end-user web apps.
3. **API Keys** — for server-to-server; no username/password; supports read-only restriction and IP restriction; usage tracked/monitored via iNSight.

## Rate Limits
- No single global numeric rate limit is published in the reference docs; throttling/limits are enforced per deployment/cluster and via API Key restrictions (IP allowlisting, read-only mode) and usage monitoring through **iNSight** (and **iNSight pro** for subscription-specific stats/error counters).
- Event-subscription-based data (webhooks) is refreshed on a **3-second poll cycle** against the underlying DB table — treat this as an inherent rate/latency ceiling for that mechanism, not real-time.
- Best practice: use pagination (`start`/`limit`) to bound response sizes, and prefer async (202) writes for high-volume operations rather than requesting synchronous (200) responses.
