# Story POI-Access 2.3 : Endpoint `POST /pois/:id/access` (mode Planning)

Status: ready-for-dev

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

- [ ] **Task 1** — Créer le schéma Zod partagé (AC: 1, ⚠️Discovery #2)
  - [ ] `packages/shared/src/schemas/poi-access.ts` avec tous les schemas + types inférés
  - [ ] Exporter depuis `packages/shared/src/index.ts`
  - [ ] Build le package : `pnpm --filter @ridenrest/shared build` → vérifier que les types sont publiés

- [ ] **Task 2** — Décider alignement Zod ↔ NestJS (⚠️Discovery #1)
  - [ ] Vérifier présence de `nestjs-zod`
  - [ ] Si présent : créer `apps/api/src/pois/dto/access-request.dto.ts` via `createZodDto(AccessRequestSchema)`
  - [ ] Si absent : créer un pipe custom `ZodValidationPipe` minimal OU définir un DTO class-validator parallèle (drift risk documenté)
  - [ ] Documenter le choix dans le commit message

- [ ] **Task 3** — Créer le helper `checkPoiOwnership` (AC: 5, ⚠️Discovery #3)
  - [ ] `apps/api/src/pois/access-calculator/ownership-check.ts`
  - [ ] Fonction qui lookup POI + adventure + user via Drizzle
  - [ ] Test unitaire : owner OK (true), non-owner KO (false), POI inexistant (false)

- [ ] **Task 4** — Implémenter l'endpoint dans `PoisController` (AC: 2, 8)
  - [ ] Ajouter méthode `@Post(':id/access')` avec guards/decorators (cf. AC #2)
  - [ ] Body : `@Body() dto: AccessRequestDto`
  - [ ] Path param : `@Param('id') poiId: string`
  - [ ] `@CurrentUser() user`
  - [ ] Call `this.accessCalculator.compute({ poiId, origin: dto.origin, profileOverride: dto.profileOverride, mode: 'planning' })`
  - [ ] Return raw (ResponseInterceptor wrap)

- [ ] **Task 5** — Tests E2E (AC: 9)
  - [ ] `apps/api/test/poi-access.e2e-spec.ts` avec :
    - Setup : Test DB seeded avec user, aventure, segment, POI
    - Mock `RoutingService.computeRoute` (via test module override)
    - Tous les cas de l'AC #9
  - [ ] Run : `pnpm --filter @ridenrest/api test:e2e poi-access` → tous green
  - [ ] Vérifier que les latences cible (cache hit < 200ms local) sont approximativement respectées

- [ ] **Task 6** — Doc Sync + commit (AC: 10)
  - [ ] Si choix Zod↔NestJS diverge de l'archi → noter
  - [ ] Commit : `feat(api): POST /pois/:id/access endpoint for planning mode — story poi-access-2.3`

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
_(À renseigner)_

### Completion Notes List
- Alignement Zod↔NestJS : ☐ nestjs-zod / ☐ pipe custom / ☐ DTO parallèle (drift accepté)
- Latence cache hit local mesurée : `___` ms
- Latence miss local mesurée : `___` ms

### File List
- [ ] `packages/shared/src/schemas/poi-access.ts`
- [ ] `packages/shared/src/index.ts` (modifié)
- [ ] `apps/api/src/pois/dto/access-request.dto.ts`
- [ ] `apps/api/src/pois/pois.controller.ts` (modifié)
- [ ] `apps/api/src/pois/access-calculator/ownership-check.ts`
- [ ] `apps/api/src/pois/access-calculator/ownership-check.spec.ts`
- [ ] `apps/api/test/poi-access.e2e-spec.ts`
- [ ] `apps/api/test/__fixtures__/brouter-mock-response.json`
