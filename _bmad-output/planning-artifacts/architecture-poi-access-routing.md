---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions', 'step-05-patterns', 'step-06-structure', 'step-07-validation', 'step-08-complete']
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/product-brief-ridenrest-app-2026-03-01.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/architecture-mobile.md'
  - '_bmad-output/planning-artifacts/epics.md'
  - '_bmad-output/planning-artifacts/research/technical-hotel-booking-apis-gpx-research-2026-01-24.md'
  - '_bmad-output/planning-artifacts/research/technical-tripadvisor-api-research-2026-04-03.md'
  - '_bmad-output/project-context.md'
workflowType: 'architecture'
scope: 'feature-poi-access-routing'
lastStep: 8
status: 'complete'
completedAt: '2026-05-20'
project_name: 'ridenrest-app'
user_name: 'Guillaume'
date: '2026-05-20'
---

# Architecture Decision Document — POI Access Routing (BRouter)

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

**Scope** : Intégration d'un calcul d'un itinéraire d'accès cyclable réel (distance + D+/D-) entre la trace d'une aventure et les POI accommodations, via BRouter self-host. Soustraction de la portion qui chevauche la trace pour ne représenter que le "coût additionnel" pour le cycliste.

**Out of scope** : Refonte du calcul de distance POI existant (vol d'oiseau via `ST_Distance` — conservé en fallback), routage pour POI non-accommodations (water, food, bike-shop), nouveaux profils BRouter custom (phase 2).

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements touchés** (extraits du PRD + epics) :

| Réf | Description | Impact sur ce scope |
|---|---|---|
| FR-030, FR-031 | Corridor search POI, tri par distance trace | Distance "itinéraire d'accès" devient critère de tri alternatif |
| FR-032, FR-033 | POI Detail Sheet (distance, km, D+, ETA) | **Extension** : ajout "itinéraire d'accès réel" |
| FR-042, FR-043 | Live POI discovery, GPS non envoyé serveur | **Contrainte RGPD critique** (résolue par opt-in) |
| FR-080 | D+ Planning POI (fromKm → poi.km projeté) | **Conservé**, complété par D+ d'accès |
| FR-082 | D+ Live POI + ETA | **Étendu** : nouveau D+ d'accès |
| Epic 4.4 | POI Detail Sheet structure | Extension UI, pas refonte |
| Epic 11.4 | Stage-Scoped POI Search | ✅ Cohérent — point d'origine = stage en cours |
| Epic 16.13 | POI Popup Redesign récent | Structure à étendre |

**Non-Functional Requirements clés** :

| Réf | NFR | Contrainte sur ce scope |
|---|---|---|
| NFR-021, NFR-040 | Cache POI bbox <200ms | Cache d'accès doit suivre la même latence cible |
| NFR-022 | Job async Density via BullMQ | Pattern réutilisé pour pré-calcul d'accès |
| NFR-032 | RGPD : GPS Live non envoyé | Résolu via opt-in explicite (popin + settings) |
| Privacy by design | Minimisation données | Position arrondie 4 décimales (~11 m) |

### Scale & Complexity

- **Domaine technique** : full-stack (backend NestJS + frontend Next.js + nouvelle infra Docker BRouter)
- **Niveau de complexité** : **Medium**
  - +1 service Docker (BRouter) — déploiement maîtrisé (Docker déjà en place : Postgres, Redis, Caddy, Uptime Kuma)
  - +1 RoutingService NestJS — pattern classique HTTP wrapper
  - +1 worker BullMQ — pattern existant (Density Analysis Epic 5.1)
  - +1 endpoint API (`POST /pois/:id/access`)
  - Extension UI (POI sheet + popup + settings + carte)
- **Composants architecturaux estimés** : ~7
  1. BRouter container (Docker)
  2. RoutingService (NestJS)
  3. AccessCalculator (logique métier : appel BRouter + ST_Difference + élévation)
  4. BullMQ worker `poi-access-calculation`
  5. Schéma DB enrichi (`accommodations_cache` + `adventures.routing_profile` + `users.live_access_consent`)
  6. API endpoint `POST /pois/:id/access`
  7. UI components (POI sheet ext, popin consent, settings toggle, carte polyline itinéraire d'accès)
- **Couplages cross-cutting** : Cache, Invalidation, Versioning, RGPD, Observability

### Technical Constraints & Dependencies

**Stack imposé** (project-context.md) :
- PostgreSQL 16 + PostGIS 3.4 → `ST_Difference`, `ST_Buffer`, `ST_LineLocatePoint`, `ST_DWithin` disponibles
- NestJS 11 + Drizzle ORM (pas de raw SQL sauf cas PostGIS justifié)
- BullMQ v5 sur Redis 7 (workers async + cache)
- VPS Hostinger **KVM 2 (8 Go RAM, 2,3 Go utilisés → 5,7 Go libres)** + Docker
- PM2 pour les Node.js (NestJS + Next.js)
- Caddy 2 reverse proxy
- Naming : tables snake_case plural, colonnes snake_case, indexes `idx_{table}_{column}`

**Dépendances externes nouvelles** :
- BRouter (binaire Java + données OSM Europe ~3 Go) — build Docker depuis `abrensch/brouter` v1.7.9 (aucune image pré-construite disponible)
- Aucune nouvelle API SaaS (auto-hébergement)

**Budget RAM estimé après ajout BRouter** :
- BRouter Europe : ~3 Go (worst case)
- Marge restante : ~2,7 Go → suffisant pour pics Postgres / Redis / autres conteneurs

**Convention cache existante à respecter** :
- POI bbox : `pois:bbox:{minLat}:{minLng}:{maxLat}:{maxLng}` (arrondi 3 décimales)
- TTL adaptatif (Epic 10.2) : densité 7j / POI bbox 24h / météo 1h
- Notre cache d'accès live suivra : `access:live:{poi_id}:{lat_4dec}:{lon_4dec}` TTL 15 min

### Cross-Cutting Concerns

1. **Cache stratégie hybride**
   - Mode Planning → DB persistante (`accommodations_cache.access_*`)
   - Mode Live → Redis volatile, anonyme, TTL court

2. **Invalidation**
   - Changement de trace aventure → invalidation totale itinéraires d'accès de l'aventure
   - Changement de `routing_profile` aventure → invalidation totale itinéraires d'accès de l'aventure
   - Changement positionnel POI (rare) → invalidation accès POI
   - Versioning par `access_engine_version` permet recalcul progressif sans purge

3. **RGPD & vie privée**
   - Opt-in explicite Live (popin 1ère fois + settings revocable)
   - Position envoyée arrondie ~11 m côté client (avant transit réseau)
   - Cache Redis Live sans `user_id` (anonyme)
   - Aucune position GPS stockée durablement

4. **Résilience BRouter**
   - Fallback vol d'oiseau si BRouter down/timeout (flag `routing_failed`)
   - Healthcheck Uptime Kuma
   - Circuit breaker dans RoutingService NestJS

5. **Observabilité**
   - Métriques BullMQ (queue depth, failure rate)
   - Logs RoutingService (latences BRouter, taux d'échec)
   - Alertes via Uptime Kuma si BRouter ne répond plus

6. **Cohérence multi-mode**
   - Planning : précalcul eager < 1500 m, lazy au-delà, origine = stage en cours (fallback adventure start)
   - Live : lazy uniquement, origine = position GPS arrondie (si consentement)

---

## Starter Template Evaluation

### Primary Technology Domain

Projet existant, stack figé (cf. `project-context.md`). **Aucun starter générique à évaluer** — le scope est l'intégration de briques ciblées dans un monorepo NestJS / Next.js existant.

### Briques Externes & Dépendances Évaluées

#### 1. Image Docker BRouter

**Option retenue** : Build Docker depuis `github.com/abrensch/brouter` (Dockerfile officiel multi-stage)

| Critère | Évaluation |
|---|---|
| Source | Dépôt officiel `abrensch/brouter`, tag pinné `v1.7.9` |
| Raison du build | Aucune image Docker Hub pré-construite viable (`nrenner/brouter` = 404, communauté = obsolète) |
| Taille | ~600 Mo image (gradle build + JDK 17 slim) + ~3 Go données Europe (volume monté) |
| Configuration | `command` override dans docker-compose (server.sh hardcode JAVA_OPTS) |
| Healthcheck | TCP check bash (image slim sans wget/curl) |

**Volume de données** : segments BRouter Europe téléchargés au premier démarrage (~3 Go) depuis `https://brouter.de/brouter/segments4/`. Volume Docker persistant pour éviter re-téléchargement.

#### 2. Profils BRouter

**Option retenue** : profils standards `trekking`, `fastbike`, `safety`

| Label UI | Profil BRouter | Justification |
|---|---|---|
| Route | `fastbike` | Route asphaltée privilégiée |
| Gravel (default) | `trekking` | Mix route + chemins blancs |
| Bikepacking | `safety` | Priorité trafic réduit |

Profils custom (`gravel-rider.brf`) : **non retenus en MVP**, ajoutables sans changement d'archi en phase 2.

#### 3. Client HTTP NestJS pour BRouter

**Option retenue** : `@nestjs/axios` (conventionnel NestJS, basé Axios)

- Module `HttpModule` configurable (timeout, retries via interceptor)
- Pattern circuit breaker via `cockatiel` ou implémentation maison
- Timeout par défaut : **5 secondes** (BRouter répond habituellement en 50-200 ms)

#### 4. Bibliothèques PostGIS via Drizzle

**Approche retenue** : `sql` helper de Drizzle pour les opérations PostGIS

- `ST_Difference`, `ST_Buffer`, `ST_Length`, etc. non disponibles dans le query builder Drizzle
- Pattern existant dans le projet : raw SQL via ``sql`` `` template tag
- Permet de garder le typage Drizzle pour les colonnes simples + raw pour PostGIS

#### 5. UI Components Frontend

**Aucune nouvelle dépendance** :
- Popin RGPD → composant `Dialog` shadcn/ui existant
- Toggle settings → composant `Switch` shadcn/ui existant
- Polyline d'accès sur carte → MapLibre GL JS `addLayer` (déjà utilisé pour la trace)

### Decisions Déjà Actées par le Stack Existant

| Décision | Imposée par |
|---|---|
| TypeScript | Project context |
| Drizzle ORM | Project context |
| Conventions naming snake_case DB | Project context |
| BullMQ pour async jobs | Project context (pattern Density Analysis) |
| Redis pour cache | Project context |
| shadcn/ui + Tailwind v4 | Project context |
| MapLibre GL JS | Project context |
| Vitest (web/packages) + Jest (api) | Project context |

### Commande d'Initialisation Infrastructure

Pas de scaffold projet — ajout au `docker-compose.yml` existant :

```yaml
brouter:
  build:
    context: https://github.com/abrensch/brouter.git#v1.7.9
  image: brouter:1.7.9
  container_name: ridenrest-brouter
  restart: unless-stopped
  ports:
    - "127.0.0.1:17777:17777"  # bind localhost uniquement (accédé par NestJS PM2 natif sur l'hôte)
  volumes:
    - brouter-segments:/segments4
  command: >-
    sh -c "java -Xmx2g -Xms256m -DmaxRunningTime=300
    -cp /app/brouter.jar btools.server.RouteServer
    /segments4 /profiles2 /customprofiles 17777 1"
  healthcheck:
    test: ["CMD-SHELL", "bash -c 'exec 3<>/dev/tcp/localhost/17777; printf \"GET /brouter HTTP/1.0\\r\\nHost: localhost\\r\\n\\r\\n\" >&3; read -t 2 line <&3; exec 3<&-; [[ \"$$line\" == *HTTP* ]]' || exit 1"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 5m

volumes:
  brouter-segments:
```

**Notes** :
- Le `command` override est nécessaire car `server.sh` hardcode `JAVA_OPTS=-Xmx128M` — le setter en env Docker ne suffit pas.
- Pas de `wget`/`curl` dans `openjdk:17.0.1-jdk-slim` → healthcheck via TCP check bash.
- NestJS tourne en PM2 natif sur l'hôte (pas dans Docker) → l'URL d'appel est `http://localhost:17777`, PAS `http://brouter:17777`.
- Les segments Europe doivent être téléchargés manuellement (pas d'auto-download dans l'image Docker) — cf. Story 1.2.

**Story d'initialisation** : "Provisionner BRouter sur le VPS + valider healthcheck + benchmarker latence sur 10 POI test" doit être la **première story d'implémentation**.

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Schéma DB : extension `accommodations_cache` + `adventures` + `profiles`
- Pattern PostGIS via `customType` Drizzle (déjà en place dans `adventure-segments.ts`)
- Stratégie cache : DB persistante (planning) + Redis volatile (live)
- Versioning du calcul via `access_engine_version`

**Important Decisions (Shape Architecture):**
- Invalidation cohérente lors du changement de trace ou de profil
- Endpoint API unique `POST /pois/:id/access` avec union discriminée de l'origine
- Anonymisation cache Redis (pas de `user_id` dans la clé)

**Deferred Decisions (Post-MVP):**
- Profils BRouter custom (`gravel-rider.brf`, etc.)
- Itinéraire d'accès pour POI non-accommodations (water, food, bike-shop)
- Affichage temps réel multi-POI sur la carte (pour MVP : à la demande POI par POI)

### Data Architecture

#### Schéma DB — Modifications

##### 1. Table `adventures` (nouvelle colonne)

```typescript
// packages/database/src/schema/adventures.ts
export const routingProfileEnum = pgEnum('routing_profile', ['road', 'gravel', 'bikepacking'])

export const adventures = pgTable('adventures', {
  // ... colonnes existantes ...
  routingProfile: routingProfileEnum('routing_profile').notNull().default('gravel'),
})
```

**Justification** : profil cyclable propre à chaque aventure (vélo route ≠ gravel ≠ bikepacking).

##### 2. Table `profiles` (nouvelle colonne)

```typescript
// packages/database/src/schema/profiles.ts
export const profiles = pgTable('profiles', {
  // ... colonnes existantes ...
  liveAccessConsent: boolean('live_access_consent'),  // NULL = jamais demandé, true/false = consentement
})
```

**Justification** : pattern existant dans le projet (cf. `overpassEnabled`). NULL tri-state pour distinguer "jamais demandé" de "refusé".

##### 3. Table `accommodations_cache` (extension)

```typescript
// packages/database/src/schema/accommodations-cache.ts
// Réutiliser le customType geometry depuis adventure-segments.ts
const lineString = customType<{ data: string; driverData: string }>({
  dataType() { return 'geometry(LINESTRING, 4326)' },
})

export const accommodationsCache = pgTable('accommodations_cache', {
  // ... colonnes existantes ...

  // --- Itinéraire d'accès cyclable ---
  accessOriginStageId: text('access_origin_stage_id').references(() => adventureStages.id, { onDelete: 'set null' }),
  accessDistanceM: real('access_distance_m'),
  accessElevationGainM: real('access_elevation_gain_m'),
  accessElevationLossM: real('access_elevation_loss_m'),
  accessGeometry: lineString('access_geometry'),
  accessEngineVersion: text('access_engine_version'),  // 'brouter-1.7.3+trekking'
  accessComputedAt: timestamp('access_computed_at'),
  accessFailed: boolean('access_failed').notNull().default(false),
}, (table) => ({
  // Index existants ...
  accessStageIdx: index('idx_accommodations_cache_access_stage').on(table.accessOriginStageId),
  // Recherches POI sans accès calculé (pour worker BullMQ)
  accessPendingIdx: index('idx_accommodations_cache_access_pending')
    .on(table.segmentId)
    .where(sql`access_computed_at IS NULL AND access_failed = false`),
}))
```

**Pourquoi `access_origin_stage_id` sur la table cache ?**
Permet d'invalider proprement l'itinéraire d'accès quand un stage change (`start_km`/`end_km` modifiés), sans toucher aux autres POI.

**Pourquoi nullable ?**
L'itinéraire d'accès n'est calculé que pour les POI proches (< 1500 m vol d'oiseau). Les autres restent à `NULL` — calcul à la demande (lazy).

##### 4. Migration SQL (raw, pour les colonnes PostGIS et les types non-Drizzle)

```sql
-- 2026-05-XX_add_poi_access.sql

-- Adventures
CREATE TYPE routing_profile AS ENUM ('road', 'gravel', 'bikepacking');
ALTER TABLE adventures
  ADD COLUMN routing_profile routing_profile NOT NULL DEFAULT 'gravel';

-- Profiles
ALTER TABLE profiles
  ADD COLUMN live_access_consent BOOLEAN;  -- NULL par défaut

-- Accommodations cache
ALTER TABLE accommodations_cache
  ADD COLUMN access_origin_stage_id TEXT REFERENCES adventure_stages(id) ON DELETE SET NULL,
  ADD COLUMN access_distance_m REAL,
  ADD COLUMN access_elevation_gain_m REAL,
  ADD COLUMN access_elevation_loss_m REAL,
  ADD COLUMN access_geometry geometry(LINESTRING, 4326),
  ADD COLUMN access_engine_version TEXT,
  ADD COLUMN access_computed_at TIMESTAMP,
  ADD COLUMN access_failed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_accommodations_cache_access_stage
  ON accommodations_cache(access_origin_stage_id);

CREATE INDEX idx_accommodations_cache_access_pending
  ON accommodations_cache(segment_id)
  WHERE access_computed_at IS NULL AND access_failed = FALSE;
```

#### Stratégie de Cache

##### Mode Planning — Cache DB persistant

| Aspect | Décision |
|---|---|
| Localisation | Table `accommodations_cache` (colonnes `access_*`) |
| Durée de vie | Pas de TTL — invalidation event-driven |
| Pré-calcul | BullMQ worker `poi-access-calculation` pour POI avec `dist_from_trace_m < 1500` |
| Lazy fallback | Calcul à la demande si non en cache |
| Cible latence | < 200 ms si cache hit, < 500 ms si lazy compute |

##### Mode Live — Cache Redis volatile anonyme

| Aspect | Décision |
|---|---|
| Clé Redis | `access:live:{poi_id}:{profile}:{lat_4dec}:{lon_4dec}` |
| TTL | 15 minutes |
| Données | JSON (`distance_m`, `elevation_gain_m`, `elevation_loss_m`, `geometry`, `failed`) |
| Anonymisation | Aucun `user_id` dans la clé (privacy by design) |
| Hit ratio attendu | Faible (chaque position GPS est ~unique) — cache surtout utile pour re-clics rapides |

#### Stratégie d'Invalidation

| Événement | Action |
|---|---|
| Modification de la trace d'un segment (`adventure_segments.geom` UPDATE) | Tous les `access_*` des POI rattachés au segment → reset à NULL + recalcul BullMQ |
| Changement de `adventures.routing_profile` | Idem pour tous les POI de l'aventure |
| Modification d'un stage (`start_km`/`end_km`) | POI avec `access_origin_stage_id = stage.id` → reset accès |
| Suppression de stage | `ON DELETE SET NULL` automatique + reset accès |
| Bump de `access_engine_version` (changement de version BRouter ou patch profil) | Pas d'invalidation immédiate ; recalcul lazy au prochain accès POI |

**Justification du recalcul lazy sur bump de version** : évite un pic de charge BullMQ au déploiement. Les POI non-consultés restent à l'ancienne version, ce qui est acceptable (cohérence éventuelle).

#### Migration Approach

- **Drizzle migrations classiques** pour les colonnes simples
- **Migration SQL raw** pour `geometry(LINESTRING, 4326)` et les index partiels `WHERE`
- Pattern existant dans le projet (cf. `adventure-segments.geom`)
- Backfill : aucun (toutes les nouvelles colonnes sont nullables ou ont un default)

#### Data Validation Strategy

- **Côté serveur (NestJS)** : `class-validator` sur le DTO de l'endpoint `POST /pois/:id/access`
  - Validation `lat` ∈ [-90, 90], `lng` ∈ [-180, 180]
  - Validation `profile` ∈ enum
  - Validation `originType` ∈ ['gps', 'stage', 'adventure-start']
- **Côté shared (Zod)** : schéma partagé entre web et api dans `packages/shared/`
- **Côté DB** : contraintes `CHECK` SQL pour `access_distance_m >= 0` (defense in depth)

### Authentication & Security

#### Authentification

**Pas de nouvelle décision** — On réutilise l'auth existante : Better Auth + JWKS (cf. `architecture.md`). L'endpoint `POST /pois/:id/access` est protégé par le guard JWT existant (`AuthGuard`).

**Justification** : seuls les utilisateurs authentifiés peuvent calculer un itinéraire d'accès (limitation abus + alignement avec les autres endpoints POI).

#### Autorisation

| Endpoint | Contrôle d'accès |
|---|---|
| `POST /pois/:id/access` | JWT requis + le POI doit appartenir à un segment d'une aventure dont `user_id = req.user.id` |
| `GET /me/settings` | JWT requis (consultation `live_access_consent`) |
| `PATCH /me/settings` | JWT requis (modification `live_access_consent`) |

**Pattern** : guard existant `OwnerOnly` (à confirmer dans l'archi globale) ou check inline `WHERE adventures.user_id = req.user.id`.

#### RGPD — Position GPS en mode Live

##### Principes appliqués

| Principe RGPD | Implémentation |
|---|---|
| **Base légale** | Consentement explicite (Art. 6.1.a) |
| **Consentement éclairé** | Popin avec explication claire avant 1er envoi |
| **Granularité du consentement** | Spécifique au cas d'usage "calcul d'itinéraire d'accès Live" |
| **Révocation à tout moment** | Toggle dans Paramètres > Confidentialité |
| **Minimisation des données** | Position arrondie à 4 décimales (~11 m) avant envoi |
| **Limitation du stockage** | Aucune position GPS stockée ; cache Redis anonyme TTL 15 min |
| **Pseudonymisation** | Clé cache Redis sans `user_id` |
| **Transparence** | Mention dans la popin + Page Privacy Policy |

##### Flow utilisateur

```
1. Utilisateur en mode Live clique sur un POI
2. Backend récupère profile.live_access_consent
   ├─ NULL → Frontend affiche popin → user choisit (TRUE / FALSE)
   │           ├─ TRUE → calcul itinéraire d'accès précis depuis position
   │           └─ FALSE → fallback vol d'oiseau, jamais redemandé
   ├─ TRUE → calcul itinéraire d'accès précis (silent)
   └─ FALSE → fallback vol d'oiseau (silent)
3. À tout moment, l'utilisateur peut basculer dans Settings
```

##### Wording de la popin (validé en step UX dédié plus tard)

> **🛰️ Calcul d'itinéraire d'accès précis**
>
> Pour calculer la distance cyclable réelle vers ce point depuis votre position actuelle, votre position (arrondie à ~10 m) sera envoyée à notre serveur de routage. Aucune donnée GPS n'est conservée.
>
> _Modifiable à tout moment dans Paramètres > Confidentialité_
>
> [Refuser] [Autoriser]

##### Arrondi côté client

```typescript
// apps/web/src/lib/privacy.ts
export function roundCoordinate(coord: number): number {
  return Math.round(coord * 10_000) / 10_000  // 4 décimales = ~11 m
}
```

L'arrondi se fait **avant** l'envoi réseau. Le serveur ne reçoit jamais la position exacte.

#### Sécurité de l'endpoint API

##### Rate Limiting

| Endpoint | Limite |
|---|---|
| `POST /pois/:id/access` | 60 req/min par user (planning), 120 req/min par user (live) |

**Justification** : un user en mode Live peut consulter 30+ POI rapidement ; en planning, le pré-calcul BullMQ couvre la majorité. Limite haute pour éviter l'abus tout en restant fluide.

**Implémentation** : `@nestjs/throttler` (vérifier si déjà installé, sinon ajout au stack).

##### Validation d'entrée

- `class-validator` strict sur le DTO (rejet 400 si types/bornes invalides)
- Sanitization Zod côté frontend avant envoi (défense in depth)

##### Protection contre les abus BRouter

- Circuit breaker dans `RoutingService` : ouverture après 5 échecs consécutifs, demi-ouvert après 30 s
- Concurrency limit BullMQ : **max 5 jobs simultanés** par worker (préserve BRouter sur le KVM 2)
- Timeout BRouter : 5 s par appel

#### Sécurité du conteneur BRouter

| Aspect | Décision |
|---|---|
| Network exposure | **Bind sur `127.0.0.1:17777`** uniquement (jamais exposé internet) |
| Reverse proxy Caddy | **Pas de route exposée vers BRouter** |
| Read-only filesystem | Container en read-only sauf volume segments |
| User non-root | Image officielle tourne déjà en non-root |
| Healthcheck | HTTP GET interne `/brouter/profile/trekking` |
| Mise à jour image | Manuelle, après test profil-par-profil |

#### Audit & Compliance

- Aucune nouvelle donnée personnelle stockée durablement (positions GPS = transitoires)
- Pas d'impact sur le DPA existant
- À documenter dans la Privacy Policy : nouvel usage "BRouter routing engine self-hosted, no third party"
- Mention dans le registre des traitements (Art. 30 RGPD) : "Calcul d'itinéraire d'accès cyclable — base légale : consentement"

#### Cross-Component Security Dependencies

| Composant | Dépendance sécurité |
|---|---|
| Frontend popin | Doit récupérer l'état `live_access_consent` avant 1er calcul |
| BullMQ worker | N'invoque jamais le calcul Live (pas de position GPS dans la queue) |
| Cache Redis Live | Clé sans PII ; purge manuelle possible sans impact RGPD |
| Cache DB Planning | Pas de PII ; le `access_origin_stage_id` n'est pas une donnée perso |

### API & Communication Patterns

#### Design Style

**REST** (cohérent avec les endpoints existants `apps/api/src/pois/*`). Pas de GraphQL — pas justifié pour ce scope ciblé.

#### Endpoint Principal : Calcul de Itinéraire d'accès

##### `POST /pois/:id/access`

**Pourquoi POST et pas GET ?**
- Origine variable (corps complexe avec union discriminée)
- Cache contrôlé serveur (DB pour planning, Redis pour live) — pas de cache HTTP
- Sémantique "déclencher un calcul" plus que "récupérer ressource"

##### DTO Request (corps)

```typescript
// packages/shared/src/schemas/poi-access.ts (Zod, partagé web ↔ api)
import { z } from 'zod'

export const AccessOriginGpsSchema = z.object({
  type: z.literal('gps'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  // Position DÉJÀ arrondie côté client (4 décimales)
})

export const AccessOriginStageSchema = z.object({
  type: z.literal('stage'),
  stageId: z.string().uuid(),
})

export const AccessOriginAdventureStartSchema = z.object({
  type: z.literal('adventure-start'),
  // Pas de payload — origine = trace km 0
})

export const AccessRequestSchema = z.object({
  origin: z.discriminatedUnion('type', [
    AccessOriginGpsSchema,
    AccessOriginStageSchema,
    AccessOriginAdventureStartSchema,
  ]),
  // Profil optionnel : par défaut on prend adventures.routing_profile
  profileOverride: z.enum(['road', 'gravel', 'bikepacking']).optional(),
})

export type AccessRequest = z.infer<typeof AccessRequestSchema>
```

##### DTO Response (corps)

```typescript
export const AccessResponseSchema = z.object({
  status: z.enum(['ok', 'fallback', 'error']),

  // Présents si status = 'ok'
  distanceM: z.number().nonnegative().optional(),
  elevationGainM: z.number().nonnegative().optional(),
  elevationLossM: z.number().nonnegative().optional(),
  geometry: z.object({  // GeoJSON LineString
    type: z.literal('LineString'),
    coordinates: z.array(z.tuple([z.number(), z.number()])),
  }).optional(),

  // Présents si status = 'fallback'
  fallbackDistanceM: z.number().nonnegative().optional(),  // vol d'oiseau
  fallbackReason: z.enum(['routing_failed', 'no_consent', 'unreachable']).optional(),

  // Toujours présents (métadonnées)
  source: z.enum(['db-cache', 'redis-cache', 'computed-fresh']),
  engineVersion: z.string().optional(),  // ex: 'brouter-1.7.3+trekking'
  computedAt: z.string().datetime().optional(),
})
```

##### Codes HTTP

| Code | Cas |
|---|---|
| `200` | Itinéraire d'accès calculé OU fallback retourné (le corps précise via `status`) |
| `400` | DTO invalide |
| `401` | Pas authentifié |
| `403` | Le POI n'appartient pas à une aventure du user |
| `404` | POI inexistant |
| `429` | Rate limit dépassé |
| `503` | BRouter unreachable ET fallback impossible (rare — ex: pas de `dist_from_trace_m`) |

**Pourquoi `200 + status:fallback` plutôt que `503` ?**
Le frontend doit pouvoir afficher le fallback proprement (UX dégradée mais fonctionnelle). Le `503` est réservé aux cas où on ne peut **rien** afficher.

#### Endpoints de Settings

##### `GET /me/settings`

```json
{
  "liveAccessConsent": true | false | null,
  // autres settings existants
}
```

##### `PATCH /me/settings`

```json
{
  "liveAccessConsent": true | false
}
```

Si l'utilisateur passe de `true` à `false`, on émet aussi un event BullMQ `cache-purge:live-access:{user_id}` pour purger les entrées Redis Live pertinentes (best-effort puisque la clé est anonyme — en pratique on laisse expirer le TTL 15 min).

#### Communication NestJS ↔ BRouter

##### Module `RoutingModule`

```
apps/api/src/routing/
├── routing.module.ts
├── routing.service.ts          # Wrapper BRouter (HTTP + circuit breaker + cache)
├── routing.types.ts            # Types BRouter response
└── routing.service.spec.ts
```

##### Appel BRouter

```typescript
// routing.service.ts (extrait)
async computeRoute(params: {
  from: [number, number]  // [lon, lat]
  to: [number, number]
  profile: 'fastbike' | 'trekking' | 'safety'
}): Promise<BrouterRoute> {
  const url = `${this.configService.get('BROUTER_BASE_URL')}/brouter`
  const response = await firstValueFrom(
    this.httpService.get(url, {
      params: {
        lonlats: `${params.from[0]},${params.from[1]}|${params.to[0]},${params.to[1]}`,
        profile: params.profile,
        alternativeidx: 0,
        format: 'geojson',
      },
      timeout: 5000,
    })
  )
  return response.data
}
```

##### Format BRouter (GeoJSON)

BRouter retourne un GeoJSON `LineString` avec `messages` (élévation par point) :

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": { "type": "LineString", "coordinates": [[lon, lat, ele], ...] },
    "properties": {
      "track-length": "4523",
      "filtered ascend": "127",
      "plain-ascend": "120",
      "messages": [...]
    }
  }]
}
```

##### AccessCalculator (logique métier)

```
apps/api/src/pois/access-calculator/
├── access-calculator.service.ts
├── access-calculator.service.spec.ts
└── strategies/
    ├── compute-divergent-segment.ts   # ST_Difference + ST_Length + élévation
    └── resolve-origin.ts              # gps | stage | adventure-start → [lon, lat]
```

Flow interne :
```
1. resolve-origin → [lon_origin, lat_origin]
2. resolveProfile(adventureId) → 'trekking' | 'fastbike' | 'safety'
3. routingService.computeRoute({ from, to: [poi.lng, poi.lat], profile })
4. PostGIS ST_Difference(route, ST_Buffer(trace, 10m)) → portion divergente
5. ST_Length + filter élévation sur portion divergente → métriques d'accès
6. Sauvegarder en cache (DB ou Redis selon mode)
```

#### Communication NestJS ↔ BullMQ

##### Queue `poi-access-calculation`

| Param | Valeur |
|---|---|
| Concurrency | 5 workers max simultanés |
| Retry | 3 tentatives, backoff exponentiel (1s, 5s, 25s) |
| Dead letter | Queue séparée `poi-access-failures` (log + ne bloque pas) |
| Idempotence | Job key = `${poi_id}:${engine_version}:${stage_id}` |

##### Job Trigger

```
Trigger eager :
- Sur création/upload d'aventure (après corridor search + dist_from_trace_m calculé)
- Sur modification trace (UPDATE adventure_segments.geom)
- Sur changement adventures.routing_profile
- Sur création/modification stages

Filter :
- WHERE dist_from_trace_m < 1500
- AND access_computed_at IS NULL
- AND access_failed = false
```

##### Job Payload

```typescript
type AccessJobPayload = {
  poiId: string
  adventureId: string
  stageId: string | null  // null = adventure start fallback
  profile: 'fastbike' | 'trekking' | 'safety'
  engineVersion: string
}
```

##### Job Result Handling

- Succès → UPDATE accommodations_cache avec colonnes d'accès
- Échec après 3 retries → `access_failed = true`, `access_computed_at = NOW()` (évite recalcul perpétuel)

#### Error Handling Standards

##### Conventions

| Type d'erreur | Format retour | Logging |
|---|---|---|
| Validation DTO (400) | `{ statusCode, message, errors: [...] }` | INFO |
| Autorisation (403) | `{ statusCode, message: 'Forbidden' }` | WARN |
| Not found (404) | `{ statusCode, message: 'POI not found' }` | INFO |
| Rate limit (429) | `{ statusCode, message, retryAfter }` | WARN |
| BRouter timeout/error | **200 + status: 'fallback' + fallbackReason: 'routing_failed'** | ERROR |
| PostGIS / DB error (500) | `{ statusCode, message: 'Internal error', traceId }` | ERROR + Sentry |

##### Logging

- Format JSON structuré (compatible Loki/Grafana si ajouté plus tard)
- Champs : `level, timestamp, service, traceId, userId, poiId, durationMs, engineVersion, status`
- Hors errors : pas de logs de chaque calcul d'accès (volume trop élevé) — agréger via métriques

#### Communication Frontend ↔ API

##### Pattern client TanStack Query

```typescript
// apps/web/src/lib/queries/poi-access.ts
export function usePoiAccess(poiId: string, origin: AccessRequest['origin']) {
  return useQuery({
    queryKey: ['poi-access', poiId, origin],
    queryFn: async () => {
      const res = await api.post(`/pois/${poiId}/access`, { origin })
      return AccessResponseSchema.parse(res.data)
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  })
}
```

##### Stratégie d'invocation

- **Mode Planning** : trigger automatique au mount de `<PoiDetailSheet>` ou hover prolongé sur le pin (debounce 300 ms)
- **Mode Live** : trigger uniquement après consentement explicite (popin) → query manuelle via `mutate()`

#### API Documentation

- OpenAPI/Swagger générée via `@nestjs/swagger` (pattern existant à confirmer)
- Endpoint exposé en dev uniquement sur `/api/docs`
- Schemas Zod → conversion vers OpenAPI via `zod-to-openapi` ou docs manuelles

### Frontend Architecture

#### Composants Impactés (Existants — à étendre)

| Composant existant | Fichier | Modification |
|---|---|---|
| POI Popup | `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` | Ajout bloc "Itinéraire d'accès cyclable" sous bloc "Distance trace" |
| POI Detail Sheet | `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` | Idem + section dédiée avec polyline preview |
| Map Layer | `apps/web/src/app/(app)/map/[id]/_components/map.tsx` (à confirmer) | Nouveau layer MapLibre `access-line` |
| Settings page | `apps/web/src/app/(app)/settings/page.tsx` (à confirmer ou créer) | Section "Confidentialité" + toggle |

#### Nouveaux Composants

```
apps/web/src/components/poi-access/
├── AccessMetrics.tsx           # Affichage distance + D+/D- + badge "vol d'oiseau" si fallback
├── AccessConsentDialog.tsx     # Popin RGPD shadcn/ui Dialog
├── AccessMapLayer.tsx          # MapLibre layer dédié pour polyline
└── useAccess.ts                # Hook TanStack Query (lazy) avec gestion consent
```

#### State Management

##### Zustand — Slice `useLiveModeStore` (existant) à étendre

```typescript
// apps/web/src/stores/live-mode-store.ts
type LiveModeState = {
  // ... état existant ...

  // --- Itinéraire d'accès cyclable Live ---
  accessConsentChecked: boolean  // a-t-on déjà demandé en cette session
  selectedPoiForAccess: string | null  // POI en cours de calcul d'accès
}
```

##### Zustand — Slice `usePlanningModeStore` (existant) à étendre

```typescript
type PlanningModeState = {
  // ... état existant ...

  // --- Itinéraire d'accès cyclable Planning ---
  currentStageId: string | null  // origine pour le calcul d'accès
  visibleAccessPoiId: string | null  // POI dont l'itinéraire d'accès est affiché sur la carte
}
```

##### TanStack Query

Cache client géré par TanStack Query :
- Key : `['poi-access', poiId, origin]`
- `staleTime: 5 min`, `gcTime: 15 min`
- Invalidation manuelle si trace change ou profil change (via `queryClient.invalidateQueries`)

#### Wording UI contextualisé par sous-catégorie POI

Le naming **code** est générique (`access`) ; le **wording UI** est contextualisé selon la sous-catégorie d'accommodation. Helper centralisé :

```typescript
// apps/web/src/lib/poi-labels.ts
import type { PoiSubcategory } from '@ridenrest/shared'

const ACCESS_LABELS: Record<PoiSubcategory, string> = {
  hotel:      "Itinéraire vers l'hôtel",
  camping:    "Itinéraire vers le camping",
  refuge:     "Itinéraire vers le refuge",
  hostel:     "Itinéraire vers l'auberge",
  guesthouse: "Itinéraire vers la chambre d'hôte",
  gite:       "Itinéraire vers le gîte",
}

export function getAccessLabel(subcategory: PoiSubcategory | null | undefined): string {
  return (subcategory && ACCESS_LABELS[subcategory]) ?? "Itinéraire d'accès"
}
```

Utilisation :
```tsx
<CardTitle>{getAccessLabel(poi.subcategory)}</CardTitle>
// → "Itinéraire vers l'hôtel" si poi.subcategory === 'hotel'
// → "Itinéraire d'accès" en fallback générique
```

**Règle d'or** : aucun composant ne hardcode "hôtel", "camping", etc. dans son JSX — toujours passer par `getAccessLabel`. Permet l'extension future à d'autres sous-catégories (water, food en phase 2) sans refactor.

#### Component Architecture

##### AccessMetrics.tsx (extrait)

```tsx
type Props = {
  poiId: string
  origin: AccessRequest['origin']
  fallbackDistanceM?: number  // dist_from_trace_m existant
}

export function AccessMetrics({ poiId, origin, fallbackDistanceM }: Props) {
  const { data, isLoading } = useAccess(poiId, origin)

  if (isLoading) return <Skeleton />
  if (data?.status === 'ok') return <OkBlock metrics={data} />
  if (data?.status === 'fallback') return <FallbackBlock fallback={data} flightDistanceM={fallbackDistanceM} />
  return null
}
```

##### AccessConsentDialog.tsx (extrait)

```tsx
export function AccessConsentDialog({ open, onChoose }: { open: boolean, onChoose: (consent: boolean) => void }) {
  return (
    <Dialog open={open}>
      <DialogContent>
        <DialogTitle>🛰️ Calcul d'itinéraire d'accès précis</DialogTitle>
        <DialogDescription>
          Pour calculer la distance cyclable réelle vers ce point depuis votre position,
          votre position (arrondie à ~10 m) sera envoyée à notre serveur. Aucune donnée
          GPS n'est conservée.
          <br /><br />
          <em>Modifiable à tout moment dans Paramètres &gt; Confidentialité</em>
        </DialogDescription>
        <DialogFooter>
          <Button variant="outline" onClick={() => onChoose(false)}>Refuser</Button>
          <Button onClick={() => onChoose(true)}>Autoriser</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

#### Carte — Affichage de l'itinéraire d'accès (MapLibre)

##### Layer dédié

```typescript
// apps/web/src/components/poi-access/AccessMapLayer.tsx
const ACCESS_LAYER_ID = 'poi-access-line'
const ACCESS_SOURCE_ID = 'poi-access-source'

// Couleur dédiée distincte de la trace :
// - Trace principale : indigo-600 (#4f46e5) — existant
// - Itinéraire d'accès cyclable  : amber-500  (#f59e0b) — nouveau
```

##### Style du layer

```typescript
{
  id: ACCESS_LAYER_ID,
  type: 'line',
  source: ACCESS_SOURCE_ID,
  paint: {
    'line-color': '#f59e0b',
    'line-width': 4,
    'line-dasharray': [2, 2],
    'line-opacity': 0.9,
  },
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
}
```

##### Comportement

- Une seule polyline d'accès visible à la fois (clic POI → affiche, clic ailleurs → cache)
- Auto-zoom sur le bbox `[access + trace_relevant_portion]` au premier affichage
- Le layer est ajouté **au-dessus** du layer `route-line` (z-order)

#### Page Settings — Section Confidentialité

```tsx
// apps/web/src/app/(app)/settings/_components/privacy-section.tsx
export function PrivacySection() {
  const { data: settings } = useMeSettings()
  const { mutate } = useUpdateMeSettings()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confidentialité</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Calcul d'itinéraire d'accès précis en mode Live</Label>
            <p className="text-sm text-muted-foreground">
              Envoie votre position GPS arrondie (~10 m) à notre serveur pour calculer
              les itinéraires d'accès cyclables réels. Aucune donnée n'est conservée.
            </p>
          </div>
          <Switch
            checked={settings?.liveAccessConsent === true}
            onCheckedChange={(checked) => mutate({ liveAccessConsent: checked })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
```

#### Performance Optimization

| Optimisation | Stratégie |
|---|---|
| Itinéraire d'accès pas affiché par défaut | Trigger uniquement au mount du POI sheet (pas en sidebar) |
| Debounce sur survol pin | 300 ms avant de prefetch |
| Lazy load `AccessMapLayer` | Dynamic import, code-split de MapLibre additions |
| Cache TanStack | 5 min stale, 15 min gc |
| Geometry size | LineString simplifié côté serveur (`ST_SimplifyPreserveTopology`) avant envoi (tolérance 5 m) |

#### Bundle Optimization

- `AccessConsentDialog` lazy via `dynamic(() => import(...))`
- `AccessMapLayer` également lazy (charge MapLibre `addLayer` à la demande)
- Estimation impact : +~8 KB gzip dans le chunk POI (négligeable)

#### Routing Strategy

Aucun changement aux routes existantes. L'itinéraire d'accès est une **feature transverse** affichée :
- Dans `/map/[id]` (mode planning) — POI sheet + popup + carte
- Dans `/live/[id]` (mode live) — POI sheet + carte (avec consentement)
- Dans `/settings` — section privacy

### Infrastructure & Deployment

#### Hosting

**VPS Hostinger KVM 2 unique** — pas de scale-out pour ce scope :
- 8 Go RAM (2,3 Go utilisés actuellement → 5,7 Go libres)
- Docker compose pour tous les services additionnels
- PM2 pour les processus Node.js (NestJS + Next.js)
- Caddy 2 comme reverse proxy (auto Let's Encrypt)

**Justification du single-node** : trafic actuel insuffisant pour scale-out. BRouter Europe tient en 2 Go RAM (cap JVM `-Xmx2g`).

#### Docker — Ajout du service BRouter

##### `docker-compose.yml` (extrait à intégrer)

```yaml
services:
  brouter:
    build:
      context: https://github.com/abrensch/brouter.git#v1.7.9
    image: brouter:1.7.9
    container_name: ridenrest-brouter
    restart: unless-stopped
    ports:
      - "127.0.0.1:17777:17777"  # bind localhost uniquement
    volumes:
      - brouter-segments:/segments4
    command: >-
      sh -c "java -Xmx2g -Xms256m -DmaxRunningTime=300
      -cp /app/brouter.jar btools.server.RouteServer
      /segments4 /profiles2 /customprofiles 17777 1"
    healthcheck:
      test: ["CMD-SHELL", "bash -c 'exec 3<>/dev/tcp/localhost/17777; printf \"GET /brouter HTTP/1.0\\r\\nHost: localhost\\r\\n\\r\\n\" >&3; read -t 2 line <&3; exec 3<&-; [[ \"$$line\" == *HTTP* ]]' || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 5m

volumes:
  brouter-segments:
```

**Note** : Pas de `depends_on` entre `api` et `brouter` — NestJS tourne en PM2 natif hors Docker (cf. project-context.md §VPS Deployment Config), pas comme service Docker.

##### Téléchargement initial des segments

Premier démarrage : ~10 min de download (~3 Go depuis `brouter.de`). Documenté dans le runbook ops :
- Lancer `docker-compose up brouter` en avance lors du déploiement
- Vérifier `docker logs ridenrest-brouter` pour confirmer le téléchargement
- Healthcheck `start_period: 5m` laisse le temps au démarrage

##### Mise à jour des segments

- Les données OSM Europe sont mises à jour par BRouter ~1×/semaine côté upstream
- **Stratégie de refresh** : task cron mensuelle (`docker exec brouter wget -N -P /segments4 ...`)
- Pas critique pour MVP — un dataset 3-6 mois d'âge reste pertinent pour le routing cyclable

#### Réseau Docker

- BRouter bind sur `127.0.0.1:17777` uniquement (jamais exposé internet)
- NestJS (PM2 natif sur l'hôte) accède à BRouter via `http://localhost:17777` (pas via hostname Docker)
- Aucune exposition publique (pas de route Caddy vers BRouter)

#### CI/CD Pipeline

##### GitHub Actions — Modifications

```yaml
# .github/workflows/deploy.yml (extension)
jobs:
  deploy:
    # ... steps existants ...

    - name: Build BRouter image (if not cached)
      run: docker compose build brouter

    - name: Restart services (rolling)
      run: |
        docker compose up -d brouter
        timeout 300 sh -c 'until docker inspect --format="{{.State.Health.Status}}" ridenrest-brouter | grep -q healthy; do sleep 5; done'
        pm2 reload api
```

##### Migrations DB

- Pattern existant : `drizzle-kit push` ou migration file
- Pour les colonnes PostGIS (`geometry`) : migration SQL raw appliquée via `psql` dans le CI
- Tests d'intégration en CI : DB Postgres+PostGIS via docker-compose CI

#### Environment Configuration

##### Nouvelles variables d'env (à ajouter au `.env.example`)

```bash
# BRouter
BROUTER_BASE_URL=http://localhost:17777       # NestJS PM2 natif → localhost (dev et prod)
BROUTER_TIMEOUT_MS=5000
BROUTER_DEFAULT_PROFILE=trekking

# Access calculation
ACCESS_EAGER_THRESHOLD_M=1500                # POI < 1500 m → pré-calcul BullMQ
ACCESS_TRACE_BUFFER_M=10                     # buffer ST_Buffer pour soustraction
ACCESS_CACHE_TTL_LIVE_SECONDS=900            # 15 min Redis TTL
ACCESS_ENGINE_VERSION=brouter-1.7.3+trekking # bumpée à chaque changement

# Rate limiting (si pas déjà global)
ACCESS_RATE_LIMIT_PLANNING=60
ACCESS_RATE_LIMIT_LIVE=120
```

##### Validation au démarrage

Pattern existant : `@nestjs/config` + Joi/Zod schema pour valider le `process.env` au boot. Crash early si une variable manque.

#### Monitoring & Logging

##### Uptime Kuma (existant)

| Monitor | Type | Alerte |
|---|---|---|
| BRouter healthcheck | HTTP Keyword (`/brouter/profile/trekking`) | Email + Telegram |
| API `/health` | HTTP existant | (existant) |

##### Métriques BullMQ

Endpoint existant `/admin/queues` (Bull Board ou équivalent) — ajout de la queue `poi-access-calculation` au dashboard :
- Queue depth (alerte si > 200)
- Failed jobs rate (alerte si > 5%)
- Avg processing time (visibilité performance)

##### Métriques applicatives

- Compteur Prometheus-compatible (si ajouté plus tard) :
  - `access_compute_total{status,source}` — counter par statut/source
  - `access_compute_duration_seconds` — histogram
  - `access_brouter_failures_total` — counter
- Hors MVP : logs ERROR/WARN suffisent au démarrage

##### Sentry (si configuré)

- Capture exceptions `RoutingService` et `AccessCalculator`
- Tags : `engine_version`, `profile`, `origin_type`
- Filter : ne pas envoyer les fallbacks "routing_failed" (volume normal attendu)

#### Scaling Strategy

##### Phase MVP (single-node KVM 2)

- BRouter : 1 instance, JVM 2 Go heap
- BullMQ workers : 1 process (concurrency 5)
- Suffisant pour < 100 aventures actives, < 50 calculs d'accès/min

##### Phase 2 (si besoin — non chiffré)

- BullMQ workers horizontaux (process dédié sur autre VPS)
- BRouter : pas de scale horizontal nécessaire avant > 1000 calculs d'accès/min
- Cache CDN sur les `access_geometry` ? Pas pertinent (par-user, par-aventure)

#### Backup & Disaster Recovery

- Volume Docker `brouter-segments` : **non sauvegardé** (re-téléchargeable depuis brouter.de)
- Colonnes `access_*` dans `accommodations_cache` : **incluses dans le backup Postgres existant**
- Recalcul possible à tout moment via bump `ACCESS_ENGINE_VERSION`
- RPO/RTO : aligné sur le SLA Postgres existant

#### Runbook Ops (créé en parallèle de la première story)

À créer dans `docs/ops/brouter-runbook.md` :
- Provisionnement initial du conteneur (téléchargement segments)
- Diagnostic d'une panne BRouter (logs, healthcheck, fallback du circuit breaker)
- Procédure de mise à jour des segments OSM
- Procédure de bump `ACCESS_ENGINE_VERSION` et recalcul progressif
- Diagnostic d'une explosion de queue BullMQ (purge, throttle)

### Decision Impact Analysis

#### Implementation Sequence (Stories)

Ordre recommandé pour limiter les risques :

1. **Story Ops 0 — Provisionner BRouter** (infra)
   - Ajouter service Docker, télécharger segments, valider healthcheck, benchmark latence (cible < 500 ms p95)
2. **Story Data 1 — Migration DB** (backend)
   - Colonnes Drizzle + migration SQL, `routing_profile` adventures, `live_access_consent` profiles
3. **Story Backend 2 — RoutingService + AccessCalculator** (backend)
   - Module NestJS, wrapper BRouter, circuit breaker, ST_Difference + élévation, tests unitaires
4. **Story Backend 3 — Endpoint `POST /pois/:id/access`** (backend)
   - DTO + guards + rate limiting, lecture cache DB + Redis, tests E2E
5. **Story Backend 4 — Worker BullMQ pré-calcul** (backend)
   - Queue + worker concurrency 5, triggers sur create/update
6. **Story Frontend 5 — AccessMetrics + intégration POI Sheet/Popup** (frontend planning)
7. **Story Frontend 6 — AccessMapLayer** (frontend)
   - Polyline MapLibre amber pointillés
8. **Story Frontend 7 — AccessConsentDialog + Settings privacy** (frontend Live)
9. **Story Cross 8 — Invalidation handlers** (backend + frontend)
10. **Story Polish 9 — Observabilité & monitoring** (ops)

#### Cross-Component Dependencies

| Décision | Composants impactés |
|---|---|
| `routing_profile` par aventure | Schéma DB + UI création/édition aventure + résolution profil backend |
| `live_access_consent` | Schéma DB + Settings UI + popin Live + RoutingService gate |
| `ACCESS_ENGINE_VERSION` bump | Trigger recalcul lazy + métadonnée cache DB + frontend force-refresh |
| ST_Difference côté DB | AccessCalculator + PostGIS migration + tests d'intégration |
| `access_origin_stage_id` | Schéma DB + invalidation handlers + tests cascades |

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**13 points de divergence potentiels identifiés**, regroupés en 5 catégories. Les conventions globales du projet (naming snake_case DB, ESLint, Vitest/Jest) sont régies par `project-context.md` et restent en vigueur — la liste ci-dessous ne couvre QUE les ambiguïtés propres à ce scope.

### Naming Patterns (spécifiques scope access)

#### Database

| Élément | Convention | Exemple |
|---|---|---|
| Colonnes accès | Préfixe `access_` + suffixe d'unité | `access_distance_m`, `access_elevation_gain_m` |
| Unité distance | **mètres** uniquement (jamais km) en stockage | `access_distance_m` |
| Unité élévation | **mètres** uniquement | `access_elevation_gain_m` |
| Booléens d'état | Verbe au passif | `access_failed`, **PAS** `is_access_failed` |
| Timestamps | Suffixe `_at` | `access_computed_at` |
| Index partiels | `idx_{table}_{purpose}` | `idx_accommodations_cache_access_pending` |
| Enum `routing_profile` | Singulier minuscule | `'road' \| 'gravel' \| 'bikepacking'` |
| Préférence user | `live_access_consent` (NULL tri-state) | `profiles.live_access_consent` |

#### API REST

| Élément | Convention | Exemple |
|---|---|---|
| Endpoint accès | Ressource-centric `/pois/:id/access` | **PAS** `/access/poi/:id` ni `/routing/access` |
| Endpoint settings | `/me/settings` (singulier "me") | **PAS** `/users/:id/settings` |
| Path param | `:id` (style Express/NestJS) | `:id`, **PAS** `{id}` |
| JSON fields | `camelCase` (alignement TypeScript) | `distanceM`, `elevationGainM` |
| Status field | String enum, jamais bool | `status: 'ok' \| 'fallback' \| 'error'` |

#### Code TypeScript

| Élément | Convention | Exemple |
|---|---|---|
| Module NestJS | `routing` (générique infra) **et** `pois/access-calculator` (métier) | Séparation infra vs métier |
| Service wrapper BRouter | `RoutingService` (générique) | **PAS** `BrouterService` (évite couplage nominal) |
| Service métier accès | `AccessCalculatorService` | **PAS** `PoiAccessService` |
| Composants React | `PascalCase`, préfixe `Access` pour ce scope | `AccessMetrics`, `AccessMapLayer`, `AccessConsentDialog` |
| Hooks | Préfixe `use` + nom métier | `useAccess(poiId, origin)` |
| Variables coordonnées | `[lon, lat]` (ordre **GeoJSON**) | **CRITIQUE** : ne jamais inverser |
| Helper `roundCoordinate` | dans `apps/web/src/lib/privacy.ts` | Réutilisable, testable |
| Helper `getAccessLabel` | dans `apps/web/src/lib/poi-labels.ts` | **Source unique** du wording UI contextualisé |

#### Queues BullMQ

| Élément | Convention | Exemple |
|---|---|---|
| Queue name | `kebab-case`, suffixe `-calculation` | `poi-access-calculation` |
| Job key (idempotence) | `${poi_id}:${engine_version}:${stage_id}` | Pattern strict |
| Dead letter queue | Suffixe `-failures` | `poi-access-failures` |

#### Cache Redis

| Élément | Convention | Exemple |
|---|---|---|
| Clé Redis | `{feature}:{mode}:{...identifiants}` séparés par `:` | `access:live:{poi_id}:{profile}:{lat}:{lon}` |
| Pas de PII dans la clé | Aucun `user_id`, `email`, etc. | Vérifié en code review |
| TTL via const | `ACCESS_CACHE_TTL_LIVE_SECONDS` env var | Pas de magic number |

### Structure Patterns

#### Project Organization

```
apps/api/src/
├── routing/                          # NEW — wrapper BRouter (infra)
│   ├── routing.module.ts
│   ├── routing.service.ts
│   ├── routing.types.ts
│   └── routing.service.spec.ts
├── pois/                              # existant
│   ├── pois.module.ts
│   ├── pois.controller.ts            # extension : endpoint access
│   ├── pois.service.ts
│   ├── pois.repository.ts
│   ├── access-calculator/            # NEW — métier accès
│   │   ├── access-calculator.module.ts
│   │   ├── access-calculator.service.ts
│   │   ├── access-calculator.service.spec.ts
│   │   └── strategies/
│   │       ├── compute-divergent-segment.ts
│   │       ├── resolve-origin.ts
│   │       └── *.spec.ts
│   └── access-worker/                # NEW — BullMQ processor
│       ├── access-worker.module.ts
│       ├── access-worker.processor.ts
│       └── access-worker.processor.spec.ts

apps/web/src/
├── components/poi-access/            # NEW — UI scope dédié
│   ├── AccessMetrics.tsx
│   ├── AccessConsentDialog.tsx
│   ├── AccessMapLayer.tsx
│   ├── useAccess.ts
│   └── *.test.tsx
├── lib/
│   ├── privacy.ts                    # NEW — roundCoordinate helper
│   ├── poi-labels.ts                 # NEW — getAccessLabel helper
│   └── queries/poi-access.ts         # NEW — TanStack Query hooks

packages/shared/src/
├── schemas/
│   └── poi-access.ts                 # NEW — Zod DTO partagé web↔api
```

**Règle clé** : un agent qui travaille sur le scope accès doit créer/modifier UNIQUEMENT dans ces emplacements. Pas de fichiers `access*` ailleurs.

#### Tests

| Type | Convention | Localisation |
|---|---|---|
| Unit (services NestJS) | `*.service.spec.ts` co-localisé | Pattern existant |
| Unit (utilities) | `*.spec.ts` co-localisé | À côté du fichier source |
| Component React | `*.test.tsx` co-localisé | Pattern existant |
| Integration API | `*.e2e-spec.ts` dans `apps/api/test/` | Pattern Jest existant |
| Frameworks | Jest (api) — Vitest (web/packages) | Imposé par stack |

### Format Patterns

#### API Response Format (access endpoint)

**Toujours retourner un objet avec `status` discriminant** — jamais `null` ou réponse vide :

```typescript
// ✅ OK
{ status: 'ok', distanceM: 4523, elevationGainM: 127, ... }
{ status: 'fallback', fallbackDistanceM: 1280, fallbackReason: 'routing_failed', ... }
{ status: 'error', message: '...' }  // 4xx/5xx seulement

// ❌ ANTI-PATTERN — pas de discriminant
{ distanceM: 4523, fallback: true }
// ❌ ANTI-PATTERN — réponse vide
null
```

#### Geometry Format

| Donnée | Format |
|---|---|
| Échange API (DTO) | GeoJSON `{ type: 'LineString', coordinates: [[lon, lat], ...] }` |
| Stockage DB | PostGIS `geometry(LineString, 4326)` |
| Conversion DB→API | Via `ST_AsGeoJSON()` en SQL, **PAS** dans le code TS |
| Simplification | `ST_SimplifyPreserveTopology(geom, 5)` avant envoi API (tolérance 5 m) |

#### Date/Time

- API : ISO 8601 string (`"2026-05-20T19:30:00Z"`)
- DB : `TIMESTAMP` Postgres (sans timezone — convention projet)
- Frontend : `Date` objects via TanStack Query parsing

#### Units

| Donnée | Unité stockage | Unité API | Unité affichage |
|---|---|---|---|
| Distance | mètres (REAL) | mètres (JSON) | `< 1000` → "X m" / `≥ 1000` → "X,X km" |
| Élévation | mètres (REAL) | mètres (JSON) | "X m" ou "X m D+" |
| Coordonnées | WGS84 lat/lng en REAL | WGS84 décimal (number) | jamais affichées |

#### Wording UI

| Règle | Détail |
|---|---|
| **Source unique** du label "Itinéraire vers le..." | `getAccessLabel(poi.subcategory)` |
| **Aucun hardcode** "hôtel", "camping", etc. dans le JSX | Toujours passer par le helper |
| Fallback label générique | "Itinéraire d'accès" |
| Vocabulaire interdit en UI | "détour" (péjoratif), "déviation" |

### Communication Patterns

#### Event Naming (BullMQ jobs)

| Type | Convention | Exemple |
|---|---|---|
| Job name | `{feature}.{action}` | `poi.compute-access`, `poi.invalidate-access` |
| Job payload | Toujours typé via `type` TS | `AccessJobPayload` |
| Triggers internes | EventEmitter NestJS `OnEvent('adventure.trace-updated')` | Suit pattern Density |

#### State Management Patterns

**Zustand** — Pattern existant à respecter :

```typescript
// ✅ Action verbeuse et explicite
setVisibleAccessPoiId: (id: string | null) => void
markAccessConsentChecked: () => void

// ❌ ANTI-PATTERN trop court ou ambigu
showAccess: (id) => void  // verbe générique
toggle: () => void  // pas de contexte
```

**TanStack Query** :

| Aspect | Convention |
|---|---|
| Query key | Tableau structuré `['poi-access', poiId, origin]` |
| Mutation key | Pas de `mutationKey` (sauf optimistic UI) |
| Invalidation | `queryClient.invalidateQueries({ queryKey: ['poi-access'] })` (préfixe) |
| Stale time | Décisions au niveau hook (pas global) |

### Process Patterns

#### Error Handling

| Couche | Pattern |
|---|---|
| `RoutingService` (BRouter) | Throw `BrouterUnavailableException` — propre exception class |
| `AccessCalculatorService` | Catch exception BRouter → retourne `{ status: 'fallback', fallbackReason: 'routing_failed' }` (jamais re-throw) |
| Controller | Laisse passer les exceptions HTTP NestJS (400/403/404), wrap autres en 500 |
| Frontend | `useAccess` retourne `{ data, isLoading, error }` — composant gère le 3 |

**Règle clé** : le **fallback est une donnée**, pas une exception. Une route impossible n'est pas une erreur applicative.

#### Loading States

```tsx
// ✅ Skeleton dédié, pas de spinner générique
{isLoading && <AccessMetricsSkeleton />}
{data?.status === 'ok' && <AccessMetrics data={data} />}
{data?.status === 'fallback' && <AccessFallback data={data} />}
{error && <AccessError />}
```

#### Authentication Flow

Pattern existant Better Auth JWT non modifié. Les nouveaux endpoints utilisent le `AuthGuard` global déjà en place.

#### Validation Timing

| Couche | Quand valider |
|---|---|
| Frontend (avant envoi) | Zod parse → erreur immédiate user |
| API gateway (controller) | `class-validator` via `ValidationPipe` global |
| Service métier | Hypothèse `data validée`, pas de re-check |
| DB | Contraintes `CHECK` SQL minimales (defense in depth) |

### Enforcement Guidelines

**All AI Agents MUST:**

1. **Toujours utiliser `[lon, lat]`** dans le code (ordre GeoJSON) — confusion = bugs de routing silencieux
2. **Stocker en mètres** côté DB pour distance/élévation, jamais km — formatage est un concern frontend
3. **Utiliser le pattern `{ status: 'ok' | 'fallback' | 'error' }`** pour toute réponse de l'endpoint accès
4. **Ne JAMAIS inclure `user_id`** dans une clé Redis de cache accès (privacy by design)
5. **Arrondir la position GPS côté CLIENT** avant envoi via `roundCoordinate()`, jamais côté serveur
6. **Préfixer les nouveaux fichiers/composants du scope** par `Access` ou les placer dans les emplacements dédiés (`pois/access-calculator`, `components/poi-access`)
7. **Utiliser `sql\`\`` helper Drizzle** pour les opérations PostGIS, pas de connexion `pg` parallèle
8. **Suffixer toutes les nouvelles colonnes DB** par leur unité physique (`_m`, `_km`, `_kmh`, `_at`)
9. **Passer par `getAccessLabel()`** pour tout label UI "Itinéraire vers le..." — aucun hardcode de sous-catégorie dans le JSX

### Pattern Examples

#### ✅ Good Examples

```typescript
// 1. Coordonnées dans l'ordre GeoJSON
const origin: [number, number] = [poi.lng, poi.lat]  // [lon, lat]

// 2. Réponse API avec status discriminant
return { status: 'ok', distanceM: 4523, elevationGainM: 127, source: 'computed-fresh' }

// 3. Arrondi côté client AVANT envoi
const body = { origin: { type: 'gps', lat: roundCoordinate(gps.lat), lng: roundCoordinate(gps.lng) } }

// 4. Clé Redis anonyme
const key = `access:live:${poiId}:${profile}:${roundedLat}:${roundedLon}`

// 5. PostGIS via Drizzle sql helper
await db.execute(sql`
  SELECT ST_Length(
    ST_Difference(${route}::geometry, ST_Buffer(${trace}::geography, 10)::geometry)
  )
`)

// 6. Label UI contextualisé
<h2>{getAccessLabel(poi.subcategory)}</h2>
```

#### ❌ Anti-Patterns

```typescript
// 1. Coordonnées inversées (latlng au lieu de lonlat)
const origin = [poi.lat, poi.lng]  // ❌ DESTRUCTEUR

// 2. Réponse ambiguë sans status
return { distance: 4523, fallback: true }  // ❌ impossible de discriminer

// 3. Arrondi côté serveur (perte trop tardive de précision)
app.post('/access', (req) => {
  const lat = Math.round(req.body.lat * 10000) / 10000  // ❌ déjà reçu en clair
})

// 4. user_id dans la clé Redis
const key = `access:live:${userId}:${poiId}`  // ❌ RGPD violation

// 5. Connexion pg directe pour PostGIS
const client = new Client(...)
await client.query('SELECT ST_Difference(...)')  // ❌ bypass Drizzle/pool

// 6. Hardcode du label par sous-catégorie
<h2>{poi.subcategory === 'hotel' ? "Itinéraire vers l'hôtel" : "Itinéraire vers le camping"}</h2>
// ❌ duplique la logique de getAccessLabel
```

## Project Structure & Boundaries

### Complete Project Directory Structure (scope POI Access)

```
ridenrest-app/
├── apps/
│   ├── api/                                       # NestJS 11 API
│   │   ├── src/
│   │   │   ├── routing/                           # 🆕 NEW — Wrapper BRouter (infra)
│   │   │   │   ├── routing.module.ts
│   │   │   │   ├── routing.service.ts             # @nestjs/axios + circuit breaker
│   │   │   │   ├── routing.types.ts               # Types BRouter response
│   │   │   │   ├── brouter-unavailable.exception.ts
│   │   │   │   └── routing.service.spec.ts
│   │   │   ├── pois/                              # 🔧 EXTENDED
│   │   │   │   ├── pois.module.ts                 # 🔧 importe AccessCalculatorModule
│   │   │   │   ├── pois.controller.ts             # 🔧 + endpoint POST /pois/:id/access
│   │   │   │   ├── pois.service.ts                # (inchangé)
│   │   │   │   ├── pois.repository.ts             # (inchangé)
│   │   │   │   ├── dto/
│   │   │   │   │   └── access-request.dto.ts      # 🆕 NEW — DTO Zod-aligned
│   │   │   │   ├── access-calculator/             # 🆕 NEW — Métier
│   │   │   │   │   ├── access-calculator.module.ts
│   │   │   │   │   ├── access-calculator.service.ts
│   │   │   │   │   ├── access-calculator.service.spec.ts
│   │   │   │   │   └── strategies/
│   │   │   │   │       ├── compute-divergent-segment.ts
│   │   │   │   │       ├── compute-divergent-segment.spec.ts
│   │   │   │   │       ├── resolve-origin.ts
│   │   │   │   │       └── resolve-origin.spec.ts
│   │   │   │   └── access-worker/                 # 🆕 NEW — BullMQ
│   │   │   │       ├── access-worker.module.ts
│   │   │   │       ├── access-worker.processor.ts
│   │   │   │       └── access-worker.processor.spec.ts
│   │   │   ├── me/                                # 🔧 EXTENDED (ou créé si n'existe pas)
│   │   │   │   ├── me.controller.ts               # 🔧 + GET/PATCH /me/settings
│   │   │   │   └── dto/settings.dto.ts            # 🔧 + liveAccessConsent
│   │   │   └── config/
│   │   │       └── access.config.ts               # 🆕 NEW — env vars validation
│   │   └── test/
│   │       └── access.e2e-spec.ts                 # 🆕 NEW — E2E endpoint access
│   │
│   └── web/                                       # Next.js 15
│       ├── src/
│       │   ├── app/
│       │   │   ├── (app)/
│       │   │   │   ├── map/[id]/
│       │   │   │   │   └── _components/
│       │   │   │   │       ├── poi-popup.tsx              # 🔧 + AccessMetrics
│       │   │   │   │       ├── poi-detail-sheet.tsx       # 🔧 + AccessMetrics + carte
│       │   │   │   │       └── map.tsx                    # 🔧 + AccessMapLayer
│       │   │   │   ├── live/[id]/
│       │   │   │   │   └── _components/
│       │   │   │   │       └── poi-live-sheet.tsx         # 🔧 + AccessMetrics + Dialog
│       │   │   │   └── settings/
│       │   │   │       ├── page.tsx                       # 🔧 (ou 🆕)
│       │   │   │       └── _components/
│       │   │   │           └── privacy-section.tsx        # 🆕 NEW
│       │   ├── components/
│       │   │   └── poi-access/                            # 🆕 NEW — Composants scope
│       │   │       ├── AccessMetrics.tsx
│       │   │       ├── AccessMetricsSkeleton.tsx
│       │   │       ├── AccessConsentDialog.tsx
│       │   │       ├── AccessMapLayer.tsx
│       │   │       ├── AccessFallback.tsx
│       │   │       ├── useAccess.ts
│       │   │       └── *.test.tsx
│       │   ├── lib/
│       │   │   ├── privacy.ts                             # 🆕 NEW — roundCoordinate
│       │   │   ├── poi-labels.ts                          # 🆕 NEW — getAccessLabel
│       │   │   └── queries/
│       │   │       ├── poi-access.ts                      # 🆕 NEW — TanStack hooks
│       │   │       └── me-settings.ts                     # 🆕 NEW — useMeSettings hook
│       │   └── stores/
│       │       ├── live-mode-store.ts                     # 🔧 + accessConsentChecked
│       │       └── planning-mode-store.ts                 # 🔧 + visibleAccessPoiId
│
├── packages/
│   ├── database/
│   │   ├── src/
│   │   │   └── schema/
│   │   │       ├── accommodations-cache.ts                # 🔧 + 8 nouvelles colonnes
│   │   │       ├── adventures.ts                          # 🔧 + routing_profile
│   │   │       └── profiles.ts                            # 🔧 + live_access_consent
│   │   └── migrations/
│   │       └── 2026-05-XX_add_poi_access.sql              # 🆕 NEW
│   │
│   └── shared/
│       └── src/
│           └── schemas/
│               └── poi-access.ts                          # 🆕 NEW — Zod partagé
│
├── docker-compose.yml                                     # 🔧 + service brouter
├── docs/
│   └── ops/
│       └── brouter-runbook.md                             # 🆕 NEW — Runbook ops
└── .env.example                                           # 🔧 + 7 nouvelles vars
```

**Légende** :
- 🆕 **NEW** : fichier/dossier créé par ce scope
- 🔧 **EXTENDED** : fichier existant modifié

### Architectural Boundaries

#### API Boundaries

| Boundary | Côté A | Côté B | Protocole |
|---|---|---|---|
| Web → API | `apps/web` (TanStack Query) | `apps/api` (NestJS) | HTTPS REST + JWT |
| API → BRouter | `RoutingService` | Conteneur BRouter | HTTP localhost (`http://localhost:17777` — PM2 natif → Docker bind) |
| API → DB | Repositories | PostgreSQL+PostGIS | Drizzle ORM + raw `sql\`\`` PostGIS |
| API → Redis | `AccessCalculatorService` | Redis 7 | ioredis client (TTL gestion) |
| API → BullMQ | `AccessCalculatorService` | Workers BullMQ | Queue Redis-backed |

#### Component Boundaries (Frontend)

| Composant | Responsabilité | Ne fait PAS |
|---|---|---|
| `AccessMetrics` | Affiche distance + D+/D- + status (ok/fallback) | Ne fetch pas — reçoit `data` du hook |
| `useAccess` | Fetch + cache TanStack Query | N'affiche rien |
| `AccessConsentDialog` | Popin RGPD + capture choix user | Ne stocke pas — appelle `mutate()` |
| `AccessMapLayer` | Affiche polyline sur MapLibre | Ne calcule pas la geometry |
| `getAccessLabel` | Retourne le label UI selon subcategory | N'a pas de side effects |
| `roundCoordinate` | Arrondit coord à 4 décimales | Pas de logique métier |

**Règle de découplage** : un composant `Access*` ne peut **PAS** importer directement d'un autre composant `Access*` sauf via le hook `useAccess` ou les helpers `lib/`.

#### Service Boundaries (Backend)

| Service | Responsabilité | Dépend de | NE dépend PAS de |
|---|---|---|---|
| `RoutingService` | Wrapper BRouter (HTTP + circuit breaker) | `HttpService`, `ConfigService` | Drizzle, PostGIS, Redis |
| `AccessCalculatorService` | Logique métier accès | `RoutingService`, DB (via repository), Redis | Controllers HTTP |
| `AccessWorkerProcessor` | Job BullMQ | `AccessCalculatorService`, Drizzle | HTTP layer, frontend |
| `PoisController` | HTTP I/O endpoint | `AccessCalculatorService` (via injection) | BRouter direct, Redis direct |
| `MeController` | Endpoint settings | `ProfilesService` (existant) | Calcul accès |

**Règle de découplage** : seul `AccessCalculatorService` orchestre. Les autres services ne se connaissent pas.

#### Data Boundaries

| Donnée | Persisté où | Lecture par | Écriture par |
|---|---|---|---|
| `access_*` columns | `accommodations_cache` (DB) | Repository POI + Controller | `AccessCalculatorService` + Worker |
| `routing_profile` | `adventures` (DB) | `AccessCalculatorService.resolveProfile()` | Adventure CRUD existant |
| `live_access_consent` | `profiles` (DB) | `MeController`, `AccessCalculatorService` (gate Live) | `MeController` PATCH |
| Live access cache | Redis (`access:live:*`) | `AccessCalculatorService` | `AccessCalculatorService` |
| BullMQ jobs | Redis (BullMQ queue) | Worker | Triggers d'invalidation |

### Requirements to Structure Mapping

#### Epic 4 (Interactive Map & POI Planning) → Fichiers concernés

| Story | Fichier(s) |
|---|---|
| 4.3 Corridor Search | `apps/api/src/pois/pois.service.ts` (inchangé) |
| 4.4 POI Detail Sheet | `apps/web/.../poi-detail-sheet.tsx` (🔧 + `<AccessMetrics>`) |
| 4.5 POI Category Filter | (inchangé) |

#### Epic 7 (Live Mode) → Fichiers concernés

| Story | Fichier(s) |
|---|---|
| 7.2 Real-Time POI Discovery | `apps/web/.../live/[id]/_components/poi-live-sheet.tsx` (🔧 + Dialog + Metrics) |
| Consentement RGPD | `AccessConsentDialog.tsx` + `privacy-section.tsx` |

#### Epic 11 (Stage Planning) → Fichiers concernés

| Story | Fichier(s) |
|---|---|
| 11.4 Stage-Scoped POI Search | `resolve-origin.ts` (mapping stageId → [lon, lat] de début de stage) |

#### Epic 16 (UX Polish) → Fichiers concernés

| Story | Fichier(s) |
|---|---|
| 16.13 POI Popup Redesign | `poi-popup.tsx` (🔧 + `<AccessMetrics>` compact) |
| 16.11 POI Visual Identity | (inchangé) — uses existing color scheme |

#### Cross-Cutting → Locations

| Concern | Locations |
|---|---|
| Auth (JWT) | `apps/api/src/auth/*` (existant — non modifié) |
| RGPD | `profiles.ts` (DB) + `privacy-section.tsx` (UI) + `AccessConsentDialog.tsx` (popin) + `privacy.ts` (helper) |
| Cache | `accommodations_cache` (DB) + Redis (`access:live:*`) + TanStack Query (front) |
| Migrations | `packages/database/migrations/2026-05-XX_add_poi_access.sql` |
| Tests E2E | `apps/api/test/access.e2e-spec.ts` |
| Runbook ops | `docs/ops/brouter-runbook.md` |

### Integration Points

#### Internal Communication

**Flux nominal (mode Planning, cache miss)** :
```
[Frontend]                  [API NestJS]              [BRouter Docker]   [PostgreSQL]   [Redis]
    │                              │                          │                │             │
    │  POST /pois/:id/access       │                          │                │             │
    │ ─────────────────────────► │                          │                │             │
    │                              │  Check DB cache          │                │             │
    │                              │ ─────────────────────────────────────► │             │
    │                              │ ◄───────────────── (miss) ────────────  │             │
    │                              │                          │                │             │
    │                              │  Compute route           │                │             │
    │                              │ ──────────────────────► │                │             │
    │                              │ ◄──── GeoJSON ─────────  │                │             │
    │                              │                          │                │             │
    │                              │  ST_Difference(buffer)   │                │             │
    │                              │ ─────────────────────────────────────► │             │
    │                              │ ◄──── divergent geom ─────────────────  │             │
    │                              │                          │                │             │
    │                              │  UPDATE accommodations_cache.access_*    │             │
    │                              │ ─────────────────────────────────────► │             │
    │                              │                          │                │             │
    │ ◄── { status: 'ok', ... } ── │                          │                │             │
```

**Flux nominal (mode Live, cache hit Redis)** :
```
[Frontend]                  [API NestJS]              [Redis]
    │                              │                       │
    │  POST /pois/:id/access       │                       │
    │  body: { origin: gps }       │                       │
    │ ──────────────────────────► │                       │
    │                              │  GET access:live:...  │
    │                              │ ─────────────────────► │
    │                              │ ◄── { cached data } ── │
    │ ◄── { status: 'ok', source: 'redis-cache' } ──       │
```

**Flux d'invalidation (UPDATE trace aventure)** :
```
[Adventure Service]            [EventEmitter]      [BullMQ Queue]
    │                                │                    │
    │  UPDATE adventure_segments.geom│                    │
    │                                │                    │
    │  emit('adventure.trace-updated', { adventureId })   │
    │ ──────────────────────────────► │                    │
    │                                │  enqueue invalidation jobs
    │                                │ ─────────────────► │
    │                                │                    │
    │                              (worker process)       │
    │                                                     │
    │     UPDATE accommodations_cache SET access_* = NULL │
    │     WHERE segment_id IN (...) AND dist_from_trace_m < 1500
    │                                                     │
    │     ENQUEUE poi.compute-access × N                  │
```

#### External Integrations

| Service externe | Usage | Localisation | Fallback |
|---|---|---|---|
| BRouter (Docker local) | Routing cyclable | `RoutingService` | Vol d'oiseau |
| OSM Overpass | POI discovery (existant) | `pois.service.ts` | Cache 24h |
| Open-Meteo (existant) | Météo | hors scope | hors scope |
| brouter.de | Téléchargement segments OSM | Bootstrap container | Manuel re-download |

#### Data Flow Summary

1. **Création/upload aventure** → `parse-status: done` → trigger BullMQ corridor search → trigger BullMQ access pre-compute (POI < 1500 m)
2. **Consultation POI Planning** → lookup `accommodations_cache.access_*` → si NULL → calcul lazy → cache DB
3. **Consultation POI Live (avec consent)** → POST `/pois/:id/access` `origin: gps` → lookup Redis → si miss → calcul lazy → cache Redis 15 min
4. **Consultation POI Live (sans consent)** → POST `/pois/:id/access` → fallback vol d'oiseau immédiat
5. **UPDATE trace ou profil** → événement → invalidation cache DB + BullMQ recompute
6. **Bump `ACCESS_ENGINE_VERSION`** → recalcul lazy progressif au prochain accès POI

### File Organization Patterns

#### Configuration Files

| Fichier | Rôle |
|---|---|
| `apps/api/src/config/access.config.ts` | Validation des env vars `ACCESS_*` et `BROUTER_*` (Joi/Zod) |
| `docker-compose.yml` | Service `brouter` ajouté |
| `.env.example` | Documentation des 7 nouvelles variables |

#### Source Organization

- **Backend** : `/routing` (infra) + `/pois/access-calculator` (métier) + `/pois/access-worker` (async)
- **Frontend** : `/components/poi-access` (scope dédié) + `/lib` (helpers réutilisables)
- **Shared** : `/packages/shared/src/schemas/poi-access.ts` (DTO partagé)

#### Test Organization

- Unit tests co-localisés (`*.spec.ts` / `*.test.tsx`)
- E2E backend : `apps/api/test/access.e2e-spec.ts`
- E2E frontend : ajout dans suite Playwright existante (si configurée)

#### Asset Organization

- Aucun nouvel asset statique (pas d'icône/image dédiée)
- Couleur amber (`#f59e0b`) ajoutée au design tokens si pas déjà présent

### Development Workflow Integration

#### Dev local

```bash
# 1. Lancer BRouter en local (avec données Europe)
docker-compose up -d brouter
# ~10 min de téléchargement initial

# 2. Migration DB
pnpm db:migrate

# 3. Lancer API + Web (existant)
pnpm dev
```

#### Build & Deploy

- BRouter container : pull image, healthcheck via Caddy avant rollover API
- API : redéploiement standard PM2 (la migration DB tourne dans le CI step)
- Web : build Next.js standard (aucun changement)

#### Tests CI

- Unit tests : runs Jest (api) + Vitest (web/packages) en parallèle Turborepo
- E2E api : PostgreSQL+PostGIS via docker-compose CI + BRouter mock (réponses fixtures GeoJSON)
- Pas de full BRouter en CI (trop lourd) → mocks ciblés

## Architecture Validation Results

### Coherence Validation ✅

#### Decision Compatibility

| Aspect | Verdict |
|---|---|
| BRouter (Java) + Docker + KVM 2 (8 Go) | ✅ Compatible (~3 Go heap + Postgres + Redis + autres = 5,5 Go max < 8 Go disponible) |
| PostGIS `ST_Difference` + Drizzle `customType` | ✅ Pattern déjà éprouvé sur `adventure_segments.geom` |
| BullMQ workers (concurrency 5) + BRouter timeout 5 s | ✅ Latence cumulée acceptable (50 POI × 200 ms = 10 s en parallèle ≈ 2 s effective) |
| TanStack Query cache + invalidation event-driven | ✅ Pattern existant pour Density Analysis |
| RGPD opt-in Live + cache Redis anonyme | ✅ Cohérent, "privacy by design" respecté |
| Profil par aventure + recalcul progressif | ✅ Versioning via `access_engine_version` permet migration douce |

**Aucune contradiction détectée** entre les décisions.

#### Pattern Consistency

| Aspect | Verdict |
|---|---|
| Naming snake_case DB / camelCase TS / kebab-case files | ✅ Aligné avec `project-context.md` |
| Préfixe `Access` partout (code) vs label UI contextualisé | ✅ Découplage code/UI respecté |
| Pattern `{ status: 'ok' \| 'fallback' \| 'error' }` | ✅ Réutilisable, extensible |
| Coordonnées `[lon, lat]` (GeoJSON) partout | ✅ Convention claire, anti-pattern explicitement listé |

#### Structure Alignment

| Aspect | Verdict |
|---|---|
| Séparation `routing/` (infra) vs `pois/access-calculator/` (métier) | ✅ Découplage propre, testable |
| Composants frontend isolés dans `components/poi-access/` | ✅ Pas de pollution du reste de l'app |
| DTO Zod partagé dans `packages/shared/` | ✅ Source unique web↔api |
| Migration SQL séparée pour PostGIS | ✅ Pattern existant respecté |

### Requirements Coverage Validation ✅

#### Epic Coverage

| Epic | Stories impactées | Statut couverture |
|---|---|---|
| **Epic 4** (Interactive Map & POI Planning) | 4.4 (POI Detail Sheet) | ✅ `<AccessMetrics>` ajouté |
| **Epic 7** (Live Mode) | 7.2 (Real-Time POI Discovery) | ✅ Dialog + AccessMetrics + RGPD opt-in |
| **Epic 11** (Stage Planning) | 11.4 (Stage-Scoped POI Search) | ✅ Origine = stage en cours |
| **Epic 16** (UX Polish) | 16.13 (POI Popup Redesign) | ✅ `<AccessMetrics>` compact |
| **Epic 8** (App Shell) | 8.4 (Filter Panel) | ⚪ Hors scope (non impacté) |
| **Epic 5** (Density Analysis) | (toutes) | ⚪ Pattern réutilisé pour BullMQ, code indépendant |

#### FR Coverage

| FR | Impact | Couverture |
|---|---|---|
| FR-030/031 (Corridor search + tri distance) | Tri alternatif par distance d'accès possible | ✅ |
| FR-032/033 (POI Detail Sheet structure) | Extension UI | ✅ |
| FR-042/043 (Live POI + GPS non envoyé) | RGPD résolu via opt-in | ✅ |
| FR-080 (D+ Planning POI) | Conservé + complété par D+ accès | ✅ |
| FR-082 (D+ Live POI + ETA) | Étendu avec D+ accès | ✅ |

#### NFR Coverage

| NFR | Couverture |
|---|---|
| NFR-021/040 (Cache POI bbox <200 ms) | ✅ Cache DB <200 ms si hit, lazy <500 ms si miss |
| NFR-022 (Job async BullMQ) | ✅ Pattern réutilisé |
| NFR-032 (RGPD GPS Live non envoyé) | ✅ Opt-in + position arrondie côté client |
| Privacy by design | ✅ Cache Redis anonyme, aucune PII stockée durablement |

### Implementation Readiness Validation ✅

#### Decision Completeness

| Catégorie | Statut |
|---|---|
| Data Architecture | ✅ Schéma DB complet (3 tables modifiées, 8 nouvelles colonnes, 1 migration) |
| Auth & Security | ✅ JWT + autorisation par owner + RGPD opt-in + rate limit défini |
| API & Communication | ✅ DTO Zod complet, codes HTTP, gestion erreur, flows internes |
| Frontend Architecture | ✅ 6 composants + 3 helpers + 2 stores Zustand étendus |
| Infrastructure | ✅ docker-compose entry, env vars listées, runbook ops planifié |

#### Structure Completeness

| Aspect | Statut |
|---|---|
| Arborescence complète | ✅ 100% des fichiers nouveaux + modifiés listés |
| Boundaries définies | ✅ API, composants, services, données |
| Mapping Epic → fichier | ✅ Stories listées |
| Integration points | ✅ 3 séquences ASCII (planning miss, live hit, invalidation) |

#### Pattern Completeness

| Aspect | Statut |
|---|---|
| Naming conventions | ✅ DB, API, code, BullMQ, Redis |
| Format conventions | ✅ Response, geometry, dates, units, wording UI |
| Communication patterns | ✅ Events BullMQ, state Zustand, TanStack Query |
| Process patterns | ✅ Error handling, loading states, validation timing |
| Enforcement guidelines | ✅ 9 règles obligatoires AI Agents |
| Exemples ✅ / ❌ | ✅ 6 good + 6 anti-patterns concrets |

### Gap Analysis Results

#### 🔴 Critical Gaps (à clarifier avant implémentation)

| Gap | Action |
|---|---|
| Existence d'un module `MeController` / `/me/settings` actuel ? | À vérifier en story 0 — créer si absent |
| Existence d'un guard `OwnerOnly` ? | À vérifier en story 0 — créer ou utiliser check inline |
| `@nestjs/throttler` installé ? | À vérifier en story 0 — ajouter si absent |
| Existence d'un `EventEmitter` NestJS configuré ? | À vérifier en story 0 — pattern à standardiser avec Density |

#### 🟠 Important Gaps (à affiner en stories ultérieures)

| Gap | Action |
|---|---|
| Wording UX exact des popin / settings | À valider dans un workflow `bmad-create-ux-design` dédié |
| Threshold circuit breaker (5 échecs / 30 s) | À benchmarker en story 0 (test charge BRouter local) |
| Buffer 10 m pour `ST_Buffer` | À valider sur 5-10 cas réels (précision OSM variable) |
| Implémentation circuit breaker (`cockatiel` vs maison) | À trancher en story backend 2 |
| Bull Board / Bull UI dashboard | À documenter si déjà en place |
| Fixtures BRouter pour tests CI | À créer avec story backend 3 (E2E mock) |

#### 🟢 Nice-to-Have Gaps (post-MVP)

| Gap | Action |
|---|---|
| Métriques Prometheus/Grafana | Phase 2 si besoin observability |
| Profil BRouter custom (`gravel-rider.brf`) | Phase 2 si feedback utilisateurs |
| Détour pour POI non-accommodations (water/food/bike-shop) | Phase 2 — l'archi est extensible |
| Affichage multi-POI simultanés sur la carte | Phase 2 |
| Backup volume `brouter-segments` | Non critique (re-téléchargeable) |
| Mise à jour automatique des segments OSM | Cron mensuel à mettre en place |

### Validation Issues Addressed

Aucune issue bloquante détectée. Les gaps critiques sont des **points de vérification** à effectuer en story 0 (Provisionner BRouter + audit codebase) — pas des défauts d'architecture.

### Architecture Completeness Checklist

#### ✅ Requirements Analysis
- [x] Project context thoroughly analyzed (PRD, epics, project-context, UX spec, 2 research docs, 2 architectures existantes)
- [x] Scale and complexity assessed (Medium, ~7 composants, full-stack)
- [x] Technical constraints identified (KVM 2, Docker, Drizzle, Better Auth)
- [x] Cross-cutting concerns mapped (Cache, Invalidation, RGPD, Versioning, Observabilité, Multi-mode)

#### ✅ Architectural Decisions
- [x] Critical decisions documented (schéma DB, cache stratégie, RGPD)
- [x] Technology stack fully specified (BRouter build depuis `abrensch/brouter` v1.7.9, `@nestjs/axios`, profils, etc.)
- [x] Integration patterns defined (NestJS↔BRouter↔BullMQ↔Redis↔Postgres)
- [x] Performance considerations addressed (concurrency, timeouts, cache TTL)

#### ✅ Implementation Patterns
- [x] Naming conventions established (DB, API, code, BullMQ, Redis)
- [x] Structure patterns defined (organization fichiers, tests)
- [x] Communication patterns specified (events, state, queries)
- [x] Process patterns documented (errors, loading, validation, auth)

#### ✅ Project Structure
- [x] Complete directory structure defined (arborescence avec 🆕 / 🔧 markers)
- [x] Component boundaries established (services, composants, data)
- [x] Integration points mapped (3 séquences détaillées)
- [x] Requirements to structure mapping complete (Epics 4, 7, 11, 16)

### Architecture Readiness Assessment

**Overall Status: ✅ READY FOR IMPLEMENTATION**

**Confidence Level: HIGH**

Justification :
- Patterns existants du projet réutilisés (BullMQ Density, PostGIS customType, cache Redis)
- Aucune nouvelle technologie inconnue de l'équipe
- BRouter et `ST_Difference` sont des briques matures, bien documentées
- Risques identifiés et mitigations en place (fallback, circuit breaker, opt-in)

**Key Strengths:**

1. **Découplage code/UI** : `access` (générique) + `getAccessLabel` (contextualisé) → extensible facilement
2. **RGPD-by-design** : opt-in granulaire, position arrondie côté client, cache anonyme
3. **Résilience** : fallback vol d'oiseau si BRouter down, circuit breaker, retry BullMQ
4. **Réutilisation des patterns projet** : BullMQ, PostGIS, customType Drizzle, TanStack Query
5. **Évolutivité** : architecture extensible vers d'autres types POI sans refactor
6. **Observabilité** : Uptime Kuma + métriques BullMQ + logs structurés
7. **Versioning** : recalcul progressif via `access_engine_version`, pas de pic de charge

**Areas for Future Enhancement:**

- Métriques fines (Prometheus/Grafana) si volume augmente
- Profils BRouter custom selon feedback utilisateurs
- Extension à d'autres types POI (water, food, bike-shop)
- Affichage multi-POI simultanés sur la carte
- Tests E2E playwright sur le flow consent → calcul → affichage

### Implementation Handoff

**AI Agent Guidelines:**

- Lire **l'intégralité** de ce document avant d'écrire la moindre ligne de code de ce scope
- Respecter les **9 règles MUST** du Step 5 (Enforcement Guidelines)
- Suivre **l'ordre des stories** du Step 4 (10 stories ordonnées)
- En cas d'ambiguïté, **référence prioritaire** : ce document > project-context.md > architecture.md global
- Pour le wording UX, **toujours passer par `getAccessLabel`** (jamais hardcoder)
- Pour les coordonnées, **toujours `[lon, lat]`** (jamais `[lat, lon]`)

**First Implementation Priority:**

**Story Ops 0** — Provisionner BRouter sur le VPS :
1. Ajouter le service `brouter` dans `docker-compose.yml`
2. Déclencher `docker-compose up brouter` (10 min de téléchargement segments)
3. Vérifier healthcheck Docker
4. Benchmark latence : 10 routes test, cible p95 < 500 ms
5. Documenter dans `docs/ops/brouter-runbook.md`
6. **Bloquant pour les stories suivantes**

Une fois validée, enchaîner sur Story Data 1 (Migration DB) puis Story Backend 2 (RoutingService + AccessCalculator).
