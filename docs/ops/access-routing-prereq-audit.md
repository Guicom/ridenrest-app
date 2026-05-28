# Audit POI Access Routing — Prérequis Codebase

Date: 2026-05-27
Auteur: Claude (story poi-access-1.4)

## 1. @nestjs/throttler

- **Statut** : ☐ Présent / ☑ Manquant
- **Localisation** : N/A
- **Décision** : ☑ create_new
- **Action** : Installer `@nestjs/throttler`, configurer `ThrottlerModule.forRoot()` dans `app.module.ts`, enregistrer `ThrottlerGuard` via `APP_GUARD`
- **Notes** : Mentionné dans `project-context.md §External API Rate Limits` comme attendu, mais jamais installé. Aucune trace dans `apps/api/package.json` ni dans le code source.

## 2. OwnerOnly guard

- **Statut** : ☐ Présent / ☑ Manquant
- **Localisation** : N/A
- **Décision** : ☑ create_new
- **Action** : Créer `common/guards/owner-only.guard.ts` + `common/decorators/owned-resource.decorator.ts` + tests
- **Notes** : Le pattern inline `findByIdAndUserId()` existe dans les services (cf. `segments.service.ts`). Le guard générique est une abstraction nouvelle pour les endpoints POI Access. Les services existants gardent leur pattern inline — pas de refactor.
- **Déviation story** : Les fichiers sont placés dans `common/guards/` et `common/decorators/` (pattern projet) au lieu de `auth/guards/` et `auth/decorators/` (story spec).

## 3. @nestjs/event-emitter

- **Statut** : ☐ Présent / ☑ Manquant
- **Localisation** : N/A
- **Décision** : ☑ create_new
- **Action** : Installer `@nestjs/event-emitter`, configurer `EventEmitterModule.forRoot()` dans `app.module.ts`, créer un smoke test
- **Notes** : Aucun pattern d'événements interne détecté (ni RxJS Subjects, ni EventEmitter Node.js). Introduction propre sans conflit.

## 4. MeController

- **Statut** : ☐ Présent / ☑ Manquant
- **Localisation** : N/A
- **Décision** : ☑ create_new
- **Action** : Créer `me/me.module.ts` + `me/me.controller.ts` (stub 501), importer dans `app.module.ts`
- **Notes** : `ProfileModule` existe (`profile/`) mais gère `overpass_enabled` — pas les settings utilisateur généraux. `MeController` est un scope distinct pour le futur (story 3.2).

## 5. Bull Board

- **Statut** : ☐ Présent / ☑ Manquant
- **Localisation** : N/A
- **Décision** : ☐ create_new / ☑ not_needed_for_this_scope
- **Action** : Reporté à Story 4.3 (Observability)
- **Notes** : BullMQ est installé et configuré (queues `gpx-processing`, `density-analysis`). Bull Board n'est pas installé. Recommandation : installer `@bull-board/api` + `@bull-board/express` en Story 4.3, enregistrer les queues existantes + future `poi-access-calculation`.

## 6. Configuration access.config.ts

- **Statut** : ☐ Présent / ☑ Manquant
- **Localisation** : N/A
- **Décision** : ☑ create_new
- **Action** : Créer `config/access.config.ts` avec validation Zod et `registerAs` pattern
- **Notes** : Les configs existantes (`bullmq.config.ts`, `redis.config.ts`, `database.config.ts`) sont des exports simples sans validation. `access.config.ts` introduit le pattern `registerAs` + Zod pour crash-early validation — justifié par les 7 variables à valider au démarrage. `ConfigModule.forRoot({ isGlobal: true })` existe déjà → ajouter `load: [accessConfig]`.

## 7. Variables d'environnement

- **Statut** : Partiellement présent
- **Localisation** : `apps/api/.env.example` (BROUTER_BASE_URL déjà présent, ajouté par Story 1.1)
- **Décision** : ☑ create_new (6 vars restantes)
- **Action** : Ajouter `BROUTER_TIMEOUT_MS`, `BROUTER_DEFAULT_PROFILE`, `ACCESS_EAGER_THRESHOLD_M`, `ACCESS_TRACE_BUFFER_M`, `ACCESS_CACHE_TTL_LIVE_SECONDS`, `ACCESS_ENGINE_VERSION` à `apps/api/.env.example`

## Synthèse

- Pré-requis à créer : 5 (throttler, OwnerOnly, event-emitter, MeController, access.config)
- Pré-requis déjà présents : 0
- Out-of-scope pour cette story : 1 (Bull Board → Story 4.3)
- Env vars à ajouter : 6 (BROUTER_BASE_URL déjà présent)

## Déviations vs story spec

| Story spec | Réalité projet | Adaptation |
|---|---|---|
| `auth/guards/` | `common/guards/` | Fichiers créés dans `common/guards/` |
| `auth/decorators/` | `common/decorators/` | Fichiers créés dans `common/decorators/` |
| `.spec.ts` tests | `.test.ts` convention | Tests en `.test.ts` |
| `.env.example` (racine) | `apps/api/.env.example` | Vars ajoutées dans `apps/api/.env.example` |
| Config sans `registerAs` | Simple exports | Nouveau pattern `registerAs` + Zod pour access config (justifié) |

---

# Story 2.1 — RoutingService (décisions d'implémentation)

Date: 2026-05-28
Auteur: Claude (story poi-access-2.1)

## Décision circuit breaker : MAISON (vs cockatiel) — AC #7

- **Retenu** : implémentation **maison** (state machine `closed | open | half-open` + fenêtre
  glissante d'échecs, ~60 lignes dans `routing.service.ts`).
- **Rejeté** : `cockatiel`.
- **Raisons** :
  - Aucune nouvelle dépendance runtime (cockatiel ajoute la lib + ses transitives).
  - Logique simple, entièrement testable avec `jest.useFakeTimers()` (Date.now contrôlé).
  - Contrôle total sur les motifs typés (`BrouterFailureReason`) et le log structuré WARN.
- **Paramètres** : seuil 5 échecs / fenêtre 60 s → ouverture 30 s → half-open (1 requête test)
  → succès = fermeture, échec = ré-ouverture 30 s.
- Conforme à la recommandation de la story (« maison pour réduire les deps »).

## Décision client HTTP : `fetch` natif (vs @nestjs/axios) — déviation AC #1/#2/#6

- **Retenu** : `fetch` natif + `AbortController` pour le timeout (`brouterTimeoutMs`).
- **Rejeté** : `@nestjs/axios` / `HttpModule` (mentionné dans la story spec).
- **Raisons** :
  - Tout le projet appelle les API externes via `fetch` natif
    (`weather`, `strava`, `geo`) — aucune trace d'`axios`/`@nestjs/axios` dans le repo.
  - Éviter d'introduire 2 nouvelles deps runtime pour un seul service.
  - Décision validée par Guillaume au démarrage de la story.
- **Impacts** :
  - `RoutingModule` n'importe pas `HttpModule` ; `access.config` est injecté via
    `accessConfig.KEY` (déjà chargé globalement par `ConfigModule.forRoot`).
  - Tests (`routing.service.spec.ts`) : mock de `global.fetch` (pas de `HttpService` mock).
  - `apps/api/package.json` **inchangé** (aucune dep ajoutée).
- Fixture de test `__fixtures__/brouter-paris-versailles.geojson.json` : construite à la main
  selon le schéma GeoJSON réel de BRouter 1.7.9 (BRouter prod est lié à loopback sur le VPS,
  donc non joignable depuis le dev local pour un `curl` de capture).
