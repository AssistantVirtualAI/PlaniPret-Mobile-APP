# Registrations (v45.0)

NS-API v2 does not expose a separate top-level "/registrations" resource; SIP registration state/contact/expiry info is embedded directly on the **Device** object (see devices.md), returned by:

- `GET /domains/{domain}/users/{user}/devices` (all devices + their registration state)
- `GET /domains/{domain}/users/{user}/devices/{device}` (single device)

## Registration-related fields on Device
- `device-sip-registration-uri` (read-only) — full SIP URI, `sip:[device]@[domain]`
- `device-sip-registration-state` (read-only) — `registered` | `unregistered`
- `device-sip-registration-contact` (read-only) — contact header value from last successful REGISTER
- `device-sip-registration-core-server` (read-only, hostname) — server that handled the last registration; used to route inbound calls to that device/server
- `device-sip-registration-datetime` (read-only, nullable) — timestamp of last registration (may lag slightly for replication)
- `device-sip-registration-expires-datetime` (read-only, nullable) — time at which device is considered unregistered; must be in the future for actively-registered devices
- `device-sip-registration-expiry-seconds` (default 60) — requested re-register interval requested of the device; device becomes `unregistered` if it fails to re-register within this + a system-wide grace period
- `device-sip-registration-ip-address` (read-only) — IP:port of last successful registration (useful for NAT/connectivity diagnostics)
- `device-sip-registration-user-agent` (read-only) — UA string from last registration (identifies client/app version)
- `device-sip-latency-seconds-current` / `device-sip-latency-seconds-average` (read-only) — registration round-trip latency (current vs avg of last 5) — useful signal for flaky mobile networks

## Practical checks for "is my device really registered and reachable"
1. `device-sip-registration-state == "registered"`
2. `device-sip-registration-expires-datetime` is in the future
3. `device-sip-registration-core-server` matches an expected/healthy media/signaling server
4. `device-sip-registration-contact` / `device-sip-registration-ip-address` reflect current network (stale entries suggest NAT rebinding without re-REGISTER)
5. High `device-sip-latency-seconds-average` can indicate poor mobile network connectivity risking dropped registration
