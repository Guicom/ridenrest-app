---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: 'complete'
completedAt: '2026-05-20'
inputDocuments:
  - '_bmad-output/planning-artifacts/architecture-poi-access-routing.md'
scope: 'feature-poi-access-routing'
project_name: 'ridenrest-app'
user_name: 'Guillaume'
date: '2026-05-20'
---

# ridenrest-app — Epic Breakdown : POI Access Routing (BRouter)

## Overview

Ce document fournit la décomposition complète en epics et stories de la feature **POI Access Routing**, dérivée de l'architecture `architecture-poi-access-routing.md` finalisée le 2026-05-20.

**Scope** : Intégration du calcul d'un itinéraire d'accès cyclable réel (distance + D+/D-) entre la trace d'une aventure et les POI accommodations, via BRouter self-host. Soustraction de la portion qui chevauche la trace pour ne représenter que le "coût additionnel" pour le cycliste.

**Out of scope** :
- Refonte du calcul de distance POI existant (vol d'oiseau via `ST_Distance` — conservé en fallback)
- Routage pour POI non-accommodations (water, food, bike-shop)
- Nouveaux profils BRouter custom (phase 2)

## Requirements Inventory

### Functional Requirements

FR-PA-001: L'utilisateur peut consulter, depuis la fiche détail d'un POI hébergement en mode Planning, un itinéraire d'accès cyclable réel (distance en mètres + dénivelé positif + dénivelé négatif) entre la trace de son aventure et le POI.

FR-PA-002: L'utilisateur peut consulter, depuis la fiche d'un POI hébergement en mode Live, un itinéraire d'accès cyclable réel calculé depuis sa position GPS actuelle, à condition d'avoir donné son consentement explicite.

FR-PA-003: Lorsqu'un POI est consulté en mode Planning et qu'aucune étape (stage) n'est définie, l'itinéraire d'accès est calculé depuis le km 0 de l'aventure (fallback "adventure-start").

FR-PA-004: Lorsqu'un POI est consulté en mode Planning et qu'une étape est en cours, l'itinéraire d'accès est calculé depuis le point de début de l'étape sélectionnée.

FR-PA-005: Lorsque BRouter est indisponible ou échoue à calculer un itinéraire, l'application affiche le fallback "distance à vol d'oiseau" avec un badge indiquant que la mesure est approximative.

FR-PA-006: L'utilisateur peut définir un **profil de routage cyclable** (Route / Gravel / Bikepacking) propre à chaque aventure, qui détermine le type d'itinéraire d'accès calculé pour ses POI.

FR-PA-007: Lorsque l'utilisateur clique sur un POI dont l'itinéraire d'accès est disponible, la polyline correspondante s'affiche sur la carte (couleur amber pointillés) au-dessus de la trace principale.

FR-PA-008: Une seule polyline d'itinéraire d'accès est visible à la fois sur la carte ; un clic sur un autre POI remplace la polyline visible, un clic en dehors la masque.

FR-PA-009: La carte effectue un auto-zoom sur le bbox englobant l'itinéraire d'accès + portion pertinente de la trace lors de l'affichage initial de la polyline.

FR-PA-010: En mode Live, avant tout envoi de la position GPS pour calcul d'itinéraire d'accès, l'application demande à l'utilisateur un consentement explicite via une popin RGPD, à la 1ère occurrence uniquement.

FR-PA-011: L'utilisateur peut, à tout moment, activer ou désactiver le consentement "Calcul d'itinéraire d'accès précis en mode Live" depuis la page Paramètres > Confidentialité.

FR-PA-012: La position GPS de l'utilisateur en mode Live est arrondie à 4 décimales (~11 m) côté client avant tout envoi au serveur, conformément au principe de minimisation des données.

FR-PA-013: Aucun identifiant utilisateur (`user_id`, email, etc.) n'est inclus dans les clés du cache Redis des itinéraires d'accès Live (anonymisation).

FR-PA-014: L'application pré-calcule de manière asynchrone (BullMQ) les itinéraires d'accès des POI hébergement situés à moins de 1500 m vol d'oiseau de la trace, lors de la création/import d'une aventure.

FR-PA-015: Lorsque la trace d'un segment d'aventure est modifiée, tous les itinéraires d'accès des POI rattachés à ce segment sont invalidés et re-calculés en arrière-plan.

FR-PA-016: Lorsque le profil de routage d'une aventure est changé, tous les itinéraires d'accès des POI de l'aventure sont invalidés et re-calculés.

FR-PA-017: Lorsqu'une étape (stage) est modifiée (changement `start_km`/`end_km`), les itinéraires d'accès des POI rattachés à cette étape sont invalidés.

FR-PA-018: La fiche détail POI affiche le statut de calcul (en cours / ok / fallback) avec un skeleton dédié pendant le chargement, jamais un spinner générique.

FR-PA-019: Le label affiché pour un itinéraire d'accès est contextualisé selon la sous-catégorie d'accommodation (ex: "Itinéraire vers l'hôtel", "Itinéraire vers le camping", "Itinéraire vers le refuge"), avec un fallback générique "Itinéraire d'accès".

FR-PA-020: La réponse de l'endpoint `POST /pois/:id/access` retourne toujours un objet avec un champ `status` discriminant (`'ok' | 'fallback' | 'error'`), et précise la source du résultat (`'db-cache' | 'redis-cache' | 'computed-fresh'`).

### NonFunctional Requirements

NFR-PA-001: La latence cible de l'endpoint `POST /pois/:id/access` est < 200 ms en cas de cache hit DB ou Redis, et < 500 ms en cas de calcul lazy à la demande (p95).

NFR-PA-002: La latence cible d'un appel BRouter (route unique) est < 500 ms p95 sur le VPS KVM 2 (1 segment Europe ~3 Go en mémoire JVM 2 Go).

NFR-PA-003: Le worker BullMQ `poi-access-calculation` traite au maximum **5 jobs simultanés** pour préserver les ressources de BRouter et de la DB sur le VPS KVM 2 (8 Go RAM).

NFR-PA-004: Le rate limiting sur `POST /pois/:id/access` est de **60 req/min par user** en mode Planning et **120 req/min par user** en mode Live.

NFR-PA-005: Le cache DB des itinéraires d'accès (`accommodations_cache.access_*`) n'a **pas de TTL** — l'invalidation est event-driven (modification trace, profil, ou stage).

NFR-PA-006: Le cache Redis des itinéraires d'accès Live a un TTL de **15 minutes** et utilise une clé strictement anonyme (`access:live:{poi_id}:{profile}:{lat_4dec}:{lon_4dec}`).

NFR-PA-007: La consommation mémoire totale du conteneur BRouter ne doit pas dépasser **2 Go RAM** (cap JVM `-Xmx2g`), pour laisser une marge sur le VPS.

NFR-PA-008: Le conteneur BRouter est exposé uniquement sur `127.0.0.1:17777` (localhost), jamais accessible depuis l'internet ni proxifié par Caddy.

NFR-PA-009: La position GPS de l'utilisateur en mode Live n'est **jamais stockée durablement** côté serveur (ni en DB, ni dans les logs, ni dans les caches autres que Redis Live anonyme).

NFR-PA-010: Le `RoutingService` implémente un **circuit breaker** ouvert après 5 échecs consécutifs BRouter, demi-ouvert après 30 s, pour éviter de saturer le service en cas d'incident.

NFR-PA-011: Le timeout d'un appel HTTP NestJS → BRouter est fixé à **5 secondes** ; au-delà, le calcul bascule en fallback vol d'oiseau.

NFR-PA-012: Les jobs BullMQ `poi-access-calculation` ont une stratégie de retry à 3 tentatives avec backoff exponentiel (1 s, 5 s, 25 s) ; après échec définitif, le POI est marqué `access_failed = true` pour éviter le recalcul perpétuel.

NFR-PA-013: La géométrie LineString retournée par l'API est **simplifiée** côté serveur via `ST_SimplifyPreserveTopology` (tolérance 5 m) avant envoi, pour minimiser la bande passante.

NFR-PA-014: L'image Docker BRouter et son volume `brouter-segments` doivent permettre un démarrage à froid en < 15 min (téléchargement initial des ~3 Go de segments Europe inclus).

NFR-PA-015: Le healthcheck BRouter est monitoré via Uptime Kuma ; toute indisponibilité > 1 min déclenche une alerte (email + Telegram).

NFR-PA-016: Les colonnes `access_*` de `accommodations_cache` sont incluses dans le backup Postgres existant ; le volume Docker `brouter-segments` est exclu (re-téléchargeable).

### Additional Requirements

#### Infrastructure & Deployment

- Ajouter un service Docker `brouter` (build depuis `abrensch/brouter` v1.7.9 — aucune image pré-construite disponible) au `docker-compose.yml` existant, avec volume persistant `brouter-segments`, healthcheck HTTP via bash /dev/tcp, JVM `-Xmx2g` via `command` override (server.sh hardcode JAVA_OPTS), et exposition sur `127.0.0.1:17777` uniquement.
- NestJS PM2 natif accède à BRouter via `http://localhost:17777` (PAS `http://brouter:17777` — pas de Docker network partagé).
- Étendre le pipeline CI/CD GitHub Actions pour build l'image BRouter (si non cachée), attendre le healthcheck, puis reload PM2 API.
- Documenter dans `docs/ops/brouter-runbook.md` : provisionnement initial, diagnostic panne, procédure de mise à jour des segments OSM, bump `ACCESS_ENGINE_VERSION`, diagnostic explosion queue BullMQ.
- Ajouter `BROUTER_BASE_URL=http://localhost:17777` au `.env.example` (story 1.1) ; les autres variables d'env access seront ajoutées par les stories suivantes.

#### Data Migration

- Migration SQL raw (`packages/database/migrations/2026-05-XX_add_poi_access.sql`) :
  - Créer le type `routing_profile` ENUM (`'road' | 'gravel' | 'bikepacking'`)
  - Ajouter `adventures.routing_profile` (NOT NULL DEFAULT 'gravel')
  - Ajouter `profiles.live_access_consent` (BOOLEAN nullable, NULL = jamais demandé)
  - Ajouter 8 colonnes à `accommodations_cache` : `access_origin_stage_id`, `access_distance_m`, `access_elevation_gain_m`, `access_elevation_loss_m`, `access_geometry` (PostGIS `geometry(LINESTRING, 4326)`), `access_engine_version`, `access_computed_at`, `access_failed`
  - Créer 2 indexes : `idx_accommodations_cache_access_stage` et `idx_accommodations_cache_access_pending` (partiel `WHERE access_computed_at IS NULL AND access_failed = false`)
- Pas de backfill nécessaire — toutes les nouvelles colonnes sont nullables ou ont un default.

#### Backend Architecture

- Créer un module NestJS `RoutingModule` (`apps/api/src/routing/`) avec `RoutingService` (wrapper BRouter HTTP + circuit breaker), `routing.types.ts`, `BrouterUnavailableException`.
- Créer un module `AccessCalculatorModule` (`apps/api/src/pois/access-calculator/`) avec `AccessCalculatorService`, stratégies `compute-divergent-segment.ts` (ST_Difference + élévation) et `resolve-origin.ts` (gps/stage/adventure-start → [lon, lat]).
- Créer un module `AccessWorkerModule` (`apps/api/src/pois/access-worker/`) avec le processor BullMQ `poi-access-calculation` (concurrency 5, retry 3 backoff exponentiel, dead letter queue `poi-access-failures`).
- Étendre `PoisController` avec l'endpoint `POST /pois/:id/access` (DTO Zod + class-validator, guard JWT, ownership check, rate limit).
- Créer/étendre `MeController` avec `GET /me/settings` et `PATCH /me/settings` (gestion `liveAccessConsent`).
- Ajouter validation des env vars `ACCESS_*` et `BROUTER_*` via `apps/api/src/config/access.config.ts` (crash early).

#### Frontend Architecture

- Créer un dossier `apps/web/src/components/poi-access/` avec 6 composants : `AccessMetrics.tsx`, `AccessMetricsSkeleton.tsx`, `AccessConsentDialog.tsx`, `AccessMapLayer.tsx`, `AccessFallback.tsx`, `useAccess.ts`.
- Créer 3 helpers/queries : `apps/web/src/lib/privacy.ts` (`roundCoordinate`), `apps/web/src/lib/poi-labels.ts` (`getAccessLabel`), `apps/web/src/lib/queries/poi-access.ts` (TanStack Query hooks).
- Étendre les composants existants : `poi-popup.tsx` (Planning), `poi-detail-sheet.tsx` (Planning), `map.tsx` (ajout `AccessMapLayer`), `poi-live-sheet.tsx` (Live + Dialog + Metrics).
- Créer la section Settings > Confidentialité (`apps/web/src/app/(app)/settings/_components/privacy-section.tsx`).
- Étendre les stores Zustand : `live-mode-store.ts` (+ `accessConsentChecked`, `selectedPoiForAccess`), `planning-mode-store.ts` (+ `currentStageId`, `visibleAccessPoiId`).

#### Shared Schemas

- Créer `packages/shared/src/schemas/poi-access.ts` (Zod) : `AccessOriginGpsSchema`, `AccessOriginStageSchema`, `AccessOriginAdventureStartSchema`, `AccessRequestSchema`, `AccessResponseSchema` — partagé web ↔ api.

#### Observability

- Métriques BullMQ : queue depth (alerte si > 200), failed jobs rate (alerte si > 5%), avg processing time — ajouter `poi-access-calculation` au dashboard Bull Board existant.
- Métriques applicatives compteur (post-MVP) : `access_compute_total{status,source}`, `access_compute_duration_seconds`, `access_brouter_failures_total`.
- Sentry : capture exceptions `RoutingService` et `AccessCalculator` avec tags `engine_version`, `profile`, `origin_type` ; filtrer les fallbacks `routing_failed` (volume normal attendu).
- Logs structurés JSON avec champs : `level, timestamp, service, traceId, userId, poiId, durationMs, engineVersion, status`.

#### Cross-Cutting

- EventEmitter NestJS pour déclencher les invalidations cross-modules (`'adventure.trace-updated'`, `'adventure.profile-changed'`, `'stage.updated'`).
- Idempotence des jobs BullMQ via `${poi_id}:${engine_version}:${stage_id}`.
- Versioning du calcul via `access_engine_version` (string `'brouter-1.7.3+trekking'`) — bump = recalcul lazy progressif au prochain accès POI (pas de pic de charge).

#### Gaps à vérifier en Story Ops 0

- Existence d'un module `MeController` / endpoint `/me/settings` actuel — créer si absent.
- Existence d'un guard `OwnerOnly` — créer ou utiliser check inline `WHERE adventures.user_id = req.user.id`.
- `@nestjs/throttler` installé — ajouter si absent.
- EventEmitter NestJS configuré — pattern à standardiser avec Density.
- Bull Board / Bull UI dashboard en place — documenter si déjà existant.

### UX Design Requirements

_Pas de document UX dédié à cette feature. Les éléments UX critiques sont embarqués dans l'architecture (popin RGPD, wording contextualisé, couleurs MapLibre) et seront affinés via un workflow `bmad-create-ux-design` dédié si besoin._

UX-DR-PA-001: Wording exact des popin RGPD et de la section Settings > Confidentialité — à valider dans un workflow UX dédié avant la story Frontend 7.

### FR Coverage Map

| FR | Epic | Description courte |
|---|---|---|
| FR-PA-001 | Epic 2 | Itinéraire d'accès depuis fiche POI Planning |
| FR-PA-002 | Epic 3 | Itinéraire d'accès depuis fiche POI Live (avec consentement) |
| FR-PA-003 | Epic 2 | Fallback origine = adventure-start (km 0) |
| FR-PA-004 | Epic 2 | Origine = début de stage en cours |
| FR-PA-005 | Epic 2 | Fallback vol d'oiseau si BRouter down |
| FR-PA-006 | Epic 1 + Epic 2 | Colonne DB (Story 1.3) + UI sélecteur dans édition aventure (Story 2.6) |
| FR-PA-007 | Epic 2 | Affichage polyline d'accès sur carte (amber pointillés) |
| FR-PA-008 | Epic 2 | Une seule polyline visible à la fois |
| FR-PA-009 | Epic 2 | Auto-zoom sur bbox accès + portion trace |
| FR-PA-010 | Epic 3 | Popin consentement RGPD à la 1ère utilisation Live |
| FR-PA-011 | Epic 3 | Toggle revocable dans Settings > Confidentialité |
| FR-PA-012 | Epic 3 | Arrondi position GPS 4 décimales côté client |
| FR-PA-013 | Epic 3 | Anonymisation clé cache Redis Live |
| FR-PA-014 | Epic 4 | Pré-calcul async BullMQ des POI < 1500 m |
| FR-PA-015 | Epic 4 | Invalidation sur modification de trace segment |
| FR-PA-016 | Epic 4 | Invalidation sur changement de profil aventure |
| FR-PA-017 | Epic 4 | Invalidation sur modification de stage |
| FR-PA-018 | Epic 2 | Skeleton dédié pendant chargement (pas spinner) |
| FR-PA-019 | Epic 2 | Label contextualisé par sous-catégorie via `getAccessLabel` |
| FR-PA-020 | Epic 2 | Réponse API avec `status` discriminant + `source` |

### NFR Coverage Map

| NFR | Epic | Description courte |
|---|---|---|
| NFR-PA-001 | Epic 2 | Latence endpoint <200ms cache hit / <500ms lazy |
| NFR-PA-002 | Epic 1 | Latence BRouter <500ms p95 sur KVM 2 |
| NFR-PA-003 | Epic 4 | Concurrency BullMQ max 5 jobs simultanés |
| NFR-PA-004 | Epic 2/3 | Rate limit 60 req/min planning, 120 live |
| NFR-PA-005 | Epic 2 | Cache DB sans TTL, invalidation event-driven |
| NFR-PA-006 | Epic 3 | Cache Redis Live TTL 15 min + clé anonyme |
| NFR-PA-007 | Epic 1 | RAM BRouter ≤ 2 Go (JVM `-Xmx2g`) |
| NFR-PA-008 | Epic 1 | BRouter bind sur 127.0.0.1:17777 uniquement |
| NFR-PA-009 | Epic 3 | GPS jamais stocké durablement côté serveur |
| NFR-PA-010 | Epic 2 | Circuit breaker RoutingService (5 échecs / 30s) |
| NFR-PA-011 | Epic 2 | Timeout BRouter 5 secondes |
| NFR-PA-012 | Epic 4 | Retry BullMQ x3 backoff exponentiel + flag failed |
| NFR-PA-013 | Epic 2 | Géométrie simplifiée `ST_SimplifyPreserveTopology` 5m |
| NFR-PA-014 | Epic 1 | Démarrage à froid BRouter < 15 min |
| NFR-PA-015 | Epic 4 | Healthcheck BRouter monitoré Uptime Kuma + alertes |
| NFR-PA-016 | Epic 1 | Backup Postgres inclut `access_*` ; segments BRouter exclus |

## Epic List

### Epic 1 — Foundation : BRouter & Data Model

**Goal** : Provisionner l'infrastructure BRouter (Docker + segments Europe), mettre en place le schéma DB étendu (`accommodations_cache.access_*`, `adventures.routing_profile`, `profiles.live_access_consent`), et créer le scaffolding des modules NestJS (`RoutingModule`, `AccessCalculatorModule`, `AccessWorkerModule`). Auditer les pré-requis cross-cutting (`MeController`, `OwnerOnly` guard, `@nestjs/throttler`, `EventEmitter`, Bull Board) et combler les gaps identifiés. À la fin de cet epic, **l'infrastructure est prête mais aucune fonctionnalité utilisateur n'est encore exposée** — c'est l'epic bloquant.

**FRs couverts** : FR-PA-006
**NFRs couverts** : NFR-PA-002, NFR-PA-007, NFR-PA-008, NFR-PA-014, NFR-PA-016
**Additional Requirements couverts** : Infrastructure & Deployment, Data Migration, Gaps Story Ops 0

### Epic 2 — Calcul & Affichage de l'Itinéraire d'Accès en Mode Planning ⭐

**Goal** : Permettre à l'utilisateur de consulter, depuis la fiche détail d'un POI hébergement en mode Planning, l'itinéraire d'accès cyclable réel (distance, D+, D-) calculé depuis sa trace, et d'en visualiser la polyline sur la carte. Inclut également l'UI permettant de définir le profil de routage par aventure. Cet epic livre la **valeur principale** de la feature et est consommable indépendamment d'Epic 3 (Live) et d'Epic 4 (async). Le calcul est lazy à la demande (pas de pré-calcul async) — Epic 4 ajoutera la couche performance.

**FRs couverts** : FR-PA-001, FR-PA-003, FR-PA-004, FR-PA-005, FR-PA-006 (UI), FR-PA-007, FR-PA-008, FR-PA-009, FR-PA-018, FR-PA-019, FR-PA-020
**NFRs couverts** : NFR-PA-001, NFR-PA-004 (planning : 60 req/min), NFR-PA-005, NFR-PA-010, NFR-PA-011, NFR-PA-013

### Epic 3 — Mode Live & Confidentialité RGPD

**Goal** : Permettre à l'utilisateur, depuis le mode Live (à vélo), de calculer un itinéraire d'accès précis depuis sa position GPS actuelle, avec un consentement explicite recueilli via popin RGPD à la 1ère occurrence et révocable à tout moment depuis Paramètres > Confidentialité. Garantit l'anonymisation et la non-persistance des données GPS. Cet epic étend les services d'Epic 2 avec la prise en charge du mode `origin: 'gps'` et du cache Redis volatile anonyme.

**FRs couverts** : FR-PA-002, FR-PA-010, FR-PA-011, FR-PA-012, FR-PA-013
**NFRs couverts** : NFR-PA-004 (live : 120 req/min), NFR-PA-006, NFR-PA-009
**UX Design Requirements** : UX-DR-PA-001 (wording popin + settings)

### Epic 4 — Pré-calcul Async, Invalidation & Production-Readiness

**Goal** : Éliminer la latence perçue par l'utilisateur via le pré-calcul asynchrone (BullMQ) des itinéraires d'accès des POI proches (< 1500 m) lors de la création d'aventure, garantir la cohérence des données via l'invalidation event-driven (trace, profil, stage), et rendre la feature observable et résiliente en production (métriques BullMQ, healthcheck BRouter, alertes Uptime Kuma, Sentry). Cet epic transforme une feature fonctionnelle en feature production-ready.

**FRs couverts** : FR-PA-014, FR-PA-015, FR-PA-016, FR-PA-017
**NFRs couverts** : NFR-PA-003, NFR-PA-012, NFR-PA-015
**Additional Requirements couverts** : Observability, Cross-Cutting (EventEmitter, idempotence, versioning)

---

**Inter-Epic Dependencies** :
- Epic 2, 3, 4 dépendent toutes d'**Epic 1** (BRouter + DB schema)
- Epic 3 dépend d'**Epic 2** (réutilise `AccessCalculatorService` + endpoint, ajoute mode `origin: 'gps'`)
- Epic 4 dépend d'**Epic 2** (réutilise services pour pré-calcul ; invalidation s'applique au cache DB d'Epic 2)
- **MVP shippable** : Epic 1 + Epic 2 = valeur principale livrable. Epic 3 et Epic 4 peuvent suivre indépendamment selon priorité produit.

**Total** : 4 epics, 20 FR-PA + 16 NFR-PA + 1 UX-DR-PA tous couverts.

---

## Epic 1 : Foundation — BRouter & Data Model

Provisionner l'infrastructure BRouter (Docker + segments Europe), mettre en place le schéma DB étendu, auditer les pré-requis cross-cutting (MeController, OwnerOnly, throttler, EventEmitter, Bull Board), et déployer en production sur le VPS (bootstrap manuel + CI/CD pipeline). Aucune fonctionnalité utilisateur exposée à la fin de cet epic — c'est l'epic bloquant.

**Découpe dev/prod** :
- Stories 1.1 → 1.4 sont du code + validation locale (commit + merge sur main).
- Story 1.5 est l'**opération manuelle one-shot** de déploiement initial sur le VPS prod + setup pipeline CI/CD pour les déploiements futurs.

### Story 1.1 : Provisionner le service Docker BRouter

As a **DevOps engineer**,
I want to add the BRouter cycling routing service as a Docker container in the project's docker-compose stack,
So that the application backend can call BRouter locally for cycling route calculations without exposing it to the internet.

**Acceptance Criteria :**

**Given** le `docker-compose.yml` existant (services postgres, redis, caddy, uptime-kuma)
**When** j'ajoute un service `brouter` buildé depuis `abrensch/brouter` v1.7.9 (aucune image Docker Hub pré-construite viable)
**Then** le service démarre via `docker compose up -d brouter`
**And** le conteneur a la JVM cappée à `-Xmx2g` via `command` override (server.sh hardcode JAVA_OPTS)
**And** le conteneur est bindé sur `127.0.0.1:17777` uniquement (jamais exposé publiquement)
**And** le conteneur a un volume nommé `brouter-segments` monté sur `/segments4`

**Given** le conteneur BRouter tourne
**When** je vérifie `docker inspect --format='{{.State.Health.Status}}' ridenrest-brouter`
**Then** le healthcheck retourne `healthy` dans le `start_period` (5 minutes)
**And** la variable `BROUTER_BASE_URL=http://localhost:17777` est ajoutée à `.env.example` (NestJS PM2 natif → localhost)

**Given** aucune route Caddy ne pointe vers BRouter
**When** je tente `curl https://ridenrest.app/brouter/...` depuis l'extérieur
**Then** la requête est refusée (404 ou bloquée au reverse proxy)

_Note : Pas de `depends_on` entre `api` et `brouter` — NestJS tourne en PM2 natif hors Docker (cf. project-context.md §VPS Deployment Config)._

---

### Story 1.2 : Valider le téléchargement des segments en local & créer le runbook ops

As a **DevOps engineer**,
I want to validate the BRouter Europe segment download workflow locally and document the operational procedures in a runbook,
So that the team has a reproducible reference for first-time bootstrap and recurring ops tasks before deploying to production (Story 1.5).

**Scope** : ce travail est fait **en local** (machine du dev). La validation formelle NFR p95 < 500 ms sur VPS prod se fait en Story 1.5.

**Acceptance Criteria :**

**Given** le conteneur BRouter provisionné en local (Story 1.1)
**When** je lance le conteneur pour la première fois sur ma machine
**Then** BRouter NE télécharge PAS automatiquement les segments (confirmé par Story 1.1 — routing retourne 400 "datafile not found")
**And** les segments Europe (~3 Go) doivent être téléchargés manuellement depuis `brouter.de/brouter/segments4/` et montés dans le volume `brouter-segments`
**And** le téléchargement complet en < 15 minutes (sur connexion ~10 Mo/s)
**And** les segments persistent dans le volume Docker `brouter-segments` entre les redémarrages
**And** je documente la commande exacte de download et le temps observé dans le runbook

**Given** les segments sont chargés en local
**When** j'exécute un script de smoke-test (3-5 requêtes de routing sur des routes européennes courtes, profil `trekking`)
**Then** toutes les requêtes retournent un GeoJSON LineString valide (status 200)
**And** la médiane de latence locale est notée (informative — ne valide pas la NFR prod)

**Given** la validation locale est OK
**When** je crée `docs/ops/brouter-runbook.md`
**Then** le runbook documente :
  - (a) Procédure de provisionnement initial (commande, prérequis disque, durée download attendue)
  - (b) Diagnostic d'une panne BRouter (logs, healthcheck, vérification volume, fallback circuit breaker)
  - (c) Procédure de mise à jour des segments OSM (cron mensuel + manuel)
  - (d) Procédure de bump de `ACCESS_ENGINE_VERSION` (impact recalcul lazy, pas de pic de charge)
  - (e) Procédure de diagnostic d'explosion de queue BullMQ (purge, throttle)
  - (f) Section "Première installation sur VPS prod" qui réfère explicitement à la Story 1.5

---

### Story 1.3 : Migration DB pour le calcul d'itinéraire d'accès

As a **backend developer**,
I want to extend the database schema with the columns and types needed for storing access route data and user routing preferences,
So that subsequent backend stories can persist computed access routes and user consent without further schema changes.

**Acceptance Criteria :**

**Given** la migration `packages/database/migrations/2026-05-XX_add_poi_access.sql`
**When** je l'applique sur une DB de dev
**Then** le type `routing_profile` ENUM (`'road' | 'gravel' | 'bikepacking'`) est créé
**And** `adventures.routing_profile` est ajoutée (`NOT NULL DEFAULT 'gravel'`)
**And** `profiles.live_access_consent BOOLEAN` est ajoutée (nullable, NULL = jamais demandé)
**And** 8 colonnes sont ajoutées à `accommodations_cache` : `access_origin_stage_id` (FK → `adventure_stages(id) ON DELETE SET NULL`), `access_distance_m REAL`, `access_elevation_gain_m REAL`, `access_elevation_loss_m REAL`, `access_geometry geometry(LINESTRING, 4326)`, `access_engine_version TEXT`, `access_computed_at TIMESTAMP`, `access_failed BOOLEAN NOT NULL DEFAULT FALSE`

**Given** la migration est appliquée
**When** j'inspecte le schéma via `\d accommodations_cache` dans psql
**Then** l'index `idx_accommodations_cache_access_stage` existe sur `access_origin_stage_id`
**And** l'index partiel `idx_accommodations_cache_access_pending` existe sur `segment_id WHERE access_computed_at IS NULL AND access_failed = false`

**Given** la migration est appliquée sur une DB contenant déjà des rows production
**When** la migration se termine
**Then** aucune row existante n'est modifiée (toutes les nouvelles colonnes sont nullables sauf `routing_profile` qui a `DEFAULT 'gravel'`)
**And** aucune perte de données détectée

**Given** la migration est appliquée
**When** je mets à jour les fichiers Drizzle (`accommodations-cache.ts`, `adventures.ts`, `profiles.ts`)
**Then** le `customType<geometry>` est réutilisé depuis `adventure-segments.ts`
**And** `pnpm typecheck` passe sur tous les apps et packages
**And** `pnpm db:studio` montre les nouvelles colonnes avec leurs types

**Given** le pipeline CI/CD GitHub Actions existant
**When** j'ajoute un step `pnpm db:migrate` (ou équivalent Drizzle) dans le job de deploy, AVANT le `pm2 reload api`
**Then** chaque release lance automatiquement les migrations en attente sur la DB prod
**And** le step échoue (et bloque le deploy) si la migration ne peut pas s'appliquer
**And** le step est idempotent (re-run safe — Drizzle skip les migrations déjà appliquées)
**And** la migration raw SQL PostGIS est appliquée via `psql` dans le même step CI (cf. `architecture-poi-access-routing.md` §CI/CD)

**Given** un dry-run staging (si environnement staging existe)
**When** je teste le pipeline avant prod
**Then** la migration s'applique sans erreur sur la staging DB
**And** un rollback manuel est documenté dans le runbook (procédure SQL `ALTER TABLE ... DROP COLUMN`)

---

### Story 1.4 : Audit pré-requis codebase & résolution des gaps critiques

As a **backend developer**,
I want to audit the existing codebase for the 5 prerequisites identified in the architecture and resolve the gaps,
So that Epic 2-4 stories can rely on these foundations existing.

**Acceptance Criteria :**

**Given** la liste des 5 pré-requis (MeController, OwnerOnly, @nestjs/throttler, EventEmitter, Bull Board)
**When** j'audite le codebase
**Then** je produis un rapport `docs/ops/access-routing-prereq-audit.md` indiquant pour chaque pré-requis : exists/missing, localisation si exists, décision (use existing / create new / not needed pour ce scope)

**Given** `@nestjs/throttler` n'est pas installé
**When** je l'ajoute via `pnpm add @nestjs/throttler` dans `apps/api`
**Then** `ThrottlerModule.forRoot()` est enregistré dans `app.module.ts` avec une config permissive globale
**And** aucune route existante n'est cassée par cet ajout

**Given** un guard `OwnerOnly` n'existe pas
**When** je crée `apps/api/src/auth/guards/owner-only.guard.ts`
**Then** le guard vérifie que `req.user.id` correspond au propriétaire d'une ressource (configurable via metadata `@OwnedResource(...)`)
**And** au moins un test unitaire couvre le happy path et le path 403

**Given** NestJS `EventEmitter` n'est pas configuré
**When** j'installe `@nestjs/event-emitter` et enregistre `EventEmitterModule.forRoot()` dans `app.module.ts`
**Then** d'autres modules peuvent déclarer des handlers `@OnEvent('...')`
**And** le module Density Analysis existant n'est PAS modifié dans cette story (seule la fondation est ajoutée)

**Given** `MeController` n'existe pas
**When** je crée `apps/api/src/me/me.controller.ts` avec des stubs pour `GET /me/settings` et `PATCH /me/settings`
**Then** le controller est enregistré dans `app.module.ts`
**And** les routes retournent `501 Not Implemented` pour l'instant (vraie implémentation en Epic 3 Story 3.2)
**And** le controller est protégé par le JWT guard existant

**Given** les pré-requis sont résolus
**When** j'ajoute 7 nouvelles variables d'environnement à `.env.example` (`BROUTER_BASE_URL`, `BROUTER_TIMEOUT_MS`, `BROUTER_DEFAULT_PROFILE`, `ACCESS_EAGER_THRESHOLD_M`, `ACCESS_TRACE_BUFFER_M`, `ACCESS_CACHE_TTL_LIVE_SECONDS`, `ACCESS_ENGINE_VERSION`)
**Then** `apps/api/src/config/access.config.ts` valide chaque variable au démarrage (schéma Zod/Joi)
**And** l'API crash early avec un message d'erreur clair si une variable requise manque

---

### Story 1.5 : Bootstrap initial du VPS prod + CI/CD pipeline BRouter + benchmark NFR

As a **DevOps engineer**,
I want to perform the one-shot manual bootstrap of BRouter on the production VPS, wire it into the GitHub Actions CI/CD pipeline, and formally validate the NFR latency (<500ms p95) in the production environment,
So that the team can ship Epic 2-4 backend work with confidence that the production routing infrastructure is operational and continuously deployable.

**Scope** : opération manuelle one-shot + modification CI permanente. À exécuter après le merge des Stories 1.1, 1.2, 1.3, 1.4 sur `main`.

**Acceptance Criteria :**

**Given** un accès SSH au VPS Hostinger KVM 2 et le runbook de Story 1.2
**When** je vérifie l'état du VPS avant bootstrap
**Then** je confirme : ≥ 5 Go d'espace disque libre, ≥ 3 Go RAM libre, Docker + docker-compose installés, version `docker-compose >= 1.29` (support `condition: service_healthy`)
**And** les checks sont consignés dans `docs/ops/brouter-prod-bootstrap-log-{date}.md`

**Given** le repo à jour sur le VPS (`git pull origin main`)
**When** j'exécute `docker-compose pull brouter && docker-compose up -d brouter`
**Then** le conteneur démarre et commence le téléchargement des ~3 Go de segments Europe
**And** je suis le progrès via `docker logs -f ridenrest-brouter`
**And** je confirme `docker inspect --format='{{.State.Health.Status}}' ridenrest-brouter == 'healthy'` dans les 15 min
**And** je valide qu'un `curl http://127.0.0.1:17777/brouter/profile/trekking` retourne 200 depuis le VPS

**Given** BRouter tourne sur le VPS
**When** j'exécute le script de benchmark formel (10 requêtes diverses, profil `trekking`, depuis le conteneur `api`)
**Then** la latence p95 mesurée est < 500 ms (validation formelle NFR-PA-002)
**And** les résultats sont consignés dans `docs/ops/brouter-benchmark-results.md` (datés, distribution, samples, environnement)
**And** si la NFR échoue → ouvrir un blocker bug et déprovisionner avant de continuer

**Given** le pipeline GitHub Actions existant (`.github/workflows/deploy.yml`)
**When** j'ajoute les steps :
```yaml
- name: Pull BRouter image
  run: docker-compose pull brouter
- name: Restart BRouter (no-op if up)
  run: docker-compose up -d brouter
- name: Wait for BRouter healthcheck
  run: timeout 300 sh -c 'until docker inspect --format="{{.State.Health.Status}}" ridenrest-brouter | grep -q healthy; do sleep 5; done'
- name: Reload API
  run: pm2 reload api
```
**Then** chaque deploy futur applique automatiquement ces steps
**And** un deploy échoue (et bloque le rollout) si BRouter ne devient pas healthy en 5 minutes
**And** un dry-run en staging (ou un deploy "no-op" sans changement) valide le pipeline

**Given** Uptime Kuma déjà configuré sur l'infra
**When** j'ajoute un monitor `HTTP Keyword` pointant vers `http://127.0.0.1:17777/brouter/profile/trekking` (interne au VPS, exécuté depuis Uptime Kuma container si possible, sinon push monitor)
**Then** une alerte (email + Telegram) se déclenche si le monitor down > 1 min
**And** le monitor est nommé clairement `BRouter Production` dans le dashboard Kuma

**Given** la procédure complète bootstrap + CI + monitoring est exécutée
**When** je conclus la story
**Then** je mets à jour `docs/ops/brouter-runbook.md` avec : log du bootstrap initial (date, opérateur), procédure de redéploiement BRouter sans downtime, procédure de rollback (downgrader l'image), procédure de purge volume + re-download si segments corrompus

**Given** l'audit final
**When** je vérifie depuis l'extérieur du VPS
**Then** `curl https://ridenrest.com/brouter/...` retourne 404 ou erreur Caddy (jamais exposé publiquement — NFR-PA-008)
**And** un scan `nmap` depuis l'extérieur ne montre pas le port 17777 ouvert

---

## Epic 2 : Calcul & Affichage de l'Itinéraire d'Accès en Mode Planning ⭐

Permettre à l'utilisateur de consulter, depuis la fiche détail d'un POI hébergement en mode Planning, l'itinéraire d'accès cyclable réel (distance, D+, D-) calculé depuis sa trace, et d'en visualiser la polyline sur la carte. Valeur principale de la feature, livrable indépendamment d'Epic 3 (Live) et d'Epic 4 (async). Calcul lazy à la demande — Epic 4 ajoutera la performance.

### Story 2.1 : Implémenter le `RoutingService` (wrapper BRouter + circuit breaker)

As a **backend developer**,
I want to encapsulate all communication with the BRouter HTTP API in a dedicated NestJS service with timeout, retry and circuit breaker logic,
So that the rest of the codebase can call BRouter via a stable, resilient interface that gracefully degrades on failure.

**Acceptance Criteria :**

**Given** le module `RoutingModule` à créer dans `apps/api/src/routing/`
**When** je crée `routing.service.ts` avec une méthode `computeRoute({ from, to, profile })`
**Then** le service utilise `@nestjs/axios` (HttpService) injecté
**And** l'URL appelée est `${BROUTER_BASE_URL}/brouter?lonlats=${from[0]},${from[1]}|${to[0]},${to[1]}&profile=${profile}&alternativeidx=0&format=geojson`
**And** le timeout est de `BROUTER_TIMEOUT_MS` (5000 ms par défaut)
**And** la réponse est typée via `BrouterRoute` (interface dans `routing.types.ts`)
**And** les coordonnées passées sont au format `[lon, lat]` (ordre GeoJSON, jamais `[lat, lon]`)

**Given** BRouter répond avec une erreur HTTP ou timeout
**When** le service détecte 5 échecs consécutifs dans une fenêtre glissante
**Then** un circuit breaker s'ouvre pour 30 secondes
**And** toute nouvelle requête `computeRoute` lève immédiatement `BrouterUnavailableException` sans toucher BRouter
**And** après 30 s, le circuit passe en half-open et tente une requête de test

**Given** une requête timeout (>5 s)
**When** elle expire
**Then** le service lève `BrouterUnavailableException` avec le motif `'timeout'`
**And** un log structuré WARN est émis avec `engine_version`, `profile`, `duration_ms`

**Given** une réponse BRouter valide
**When** elle est parsée
**Then** le service retourne `{ geometry, distanceM, elevationGainM, elevationLossM }` extrait du GeoJSON et des `properties.messages`
**And** un test unitaire `routing.service.spec.ts` valide le parsing avec une fixture GeoJSON BRouter réelle

**Given** la décision d'implémentation circuit breaker (cockatiel vs maison)
**When** je tranche dans cette story
**Then** la décision est documentée dans un commentaire de tête du fichier ou dans `docs/ops/access-routing-prereq-audit.md`

---

### Story 2.2 : Implémenter le `AccessCalculatorService` (logique métier accès)

As a **backend developer**,
I want a service that orchestrates the full access-route calculation pipeline (resolve origin → call BRouter → subtract trace overlap via PostGIS → persist to cache),
So that the controller and the BullMQ worker share a single source of truth for the business logic.

**Acceptance Criteria :**

**Given** le module `AccessCalculatorModule` créé dans `apps/api/src/pois/access-calculator/`
**When** je crée `access-calculator.service.ts` avec la méthode `compute({ poiId, origin, profileOverride? })`
**Then** la stratégie `resolve-origin.ts` retourne `[lon, lat]` selon le type d'origine (`'gps' | 'stage' | 'adventure-start'`)
**And** la stratégie `compute-divergent-segment.ts` utilise `db.execute(sql\`SELECT ST_Length(ST_Difference(${route}::geometry, ST_Buffer(${trace}::geography, ${ACCESS_TRACE_BUFFER_M})::geometry))\`)` pour calculer la distance divergente

**Given** un POI cible et une origine résolue
**When** `compute()` est appelée
**Then** elle appelle `routingService.computeRoute({ from: origin, to: [poi.lng, poi.lat], profile })`
**And** elle soustrait la portion qui chevauche la trace via `ST_Difference` avec un buffer de 10 m
**And** elle calcule le D+/D- sur la portion divergente uniquement (filtrage des points d'élévation)
**And** elle retourne `{ status: 'ok', distanceM, elevationGainM, elevationLossM, geometry, engineVersion, computedAt }`

**Given** `routingService.computeRoute` lève `BrouterUnavailableException`
**When** `compute()` catch l'exception
**Then** elle retourne `{ status: 'fallback', fallbackReason: 'routing_failed', fallbackDistanceM: <dist_from_trace_m existant> }` sans re-throw
**And** elle NE met PAS à jour le cache DB (pour permettre un retry ultérieur sans flag `access_failed`)

**Given** un calcul réussi en mode Planning
**When** `compute()` termine
**Then** elle UPDATE `accommodations_cache` avec les colonnes `access_*` + `access_computed_at = NOW()` + `access_engine_version = $ACCESS_ENGINE_VERSION`
**And** la geometry stockée est simplifiée via `ST_SimplifyPreserveTopology(geom, 5)` (tolérance 5 m)

**Given** un POI sans `dist_from_trace_m` (impossible en pratique)
**When** `compute()` est appelée
**Then** elle lève une exception 503 (cas dégénéré, pas de fallback possible)

**Given** un test unitaire de la stratégie `compute-divergent-segment.ts`
**When** je fournis une fixture (route + trace en GeoJSON LineString)
**Then** le test valide que la distance retournée correspond à la portion strictement divergente (± 1 m)

---

### Story 2.3 : Endpoint `POST /pois/:id/access` (mode Planning)

As a **frontend developer**,
I want to call a single REST endpoint that returns the access route metrics (distance + elevation + geometry) for any POI in Planning mode,
So that the UI can render the access info synchronously without orchestrating BRouter + PostGIS calls itself.

**Acceptance Criteria :**

**Given** l'endpoint `POST /pois/:id/access` à créer dans `apps/api/src/pois/pois.controller.ts`
**When** je l'implémente
**Then** il accepte un body conforme à `AccessRequestSchema` (Zod partagé dans `packages/shared/src/schemas/poi-access.ts`)
**And** il rejette `400` si le body est invalide (via `class-validator` ou ZodValidationPipe)
**And** il rejette `401` sans JWT valide
**And** il rejette `403` si le POI n'appartient pas à une aventure du user authentifié
**And** il rejette `404` si le POI n'existe pas
**And** il applique le rate limit de 60 req/min/user (planning), via `@nestjs/throttler`

**Given** une requête avec `origin.type === 'stage'` et `stageId` valide appartenant au user
**When** le controller appelle `accessCalculatorService.compute(...)`
**Then** la réponse 200 a le format `AccessResponseSchema` : `{ status: 'ok' | 'fallback' | 'error', ... , source: 'db-cache' | 'redis-cache' | 'computed-fresh' }`
**And** si `accommodations_cache.access_computed_at IS NOT NULL` et `access_origin_stage_id == requestedStageId`, on retourne le cache DB (`source: 'db-cache'`)
**And** sinon on déclenche `compute()` lazy et on retourne `source: 'computed-fresh'`

**Given** une requête avec `origin.type === 'adventure-start'`
**When** le controller appelle `compute()`
**Then** l'origine résolue est le point `[lng, lat]` au km 0 de la première trace de l'aventure
**And** la story 11.4 (Stage-Scoped POI Search) n'est pas régressée

**Given** BRouter est down
**When** le calcul est lancé
**Then** la réponse HTTP est 200 (pas 503) avec `{ status: 'fallback', fallbackReason: 'routing_failed', fallbackDistanceM: ... }`

**Given** un test E2E `apps/api/test/access.e2e-spec.ts`
**When** je couvre les cas : happy path, 400 (body invalide), 403 (POI d'un autre user), 404 (POI inexistant), 429 (rate limit), 200 fallback
**Then** tous les tests passent en CI avec un BRouter mocké (fixtures GeoJSON)

---

### Story 2.4 : Composant `AccessMetrics` + intégration POI Sheet/Popup Planning

As a **end user planning my adventure on desktop**,
I want to see the real cycling access distance + elevation gain to each accommodation POI directly in its detail sheet and popup,
So that I can pick a stopover hotel based on the actual additional cycling effort, not just a misleading straight-line distance.

**Acceptance Criteria :**

**Given** le composant `apps/web/src/components/poi-access/AccessMetrics.tsx`
**When** il est monté avec props `{ poiId, origin, fallbackDistanceM }`
**Then** il appelle le hook `useAccess(poiId, origin)` qui wrap `TanStack Query`
**And** pendant le chargement il affiche `<AccessMetricsSkeleton />` (jamais un spinner générique)
**And** si `data.status === 'ok'`, il affiche : distance formatée (`< 1000` → "X m" ; sinon "X,X km"), D+ ("X m D+"), D- ("X m D-")
**And** si `data.status === 'fallback'`, il affiche `<AccessFallback>` avec la distance vol d'oiseau et un badge "≈ approximatif"

**Given** le helper `apps/web/src/lib/poi-labels.ts` exportant `getAccessLabel(subcategory)`
**When** `AccessMetrics` affiche un titre
**Then** il utilise `getAccessLabel(poi.subcategory)` (ex: "Itinéraire vers l'hôtel", "Itinéraire vers le camping")
**And** aucun composant ne hardcode "hôtel"/"camping"/etc. dans son JSX
**And** le fallback générique est "Itinéraire d'accès" si `subcategory` est null/inconnue

**Given** le composant existant `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx`
**When** je l'étends pour inclure `<AccessMetrics>` sous le bloc "Distance trace"
**Then** le bloc est masqué tant que l'utilisateur n'a pas ouvert le sheet (lazy mount)
**And** le composant n'introduit pas de re-render cascade des autres sections

**Given** le composant `poi-popup.tsx` (Planning)
**When** je l'étends pour inclure une version compacte de `<AccessMetrics>` (distance seule, sans D+/D-)
**Then** le popup reste lisible et compact (pas plus de 2 lignes ajoutées)

**Given** le hook `useAccess`
**When** je l'implémente dans `apps/web/src/components/poi-access/useAccess.ts`
**Then** il retourne `{ data, isLoading, error }` avec queryKey `['poi-access', poiId, origin]`
**And** `staleTime: 5 * 60 * 1000` et `gcTime: 15 * 60 * 1000`
**And** un test `*.test.tsx` couvre le rendu skeleton, ok, et fallback

---

### Story 2.5 : `AccessMapLayer` — polyline d'itinéraire d'accès sur MapLibre

As a **end user planning my adventure**,
I want to visualize the access route between my trace and the selected POI as a distinct polyline on the map,
So that I can spatially understand the detour and compare alternative POIs at a glance.

**Acceptance Criteria :**

**Given** le composant `apps/web/src/components/poi-access/AccessMapLayer.tsx`
**When** il est monté avec une `geometry: GeoJSON LineString`
**Then** il ajoute un layer MapLibre `id: 'poi-access-line'` au-dessus du layer existant `route-line`
**And** le style du layer est : `line-color: '#f59e0b'` (amber-500), `line-width: 4`, `line-dasharray: [2, 2]`, `line-opacity: 0.9`, `line-cap: 'round'`, `line-join: 'round'`

**Given** un POI est cliqué dans la fiche détail
**When** le store Zustand `usePlanningModeStore.visibleAccessPoiId` passe à `poi.id`
**Then** la polyline correspondante s'affiche
**And** la carte zoom sur le bbox englobant `[access_geometry + portion pertinente de trace]`

**Given** une autre polyline d'accès est déjà visible
**When** l'utilisateur clique sur un nouveau POI
**Then** l'ancienne polyline est remplacée (jamais accumulation de plusieurs polylines simultanées)

**Given** l'utilisateur clique sur la carte en dehors d'un POI
**When** `visibleAccessPoiId` passe à `null`
**Then** la polyline est retirée du layer MapLibre proprement (cleanup `removeLayer` + `removeSource`)

**Given** le composant est lazy via `dynamic(() => import('AccessMapLayer'), { ssr: false })`
**When** je build l'app
**Then** l'impact bundle initial est < 10 KB gzip (chunk POI)

**Given** un test composant
**When** je couvre : mount avec geometry, switch de POI, unmount → cleanup
**Then** les tests passent avec un mock MapLibre

---

### Story 2.6 : UI sélecteur de profil de routage dans l'édition d'aventure

As a **end user planning my adventure**,
I want to set the cycling routing profile (Route / Gravel / Bikepacking) on each of my adventures,
So that the access route calculations match my actual riding style and bike type.

**Acceptance Criteria :**

**Given** la page d'édition d'aventure existante
**When** j'ajoute un composant `<Select>` shadcn/ui sous le titre "Profil de routage cyclable"
**Then** le select expose 3 options : `Route`, `Gravel (par défaut)`, `Bikepacking`
**And** la valeur affichée correspond à `adventure.routingProfile` lue depuis l'API
**And** un mini-tooltip (`?` icon) explique en 1 phrase la différence entre profils (ex: "Route privilégie l'asphalte, Gravel mix route+chemins, Bikepacking minimise le trafic")

**Given** l'utilisateur change la sélection
**When** il sélectionne un autre profil
**Then** l'UI appelle `PATCH /adventures/:id { routingProfile: 'road' | 'gravel' | 'bikepacking' }`
**And** la réponse 200 confirme le changement et le store local TanStack Query est invalidé
**And** un toast confirme la sauvegarde
**And** sur erreur réseau/serveur, un toast d'erreur s'affiche et la sélection revient à la valeur précédente

**Given** le backend `PATCH /adventures/:id` reçoit `routingProfile`
**When** la mise à jour DB est faite
**Then** un event `'adventure.profile-changed'` est émis via `EventEmitter` (consommé par Story 4.2 pour l'invalidation des caches d'accès)
**And** la validation DTO côté backend accepte uniquement les 3 valeurs enum, rejette 400 sinon
**And** un test E2E couvre : PATCH valide (200 + event émis), PATCH valeur invalide (400), PATCH sur aventure d'un autre user (403)

**Given** une nouvelle aventure créée
**When** je consulte sa fiche
**Then** `routingProfile === 'gravel'` (default DB de la Story 1.3 appliqué)
**And** le `<Select>` affiche "Gravel (par défaut)" sélectionné

**Given** un test composant React
**When** je couvre : render avec valeur initiale, changement valeur → mutation appelée, erreur mutation → rollback UI
**Then** tous les cas passent

---

## Epic 3 : Mode Live & Confidentialité RGPD

Permettre à l'utilisateur, depuis le mode Live (à vélo), de calculer un itinéraire d'accès précis depuis sa position GPS actuelle, avec un consentement explicite recueilli via popin RGPD à la 1ère occurrence et révocable depuis Paramètres > Confidentialité. Garantit l'anonymisation et la non-persistance des données GPS.

### Story 3.1 : Extension endpoint pour mode Live (origin GPS + cache Redis anonyme)

As a **backend developer**,
I want to extend the `POST /pois/:id/access` endpoint to support the Live mode (origin GPS) with an anonymous Redis cache and a consent gate,
So that the Live UX can call the same endpoint without leaking PII.

**Acceptance Criteria :**

**Given** une requête avec `origin.type === 'gps'` et `{ lat, lng }` arrondis 4 décimales
**When** le controller la reçoit
**Then** il vérifie `profile.live_access_consent === true` ; si `false` ou `null`, il retourne `{ status: 'fallback', fallbackReason: 'no_consent', fallbackDistanceM: ... }` sans appeler BRouter
**And** si `true`, il poursuit le flux normal de calcul

**Given** le calcul est autorisé
**When** `accessCalculatorService.compute(...)` est appelé avec `origin: gps`
**Then** la clé Redis utilisée est `access:live:${poiId}:${profile}:${lat}:${lng}` (jamais `userId`)
**And** le TTL est de `ACCESS_CACHE_TTL_LIVE_SECONDS` (900s = 15 min) par défaut
**And** si cache hit Redis → réponse `{ source: 'redis-cache', ... }` sans appel BRouter
**And** si cache miss → calcul + SET Redis avec TTL + réponse `{ source: 'computed-fresh', ... }`

**Given** une requête Live avec `lat`/`lng` ayant plus de 4 décimales
**When** le DTO est validé
**Then** la requête est rejetée 400 (le serveur exige des coordonnées pré-arrondies — defense in depth)
**And** un test E2E valide ce rejet

**Given** le rate limit Live (`ACCESS_RATE_LIMIT_LIVE = 120 req/min/user`)
**When** un user dépasse le seuil
**Then** la réponse est 429 avec header `Retry-After`

**Given** un test E2E `access.e2e-spec.ts`
**When** je couvre : origin gps avec consent=true (200 ok), consent=false (200 fallback no_consent), consent=null (200 fallback no_consent), cache hit Redis, lat non-arrondi (400), rate limit Live (429)
**Then** tous les cas passent

---

### Story 3.2 : `MeController` — `GET /me/settings` & `PATCH /me/settings` (impl. réelle)

As a **end user**,
I want to view and update my privacy settings via the `/me/settings` endpoints,
So that I can review and revoke my consent to live GPS-based access route calculations at any time.

**Acceptance Criteria :**

**Given** les stubs `GET /me/settings` et `PATCH /me/settings` créés en Story 1.4
**When** je remplace les stubs par l'implémentation réelle
**Then** `GET /me/settings` retourne `{ liveAccessConsent: true | false | null, ... autres settings existants si présents }`
**And** la réponse est cachée 0 secondes (toujours fresh)

**Given** une requête `PATCH /me/settings` avec body `{ liveAccessConsent: true }` ou `{ liveAccessConsent: false }`
**When** le controller la traite
**Then** la valeur est persistée dans `profiles.live_access_consent`
**And** la réponse 200 retourne l'état mis à jour
**And** seul l'owner du profile peut PATCH (vérifié via JWT `req.user.id`)

**Given** un user passe de `liveAccessConsent: true` à `false`
**When** le PATCH est traité
**Then** un event `'profile.live-consent-revoked'` est émis via `EventEmitter` avec `{ userId }`
**And** un handler dans `AccessWorkerModule` (story 4.2) pourra le consommer plus tard (best-effort purge Redis)

**Given** une requête sans JWT
**When** je hit `GET /me/settings`
**Then** la réponse est 401

**Given** un body PATCH avec une valeur autre que `true | false`
**When** le DTO est validé
**Then** la réponse est 400

**Given** un test E2E
**When** je couvre : GET sans JWT (401), GET avec JWT (200 + état), PATCH true (200 + DB updated), PATCH false (200 + event émis), PATCH avec body invalide (400)
**Then** tous les cas passent

---

### Story 3.3 : `AccessConsentDialog` popin RGPD + Section Privacy Settings + helper `roundCoordinate`

As a **end user using Live mode for the first time**,
I want to be asked for explicit consent before my GPS position is sent for access route calculation, and to be able to revoke that consent later from my settings,
So that I keep control over my privacy data per RGPD principles.

**Acceptance Criteria :**

**Given** le helper `apps/web/src/lib/privacy.ts` à créer
**When** j'exporte `roundCoordinate(coord: number): number`
**Then** il retourne `Math.round(coord * 10_000) / 10_000` (4 décimales = ~11 m)
**And** un test unitaire couvre les cas : positif, négatif, déjà arrondi, 0

**Given** le composant `apps/web/src/components/poi-access/AccessConsentDialog.tsx`
**When** il est monté avec `{ open, onChoose }`
**Then** il utilise `<Dialog>` shadcn/ui avec le wording validé en architecture (titre "🛰️ Calcul d'itinéraire d'accès précis", description sur position arrondie ~10 m + non-conservation des données, footer "Modifiable dans Paramètres > Confidentialité")
**And** deux boutons "Refuser" (variant outline) et "Autoriser" (variant default) appellent `onChoose(false)` ou `onChoose(true)`

**Given** un user clique sur un POI en mode Live pour la première fois
**When** le frontend détecte `profile.liveAccessConsent === null`
**Then** la popin `AccessConsentDialog` s'affiche
**And** le store `useLiveModeStore.accessConsentChecked` passe à `true` (évite la re-demande dans la session courante même si user n'a pas choisi)
**And** sur "Autoriser" → `PATCH /me/settings { liveAccessConsent: true }` puis déclenchement calcul itinéraire
**And** sur "Refuser" → `PATCH /me/settings { liveAccessConsent: false }` puis fallback vol d'oiseau immédiat (sans appeler le calcul)

**Given** la section `apps/web/src/app/(app)/settings/_components/privacy-section.tsx` à créer
**When** je l'intègre dans `apps/web/src/app/(app)/settings/page.tsx`
**Then** elle affiche un `<Switch>` shadcn/ui avec label "Calcul d'itinéraire d'accès précis en mode Live"
**And** une description explicative (position arrondie + non-conservation)
**And** le switch reflète `liveAccessConsent === true` (ni `false` ni `null` ne coche le switch)
**And** changer le switch déclenche `PATCH /me/settings` via `useUpdateMeSettings()` mutation

**Given** le composant frontend qui envoie la position GPS
**When** il prépare le body de la requête
**Then** il applique `roundCoordinate(gps.lat)` et `roundCoordinate(gps.lng)` AVANT envoi
**And** la position non-arrondie ne quitte JAMAIS le client (vérifié en review et via test)

**Given** un test E2E Playwright (si configuré)
**When** je couvre le flow : 1ère visite Live → popin → autoriser → calcul lancé / refuser → fallback immédiat / consentement déjà donné → pas de popin
**Then** tous les scénarios passent

---

## Epic 4 : Pré-calcul Async, Invalidation & Production-Readiness

Éliminer la latence perçue via le pré-calcul asynchrone (BullMQ) des POI proches (<1500 m) à la création d'aventure, garantir la cohérence des données via l'invalidation event-driven, et rendre la feature observable et résiliente en production.

### Story 4.1 : Worker BullMQ `poi-access-calculation` (pré-calcul eager)

As a **end user uploading a new adventure**,
I want the access routes for nearby POIs to be pre-computed in the background so the data is ready when I open the map,
So that I never see a loading skeleton on common POIs.

**Acceptance Criteria :**

**Given** le module `AccessWorkerModule` créé dans `apps/api/src/pois/access-worker/`
**When** j'enregistre la queue `poi-access-calculation` via `@nestjs/bullmq`
**Then** la concurrency est de 5 jobs simultanés
**And** la stratégie retry est 3 tentatives avec backoff exponentiel (1s, 5s, 25s)
**And** une dead letter queue `poi-access-failures` reçoit les jobs après échec définitif
**And** chaque job a une `jobId` = `${poiId}:${engineVersion}:${stageId ?? 'null'}` (idempotence)

**Given** un trigger d'upload d'aventure terminé (corridor search + `dist_from_trace_m` calculé)
**When** un event `'adventure.corridor-ready'` est émis
**Then** le worker enqueue un job par POI satisfaisant : `dist_from_trace_m < ACCESS_EAGER_THRESHOLD_M (1500m) AND access_computed_at IS NULL AND access_failed = false`
**And** le job est traité en arrière-plan sans bloquer la réponse HTTP de l'upload

**Given** un job en cours
**When** le processor appelle `accessCalculatorService.compute(...)` avec `origin: 'stage'` (premier stage) ou `'adventure-start'` (si aucun stage)
**Then** un succès met à jour `accommodations_cache.access_*` + `access_computed_at = NOW()`
**And** un échec définitif après 3 retries met `access_failed = true` + `access_computed_at = NOW()` (évite recalcul perpétuel)

**Given** un nouveau push avec bump de `ACCESS_ENGINE_VERSION`
**When** l'API redémarre
**Then** AUCUN job de recalcul global n'est enqueue (pas de pic de charge)
**And** le recalcul se fait lazy au prochain accès du POI (cf. story 2.3 — cache check inclut version match)

**Given** un test E2E worker
**When** je couvre : enqueue depuis event, traitement succès, traitement échec 3x → DLQ, idempotence (re-enqueue même jobId = no-op)
**Then** tous les cas passent

---

### Story 4.2 : Invalidation handlers event-driven (trace / profil / stage)

As a **end user modifying my adventure trace, routing profile, or stages**,
I want the access routes to be automatically invalidated and recomputed so I never see stale data,
So that my planning decisions are always based on current information.

**Acceptance Criteria :**

**Given** un UPDATE sur `adventure_segments.geom` (changement de trace)
**When** un event `'adventure.trace-updated'` est émis avec `{ adventureId, segmentId }`
**Then** un handler SQL UPDATE `accommodations_cache SET access_distance_m=NULL, access_elevation_gain_m=NULL, access_elevation_loss_m=NULL, access_geometry=NULL, access_computed_at=NULL, access_engine_version=NULL, access_failed=false WHERE segment_id = $segmentId`
**And** les jobs de recompute sont enqueue pour les POI éligibles (cf. story 4.1 critères eager)

**Given** un PATCH sur `adventures.routing_profile`
**When** un event `'adventure.profile-changed'` est émis avec `{ adventureId, newProfile }`
**Then** tous les `accommodations_cache.access_*` des POI de l'aventure sont reset à NULL
**And** les jobs de recompute sont enqueue avec le nouveau profil

**Given** un PATCH sur `adventure_stages` (changement `start_km` ou `end_km`)
**When** un event `'stage.updated'` est émis avec `{ stageId }`
**Then** seuls les POI ayant `access_origin_stage_id = stageId` sont reset
**And** les autres POI de l'aventure ne sont PAS affectés

**Given** un DELETE sur `adventure_stages`
**When** le delete se produit
**Then** la contrainte `ON DELETE SET NULL` met `access_origin_stage_id` à NULL pour les POI concernés
**And** un event `'stage.deleted'` déclenche le reset des `access_*` pour ces POI

**Given** un user révoque le consent Live (event `'profile.live-consent-revoked'` de la story 3.2)
**When** le handler le consomme
**Then** une purge best-effort des clés Redis `access:live:*` est tentée via `SCAN + DEL` (limité à 1000 clés max pour éviter blocage Redis)
**And** un log INFO consigne le nombre de clés purgées (ou "expiré naturellement" si purge non triviale)

**Given** un test d'intégration
**When** je couvre : UPDATE trace → reset + reenqueue, UPDATE profile → reset + reenqueue, UPDATE stage → reset stage-scoped uniquement, DELETE stage → SET NULL + reset
**Then** tous les cas passent

---

### Story 4.3 : Observabilité — Métriques BullMQ + Uptime Kuma + Sentry

As a **DevOps engineer running the app in production**,
I want metrics, alerts and structured logs for the access routing pipeline,
So that I can detect BRouter outages, queue backlogs, and silent failures before users complain.

**Acceptance Criteria :**

**Given** un dashboard Bull Board (existant ou ajouté en Story 1.4)
**When** j'ajoute la queue `poi-access-calculation` au dashboard
**Then** le dashboard affiche : queue depth, active jobs, failed jobs (24h), avg processing time
**And** une alerte Uptime Kuma se déclenche si queue depth > 200 (push notification / email)

**Given** un monitor Uptime Kuma de type HTTP Keyword
**When** je configure `URL: http://localhost:17777/brouter/profile/trekking`, `Keyword: <expected response>`, `Interval: 30s`
**Then** une alerte (email + Telegram) se déclenche si le monitor down > 1 minute
**And** la procédure de diagnostic est documentée dans `brouter-runbook.md`

**Given** Sentry est configuré (existant dans le projet)
**When** une exception est levée dans `RoutingService` ou `AccessCalculatorService`
**Then** elle est capturée avec tags `engine_version`, `profile`, `origin_type`, `traceId`
**And** les fallbacks `routing_failed` (volume normal attendu) NE sont PAS envoyés à Sentry (filter `beforeSend`)

**Given** des logs structurés JSON dans `RoutingService` et `AccessCalculatorService`
**When** une requête traverse la pipeline
**Then** chaque log contient : `level, timestamp, service, traceId, userId?, poiId, durationMs, engineVersion, status`
**And** le niveau par défaut des succès est NONE (pas de log de chaque calcul, volume trop élevé) — on agrège via métriques
**And** les erreurs / fallbacks sont loggés en WARN ou ERROR

**Given** la documentation du runbook
**When** je mets à jour `docs/ops/brouter-runbook.md`
**Then** il inclut : (a) interprétation des métriques BullMQ, (b) diagnostic d'un pic de queue depth, (c) bump `ACCESS_ENGINE_VERSION` + impact recalcul progressif, (d) procédure de purge cache Redis live, (e) checklist post-incident BRouter

**Given** un test smoke d'observabilité en CI
**When** je provoque artificiellement une exception dans le worker
**Then** Sentry reçoit l'event en environnement staging (vérifié manuellement à la 1ère exécution)



