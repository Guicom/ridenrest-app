# Story POI-Access 2.2 : Implémenter le `AccessCalculatorService` (logique métier)

Status: done

<!-- Dépend de : 1.3 (migration DB), 1.4 (env vars), 2.1 (RoutingService). -->

## Story

As a **backend developer**,
I want a service that orchestrates the full access-route calculation pipeline (resolve origin → call BRouter → subtract trace overlap via PostGIS → persist to cache),
So that the controller and the BullMQ worker share a single source of truth for the business logic.

## Acceptance Criteria

1. **Given** le module `AccessCalculatorModule` à créer dans `apps/api/src/pois/access-calculator/`, **When** je le crée, **Then** :
   - Imports : `RoutingModule`, `DatabaseModule` (Drizzle), `EventEmitterModule`
   - Provider : `AccessCalculatorService`
   - Export : `AccessCalculatorService`
   - Importé par `PoisModule` (Story 2.3 l'utilisera)

2. **Given** `access-calculator.service.ts`, **When** je crée la méthode `compute(input)`, **Then** :
   - Signature :
     ```typescript
     compute(input: {
       poiId: string
       origin: AccessOrigin       // 'gps' | 'stage' | 'adventure-start' discriminated union
       profileOverride?: BrouterProfile
       mode: 'planning' | 'live'   // pour décider DB cache vs Redis cache
     }): Promise<AccessResult>
     ```
   - Retourne `AccessResult` avec status discriminant (`'ok' | 'fallback' | 'error'`)
   - **Jamais de throw** sauf cas dégénéré (POI inexistant) — les erreurs BRouter sont catched et converties en `fallback`

3. **Given** la stratégie `resolve-origin.ts`, **When** elle est appelée avec un origin et un poiId, **Then** :
   - `origin.type === 'gps'` → retourne `[origin.lng, origin.lat]` directement
   - `origin.type === 'stage'` → lookup `adventure_stages.start_km` + interpolation sur la trace → retourne `[lon, lat]` du point projeté
   - `origin.type === 'adventure-start'` → retourne `[lon, lat]` au km 0 de la première trace de l'aventure
   - Si stage absent ou aventure sans trace → throw `NotFoundException`

4. **Given** la stratégie `compute-divergent-segment.ts`, **When** elle reçoit la route BRouter + la trace de l'aventure, **Then** :
   - Utilise `db.execute(sql\`SELECT ST_Length(ST_Difference(${route}::geometry, ST_Buffer(${trace}::geography, ${access.traceBufferM})::geometry)::geography) AS divergent_length_m\`)`
   - Le buffer est `ACCESS_TRACE_BUFFER_M` (10m par défaut) depuis config
   - Calcule le D+/D- sur la portion divergente uniquement (filtrage des points d'élévation hors buffer)
   - Retourne `{ distanceM, elevationGainM, elevationLossM, geometry }` (geometry = portion divergente simplifiée)

5. **Given** le flow nominal `compute()` en mode Planning, **When** un calcul réussit, **Then** :
   - 1. `resolveOrigin(origin, poiId)` → `[lon_origin, lat_origin]`
   - 2. `resolveProfile(adventureId, profileOverride)` → mappé vers `BrouterProfile`
   - 3. `routingService.computeRoute({ from, to: [poi.lng, poi.lat], profile })` → `BrouterRoute`
   - 4. `computeDivergentSegment(route, trace)` → métriques d'accès
   - 5. UPDATE `accommodations_cache` avec les colonnes `access_*` + `access_computed_at = NOW()` + `access_engine_version = ${access.engineVersion}` + `access_origin_stage_id` (si applicable)
   - 6. Retourne `{ status: 'ok', distanceM, elevationGainM, elevationLossM, geometry, engineVersion, computedAt, source: 'computed-fresh' }`

6. **Given** le flow Planning avec cache hit, **When** `accommodations_cache.access_computed_at IS NOT NULL` AND `access_engine_version` matche la version courante AND `access_origin_stage_id` matche l'origin demandé, **Then** :
   - PAS d'appel BRouter
   - Retourne directement depuis le cache DB avec `source: 'db-cache'`

7. **Given** `routingService.computeRoute` lève `BrouterUnavailableException`, **When** `compute()` le catch, **Then** :
   - PAS de UPDATE cache (pour permettre retry ultérieur)
   - Retourne `{ status: 'fallback', fallbackReason: 'routing_failed', fallbackDistanceM: <dist_from_trace_m existant> }`
   - Log INFO (pas ERROR — volume attendu)

8. **Given** la geometry retournée, **When** elle est sauvegardée OU envoyée à l'API, **Then** :
   - Elle est simplifiée via `ST_SimplifyPreserveTopology(geom, 5)` (tolérance 5m, cf. archi)
   - Sa taille en kB est notée pour info dans les logs (warn si > 50 kB)

9. **Given** les tests unitaires, **When** je couvre les cas, **Then** :
   - `resolve-origin.spec.ts` : 3 cas (gps, stage, adventure-start) + cas erreur stage inexistant
   - `compute-divergent-segment.spec.ts` : fixture avec route+trace simulés, vérif distance divergente ± 1m
   - `access-calculator.service.spec.ts` : happy path, cache hit, BRouter fail → fallback, DB write correct (mock Drizzle)
   - Coverage ≥ 85% sur l'ensemble du module

10. **Given** la story terminée, **When** je commit, **Then** le diff inclut UNIQUEMENT :
    - `apps/api/src/pois/access-calculator/access-calculator.module.ts`
    - `apps/api/src/pois/access-calculator/access-calculator.service.ts`
    - `apps/api/src/pois/access-calculator/access-calculator.service.spec.ts`
    - `apps/api/src/pois/access-calculator/strategies/{resolve-origin.ts, compute-divergent-segment.ts}` + `.spec.ts`
    - `apps/api/src/pois/access-calculator/types/access-result.types.ts` (nouveau, types partagés)
    - `apps/api/src/pois/pois.module.ts` (modifié — import AccessCalculatorModule)
    - Éventuellement `packages/database/src/...` si on ajoute des helpers PostGIS partagés (à éviter dans ce scope)
    - Doc Sync si écart

---

## ⚠️ Critical Discovery Notes

### 1. PostGIS via Drizzle `sql` helper — pattern strict

Cf. archi §Implementation Patterns règle #7 : "Utiliser `sql\`\`` helper Drizzle pour les opérations PostGIS, pas de connexion `pg` parallèle".

Pattern attendu :
```typescript
import { sql } from 'drizzle-orm'
const result = await this.db.execute(sql`
  SELECT ST_Length(
    ST_Difference(
      ST_GeomFromGeoJSON(${JSON.stringify(routeGeom)})::geometry,
      ST_Buffer(${traceGeomColumn}::geography, ${bufferM})::geometry
    )::geography
  ) AS divergent_length_m
`)
```

**Anti-pattern** : créer un `new Client(...)` direct depuis `pg` — bypass du pool Drizzle.

### 2. Resolve-origin pour `stage` — interpolation requise

Le `adventure_stages.start_km` est un float (km depuis le début de la trace). Pour récupérer `[lon, lat]` au km X, il faut interpoler sur la geometry de la trace :
```sql
SELECT ST_AsGeoJSON(
  ST_LineInterpolatePoint(
    (SELECT ST_LineMerge(ST_Union(geom ORDER BY order_index)) FROM adventure_segments WHERE adventure_id = $1),
    ${startKm} / total_length_km
  )
)
```

**À vérifier en Task 4** : si une fonction utility existe déjà dans `apps/api` (ex: `findPointAtKm`), la réutiliser. Sinon créer dans `strategies/resolve-origin.ts`.

### 3. Concurrency cache update

Plusieurs requêtes simultanées sur le même POI peuvent lancer 2 calculs BRouter en parallèle (race condition). Mitigations possibles :
- **Pas critique pour MVP** — l'idempotence du UPDATE garantit la cohérence finale (le dernier gagne)
- Pour Live : la clé Redis avec lat/lng arrondi sert d'idempotence naturelle (calcul similaire = même clé)
- Pour Planning : ajouter un advisory lock Postgres ou un Redis SETNX (out of scope MVP)

→ Documenter le risque en commentaire de service, pas de fix MVP.

### 4. Distinguer `dist_from_trace_m` vs `access_distance_m`

- `dist_from_trace_m` (existant) = distance vol d'oiseau du POI au point le plus proche de la trace (perpendiculaire)
- `access_distance_m` (nouveau) = distance cyclable réelle de l'origin (gps/stage/start) au POI moins le chevauchement trace

→ Ne PAS confondre. Le fallback retourne `dist_from_trace_m` (existant), pas `access_distance_m`.

---

## Tasks / Subtasks

- [x] **Task 1** — Créer la structure module (AC: 1, 10)
  - [x] `access-calculator.module.ts` avec imports/providers/exports
  - [x] Modifier `pois.module.ts` pour importer `AccessCalculatorModule`

- [x] **Task 2** — Définir les types partagés (AC: 2)
  - [x] `types/access-result.types.ts` :
    ```typescript
    export type AccessOrigin =
      | { type: 'gps'; lat: number; lng: number }
      | { type: 'stage'; stageId: string }
      | { type: 'adventure-start' }
    
    export type AccessResult =
      | { status: 'ok'; distanceM: number; elevationGainM: number; elevationLossM: number; geometry: GeoJSONLineString; engineVersion: string; computedAt: string; source: 'db-cache' | 'redis-cache' | 'computed-fresh' }
      | { status: 'fallback'; fallbackReason: 'routing_failed' | 'no_consent' | 'unreachable'; fallbackDistanceM: number; source: 'computed-fresh' }
      | { status: 'error'; message: string }
    ```

- [x] **Task 3** — Implémenter `compute-divergent-segment.ts` (AC: 4, ⚠️Discovery #1)
  - [x] Function pure (testable sans DI) qui prend `db: SqlExecutor`, `route: GeoJSONLineString`, `adventureId: string`, `bufferM: number`
  - [x] Exécute la requête PostGIS via `db.execute(sql\`...\`)` (2 requêtes : distance+geom, puis D+/D- par point)
  - [x] Retourne `{ distanceM, elevationGainM, elevationLossM, geometry }`
  - [x] Test : rows mockés (distance/geom + points élévation), assert parsing distance ± 1m + logique D+/D- pure (`computeDivergentElevation`)

- [x] **Task 4** — Implémenter `resolve-origin.ts` (AC: 3, ⚠️Discovery #2)
  - [x] Function pure qui prend `db: SqlExecutor`, `origin: AccessOrigin`, `poi: { adventureId: string }`
  - [x] Switch sur `origin.type`
  - [x] Pour `stage` et `adventure-start` : `ST_LineInterpolatePoint` sur la trace fusionnée (`ST_LineMerge(ST_Collect(geom ORDER BY order_index))`)
  - [x] Test : 3 cas (gps/stage/adventure-start) + 2 cas erreur (stage inexistant, aventure sans trace)

- [x] **Task 5** — Implémenter `AccessCalculatorService.compute` (AC: 2, 5, 6, 7, 8)
  - [x] Inject : `RoutingService`, `accessConfig`. `db` importé directement (`@ridenrest/database`, pas de token DRIZZLE_DB). Lookups POI/adventure/trace inline via `db.execute(sql)` (voir déviations).
  - [x] Vérifier cache DB d'abord (Planning) — Redis (Live) reporté Story 3.1
  - [x] Si miss : `resolveOrigin` → `resolveProfile` → `routingService.computeRoute` (try/catch) → `computeDivergentSegment` → UPDATE cache → return
  - [x] Catch `BrouterUnavailableException` → fallback
  - [x] Mode `'planning'` uniquement (cache DB). Mode `'live'` en Story 3.1.

- [x] **Task 6** — Implémenter `resolveProfile` helper inline (AC: 5)
  - [x] Fonction privée qui lit `adventures.routing_profile` (joint dans loadPoi) ou utilise `profileOverride` si fourni
  - [x] Mapping label projet → profil BRouter (cf. archi §Starter Template Evaluation) :
    ```typescript
    const PROFILE_MAP: Record<RoutingProfile, BrouterProfile> = {
      road: 'fastbike',
      gravel: 'trekking',
      bikepacking: 'safety',
    }
    ```

- [x] **Task 7** — Tests unitaires complets (AC: 9)
  - [x] `access-calculator.service.spec.ts` avec mocks Drizzle (`jest.mock('@ridenrest/database')`) + RoutingService + stratégies
  - [x] Cas couverts :
    - Happy path planning, cache miss → BRouter call → UPDATE DB → return ok
    - Cache hit DB → no BRouter call → return ok with source: 'db-cache'
    - BRouter exception → fallback returned, no cache update
    - POI inexistant → throw NotFoundException
    - + engineVersion obsolète → recalcul, erreur non-BRouter propagée, géométrie > 50 kB → WARN, cache MultiLineString aplati, module DI wiring
  - [x] Coverage **96.55 %** sur le module (≥ 85 % requis)

- [x] **Task 8** — Doc Sync + commit
  - [x] Helper existant `findPointAtKm` (packages/gpx, waypoint-based) + `getWaypointAtKm` (pois.repository) repérés ; NON réutilisés — AC #3/Discovery #2 prescrivent explicitement `ST_LineInterpolatePoint` sur la geom PostGIS (plus précis que l'interpolation sur waypoints jsonb). Déviations documentées ci-dessous.
  - [ ] Commit (laissé à Guillaume / post-review) : `feat(api): add AccessCalculatorService (resolve-origin, compute-divergent-segment, cache orchestration) — story poi-access-2.2`

---

## Dev Notes

### Pattern projet — Repository

Toutes les queries Drizzle vont dans les repositories (cf. project-context §NestJS Architecture Rules). Pour cette story :
- Lookup POI → `pois.repository.ts` (existant probablement, sinon créer méthode)
- Lookup adventure trace → `adventures.repository.ts` (existant)
- UPDATE accommodations_cache → repository dédié OU inline dans service avec `db.execute(sql\`UPDATE ...\`)` — décision à prendre selon pattern existant

### Pattern projet — db injection

```typescript
constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>) {}
```

(À confirmer dans `packages/database/src/db.module.ts` ou équivalent.)

### Geometry conversion DB ↔ TS

DB stocke en `geometry(LineString, 4326)`. Conversion :
- DB → API : `ST_AsGeoJSON()` en SQL (cf. archi §Format Patterns)
- TS → DB : `ST_GeomFromGeoJSON(${JSON.stringify(...)})` en SQL
- **Pas de conversion manuelle en TS** (parser GeoJSON binaire WKB = chaos)

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-2.2]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Data-Architecture]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#AccessCalculator-(logique-métier)]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Implementation-Patterns]
- [Source: _bmad-output/implementation-artifacts/poi-access-2-1-...md] — RoutingService
- [Source: _bmad-output/implementation-artifacts/poi-access-1-3-...md] — schéma DB
- PostGIS `ST_Difference` : https://postgis.net/docs/ST_Difference.html
- PostGIS `ST_LineInterpolatePoint` : https://postgis.net/docs/ST_LineInterpolatePoint.html

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (1M context) — Dev Story workflow (bmad-dev-story)

### Completion Notes List
- **Helper interpolation point** : ☑ existant repéré (`findPointAtKm` packages/gpx + `getWaypointAtKm` pois.repository, basés waypoints jsonb) / **NON réutilisé** → AC #3 + Discovery #2 prescrivent `ST_LineInterpolatePoint` sur la geom PostGIS (trace fusionnée), plus précis. Implémenté dans `strategies/resolve-origin.ts`.
- **Coverage tests** : **96.55 %** statements / 92 % branch / 100 % funcs sur `src/pois/access-calculator` (strategies 98.14 %). 20 tests, tous verts. Suite API complète : **320/320** (zéro régression). Lint + `tsc --noEmit` clean.
- **Concurrency cache update** : ☑ documenté en commentaire (en-tête `access-calculator.service.ts`) — idempotence UPDATE, pas de SETNX (hors scope MVP, Discovery #3).

#### Déviations vs story spec (Doc Sync)
1. **Pas de token `DRIZZLE_DB` / `DatabaseModule`** : le projet n'en a pas. Pattern réel = singleton `db` importé de `@ridenrest/database` (cf. `pois.repository`, `adventures.repository`). Les stratégies reçoivent `db` en paramètre (type `SqlExecutor`, testable) ; le service importe `db` directement. → `AccessCalculatorModule` n'importe donc PAS de `DatabaseModule`.
2. **Pas d'`EventEmitter2` / `EventEmitterModule`** : aucun AC n'exige d'émettre un événement, et `EventEmitterModule.forRoot()` est déjà global (`app.module`). Injection supprimée pour éviter du code mort. (Story 2.3+ pourra l'ajouter si un listener apparaît.)
3. **Lectures/écritures DB inline (`db.execute(sql)`) dans le service, pas de repository dédié** : AC #10 restreint le diff aux fichiers du module (aucun repo nouveau/modifié) et les repos existants ne conviennent pas (`AdventuresRepository.findByIdAndUserId` exige un `userId` absent de `compute()`, `PoisRepository` n'a pas de `findById`). Les Dev Notes sanctionnent explicitement l'inline pour l'UPDATE — étendu aux lectures. `loadPoi` joint `adventure_segments` + `adventures` pour récupérer `adventureId` + `routing_profile` en une requête (donc `resolveProfile` lit `routing_profile` déjà chargé, pas un lookup séparé par `adventureId`).
4. **Signature `computeDivergentSegment`** : prend `adventureId` (et fusionne la trace en SQL) plutôt qu'un `traceGeom: PostGISReference` opaque — cohérent avec `resolveOrigin`.
5. **D+/D- divergent recalculé en TS** : `ST_Difference`/`ST_Buffer` opèrent en 2D (perte du Z), donc une 2e requête `ST_DumpPoints` renvoie `(ele, within_trace)` par sommet et `computeDivergentElevation()` somme les deltas hors buffer (pure, testée). NB : la justesse PostGIS (ST_Difference/buffer) n'est PAS exercée par les tests unitaires (pas de PostGIS sous Jest, comme `pois.repository`) — validation déférée à l'intégration/déploiement.

### File List
- [x] `apps/api/src/pois/access-calculator/access-calculator.module.ts` (nouveau)
- [x] `apps/api/src/pois/access-calculator/access-calculator.service.ts` (nouveau)
- [x] `apps/api/src/pois/access-calculator/access-calculator.service.spec.ts` (nouveau)
- [x] `apps/api/src/pois/access-calculator/strategies/resolve-origin.ts` (nouveau)
- [x] `apps/api/src/pois/access-calculator/strategies/resolve-origin.spec.ts` (nouveau)
- [x] `apps/api/src/pois/access-calculator/strategies/compute-divergent-segment.ts` (nouveau)
- [x] `apps/api/src/pois/access-calculator/strategies/compute-divergent-segment.spec.ts` (nouveau)
- [x] `apps/api/src/pois/access-calculator/types/access-result.types.ts` (nouveau)
- [x] `apps/api/src/pois/pois.module.ts` (modifié — import `AccessCalculatorModule`)

### Change Log
| Date | Auteur | Changement |
|---|---|---|
| 2026-05-29 | Amelia (Dev Agent) | Implémentation Story 2.2 : `AccessCalculatorService` + stratégies `resolve-origin`/`compute-divergent-segment` + types partagés + wiring `PoisModule`. 20 tests (96.55 % coverage module), suite API 320/320 verte. Status → review. |

---

### Review Findings

> Code review 2026-05-29 — 3 couches (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Triage : 4 decisions, 6 patches, 5 deferrals, 6 dismissed.

#### Decisions (resolved)

- [x] [Review][Decision] **D1 — Cache key collision GPS vs adventure-start** → **Résolu : GPS exclu du cache** — Ajouter `input.origin.type !== 'gps'` à la condition de cache hit. GPS toujours recomputed, pas de migration DB nécessaire.
- [x] [Review][Decision] **D2 — Failure `updateCache` : 500 ou best-effort ?** → **Résolu : best-effort** — `updateCache` wrappé dans son propre try/catch ; log WARN sur échec ; résultat frais retourné au caller quand même.
- [x] [Review][Decision] **D3 — `ST_LineMerge` → MultiLineString crashe `ST_LineInterpolatePoint`** → **Résolu : interpolation segment par segment** — Remplacer `ST_LineMerge` par une CTE `seg_lengths` calculant les longueurs cumulées par segment, puis interpoler dans le bon segment via `ORDER BY order_index DESC LIMIT 1 WHERE seg_start_m <= target_m`. Fonctionne sur les traces multi-parties (gap ferry/train).
- [x] [Review][Decision] **D4 — MultiLineString divergent : aplatir ou typer correctement ?** → **Résolu : type `GeoJSONGeometry`** — Introduire `type GeoJSONGeometry = GeoJSONLineString | GeoJSONMultiLineString` dans `access-result.types.ts`. `DivergentMetrics.geometry` et `AccessResult.ok.geometry` utilisent `GeoJSONGeometry`. `parseGeometry` retourne le type natif sans flatten.

#### Patches

- [x] [Review][Patch] **P1 — `JSON.parse` non protégé dans `parseGeometry` (cache-hit path)** [`access-calculator.service.ts:233`] — Un `access_geometry` corrompu en DB lance un `SyntaxError` hors du try/catch, produisant un 500 sur un cache hit. Wraper dans `try/catch` → fallback vers recompute (invalider le cache hit et tomber dans la branche fraîche).
- [x] [Review][Patch] **P2 — Coordonnées GeoJSON Point non validées avant destructuring** [`strategies/resolve-origin.ts:91`] — `point.coordinates` peut être `undefined` ou `[]` si PostGIS retourne une géométrie dégénérée. Ajouter une guard : `if (!Array.isArray(point?.coordinates) || point.coordinates.length < 2) throw new NotFoundException(...)`.
- [x] [Review][Patch] **P3 — `startKm` NaN si `start_km` est NULL ou non-numérique** [`strategies/resolve-origin.ts:56`] — `Number(null/undefined/'')` → `NaN`, propagé dans le ratio SQL `LEAST(GREATEST(NaN*1000/..., 0), 1)` → `NaN` → `ST_LineInterpolatePoint` échoue. Ajouter `if (!Number.isFinite(startKm)) throw new NotFoundException(...)` après `Number(stage.start_km)`.
- [x] [Review][Patch] **P4 — Élévation NULL coercée à 0 dans le cache hit** [`access-calculator.service.ts:101-102`] — La garde de cache hit vérifie `accessDistanceM !== null` et `accessGeometry !== null` mais pas les colonnes élévation. Un row avec distance+géom présents mais élévation NULL retourne `{elevationGainM:0, elevationLossM:0}` indiscernable d'un parcours plat. Ajouter `poi.accessElevationGainM !== null && poi.accessElevationLossM !== null` dans la condition de cache hit.
- [x] [Review][Patch] **P5 — Trace NULL → distance=0 + géométrie=route complète (incohérent)** [`strategies/compute-divergent-segment.ts:56-68`] — Quand l'aventure n'a pas de segments, `ST_Difference(r.g, NULL) = NULL` → `COALESCE(ST_Length(NULL), 0) = 0` mais `CASE WHEN dg IS NULL THEN d.rg` retourne la route entière. Le résultat `{distanceM:0, geometry:fullRoute}` est contradictoire. Corriger le CASE distance : `COALESCE(ST_Length(CASE WHEN t.g IS NULL THEN r.g ELSE d.dg END::geography), 0)`.
- [x] [Review][Patch] **P6 — `mode='live'` écrit dans le cache Planning DB** [`access-calculator.service.ts:124`] — `updateCache` est appelé inconditionnellement, même pour `mode='live'` (qui est censé utiliser Redis, Story 3.1). Cela pollue les horodatages Planning et provoque du write amplification. Guard : `if (input.mode === 'planning') await this.updateCache(...)`.
- [x] [Review][Patch] **P7 — GPS exclu du cache (D1)** [`access-calculator.service.ts:83`] — Ajouter `input.origin.type !== 'gps'` à la condition de cache hit pour éviter la collision avec `adventure-start` (les deux ont `originStageId = null`).
- [x] [Review][Patch] **P8 — `updateCache` best-effort (D2)** [`access-calculator.service.ts:124`] — Wrapper `await this.updateCache(...)` dans un try/catch séparé ; `this.logger.warn({ msg: 'access_cache_write_failed', poiId, err })` + retourner le résultat frais quand même.
- [x] [Review][Patch] **P9 — Interpolation segment par segment (D3)** [`strategies/resolve-origin.ts:57`] — Remplacer la CTE `merged` + `ST_LineMerge` par une CTE `seg_lengths` avec `SUM(ST_Length) OVER (ORDER BY order_index ROWS UNBOUNDED PRECEDING AND 1 PRECEDING)`, puis `WHERE seg_start_m <= $startKm * 1000.0 ORDER BY order_index DESC LIMIT 1`.
- [x] [Review][Patch] **P10 — Type `GeoJSONGeometry` (D4)** [`types/access-result.types.ts`] — Ajouter `GeoJSONMultiLineString` + `GeoJSONGeometry = GeoJSONLineString | GeoJSONMultiLineString`. Mettre à jour `DivergentMetrics.geometry`, `AccessResult.ok.geometry`, et les deux `parseGeometry` pour retourner le type natif sans `flat()`.

#### Deferrals

- [x] [Review][Defer] **W1 — `Number(lat/lng)` sans garde finiteness** [`access-calculator.service.ts:192-193`] — deferred, pre-existing — `lat`/`lng` sont `NOT NULL` dans le schéma DB ; une valeur nulle est une corruption de données hors périmètre de ce service.
- [x] [Review][Defer] **W2 — Deux requêtes DB sans transaction (race condition trace)** [`strategies/compute-divergent-segment.ts:36,72`] — deferred, pre-existing — Documenté en Discovery #3 (concurrency MVP non-critique). Mitigation : `SELECT FOR UPDATE` ou advisory lock (hors scope).
- [x] [Review][Defer] **W3 — Coordonnées GPS `NaN`/`Infinity` non validées** [`strategies/resolve-origin.ts:20`] — deferred, pre-existing — Validation des inputs à la frontière API (Story 2.3 / controller). La stratégie n'est pas la bonne couche.
- [x] [Review][Defer] **W4 — Cast `as string` sur colonnes JOIN potentiellement nullables** [`access-calculator.service.ts:200-202`] — deferred, pre-existing — `adventure_segments.adventure_id` et `adventures.routing_profile` sont `NOT NULL` dans le schéma ; le cast est safe.
- [x] [Review][Defer] **W5 — `as unknown as RoutePointRow[]` désactive les checks de type** [`strategies/compute-divergent-segment.ts:97`] — deferred, pre-existing — SQL contrôlé ; la garde `typeof row.ele === 'number'` compense. Refactor opportuniste.`
