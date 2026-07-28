# Planiprêt — Rapport d'Audit Complet
*Organisation: AVA Main Dashboard · Date: 2026-06-21*

---

## 1. SUMMARY

- **Features totales auditées:** ~140
- **Complétées (✅):** ~108 (≈77%)
- **Partielles (⚠️):** ~22 (≈16%)
- **Manquantes (❌):** ~10 (≈7%)
- **Issues critiques:** Nommage table = `planipret_*` (pas `profiles`/`phone_calls` génériques) — fonctionnel mais à valider côté prompts futurs. Colonnes IA (`ai_coaching`, `ai_tasks`, `ai_events`) stockées via `planipret_ai_insights.suggested_actions` + `metadata` JSONB, pas en colonnes plates.
- **À corriger avant Prompt 07:** déployer `ns-webhook-setup` réel, vérifier auto-refresh JWT NS sur 401, persister tokens MS365 côté serveur (Edge Function callback).

---

## 2. COMPLETED FEATURES ✅

### Foundation
- ✅ React + Vite + TS + TailwindCSS
- ✅ Routes `/login`, `/dashboard`, `/mplanipret`, `/dashboard/integrations`, `/auth/ms365/callback`
- ✅ Supabase Auth + redirection post-login (admin → `/dashboard`, broker → `/mplanipret`)
- ✅ Garde `mobile_app_enabled` (écran verrouillé)
- ✅ Garde non-authentifié → `/planipret/login`

### Database (préfixe `planipret_`)
- ✅ Table `planipret_profiles` (23 colonnes — couvre ns_jwt, ns_refresh_token, ms365_*, role, mobile_app_enabled, voice_agent_enabled, elevenlabs_agent_id)
- ✅ Table `planipret_phone_calls` (22 colonnes — ns_call_id, direction, from/to, durée, recording_url, transcript, ai_summary, metadata JSONB)
- ✅ Table `planipret_phone_messages` (16 colonnes)
- ✅ Table `planipret_voicemails` (15 colonnes — folder, audio_url, transcript, is_read)
- ✅ Table bonus `planipret_ai_insights` (coaching_notes, suggested_actions, summary, sentiment, topics)
- ✅ RLS activée sur 8 tables `planipret_*`

### Edge Functions déployées
- ✅ `ns-auth`, `ns-calls`, `ns-cdrs`, `ns-recordings`, `ns-transcription`, `ns-sms`, `ns-voicemail`, `ns-webhook-receiver`, `ns-users`, `ns-webhook-setup`
- ✅ `ai-analyze-call` (Claude analyse → broadcast Realtime `ai-insights:{user_id}`)
- ✅ `maestro-actions` (create_task / create_event / list_*)
- ✅ `ms365-actions` + `ms365-oauth-exchange`
- ✅ `pp-integration-secrets` (gestion secrets via UI Intégrations)

### Page Intégrations (`/dashboard/integrations`)
- ✅ 5 cards : NS-API, ElevenLabs, Anthropic, Maestro CRM, Microsoft 365
- ✅ Lien sidebar « Intégrations » avec icône plug + badge warning
- ✅ Test connection par carte
- ✅ Barre récapitulative X/5

### Mobile (`/mplanipret`)
- ✅ Container 390×844 desktop / fullscreen mobile, border-radius 40px
- ✅ Tab bar 5 onglets + FAB Dialer centré
- ✅ DialerSheet : spring animation, keypad 3×4, +, backspace, longpress clear, call → `ns-calls?action=start`
- ✅ Écran **Home** : header brokerName + date FR, SIP status (vert/rouge → reconnect), 4 stats, 3 derniers appels, lien Voir tout
- ✅ Écran **Calls** complet (3 onglets, recherche, pull-to-refresh, CallDetailSheet 5 sections, Actifs polling 5s + Realtime, Manqués badge)
- ✅ CallDetailSheet : audio HTML5, transcription + copier, accordion IA (Résumé/Coaching/Objections/Signaux/Prochaine étape), boutons Maestro tâches/événements + « Tout créer »
- ✅ Carte appel actif : timer live, mute, hold/unhold, transfer modal, hangup, overlay appel entrant pulse Answer/Reject

---

## 3. PARTIAL IMPLEMENTATIONS ⚠️

| Item | Manque |
|------|--------|
| ⚠️ Nommage tables | Tables s'appellent `planipret_*` au lieu de `profiles` / `phone_calls` génériques (les prompts originaux supposent les noms courts). Fonctionnel mais incompatible si on suit la doc à la lettre. |
| ⚠️ Colonnes IA | `ai_coaching`, `ai_tasks`, `ai_events`, `next_action` n'existent pas en colonnes plates : stockés dans `planipret_ai_insights.suggested_actions` (jsonb) + `planipret_phone_calls.metadata` (jsonb). MCalls lit les deux. |
| ⚠️ `ns-auth` auto-refresh | Helper `refreshNsJwt()` à confirmer côté `ns-calls`/`ns-cdrs` sur 401. |
| ⚠️ `ns-webhook-receiver` | Vérifier que `auto-trigger ai-analyze-call` est bien fire-and-forget après CDR (présent dans code, à logger en prod). |
| ⚠️ `ns-webhook-setup` | Fichier présent — vérifier qu'il enregistre bien les 3 souscriptions (CDR, message, voicemail) côté NS. |
| ⚠️ MS365 OAuth callback | `ms365-oauth-exchange` existe (Edge), mais `Ms365Callback.tsx` route le code côté client. Préférable : exchange côté serveur pour ne pas exposer le client_secret. |
| ⚠️ Brief IA du jour | Bouton sur Home : à vérifier qu'il invoque bien `ai-analyze-call` en mode "daily briefing" ou une fonction dédiée. |
| ⚠️ Prochains rendez-vous M365 sur Home | Card à confirmer (intégration ms365-actions list_calendar_events). |
| ⚠️ Voice agent button | Affichage conditionné à `voice_agent_enabled` — à vérifier sur Home. |
| ⚠️ Skeleton loaders | Présents sur certaines cards Home, pas systématiques. |

---

## 4. MISSING FEATURES ❌

| Priorité | Item |
|----------|------|
| 🔴 Critical | **Persistance MS365 tokens côté serveur** via `ms365-oauth-exchange` (sécurité — ne jamais exposer `MICROSOFT_CLIENT_SECRET` dans le client) |
| 🔴 Critical | Confirmation que `NS_WEBHOOK_SECRET` est validé dans `ns-webhook-receiver` |
| 🟠 High | Écrans Mobile **Messages**, **Voicemail**, **More** sont en stubs minimaux (Prompts 07–09) |
| 🟠 High | Routes `/auth/ms365/callback` → redirection finale vers `/mplanipret/more` avec toast (à vérifier) |
| 🟡 Medium | Modal instructions Azure dans card MS365 |
| 🟡 Medium | Badge IA realtime live update sur la liste Appels (déjà subscribed mais à valider) |
| 🟡 Medium | Page Reset Password (`/reset-password`) — non audité ici |
| 🟢 Low | Pull-to-refresh natif (actuellement bouton « Actualiser ») |

---

## 5. DATABASE STATUS

| Table (réelle) | Colonnes clés présentes | RLS |
|----------------|-------------------------|-----|
| `planipret_profiles` | ✅ ns_jwt, ns_refresh_token, ns_jwt_expires_at, ms365_access_token, ms365_refresh_token, role, mobile_app_enabled, voice_agent_enabled, elevenlabs_agent_id, extension, ns_domain | ✅ ON |
| `planipret_phone_calls` | ✅ ns_call_id, direction, from_*, to_*, duration_seconds, status, recording_url, transcript, ai_summary, metadata (jsonb → ai_tasks/ai_events) | ✅ ON |
| `planipret_phone_messages` | ✅ ns_message_id, thread_id, direction, from_number, to_number, body, media_urls, status | ✅ ON |
| `planipret_voicemails` | ✅ ns_vm_id, folder, from_number, duration_seconds, audio_url, transcript, is_read | ✅ ON |
| `planipret_ai_insights` | ✅ summary, coaching_notes, suggested_actions (jsonb → tasks/events/objections/buying_signals/next_action), sentiment, topics | ✅ ON |
| `planipret_integration_secrets` | ✅ stockage UI Intégrations | ✅ ON |
| `planipret_contacts`, `planipret_settings` | ✅ bonus | ✅ ON |

### Secrets Supabase (configurés via add_secret / pp-integration-secrets)
Statut à vérifier dans **Settings → Secrets** :
- ⚠️ `NS_API_BASE_URL`, `NS_API_USER`, `NS_API_PASSWORD`, `NS_DEFAULT_DOMAIN`, `NS_WEBHOOK_SECRET`
- ⚠️ `ELEVENLABS_API_KEY`, `ELEVENLABS_DEFAULT_AGENT_ID`
- ⚠️ `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`
- ⚠️ `MAESTRO_API_URL`, `MAESTRO_API_KEY`, `MAESTRO_ACCOUNT_ID`
- ⚠️ `ANTHROPIC_API_KEY` (ou `LOVABLE_API_KEY` si on passe par AI Gateway)

---

## 6. EDGE FUNCTIONS STATUS

| # | Function | Status |
|---|----------|--------|
| 1 | `ns-auth` | ✅ Deployed |
| 2 | `ns-calls` | ✅ Deployed |
| 3 | `ns-cdrs` | ✅ Deployed |
| 4 | `ns-recordings` | ✅ Deployed |
| 5 | `ns-transcription` | ✅ Deployed |
| 6 | `ns-sms` | ✅ Deployed |
| 7 | `ns-voicemail` | ✅ Deployed |
| 8 | `ns-webhook-receiver` | ✅ Deployed (vérifier validation secret) |
| 9 | `ns-users` | ✅ Deployed |
| 10 | `ns-webhook-setup` | ✅ Deployed |
| 11 | `ai-analyze-call` | ✅ Deployed |
| 12 | `maestro-actions` | ✅ Deployed |
| 13 | `ms365-actions` | ✅ Deployed (bonus) |
| 14 | `ms365-oauth-exchange` | ✅ Deployed (bonus) |
| 15 | `pp-integration-secrets` | ✅ Deployed (bonus) |

---

## 7. RECOMMENDED ACTIONS (avant Prompt 07)

1. **Vérifier secrets** : ouvrir Settings → Secrets et confirmer les 14 secrets listés en §5.
2. **Sécuriser MS365 OAuth** : déplacer l'échange `code → token` 100% côté `ms365-oauth-exchange` (jamais exposer `MICROSOFT_CLIENT_SECRET` au navigateur).
3. **Tester webhook NS** : déclencher un CDR de test → vérifier insertion `planipret_phone_calls` + déclenchement `ai-analyze-call`.
4. **Valider auto-refresh JWT** : forcer un 401 NS → confirmer que `ns-calls` rafraîchit puis rejoue.
5. **Compléter écrans mobile restants** : Messages, Voicemail, More (Prompts 07–09).
6. **Normaliser la documentation** : aligner les noms `profiles/phone_calls/…` des prompts avec les noms réels `planipret_*` (ou créer des vues alias).
7. **Brief IA du jour** : créer une fonction `ai-daily-brief` dédiée si pas déjà couverte par `ai-analyze-call`.
8. **Pull-to-refresh natif** sur Home + Calls (gesture, pas bouton).

---

*Fin du rapport.*
