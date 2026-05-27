# Story POI-Access 2.2 : Implémenter le `AccessCalculatorService` (logique métier)

Status: ready-for-dev

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

- [ ] **Task 1** — Créer la structure module (AC: 1, 10)
  - [ ] `access-calculator.module.ts` avec imports/providers/exports
  - [ ] Modifier `pois.module.ts` pour importer `AccessCalculatorModule`

- [ ] **Task 2** — Définir les types partagés (AC: 2)
  - [ ] `types/access-result.types.ts` :
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

- [ ] **Task 3** — Implémenter `compute-divergent-segment.ts` (AC: 4, ⚠️Discovery #1)
  - [ ] Function pure (testable sans DI) qui prend `db: DrizzleDb`, `route: GeoJSONLineString`, `traceGeom: PostGISReference`, `bufferM: number`
  - [ ] Exécute la requête PostGIS via `db.execute(sql\`...\`)`
  - [ ] Retourne `{ distanceM, elevationGainM, elevationLossM, geometry }`
  - [ ] Test : fixture route+trace simulés (overlap connu), assert distance divergente ± 1m

- [ ] **Task 4** — Implémenter `resolve-origin.ts` (AC: 3, ⚠️Discovery #2)
  - [ ] Function pure qui prend `db`, `origin: AccessOrigin`, `poi: { adventureId: string }`
  - [ ] Switch sur `origin.type`
  - [ ] Pour `stage` et `adventure-start` : utiliser `ST_LineInterpolatePoint` (ou helper existant si trouvé)
  - [ ] Test : 3 cas + 1 cas erreur (stage inexistant)

- [ ] **Task 5** — Implémenter `AccessCalculatorService.compute` (AC: 2, 5, 6, 7, 8)
  - [ ] Inject : `RoutingService`, `AdventuresRepository` (lookup adventure+trace), `PoisRepository` (lookup POI), Drizzle `db`, `accessConfig`, `EventEmitter2`
  - [ ] Vérifier cache DB d'abord (Planning) ou Redis (Live, Story 3.1)
  - [ ] Si miss : `resolveOrigin` → `resolveProfile` → `routingService.computeRoute` (try/catch) → `computeDivergentSegment` → UPDATE cache → return
  - [ ] Catch `BrouterUnavailableException` → fallback
  - [ ] Pour cette story, ne traiter QUE le mode `'planning'` (cache DB). Mode `'live'` ajouté en Story 3.1.

- [ ] **Task 6** — Implémenter `resolveProfile` helper inline (AC: 5)
  - [ ] Fonction privée qui lit `adventures.routing_profile` ou utilise `profileOverride` si fourni
  - [ ] Mapping label projet → profil BRouter (cf. archi §Starter Template Evaluation) :
    ```typescript
    const PROFILE_MAP: Record<RoutingProfile, BrouterProfile> = {
      road: 'fastbike',
      gravel: 'trekking',
      bikepacking: 'safety',
    }
    ```

- [ ] **Task 7** — Tests unitaires complets (AC: 9)
  - [ ] `access-calculator.service.spec.ts` avec mocks Drizzle/RoutingService
  - [ ] Cas couverts (au minimum) :
    - Happy path planning, cache miss → BRouter call → UPDATE DB → return ok
    - Cache hit DB → no BRouter call → return ok with source: 'db-cache'
    - BRouter exception → fallback returned, no cache update
    - POI sans `dist_from_trace_m` → throw NotFoundException
  - [ ] Coverage ≥ 85%

- [ ] **Task 8** — Doc Sync + commit
  - [ ] Si helper utility existant trouvé (`findPointAtKm`...), documenter dans archi
  - [ ] Commit : `feat(api): add AccessCalculatorService (resolve-origin, compute-divergent-segment, cache orchestration) — story poi-access-2.2`

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
_(À renseigner)_

### Completion Notes List
- Helper interpolation point trouvé existant : ☐ Oui (`___`) / ☐ Non (créé)
- Coverage tests : `___%`
- Concurrency cache update : ☐ documenté en commentaire / ☐ fixé via SETNX

### File List
- [ ] `apps/api/src/pois/access-calculator/access-calculator.module.ts`
- [ ] `apps/api/src/pois/access-calculator/access-calculator.service.ts`
- [ ] `apps/api/src/pois/access-calculator/access-calculator.service.spec.ts`
- [ ] `apps/api/src/pois/access-calculator/strategies/resolve-origin.ts`
- [ ] `apps/api/src/pois/access-calculator/strategies/resolve-origin.spec.ts`
- [ ] `apps/api/src/pois/access-calculator/strategies/compute-divergent-segment.ts`
- [ ] `apps/api/src/pois/access-calculator/strategies/compute-divergent-segment.spec.ts`
- [ ] `apps/api/src/pois/access-calculator/types/access-result.types.ts`
- [ ] `apps/api/src/pois/pois.module.ts` (modifié)
