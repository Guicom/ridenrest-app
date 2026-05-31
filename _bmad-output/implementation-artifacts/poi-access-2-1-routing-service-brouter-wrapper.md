# Story POI-Access 2.1 : Implémenter le `RoutingService` (wrapper BRouter + circuit breaker)

Status: done

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

- [x] **Task 1** — Trancher cockatiel vs maison (AC: 7, Discovery #1 audit)
  - [x] Estimer LOC + tests pour chaque option
  - [x] Décider et documenter en haut de `routing.service.ts`
  - [x] Si cockatiel : `pnpm --filter @ridenrest/api add cockatiel`

- [x] **Task 2** — Créer la structure du module (AC: 1)
  - [x] `apps/api/src/routing/routing.module.ts` avec `imports: [HttpModule, ConfigModule]`, `providers: [RoutingService]`, `exports: [RoutingService]`
  - [x] Enregistrer `RoutingModule` dans `app.module.ts`

- [x] **Task 3** — Définir les types (AC: 2, 3)
  - [x] `routing.types.ts` :
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

- [x] **Task 4** — Créer `BrouterUnavailableException` (AC: 5)
  - [x] `brouter-unavailable.exception.ts` :
    ```typescript
    export type BrouterFailureReason = 'timeout' | 'network' | 'http_error' | 'parse_error' | 'circuit_open'
    export class BrouterUnavailableException extends HttpException {
      constructor(public readonly reason: BrouterFailureReason, public readonly detail?: string) {
        super({ message: `BRouter unavailable: ${reason}`, reason, detail }, HttpStatus.SERVICE_UNAVAILABLE)
      }
    }
    ```

- [x] **Task 5** — Implémenter `RoutingService.computeRoute` (AC: 2, 3)
  - [x] Inject `HttpService` + `ConfigType<typeof accessConfig>`
  - [x] Construire URL + query params depuis params
  - [x] Appel via `firstValueFrom(this.httpService.get(url, { timeout: ... }))`
  - [x] Parser la réponse : distance via `parseFloat(properties['track-length'])`, gain via `parseFloat(properties['filtered ascend'])`, loss calculé via delta points 3D
  - [x] Retourner `BrouterRoute`

- [x] **Task 6** — Implémenter circuit breaker (AC: 4, 5)
  - [x] Si maison : state machine `'closed' | 'open' | 'half-open'`, compteur fenêtre 60s
  - [x] Wrap l'appel HTTP dans le circuit breaker
  - [x] Émettre les `BrouterUnavailableException` avec bon reason
  - [x] Logger WARN structuré pour chaque échec

- [x] **Task 7** — Tests unitaires (AC: 6)
  - [x] Créer fixture `__fixtures__/brouter-paris-versailles.geojson.json` (capturer une vraie réponse BRouter en local — `curl ... > fixture.json`)
  - [x] Tests Jest avec `HttpService` mocké (via `@nestjs/testing`) :
    - Happy path → distance/elevation correctes
    - 500 → exception avec reason
    - Timeout → exception
    - 5 fails consécutifs → 6ème = circuit_open
    - Half-open après 30s (utiliser `jest.useFakeTimers()`)
  - [x] `pnpm --filter @ridenrest/api test routing` → green, coverage ≥ 90%

- [x] **Task 8** — Doc Sync + commit (AC: 8)
  - [x] Si décision cockatiel/maison diverge de l'archi → mettre à jour
  - [x] Commit : `feat(api): add RoutingService wrapper for BRouter with circuit breaker — story poi-access-2.1`

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
claude-opus-4-8 (1M context) — BMad dev-story workflow

### Completion Notes List
- **Circuit breaker impl : ☑ maison** (vs cockatiel). State machine `closed | open | half-open` + fenêtre glissante d'échecs (~60 lignes dans `routing.service.ts`). Aucune nouvelle dépendance. Décision documentée en tête de `routing.service.ts` + dans `docs/ops/access-routing-prereq-audit.md`. Paramètres : 5 échecs / 60 s → open 30 s → half-open (1 requête test) → succès=fermeture, échec=ré-ouverture.
- **Déviation client HTTP : `fetch` natif** au lieu de `@nestjs/axios`/`HttpModule` (story spec). Raison : tout le projet (weather/strava/geo) utilise `fetch` natif, zéro `axios` dans le repo. Décision validée par Guillaume au démarrage. Timeout via `AbortController` + `brouterTimeoutMs`. Impact : `RoutingModule` n'importe pas `HttpModule` ; `access.config` injecté via `accessConfig.KEY` (déjà global) ; tests mockent `global.fetch`. **`apps/api/package.json` inchangé** (aucune dep ajoutée). Déviation tracée dans l'audit doc (Doc Sync Rule).
- **Coverage tests `routing.service.ts` : `97.5%` lignes** (90.9% funcs, 81.25% branches) — cible ≥ 90% atteinte. 10 tests : happy path (fixture), http_error (500), timeout (AbortError), network, parse_error (×2 : body malformé + json() qui throw), circuit_open (6e appel après 5 échecs), half-open recovery (succès → fermeture) + half-open échec → ré-ouverture.
- **Fixture BRouter** : `__fixtures__/brouter-paris-versailles.geojson.json` construite à la main selon le schéma GeoJSON réel de BRouter 1.7.9 (BRouter prod = loopback-only sur le VPS → non joignable depuis le dev local pour un `curl` de capture). Valeurs déterministes : `track-length=21034` → distanceM 21034 ; `filtered ascend=125` → elevationGainM 125 ; 10 points 3D dont les deltas négatifs cumulés donnent elevationLossM 40.
- Validations : `tsc --noEmit` OK ; `eslint src/routing` clean ; suite API complète **298/298 tests** verts (aucune régression).

### File List
- `apps/api/src/routing/routing.module.ts` (nouveau)
- `apps/api/src/routing/routing.service.ts` (nouveau)
- `apps/api/src/routing/routing.types.ts` (nouveau)
- `apps/api/src/routing/brouter-unavailable.exception.ts` (nouveau)
- `apps/api/src/routing/routing.service.spec.ts` (nouveau)
- `apps/api/src/routing/__fixtures__/brouter-paris-versailles.geojson.json` (nouveau — fixture test)
- `apps/api/src/app.module.ts` (modifié — import + enregistrement `RoutingModule`)
- `docs/ops/access-routing-prereq-audit.md` (modifié — décisions circuit breaker maison + client HTTP fetch, Doc Sync)
- _`apps/api/package.json` : NON modifié (décision maison + fetch → aucune dépendance ajoutée)_

### Change Log
| Date | Changement |
|---|---|
| 2026-05-28 | Implémentation `RoutingService` (wrapper BRouter + circuit breaker maison). Déviation validée : `fetch` natif au lieu de `@nestjs/axios`. Coverage 97.5% sur `routing.service.ts`, 298/298 tests API verts. Status → review. |

---

### Review Findings

_Code review du 2026-05-28 — 3 couches adversariales (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 5 dismissed, 3 decision_needed, 5 patch, 3 defer._

#### À décider

- [ ] [Review][Decision] **D1 — Fixture synthétique vs réelle** — AC #6 spécifie "fixture GeoJSON BRouter réelle (Paris→Versailles)". La fixture est construite à la main d'après le schéma BRouter 1.7.9 (BRouter prod = loopback VPS, non joignable en dev local). Risque : si les noms de propriétés réels diffèrent (`track-length`, `filtered ascend`), les tests passeront mais le parsing échouera en prod. Décision : capturer une vraie réponse via SSH+curl sur le VPS, ou accepter la fixture synthétique en l'état.
- [x] [Review][Defer] **D2 — Half-open sans verrou de sonde unique** [`routing.service.ts` ~L117] — différé : Option 1 (sonde unique) pénaliserait les users concurrents lors de la recovery (ils recevraient fallback alors que BRouter est UP). Option 2 (actuel) est meilleure pour l'UX. BRouter est loopback → pas de risque de surcharge upstream.
- [x] [Review][Defer] **D3 — `onSuccess()` remet à zéro toute la fenêtre d'échecs** [`routing.service.ts` ~L131] — différé : comportement `forgive-on-success` conservé intentionnellement. BRouter flapping rare ; alternance partielle préférable au mode dégradé forcé si BRouter fonctionne encore partiellement.

#### À corriger

- [x] [Review][Patch] **P1 — `circuit_open` log émet `durationMs: 0` hardcodé** — `assertCircuitClosed` ne reçoit pas `startedAt`, donc émet `durationMs: 0` dans le warn structuré. Fix : passer `startedAt` en paramètre ou appeler `Date.now()` localement. [`routing.service.ts` ~L122]
- [x] [Review][Patch] **P2 — Précision incohérente entre `elevationGainM` et `elevationLossM`** — `elevationGainM` est un float brut (`parseFloat`), `elevationLossM` est arrondi (`Math.round`). Fix : appliquer `Math.round` aux deux. [`routing.service.ts` ~L133]
- [x] [Review][Patch] **P3 — Coordonnées 2D castées silencieusement en `LonLatEle[]` sans validation** — Si BRouter renvoie une géométrie 2D ou un type non-LineString, le cast `as LonLatEle[]` passe silencieusement ; `computeElevationLoss` renvoie 0 (guard `typeof prev === 'number'` fonctionne mais la corruption TypeScript est invisible). Fix : valider `feature.geometry?.type === 'LineString'` avant le cast. [`routing.service.ts` ~L90–112]
- [x] [Review][Patch] **P4 — Branche `elevationGainM = 0` (NaN fallback) non testée** — Le cas `filtered ascend` absent ou non numérique n'a pas de test dédié. Fix : ajouter un test avec `properties` sans `filtered ascend`. [`routing.service.spec.ts`]
- [x] [Review][Patch] **P5 — `onSuccess()` peut fermer un circuit ré-ouvert par un appel concurrent** — En half-open, si deux appels sont in-flight et que le premier échoue (→ `openCircuit()`) puis le second réussit (→ `onSuccess()` → `state='closed'`), le circuit est fermé alors qu'une sonde vient d'échouer. Fix : `if (this.circuitState !== 'open') { this.circuitState = 'closed'; ... }` dans `onSuccess()`. [`routing.service.ts` ~L131]

#### Différés

- [x] [Review][Defer] **R1 — `profile` non URL-encodé dans `buildUrl`** [`routing.service.ts` ~L83] — différé : union type `BrouterProfile` = valeurs URL-safe uniquement ; pas de risque d'injection en pratique
- [x] [Review][Defer] **R2 — `brouterTimeoutMs` sans borne max dans Zod schema** [`access.config.ts`] — différé : concern config/ops, hors périmètre story
- [x] [Review][Defer] **R3 — Coordonnées `NaN`/`Infinity` produiraient une URL invalide** [`routing.service.ts` ~L80–84] — différé : coordonnées toujours issues du GPS, pas d'input utilisateur
