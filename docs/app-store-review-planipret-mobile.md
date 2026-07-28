# Planiprêt Mobile — App Store / Play Store submission pack (EN)

Last updated: 2026-07-28

## 1. App identity

| Field | Value |
|---|---|
| App name | Planiprêt Mobile |
| Subtitle | Business phone & CRM for mortgage brokers |
| Bundle ID (iOS) | `com.planipret.mobile` |
| Package name (Android) | `com.planipret.mobile` |
| Category | Primary: Business — Secondary: Productivity |
| Age rating | 4+ (no objectionable content) |
| Languages | English, French (Canada) |
| Support URL | https://avastatistic.ca/support |
| Marketing URL | https://avastatistic.ca |
| Privacy Policy URL | https://avastatistic.ca/privacy |
| Terms URL | https://avastatistic.ca/terms |
| Support email | support@avastatistic.ca |
| Copyright | © 2026 AVA Telecom / Planiprêt |

## 2. Demo account for App Review (REQUIRED — enter in App Review Information)

```
Username : demo@avastatistic.ca
Password : DemoPass2026!
```

- Sign-in is **email + password** on the first screen. Microsoft 365 sign-in is optional and NOT required to review the app.
- The account is pre-provisioned with a business extension (**1999**) and already contains sample call history, transcripts and AI summaries so every screen is populated.
- The account never expires and is excluded from billing.
- No hardware, no VPN, no second device is required.
- "Sign in with Microsoft" is an **optional** connector for calendar/email. If the reviewer taps it and does not have a Microsoft work account, they can go back and use email/password.

### Suggested review path (2 minutes)
1. Sign in with the credentials above.
2. **Home** — dashboard, dialpad button, today's summary.
3. **Calls** — tap any call to see the recording, transcript and AI summary.
4. **Messages** — SMS threads (sending is disabled for the demo account to avoid contacting real people).
5. **AVA** — the in-app AI assistant, ask "summarize my day".
6. **More → Settings** — Do Not Disturb, language toggle, notifications.
7. **More → Delete my account** — in-app account deletion (guideline 5.1.1(v)).

## 3. App Review notes (paste into "Notes")

> Planiprêt Mobile is a **business-only VoIP softphone and CRM companion** distributed to licensed mortgage brokers of the Planiprêt network. Accounts are created by the brokerage administrator; there is no consumer self-signup, which is why a demo account is provided above.
>
> - **VoIP**: The app registers to our SIP/PBX (AVA Telecom / NetSapiens) and uses CallKit + PushKit for incoming calls. Background modes `voip`, `audio` and `remote-notification` are required for incoming calls while the app is suspended.
> - **Call recording**: Recording is a brokerage compliance feature, disabled by default, controlled server-side by the employer, and disclosed to both parties by an audible announcement. Recordings are stored in the brokerage's own tenant.
> - **AI features**: transcription, summary and analytics run server-side; no third-party advertising or tracking SDK is embedded.
> - **Account deletion**: available in-app under **More → Delete my account**. It deletes the user profile, push tokens, PBX device link and personal identifiers. Business call records retained for regulatory reasons are anonymized.
> - **Encryption**: standard HTTPS/TLS and SRTP only — `ITSAppUsesNonExemptEncryption = false`.
> - **No account required to browse?** No — the app is useless without a brokerage account, per guideline 5.1.1(i) all requested data is required for the service (telephony identity).

## 4. Permissions and purpose strings (declared in Info.plist)

| Permission | Purpose string |
|---|---|
| Microphone | Planiprêt uses the microphone to place and receive VoIP business calls. |
| Contacts | Planiprêt accesses your contacts so you can call and message your clients. |
| Camera | Planiprêt uses the camera so you can set a profile photo. |
| Photo library | Planiprêt accesses your photo library so you can pick a profile photo. |
| Local network | Planiprêt uses the local network to establish VoIP call audio. |
| Speech recognition | Planiprêt transcribes your recorded calls when you enable transcription. |
| Notifications | Incoming calls, voicemail and message alerts. |

Background modes: `voip`, `audio`, `remote-notification`, `processing`.
Entitlements: Push Notifications (with PushKit VoIP), Associated Domains (`applinks:avastatistic.ca`).

## 5. App Privacy questionnaire (Apple) — answers

| Data type | Collected | Linked to user | Tracking | Purpose |
|---|---|---|---|---|
| Name, email, phone number | Yes | Yes | No | App functionality |
| Contacts | Yes (on-device access; only numbers you dial/text are sent) | Yes | No | App functionality |
| Audio data (calls, voicemail) | Yes | Yes | No | App functionality |
| User content (SMS, notes) | Yes | Yes | No | App functionality |
| Identifiers (device push token) | Yes | Yes | No | App functionality |
| Usage data / diagnostics | Yes (crash + call quality) | Yes | No | App functionality, analytics |
| Location, financial info, health, browsing, ads | No | — | — | — |

**Tracking: NO.** No ad networks, no data brokers, no ATT prompt needed.

Google Play Data Safety mirrors the table above; data is encrypted in transit, users can request deletion in-app.

## 6. Export compliance

- Uses only standard encryption (TLS 1.2+, SRTP/DTLS for media).
- `ITSAppUsesNonExemptEncryption` = `false` — no CCATS/ERN filing required.

## 7. Store listing copy (EN)

**Promotional text (170 max)**
Your brokerage phone line, client conversations and AI call summaries — all in one secure app built for mortgage brokers.

**Description**
Planiprêt Mobile turns your phone into your complete brokerage workstation.

• Business phone line — receive and place calls on your brokerage extension with HD audio and native call screen integration.
• Voicemail & call history — visual voicemail, missed-call alerts and a full searchable call log.
• Text messaging — SMS your clients from your business number, never your personal one.
• AI call summaries — automatic transcription, summary and next-step suggestions after each call.
• AVA assistant — ask for a recap of your day, send a text or start a call by simply asking.
• CRM sync — calls, notes, recordings and messages sync automatically to your Maestro CRM.
• Microsoft 365 — optional calendar, email and Teams meeting integration.
• Bilingual — full English and French (Canada) interface.

Planiprêt Mobile requires an active account provided by your brokerage administrator.

**Keywords**
mortgage,broker,voip,softphone,business phone,crm,call recording,transcription,sms,planipret

## 8. Pre-submission checklist

- [x] Demo account works and shows populated data
- [x] In-app account deletion (More → Delete my account)
- [x] All purpose strings present and specific
- [x] `ITSAppUsesNonExemptEncryption` declared
- [x] Privacy Policy and Terms reachable without login
- [x] No placeholder/lorem content, no "beta" wording
- [x] Sign in with Microsoft is optional (no third-party-only login → no Sign in with Apple requirement)
- [x] Bilingual EN/FR strings complete
- [x] Safe-area respected on notch devices; no zoom-out on any screen
- [ ] Upload 6.7" and 6.1" iPhone screenshots (5–8 per language)
- [ ] Upload 1024×1024 app icon (no alpha)
- [ ] Fill App Review Information with the demo credentials above
