# Story POI-Access 2.3 : Endpoint `POST /pois/:id/access` (mode Planning)

Status: done

<!-- Dépend de : 1.4 (throttler + OwnerOnly), 2.2 (AccessCalculatorService). Indépendante de Live (Story 3.1). -->

## Story

As a **frontend developer**,
I want to call a single REST endpoint that returns the access route metrics (distance + elevation + geometry) for any POI in Planning mode,
So that the UI can render the access info synchronously without orchestrating BRouter + PostGIS calls itself.

## Acceptance Criteria

1. **Given** le schéma Zod partagé, **When** je crée `packages/shared/src/schemas/poi-access.ts`, **Then** il exporte :
   - `AccessOriginGpsSchema` (lat/lng arrondis 4 décimales — validation regex `/^-?\d+(\.\d{1,4})?$/` ou check via `(n * 10000) % 1 === 0`)
   - `AccessOriginStageSchema` (stageId uuid)
   - `AccessOriginAdventureStartSchema` (no payload)
   - `AccessRequestSchema` (origin = discriminatedUnion + profileOverride optional)
   - `AccessResponseSchema` (status discriminant, voir Story 2.2 types)
   - Types TS inférés : `AccessRequest`, `AccessResponse`

2. **Given** l'endpoint `POST /pois/:id/access`, **When** je l'implémente dans `apps/api/src/pois/pois.controller.ts` (extension), **Then** :
   - Path : `POST /pois/:id/access`
   - Decorators : `@UseGuards(JwtAuthGuard, OwnerOnly, ThrottlerGuard)` + `@OwnedResource(checkPoiOwnership)` + `@Throttle({ default: { limit: 60, ttl: 60_000 } })` (Planning rate)
   - Body validé via DTO `AccessRequestDto` (class-validator + Zod alignment)
   - Inject `AccessCalculatorService`
   - Appel `accessCalculator.compute({ poiId, origin, profileOverride, mode: 'planning' })`
   - Retour brut (ResponseInterceptor wrap automatique)

3. **Given** une requête avec body invalide, **When** elle est rejetée, **Then** réponse `400` avec body `{ message, errors }` (format ValidationPipe global).

4. **Given** une requête sans JWT, **When** elle est rejetée, **Then** réponse `401`.

5. **Given** une requête où le POI n'appartient PAS à une aventure du user authentifié, **When** elle est rejetée par `OwnerOnly` guard (Story 1.4), **Then** réponse `403`.

6. **Given** une requête sur un POI inexistant, **When** `compute()` throw `NotFoundException`, **Then** réponse `404`.

7. **Given** un user dépasse 60 req/min sur cet endpoint, **When** le 61ème call arrive, **Then** réponse `429` avec header `Retry-After`.

8. **Given** une requête valide en Planning, **When** elle est traitée, **Then** :
   - Status 200
   - Body : `AccessResponseSchema` valide (status `'ok' | 'fallback'` selon résultat)
   - Si cache hit DB → `source: 'db-cache'`, latence < 200ms (vérifiable via timing local)
   - Si miss → `source: 'computed-fresh'`, latence < 500ms (cible)
   - Si BRouter down → `status: 'fallback'`, `fallbackReason: 'routing_failed'`, code HTTP 200 (PAS 503 — le fallback EST une donnée)

9. **Given** les tests E2E `apps/api/test/poi-access.e2e-spec.ts`, **When** je couvre les cas, **Then** :
   - Happy path planning (origin stage) → 200 ok
   - Body invalide → 400
   - Pas de JWT → 401
   - POI d'un autre user → 403
   - POI inexistant → 404
   - Rate limit (61ème call) → 429
   - BRouter mocké down → 200 fallback
   - Cache hit → 200 db-cache (pas d'appel BRouter dans les logs)
   - Tous les tests passent en CI avec BRouter mocké (fixtures GeoJSON)

10. **Given** la story terminée, **When** je commit, **Then** le diff inclut :
    - `packages/shared/src/schemas/poi-access.ts` (nouveau)
    - `packages/shared/src/index.ts` (modifié — export du nouveau schéma)
    - `apps/api/src/pois/pois.controller.ts` (modifié)
    - `apps/api/src/pois/dto/access-request.dto.ts` (nouveau — alignement Zod ↔ class-validator)
    - `apps/api/test/poi-access.e2e-spec.ts` (nouveau)
    - `apps/api/test/__fixtures__/brouter-mock-response.json` (nouveau si pas déjà créé en 2.1)
    - Éventuellement `apps/api/src/pois/access-calculator/ownership-check.ts` (helper de check ownership pour `@OwnedResource`)
    - Doc Sync si écart

---

## ⚠️ Critical Discovery Notes

### 1. Alignement Zod (shared) ↔ class-validator (NestJS DTO)

Le projet utilise **Zod en partage web↔api** (`packages/shared`) ET **class-validator** côté NestJS pour la `ValidationPipe` globale (cf. project-context §Validation).

Deux options :
- **A.** Définir UNIQUEMENT en class-validator côté NestJS, dupliquer en Zod côté shared → drift risque
- **B.** Définir en Zod dans `packages/shared`, créer un DTO class-validator qui WRAP le Zod check (via `@nestjs/zod` ou pipe custom) → source unique

Recommandation : **B** (source unique). Vérifier si `nestjs-zod` est déjà dans le projet :
```bash
grep nestjs-zod apps/api/package.json
```
Si oui : utiliser `createZodDto(AccessRequestSchema)`. Sinon : ajouter dep ou pipe custom.

### 2. Validation lat/lng arrondi 4 décimales

L'archi exige que les coordonnées GPS arrivent DÉJÀ arrondies (4 décimales = ~11m) côté serveur. Validation Zod :
```typescript
const RoundedCoord = z.number().refine(
  (n) => Number.isInteger(n * 10000),
  { message: 'Coordinate must be rounded to 4 decimals' }
)
AccessOriginGpsSchema: z.object({
  type: z.literal('gps'),
  lat: RoundedCoord.min(-90).max(90),
  lng: RoundedCoord.min(-180).max(180),
})
```

Note: en mode Planning, `origin: 'gps'` n'est JAMAIS utilisé (c'est pour Live, Story 3.1). Cette story ne le teste pas, mais le schéma le supporte déjà pour la story Live.

### 3. OwnerOnly check function

`OwnerOnly` guard (Story 1.4) attend une `OwnerCheckFn`. Pour cet endpoint :
```typescript
async function checkPoiOwnership(poiId: string, userId: string): Promise<boolean> {
  // POI appartient à un segment qui appartient à une aventure qui appartient au user
  const result = await db
    .select({ count: count() })
    .from(accommodationsCache)
    .innerJoin(adventureSegments, eq(adventureSegments.id, accommodationsCache.segmentId))
    .innerJoin(adventures, eq(adventures.id, adventureSegments.adventureId))
    .where(and(eq(accommodationsCache.id, poiId), eq(adventures.userId, userId)))
  return result[0].count > 0
}
```

→ Créer dans `apps/api/src/pois/access-calculator/ownership-check.ts` (ou colocaliser avec le controller).

### 4. ResponseInterceptor + AccessResponse

Le `ResponseInterceptor` global wrap automatiquement : `return data` → `{ data: ... }`. **Vérifier** que le client TanStack Query (Story 2.4) attend `response.data.data` pour récupérer l'AccessResponse. Sinon adapter le client.

---

## Tasks / Subtasks

- [x] **Task 1** — Créer le schéma Zod partagé (AC: 1, ⚠️Discovery #2)
  - [x] `packages/shared/src/schemas/poi-access.ts` avec tous les schemas + types inférés
  - [x] Exporter depuis `packages/shared/src/index.ts`
  - [x] Build le package : `pnpm --filter @ridenrest/shared build` → OK (le package est consommé depuis `./src/index.ts`, pas de dist à publier)

- [x] **Task 2** — Décider alignement Zod ↔ NestJS (⚠️Discovery #1)
  - [x] Vérifier présence de `nestjs-zod` → **ABSENT**
  - [x] Choix retenu (validé avec l'utilisateur) : **pipe custom** `ZodValidationPipe` (source unique = Zod, zéro dep ajoutée)
  - [x] `apps/api/src/common/pipes/zod-validation.pipe.ts` (générique) + `apps/api/src/pois/dto/access-request.dto.ts` (type inféré + instance du pipe)
  - [x] Documenté en Completion Notes + Doc Sync

- [x] **Task 3** — Créer le helper `checkPoiOwnership` (AC: 5, ⚠️Discovery #3)
  - [x] `apps/api/src/pois/access-calculator/ownership-check.ts` (SQL inline `db.execute`, cohérent avec AccessCalculatorService)
  - [x] Fonction qui lookup POI + segment + adventure + user
  - [x] Test unitaire : owner OK (true), non-owner KO (false), POI inexistant (false) — `ownership-check.spec.ts`

- [x] **Task 4** — Implémenter l'endpoint dans `PoisController` (AC: 2, 8)
  - [x] Ajouter méthode `@Post(':id/access')` + `@HttpCode(200)` + guards/decorators
  - [x] Body : `@Body(accessRequestValidationPipe) dto: AccessRequestDto`
  - [x] Path param : `@Param('id') poiId: string`
  - [x] `@CurrentUser()`
  - [x] Call `this.accessCalculator.compute({ poiId, origin: dto.origin, profileOverride: dto.profileOverride, mode: 'planning' })`
  - [x] Return raw (ResponseInterceptor wrap)

- [x] **Task 5** — Tests endpoint (AC: 9) — voir Doc Sync (test d'intégration controller plutôt qu'E2E DB-backed)
  - [x] `apps/api/src/pois/pois.controller.access.spec.ts` avec :
    - Pile HTTP réelle reconstituée (ValidationPipe, ResponseInterceptor, HttpExceptionFilter, ThrottlerGuard, OwnerOnlyGuard, pipe Zod)
    - `AccessCalculatorService` mocké (logique unit-testée en 2.2) ; `JwtAuthGuard` faux piloté par header ; `db.execute` mocké pour l'ownership
    - Tous les cas de l'AC #9 (200 ok / 400 / 401 / 403 / 404 / 429+Retry-After / 200 fallback / 200 db-cache)
  - [x] Run : `pnpm --filter @ridenrest/api test` → 334/334 green (dont 8 cas de cet endpoint). Tourne dans le job CI `test`.
  - [~] Latences cible (cache hit <200ms / miss <500ms) : **NON mesurées** dans cette story (pas d'E2E DB-backed — cf. Doc Sync) → à valider en QA manuelle / au déploiement.

- [x] **Task 6** — Doc Sync + commit (AC: 10)
  - [x] Écarts notés en Doc Sync ci-dessous
  - [ ] Commit : `feat(api): POST /pois/:id/access endpoint for planning mode — story poi-access-2.3` (à faire par l'utilisateur)

---

## Dev Notes

### Pattern projet — Response format

ResponseInterceptor wrap toutes les réponses : `{ data: <ton retour> }`. Le frontend extrait via `response.data.data` (ou via helper API client).

### Pattern projet — Throttler override per endpoint

`@nestjs/throttler` permet d'override la limite par endpoint :
```typescript
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Post(':id/access')
```

La limite globale (Story 1.4) reste 100 req/min — cet endpoint la baisse à 60 (Planning).

### Pattern projet — Test E2E

Pattern existant (cf. tests E2E des autres features) :
- DB de test isolée (docker-compose CI ou TestContainers)
- Migrations appliquées avant
- Seeds explicits par test (pas de shared state)
- Cleanup après chaque test

### Pattern projet — packages/shared exports

`packages/shared/src/index.ts` exporte tous les schemas/types. Pattern :
```typescript
export * from './schemas/poi-access'
export type { AccessRequest, AccessResponse } from './schemas/poi-access'
```

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-2.3]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#API-Communication-Patterns]
- [Source: _bmad-output/project-context.md#NestJS-Architecture-Rules]
- [Source: _bmad-output/project-context.md#Validation]
- [Source: _bmad-output/implementation-artifacts/poi-access-1-4-...md] — guards + throttler
- [Source: _bmad-output/implementation-artifacts/poi-access-2-2-...md] — AccessCalculatorService
- nestjs-zod : https://www.npmjs.com/package/nestjs-zod (si retenu)

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — workflow `bmad-dev-story`.

### Completion Notes List
- Alignement Zod↔NestJS : ☑ **pipe custom** (`ZodValidationPipe` générique). `nestjs-zod` absent ; choix validé avec l'utilisateur. Source UNIQUE de vérité = schéma Zod `packages/shared` ; le « DTO » n'est que le type inféré. Aucune dépendance ajoutée.
- Latence cache hit local mesurée : **N/A** — non mesurée (pas d'E2E DB-backed dans cette story, cf. Doc Sync). Cible <200ms à valider en QA/déploiement.
- Latence miss local mesurée : **N/A** — idem, cible <500ms à valider.
- Tests : `pnpm --filter @ridenrest/api test` → **334/334 green** (8 nouveaux cas endpoint + 3 ownership + 3 pipe). `pnpm --filter @ridenrest/shared test` → **31 green** (schéma Zod). Lint + `nest build` OK.

### Doc Sync — écarts vs spec story

1. **Format d'erreur 400 (AC #3)** : la spec décrivait `{ message, errors }`. Le `HttpExceptionFilter` global du projet impose `{ error: { code, message } }` pour TOUTES les erreurs (et ne propage que `.message`, pas `errors`). Le pipe construit bien `{ message:'Validation failed', errors:[...] }` mais le filtre global le réduit. Réponse réelle : `400 { error: { code: 'BAD_REQUEST', message: 'Validation failed' } }`. Tests alignés sur le format réel.

2. **Décorateurs guards (AC #2)** : la spec listait `@UseGuards(JwtAuthGuard, OwnerOnly, ThrottlerGuard)`. `JwtAuthGuard` et `ThrottlerGuard` sont déjà des `APP_GUARD` globaux. Ré-ajouter `ThrottlerGuard` à `@UseGuards` **doublerait le comptage** des requêtes. Implémenté : `@UseGuards(JwtAuthGuard, OwnerOnlyGuard)` + `@OwnedResource(checkPoiOwnership)` + `@Throttle({ default: { limit: 60, ttl: 60_000 } })` (le `@Throttle` override la limite sur le ThrottlerGuard global). Conforme au pattern existant (`@Get('google-details')`).

3. **404 vs 403 (AC #5/#6)** : `checkPoiOwnership` répond `false` aussi bien pour « pas le propriétaire » que pour « POI inexistant » (même requête jointe). Le `OwnerOnlyGuard` renvoie donc **403** avant que `compute()` puisse lever un 404 — pattern sécurité standard (ne pas divulguer l'existence d'une ressource). Un 404 réel ne survient que si le POI disparaît entre le check d'ownership et `compute()` (race), ou hors guard. Le test 404 couvre ce chemin (`compute()` lève `NotFoundException`).

4. **Stratégie de test (AC #9 / Task 5)** : la spec demandait un E2E DB-backed (`apps/api/test/poi-access.e2e-spec.ts`) « green en CI ». Or le CI projet n'exécute que `pnpm test` (Jest unitaire) **sans Postgres/Redis** et ne câble pas `test:e2e`. Choix validé avec l'utilisateur : **test d'intégration controller** (`src/pois/pois.controller.access.spec.ts`), qui reconstitue la pile HTTP réelle et couvre tous les cas AC #9, tout en tournant dans le job CI `test` existant. Fichier placé sous `src/` (rootDir Jest) au lieu de `test/`.

5. **Fixture BRouter (AC #10)** : non créée — le test mocke directement `AccessCalculatorService`, donc aucune fixture GeoJSON BRouter n'est nécessaire ici. Une fixture réelle existe déjà depuis la Story 2.1 (`apps/api/src/routing/__fixtures__/brouter-paris-versailles.geojson.json`).

### File List
- [x] `packages/shared/src/schemas/poi-access.ts` (nouveau)
- [x] `packages/shared/src/schemas/poi-access.test.ts` (nouveau — vitest)
- [x] `packages/shared/src/index.ts` (modifié — exports)
- [x] `apps/api/src/common/pipes/zod-validation.pipe.ts` (nouveau — pipe Zod générique)
- [x] `apps/api/src/common/pipes/zod-validation.pipe.spec.ts` (nouveau)
- [x] `apps/api/src/pois/dto/access-request.dto.ts` (nouveau — type inféré + instance pipe)
- [x] `apps/api/src/pois/pois.controller.ts` (modifié — endpoint + injection AccessCalculatorService)
- [x] `apps/api/src/pois/access-calculator/ownership-check.ts` (nouveau)
- [x] `apps/api/src/pois/access-calculator/ownership-check.spec.ts` (nouveau)
- [x] `apps/api/src/pois/pois.controller.access.spec.ts` (nouveau — test d'intégration AC #9)
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié — statut story)

### Change Log
- 2026-05-29 — Implémentation Story POI-Access 2.3 : endpoint `POST /pois/:id/access` (Planning). Schéma Zod partagé, `ZodValidationPipe` custom, helper `checkPoiOwnership`, endpoint guardé + throttlé (60/min), test d'intégration controller (8 cas AC #9, 334/334 API green). 5 écarts documentés en Doc Sync. Statut → review.

---

### Review Findings

_Code review adversariale (3 couches : Blind Hunter / Edge Case Hunter / Acceptance Auditor) — 2026-05-29. 2 decision-needed, 3 patch, 1 defer, 10 dismissed (dont 3 faux positifs réfutés par vérification : `accommodations_cache.id` est `text` → pas de 500 sur id malformé ; `db.execute` renvoie `{ rows }` (driver node-postgres) ; `compute()` ne renvoie jamais `status:'error'` → branche morte, pas de risque "erreur en HTTP 200")._

- [x] [Review][Decision→Dismissed] `AccessRequestSchema` non `.strict()` (clés inconnues silencieusement supprimées). **Résolu : garder le comportement permissif** — cohérent avec le `ValidationPipe` global du projet (whitelist sans `forbidNonWhitelisted`). Aucun changement de code.
- [x] [Review][Patch] AC #9 « cache hit → pas d'appel BRouter » non vérifié à la couche controller (service mocké). **Résolu (decision D2) : renforcé** — nouveau bloc `describe` dans `pois.controller.access.spec.ts` câblant le vrai `AccessCalculatorService` + espion `RoutingService` + db mockée en cache hit ; assertion `computeRoute` non appelé et `source === 'db-cache'` à travers la pile HTTP. [apps/api/src/pois/pois.controller.access.spec.ts]
- [x] [Review][Patch] Nom de test trompeur : `'accepts a profileOverride'` assertait `success: false` — renommé en `'rejects a non-BRouter profile label as profileOverride'` [packages/shared/src/schemas/poi-access.test.ts]
- [x] [Review][Patch] Bloc `describe('AccessOriginGpsSchema (rounded coords)')` appelait `AccessOriginSchema.safeParse` — désormais `AccessOriginGpsSchema.safeParse` (teste le sous-schéma GPS + ses bornes min/max en isolation) [packages/shared/src/schemas/poi-access.test.ts]
- [x] [Review][Patch] Schéma géométrie de réponse resserré : `Position` = `z.array(z.number()).min(2).max(3)`, `LineString.coordinates.min(2)`, `MultiLineString` lignes `.min(2)` (GeoJSON RFC 7946) [packages/shared/src/schemas/poi-access.ts]
- [x] [Review][Defer] Le test d'intégration ne reconstitue pas l'enregistrement `APP_GUARD` global du `JwtAuthGuard` (contournement ESM/`jose`), donc l'ordre prod des guards (JWT avant Throttler) n'est pas exercé [apps/api/src/pois/pois.controller.access.spec.ts:368-376] — deferred, tradeoff documenté
