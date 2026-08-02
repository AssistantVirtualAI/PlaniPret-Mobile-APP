# Architecture decision: answering an inbound call is SIP-only

Status: **binding**. Last verified 2026-08-02.

This document exists because the same proposal keeps coming back. Read it before
touching the answer path in `src/hooks/useMplanipretSoftphone.ts`.

## Decision

The green Answer button MUST send a SIP `200 OK` from the endpoint registered on the
AOR. It MUST NOT call any REST endpoint that "answers on our behalf", and it MUST NOT
call NS-API click-to-call.

## Rejected proposal

```
POST /domains/planipret.ca/users/{ext}/calls
{ "call-orig-user": "{ext}_mobile@planipret.ca",
  "call-term-user": "<caller>",
  "auto-answer-enabled": "yes" }
```

Three independent reasons this must not be wired to Answer:

1. **It is not an answer, it is an origination.** `call-orig-user` /
   `call-term-user` places a NEW OUTBOUND call. The inbound call keeps ringing
   unanswered and lands in voicemail while a second call is dialed to the same party.
   That is the ring13 double-call bug, reintroduced by design.
2. **The `200 OK` carries the SDP.** RTP addresses and ports travel in the SDP of the
   `200 OK`. A REST API cannot supply SDP for media it does not host. NetSapiens
   documents no mechanism for a third party to answer for a registered endpoint.
3. **`auto-answer-enabled` assumes a self-answering device.** That is a desk-phone
   feature. No iOS device auto-answers through CallKit.

## The premise behind the proposal is false

The proposal is always justified by "wss://core1.cluster1.ucstack.io:9002 is not
publicly reachable". Verified false from an arbitrary public host, no VPN, no allowlist:

```
DNS      core1.cluster1.ucstack.io -> 64.26.133.72
TCP 9002 open
HTTP/1.1 101 Switching Protocols
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
Sec-WebSocket-Protocol: sip
Server: WebSocket++/0.8.1
```

`101 Switching Protocols` plus `Sec-WebSocket-Protocol: sip` means the server accepts a
WebSocket SIP session. Re-run the check before claiming otherwise.

Do not confuse the two hosts: `voice.ava-telecom.ca` (portal) was correctly excluded in
July 2026 because it accepts REGISTER without carrying call delivery. `core1` is the
call-processing node and is the correct target. See `src/lib/planipret/sip/sipEdgePolicy.ts`.

## `ws_disconnected` at ring time is expected, not a fault

On a background VoIP push, iOS has suspended the WebView, so the socket IS closed when the
incoming screen renders. The whole ring9-ring19 wake path — `wakeForIncoming`, the 1.5s
native grace window, `declareJsOwnsAor` — exists to rebuild it before the INVITE lands.
Treating that transient state as "WSS unreachable" and falling back to click-to-call would
fire on **every** background call, i.e. the only scenario that matters.

## What is allowed over REST

REST is a **control plane** on an existing call-id, never a media path:

- `PATCH .../calls/{call-id}/{disconnect,reject,hold,unhold,transfer,forward,mute,dtmf}`
- `DELETE .../calls/{call-id}` as documented hangup fallback when the PATCH is refused
- marking rows ended locally so the overlay closes if the webhook is slow

Outbound click-to-call remains legitimate as an **explicitly chosen outbound dialing
mode** (see `mobile-calls-start`), because there the user's intent is to originate a call.
It is never an answer path.

## Guard

`supabase/functions/pp-ns-calls/index.ts` intentionally has no `callback` action. If a
sync from the upstream Lovable repository (`attach-app-creator-8134a2fa`, branch
`Planipret`) reintroduces one, drop it.
