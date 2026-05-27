# Story POI-Access 2.1 : Implémenter le `RoutingService` (wrapper BRouter + circuit breaker)

Status: ready-for-dev

<!-- Dépend de : 1.1 (Docker BRouter), 1.4 (env vars + access.config). Indépendante de 1.2, 1.3, 1.5. -->

## Story

As a **backend developer**,
I want to encapsulate all communication with the BRouter HTTP API in a dedicated NestJS service with timeout, retry and circuit breaker logic,
So that the rest of the codebase can call BRouter via a stable, resilient interface that gracefully degrades on failure.

## Acceptance Criteria

1. **Given** le module `RoutingModule` à créer, **When** je crée `apps/api/src/routing/routing.module.ts`, **Then** il importe `HttpModule` (`@nestjs/axios`) et `ConfigModule` (pour `access.config.ts`), expose `RoutingService` comme provider et export.

2. **Given** `routing.service.ts`, **When** je crée la méthode `computeRoute({ from, to, profile })`, **Then** :
   - Signature : `computeRoute(params: { from: [number, number]; to: [number, number]; profile: 'fastbike' | 'trekking' | 'safety' }): Promise<BrouterRoute>`
   - Les coordonnées sont au format `[lon, lat]` (GeoJSON), **typage strict pour empêcher l'inversion accidentelle** (cf. archi §Enforcement Guidelines règle #1)
   - URL appelée : `${access.brouterBaseUrl}/brouter?lonlats={lon1},{lat1}|{lon2},{lat2}&profile={profile}&alternativeidx=0&format=geojson`
   - Timeout : `access.brouterTimeoutMs` (5000ms par défaut)
   - Retourne un objet `BrouterRoute` typé (interface dans `routing.types.ts`)

3. **Given** la réponse BRouter valide, **When** elle est parsée, **Then** :
   - `BrouterRoute` contient : `geometry: { type: 'LineString', coordinates: [lon, lat, ele][] }`, `distanceM: number`, `elevationGainM: number`, `elevationLossM: number`
   - La distance vient de `features[0].properties['track-length']` (string → parseFloat)
   - L'élévation gain vient de `features[0].properties['filtered ascend']` (string → parseFloat)
   - L'élévation loss est calculée depuis les points 3D du LineString (delta négatif cumulé)

4. **Given** BRouter répond avec erreur (HTTP 4xx/5xx) ou timeout, **When** le service détecte 5 échecs consécutifs dans une fenêtre glissante de 60s, **Then** :
   - Un circuit breaker s'ouvre pour 30 secondes
   - Toute nouvelle requête `computeRoute` lève immédiatement `BrouterUnavailableException` sans atteindre BRouter
   - Après 30s, le circuit passe en half-open et tente une requête de test
   - Si la test request réussit → circuit fermé (back to normal). Sinon → re-open 30s

5. **Given** une requête timeout (>5s) OU une exception réseau, **When** elle se produit, **Then** :
   - Le service lève `BrouterUnavailableException` avec un motif typé (`'timeout' | 'network' | 'http_error' | 'parse_error' | 'circuit_open'`)
   - Un log structuré WARN est émis avec `profile`, `durationMs`, `reason`, `engineVersion` (depuis access.config)

6. **Given** un test unitaire `routing.service.spec.ts`, **When** je couvre les cas, **Then** :
   - Happy path : fixture GeoJSON BRouter réelle (Paris→Versailles) → parsing correct distance/elevation
   - HTTP 500 mocké → `BrouterUnavailableException` avec reason `'http_error'`
   - Timeout simulé → reason `'timeout'`
   - 5 échecs consécutifs → 6ème call : `circuit_open` (pas d'appel HTTP réel observable via mock)
   - Half-open recovery : après 30s mock timer, circuit re-tente
   - **Coverage cible** : ≥ 90% lignes sur `routing.service.ts`

7. **Given** la décision d'implémentation circuit breaker (cf. epics Story 2.1 mentionnait "cockatiel vs maison"), **When** je tranche, **Then** :
   - Décision documentée en commentaire de tête de `routing.service.ts` + dans `docs/ops/access-routing-prereq-audit.md`
   - Si `cockatiel` retenu : ajout dep + setup `Policy.handleAll().circuitBreaker(...)`
   - Si maison retenu : compteur de fenêtre glissante + état `open|half-open|closed` (~50 lignes)
   - Recommandation : **maison** pour réduire deps et garder le contrôle ; `cockatiel` si l'équipe préfère une lib battle-tested

8. **Given** la story terminée, **When** je commit, **Then** le diff inclut UNIQUEMENT :
   - `apps/api/src/routing/routing.module.ts` (nouveau)
   - `apps/api/src/routing/routing.service.ts` (nouveau)
   - `apps/api/src/routing/routing.types.ts` (nouveau)
   - `apps/api/src/routing/brouter-unavailable.exception.ts` (nouveau)
   - `apps/api/src/routing/routing.service.spec.ts` (nouveau)
   - `apps/api/src/routing/__fixtures__/brouter-paris-versailles.geojson.json` (nouveau — fixture test)
   - `apps/api/src/app.module.ts` (modifié — import `RoutingModule`)
   - Si `cockatiel` retenu : `apps/api/package.json` + lock
   - Doc Sync si écart vs architecture

---

## ⚠️ Critical Discovery Notes

### 1. Profile mapping projet vs BRouter

L'archi définit un mapping label UI ↔ profil BRouter :
| Label projet | Profil BRouter |
|---|---|
| Route | `fastbike` |
| Gravel (default) | `trekking` |
| Bikepacking | `safety` |

→ `RoutingService` accepte les **profils BRouter** (`fastbike`, `trekking`, `safety`), pas les labels projet. Le mapping label→profil est fait **en amont** dans `AccessCalculatorService` (Story 2.2). Cohérence avec le principe "RoutingService = wrapper bas niveau".

### 2. BROUTER_BASE_URL : déjà clarifié par Story 1.1

Cf. Story 1.1 Discovery #2 : la valeur correcte est `http://localhost:17777` (PM2 hôte) — pas `http://brouter:17777`. Cette story utilise `config.get('access.brouterBaseUrl')` qui lit la valeur correcte du `.env`.

### 3. ResponseInterceptor + Exception handling

L'application a un `ResponseInterceptor` global et un `HttpExceptionFilter`. `BrouterUnavailableException` doit étendre `HttpException` (status 503 par défaut) pour être correctement loggé/filtré par la stack. **MAIS** dans `AccessCalculatorService` (Story 2.2), on **catch** cette exception et on retourne `{ status: 'fallback' }` — donc l'exception ne remontera pas au client en pratique. Le 503 sert seulement de fallback ultime si AccessCalculator n'est pas dans la chaîne.

---

## Tasks / Subtasks

- [ ] **Task 1** — Trancher cockatiel vs maison (AC: 7, Discovery #1 audit)
  - [ ] Estimer LOC + tests pour chaque option
  - [ ] Décider et documenter en haut de `routing.service.ts`
  - [ ] Si cockatiel : `pnpm --filter @ridenrest/api add cockatiel`

- [ ] **Task 2** — Créer la structure du module (AC: 1)
  - [ ] `apps/api/src/routing/routing.module.ts` avec `imports: [HttpModule, ConfigModule]`, `providers: [RoutingService]`, `exports: [RoutingService]`
  - [ ] Enregistrer `RoutingModule` dans `app.module.ts`

- [ ] **Task 3** — Définir les types (AC: 2, 3)
  - [ ] `routing.types.ts` :
    ```typescript
    export type BrouterProfile = 'fastbike' | 'trekking' | 'safety'
    export interface BrouterRoute {
      geometry: { type: 'LineString'; coordinates: Array<[number, number, number]> }
      distanceM: number
      elevationGainM: number
      elevationLossM: number
    }
    export interface ComputeRouteParams {
      from: readonly [number, number]  // [lon, lat]
      to: readonly [number, number]
      profile: BrouterProfile
    }
    ```

- [ ] **Task 4** — Créer `BrouterUnavailableException` (AC: 5)
  - [ ] `brouter-unavailable.exception.ts` :
    ```typescript
    export type BrouterFailureReason = 'timeout' | 'network' | 'http_error' | 'parse_error' | 'circuit_open'
    export class BrouterUnavailableException extends HttpException {
      constructor(public readonly reason: BrouterFailureReason, public readonly detail?: string) {
        super({ message: `BRouter unavailable: ${reason}`, reason, detail }, HttpStatus.SERVICE_UNAVAILABLE)
      }
    }
    ```

- [ ] **Task 5** — Implémenter `RoutingService.computeRoute` (AC: 2, 3)
  - [ ] Inject `HttpService` + `ConfigType<typeof accessConfig>`
  - [ ] Construire URL + query params depuis params
  - [ ] Appel via `firstValueFrom(this.httpService.get(url, { timeout: ... }))`
  - [ ] Parser la réponse : distance via `parseFloat(properties['track-length'])`, gain via `parseFloat(properties['filtered ascend'])`, loss calculé via delta points 3D
  - [ ] Retourner `BrouterRoute`

- [ ] **Task 6** — Implémenter circuit breaker (AC: 4, 5)
  - [ ] Si maison : state machine `'closed' | 'open' | 'half-open'`, compteur fenêtre 60s
  - [ ] Wrap l'appel HTTP dans le circuit breaker
  - [ ] Émettre les `BrouterUnavailableException` avec bon reason
  - [ ] Logger WARN structuré pour chaque échec

- [ ] **Task 7** — Tests unitaires (AC: 6)
  - [ ] Créer fixture `__fixtures__/brouter-paris-versailles.geojson.json` (capturer une vraie réponse BRouter en local — `curl ... > fixture.json`)
  - [ ] Tests Jest avec `HttpService` mocké (via `@nestjs/testing`) :
    - Happy path → distance/elevation correctes
    - 500 → exception avec reason
    - Timeout → exception
    - 5 fails consécutifs → 6ème = circuit_open
    - Half-open après 30s (utiliser `jest.useFakeTimers()`)
  - [ ] `pnpm --filter @ridenrest/api test routing` → green, coverage ≥ 90%

- [ ] **Task 8** — Doc Sync + commit (AC: 8)
  - [ ] Si décision cockatiel/maison diverge de l'archi → mettre à jour
  - [ ] Commit : `feat(api): add RoutingService wrapper for BRouter with circuit breaker — story poi-access-2.1`

---

## Dev Notes

### Pattern projet — @nestjs/axios

`HttpService` retourne des `Observable<AxiosResponse<T>>`. Pattern attendu :
```typescript
const response = await firstValueFrom(
  this.httpService.get<unknown>(url, { timeout: 5000 })
)
const data = response.data
```

### Pattern projet — Services + config

Pattern existant (cf. project-context §Configuration NestJS) :
```typescript
constructor(
  private readonly httpService: HttpService,
  @Inject(accessConfig.KEY) private readonly config: ConfigType<typeof accessConfig>,
) {}
```

### Pattern logs structurés

Utiliser le logger par défaut NestJS avec format JSON si configuré :
```typescript
private readonly logger = new Logger(RoutingService.name)
// ...
this.logger.warn({ profile, durationMs, reason, engineVersion: this.config.engineVersion })
```

### Coordonnées `[lon, lat]` — typage strict

Pour empêcher l'inversion accidentelle :
```typescript
type LonLat = readonly [number, number]  // exposé via brand type idéalement
// Au lieu de just `[number, number]`
```

Cohérence avec règle archi #1 : `[lon, lat]` partout (GeoJSON), jamais `[lat, lon]`.

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-2.1] — AC originaux
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Communication-NestJS-BRouter] — pattern
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Enforcement-Guidelines] — règles AI agents
- [Source: _bmad-output/implementation-artifacts/poi-access-1-1-...md] — BROUTER_BASE_URL setup
- [Source: _bmad-output/implementation-artifacts/poi-access-1-4-...md] — access.config + ConfigService pattern
- BRouter HTTP API : https://github.com/abrensch/brouter/blob/master/docs/users/api.md
- @nestjs/axios : https://docs.nestjs.com/techniques/http-module
- cockatiel : https://www.npmjs.com/package/cockatiel (si retenu)

---

## Dev Agent Record

### Agent Model Used
_(À renseigner)_

### Completion Notes List
- Circuit breaker impl : ☐ cockatiel / ☐ maison
- Coverage tests : `___%`
- Fixture BRouter capturée depuis : `___` (URL + paramètres)

### File List
- [ ] `apps/api/src/routing/routing.module.ts` (nouveau)
- [ ] `apps/api/src/routing/routing.service.ts` (nouveau)
- [ ] `apps/api/src/routing/routing.types.ts` (nouveau)
- [ ] `apps/api/src/routing/brouter-unavailable.exception.ts` (nouveau)
- [ ] `apps/api/src/routing/routing.service.spec.ts` (nouveau)
- [ ] `apps/api/src/routing/__fixtures__/brouter-paris-versailles.geojson.json` (nouveau)
- [ ] `apps/api/src/app.module.ts` (modifié)
- [ ] `apps/api/package.json` + lock (modifié si cockatiel)
