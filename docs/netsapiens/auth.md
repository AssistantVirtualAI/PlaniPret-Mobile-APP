# NS-API v2 Authentication (v45.0)

Base URL: `https://{server}/ns-api/v2` (e.g. `https://ns-api.com/ns-api/v2` or your platform's API server hostname).

## POST /tokens — Get Access Token
Grant types (`grant_type`): `password`, `refresh_token`, `mfa` (default in schema example: "mfa"; typical usage default "password").

### grant_type=password
Body (JSON):
- `grant_type` (string, required) = "password"
- `client_id` (string, required)
- `client_secret` (string, required)
- `username` (string, required) — uid form `user@domain` (or configured login, can be email)
- `password` (string, required)

### grant_type=refresh_token (Get Access Token From Refresh)
Body:
- `grant_type` = "refresh_token"
- `client_id`, `client_secret`
- `refresh_token` (string) — from prior AccessToken response

### grant_type=mfa (Get Access Token after MFA)
Body: same as password grant plus a passcode field generated from an authenticator app. Two-step: first password auth triggers MFA requirement, second request uses grant_type=mfa with the passcode.

## Response: AccessToken object
Fields returned: `username`, `user`, `territory`, `domain`, `site`, `group`, `department`, `uid`, `login`, `scope`, `user_email`, `displayName`, `access_token`, `expires_in` (seconds), `token_type` (typically "Bearer"), `refresh_token`, `client_id`, `apiversion`.

Required fields per schema: username, user, territory, domain, department, uid, login, scope, user_email, displayName, access_token, expires_in, token_type, refresh_token, client_id, apiversion.

## Using the token
All other API calls: `Authorization: Bearer {access_token}` header (securityScheme `bearerAuth`, type http/bearer).

## Token refresh behavior
- Access tokens expire per `expires_in` (seconds).
- Use `refresh_token` grant before/at expiry to get a new `access_token` + new `refresh_token` (refresh tokens appear to rotate — treat old one as single-use).
- No `/ns-api/v2/tokens` DELETE endpoint documented for access tokens directly, but revocation exists for related credential types (API keys, JWTs — see below).

## Alternative: API Keys
- `readapikeys` (GET) — list API keys visible/manageable by current key.
- `readmyapikey` (GET, parameterless) — info about key used for current request (confirms access level/scope).
- `createapikey` (POST) — limited action, requires special access.
- `updateapikey` (PUT) — can only change description and IP restrictions; cannot change scope/access — must create new key to change scope.
- `revokeapikey` (DELETE) — removes key from DB and cache immediately (limited/special access required).
- `readapikey` (GET by key ID).

## Alternative: JWT
- `POST /jwt` (post_jwt) — create JWT from username/password.
- `POST /jwt` (mfa variant, post_jwt-2) — create JWT after MFA passcode.
- `POST /jwt` (delegated, post_jwt-3) — create JWT for a different user; requires valid API key access (delegated/admin use case).
- `POST /jwt` (from refresh, post_jwt-1) — accepts a refresh token JSON object, grants new JWT AND revokes the refresh token used (single use).
- `GET /jwt` (get_jwt) — read current JWT info.
- DELETE-equivalent `revokemyjwt` — revokes current JWT by its JTI, requires valid JWT; prevents further use.
- `revokejwtbyuid` — revoke all JWT(s) for a uid (user@domain).
- `revokejwtbyjti` — revoke a specific JWT by its JTI (JWT ID).

## Error format (ErrorResponse schema, used across API)
```json
{ "code": <int, HTTP status code>, "message": "<string, detail/correction guidance>" }
```
Common statuses seen across endpoints: 400 Bad Request, 401 Authentication Required, 403 Forbidden, 404 Record not found.

## Synchronous vs Async (`synchronous` param)
Many POST/PUT bodies accept a `synchronous` field (schema `Synchronous`) that controls whether the API waits for the change to fully propagate before responding:
- If omitted/false: many write endpoints return **202 Accepted** immediately (change queued, async apply).
- If `synchronous=yes`/true: endpoint waits and returns final resource state (200) once applied — use when you need to immediately read back state (e.g., device registration URI) or confirm before proceeding. This is the general pattern for Devices, Answerrules, Users, etc. Always pass `synchronous: true`/"yes" in automation that needs immediate consistency (e.g., before initiating a call to a just-created device).
