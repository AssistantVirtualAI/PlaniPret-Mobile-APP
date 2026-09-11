# Planiprêt Task API — intégration mobile & AVA

## Architecture
```text
UI mobile (TasksSection / TaskComposerSheet)
  └── usePlanipretTasks (cache local, realtime, optimistic)
        └── src/lib/planipret/tasks.ts  (supabase.functions.invoke)
              └── edge: planipret-task-api  ← seul point d'accès à l'API
                    ├── _shared/planipret-task-handler.ts (logique testable)
                    ├── secrets serveur (PLANIPRET_ACCESS_TOKEN)
                    ├── idempotence : planipret_task_mutations
                    ├── projection : planipret_tasks_projection
                    └── audit : planipret_audit_log
AVA chat + voicebot → ava-tool-executor → planipret-task-api (mêmes permissions)
```
Le client React n'appelle **jamais** `client.planipret.com` directement et ne
manipule aucun Bearer token ni clé service role.

## Endpoints officiels utilisés (doc Scribe, 2026-09-09)
Base `https://client.planipret.com`, préfixe `/api/main`, `Authorization: Bearer`.
- `GET /api/main/tasks` — liste (`status`, `type`, `delegate_users_id`,
  `target_id`, `date_from`+`date_to`, `date_scope`, `order_by`, `per_page` ≤ 200)
- `POST /api/main/tasks` — création (`xid`, `type`, `date`, `notes`, `description`)
- `PUT /api/main/tasks/{taskId}` — modification (`task_id` aussi dans le corps)
- `DELETE /api/main/tasks/{taskId}` — suppression logique (`task_id` dans le corps)

Autres ressources exposées par la même API et branchées via
`pp-maestro-scribe` (`_shared/maestro-scribe.ts`, client
`src/lib/planipret/maestroScribe.ts`) : clients (`/clients`, adresses et
téléphones imbriqués), contrats (`GET/POST /contracts`, `PUT /contracts/{id}`),
institutions financières et rapports de commissions.

## Repli de la liste
Si `GET /api/main/tasks` échoue, la réponse devient `source: "projection"`
(dernier état connu, scopé par `user_id`) ou `source: "unavailable"` avec
`error: "tasks_unavailable"`.

## Format des dates
`YYYY-MM-DD HH:mm:ss` en **America/Toronto** (`toApiDateTime`), imposé côté
serveur comme côté client via `supabase/functions/_shared/planipret-tasks.ts`.

## Outils AVA
`list_tasks`, `get_task`, `create_task`, `update_task`, `delete_task` —
schémas identiques pour le chat et ElevenLabs. `create_task`, `update_task` et
`delete_task` exigent une confirmation explicite, définie une seule fois dans
`src/lib/planipret/avaMutations.ts` (`AVA_MUTATING_ACTIONS`,
`AVA_CONFIRM_REQUIRED`) et consommée par `MAvaChat.tsx` et `AvaVoiceAgent.tsx`.
En voix, silence, ambiguïté ou déconnexion = aucune mutation. Chaque mutation
diffuse un événement realtime qui rafraîchit l'accueil.

## Rôles
`admin`, `broker`, `advisor` : lecture, création, modification, suppression.
`assistant` : pas de suppression — refus serveur (`role_forbidden`) avant tout
appel à Planiprêt.

## Idempotence et audit
Chaque mutation calcule une clé déterministe stockée dans
`planipret_task_mutations` : double tap, retry réseau ou tool-call AVA rejoué
renvoient la première réponse, sans seconde écriture. `planipret_audit_log`
reçoit outil, source, session AVA, `task_id`, statut HTTP, résultat et
`correlation_id` — jamais le contenu des notes.

## Accueil mobile
Le bloc « Appels récents » est remplacé par « Mes tâches » (En retard /
Aujourd'hui / À venir) avec créer, modifier, reporter (+24 h) et supprimer,
états skeleton / vide / offline / erreur, zones de tap ≥ 44 px et safe-area iOS.
L'historique d'appels reste intégralement dans l'onglet Appels; aucun code
VoIP/PJSIP/JsSIP n'a été modifié.

## Tests
- `src/lib/__tests__/planipretTasks.test.ts` — dates, buckets, cache par user.
- `src/test/planipretTaskHandler.test.ts` — passerelle : create/update/delete,
  validation sans notes, `xid` hors périmètre, token expiré, rôle assistant,
  isolation multi-tenant, `tasks_unavailable`, idempotence, audit.
- `src/test/avaTaskTools.test.ts` — schémas des 5 outils et barrières de
  confirmation partagées chat/voix.
- `src/test/tasksSection.test.tsx` — buckets, vide, offline, erreur + Réessayer,
  bouton `+`, report, suppression confirmée/annulée, realtime, filtres.
- `src/test/tasksHomeRegression.test.ts` — onglet Appels intact, aucun secret
  côté client, tout passe par `planipret-task-api`.
