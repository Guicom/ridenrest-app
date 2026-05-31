---
baseline_commit: 59abd8a8ff344204beac86a11c191e799876653f
---

# Story POI-Access 3.1 : Extension endpoint pour mode Live (origin GPS + cache Redis anonyme)

Status: superseded
<!-- 2026-05-30 : implémentation RETIRÉE. Le mode Live utilise désormais l'origine `nearest-trace`
     (comme le Planning), pas la position GPS → plus d'origin GPS, plus de consent gate, plus de
     cache Redis anonyme, plus de rate limit conditionnel. Cf. Change Log + Completion Notes. -->


<!-- Dépend de : 2.2 (AccessCalculator), 2.3 (endpoint Planning créé), 1.4 (throttler). Indépendante de 3.2, 3.3. -->

## Story

As a **backend developer**,
I want to extend the `POST /pois/:id/access` endpoint to support the Live mode (origin GPS) with an anonymous Redis cache and a consent gate,
So that the Live UX can call the same endpoint without leaking PII.

## Acceptance Criteria

1. **Given** une requête avec `origin.type === 'gps'` et `{ lat, lng }` arrondis 4 décimales, **When** le controller la reçoit, **Then** :
   - La validation Zod accepte les coordonnées si elles passent `Number.isInteger(n * 10000)` (déjà couvert par schéma Story 2.3 §Discovery #2)
   - Si lat/lng non-arrondis → rejet 400 avec message clair

2. **Given** un user authentifié, **When** une requête `origin.type === 'gps'` arrive, **Then** :
   - Le controller récupère `profile.live_access_consent` depuis la DB pour `req.user.id`
   - Si `consent !== true` (false OU null) → retourne `{ status: 'fallback', fallbackReason: 'no_consent', fallbackDistanceM: <dist_from_trace_m existant>, source: 'computed-fresh' }` sans appeler BRouter
   - Si `consent === true` → poursuit le flow de calcul

3. **Given** le calcul Live est autorisé, **When** `AccessCalculatorService.compute({ mode: 'live', origin: gps })` est appelé, **Then** :
   - La clé Redis utilisée est `access:live:{poiId}:{profile}:{lat}:{lng}` — **jamais `userId`** dans la clé (anonymisation, NFR-PA-006)
   - Le TTL est `ACCESS_CACHE_TTL_LIVE_SECONDS` (900s = 15 min par défaut) depuis config
   - Si cache hit Redis → réponse `{ status: 'ok', ..., source: 'redis-cache' }` sans appel BRouter
   - Si cache miss → calcul BRouter + ST_Difference → SET Redis avec TTL + réponse `{ ..., source: 'computed-fresh' }`

4. **Given** une requête Live, **When** le rate limit est appliqué, **Then** :
   - Limite : 120 req/min/user (Live, plus permissif que Planning 60)
   - **Implémentation** : décorateur `@Throttle({ default: { limit: 120, ttl: 60_000 } })` OU logique conditionnelle dans le controller selon `origin.type` (cf. ⚠️Discovery #1)
   - Réponse 429 avec `Retry-After` au dépassement

5. **Given** le `AccessCalculatorService` étendu, **When** il traite `mode: 'live'` :
   - Pour la stratégie d'origine : `origin.type === 'gps'` → retourne `[origin.lng, origin.lat]` (déjà couvert Story 2.2)
   - Pour le cache : utilise Redis (pas DB) — la table `accommodations_cache` reste pour le mode Planning UNIQUEMENT
   - Si BRouter fail : fallback `{ status: 'fallback', fallbackReason: 'routing_failed', fallbackDistanceM, source: 'computed-fresh' }`
   - **Aucun stockage durable** de la position GPS côté serveur (ni log, ni DB, ni autre cache)

6. **Given** un user existant avec cache Redis actif, **When** il révoque le consent (Story 3.2 ou 4.2), **Then** :
   - Les entrées Redis `access:live:*` ne sont PAS automatiquement purgées (best-effort dans Story 4.2)
   - Mais elles **expirent naturellement en 15 min** → impact transitoire acceptable
   - Aucune fuite de PII puisque les clés sont anonymes

7. **Given** les tests E2E `apps/api/test/poi-access-live.e2e-spec.ts`, **When** je les écris, **Then** :
   - `origin: gps` + consent=true → 200 ok
   - `origin: gps` + consent=false → 200 fallback no_consent
   - `origin: gps` + consent=null → 200 fallback no_consent
   - `origin: gps` + cache hit Redis → 200 ok with source: 'redis-cache'
   - `origin: gps` + lat=48.85 (3 décimales seulement) → 400 (validation Zod)
   - `origin: gps` + lat=48.8500 (correctement formaté) → OK
   - Rate limit Live à 121 req/min → 429
   - Tous les tests passent en CI avec BRouter mocké et Redis testé en réel (TestContainers ou docker-compose CI)

8. **Given** la story terminée, **When** je commit, **Then** le diff inclut :
   - `apps/api/src/pois/access-calculator/access-calculator.service.ts` (modifié — gère mode 'live')
   - `apps/api/src/pois/access-calculator/access-calculator.service.spec.ts` (modifié — ajout tests Live)
   - `apps/api/src/pois/access-calculator/strategies/redis-cache.ts` (nouveau — wrapper Redis ioredis)
   - `apps/api/src/pois/access-calculator/strategies/redis-cache.spec.ts` (nouveau)
   - `apps/api/src/pois/pois.controller.ts` (modifié — gestion rate limit Live + lookup consent)
   - `apps/api/src/pois/access-calculator/profile-lookup.ts` (nouveau — helper lookup consent du user)
   - `apps/api/test/poi-access-live.e2e-spec.ts` (nouveau)
   - Doc Sync si écart

---

## ⚠️ Critical Discovery Notes

### 1. Rate limit conditionnel — Planning 60 vs Live 120

`@Throttle` est par endpoint, pas par body. Deux approches :
- **A.** Un seul endpoint avec rate limit fixe au max (120) → Planning peut abuser
- **B.** Un seul endpoint avec un guard custom qui inspecte le body → applique 60 si stage/adventure-start, 120 si gps
- **C.** Deux endpoints séparés : `POST /pois/:id/access/planning` (60) et `POST /pois/:id/access/live` (120) → cassse la simplicité de l'API

Recommandation : **B** (custom guard ou logique inline dans controller). Documenter la décision dans le code.

### 2. Lookup consent — performance

Le lookup `profile.live_access_consent` ajoute 1 query DB par requête Live. Optimisations possibles :
- **Cache profile dans Redis** (TTL 5 min) — overkill pour MVP
- **Cache dans le JWT** — risque sécurité (révocation non immédiate)
- **MVP** : 1 query DB simple, indexé sur `user_id` (PK). ~5ms, acceptable.

### 3. Redis client — pattern existant

Le projet utilise probablement `ioredis` (pour BullMQ). Vérifier :
```bash
grep ioredis apps/api/package.json
```
Si oui : injecter via `@InjectRedis()` du package `@nestjs-modules/ioredis` ou via un provider custom. Réutiliser le pattern existant.

### 4. AccessOriginGps validation déjà en place

Story 2.3 a déjà créé le schéma Zod `AccessOriginGpsSchema` avec la validation arrondi 4 décimales. Cette story réutilise tel quel — pas de modification du schéma.

### 5. Pas d'index sur `profile.live_access_consent`

Pas besoin d'index — le lookup se fait sur `user_id` (PK). La colonne `live_access_consent` est uniquement lue/écrite par user, jamais filtrée.

---

## Tasks / Subtasks

- [x] **Task 1** — Décider stratégie rate limit (AC: 4, ⚠️Discovery #1)
  - [x] Évaluer les 3 options
  - [x] Décider et documenter en commentaire de tête du controller → **Option B** retenue
  - [x] Implémenter via guard custom (`AccessThrottlerGuard`) — bump 60→120 si `origin.type === 'gps'`

- [x] **Task 2** — Créer `redis-cache.ts` wrapper (AC: 3, ⚠️Discovery #3)
  - [x] Identifier le pattern d'injection Redis existant → `RedisProvider.getClient()` (ioredis), pattern `pois.service`
  - [x] Wrapper : `getCachedAccess(redis, key)`, `setCachedAccess(redis, key, metrics, ttlSec)`
  - [x] Clé builder : `buildAccessLiveKey({ poiId, profile, lat, lng }) → 'access:live:...'`
  - [x] Test unitaire (fake Redis en mémoire — `ioredis-mock` non installé, fake `{get,setex}` jest)

- [x] **Task 3** — Créer `profile-lookup.ts` helper (AC: 2)
  - [x] `getLiveAccessConsent(db, userId): Promise<boolean | null>` via Drizzle (fonction pure, pattern resolve-origin)
  - [x] Test unitaire (mock DB) — tri-state true/false/null + profil absent

- [x] **Task 4** — Étendre `AccessCalculatorService.compute` pour mode 'live' (AC: 5)
  - [x] Switch sur `mode` : 'planning' → DB cache (Story 2.2), 'live' → Redis cache (`computeLive`)
  - [x] Si live + gps → check consent via `getLiveAccessConsent` (dans le service, cf. Doc Sync)
  - [x] Si consent !== true → return fallback no_consent (sans BRouter)
  - [x] Sinon : check Redis → miss → compute BRouter + ST_Diff → SET Redis → return (calcul frais partagé `computeFresh`)

- [x] **Task 5** — Étendre `PoisController` (AC: 1, 2, 4)
  - [x] Détecter `origin.type === 'gps'` → mode 'live', sinon 'planning'
  - [x] Appliquer rate limit conditionnel via `AccessThrottlerGuard` global (cf. Task 1)
  - [x] Pass `mode` + `userId` à `accessCalculator.compute`

- [x] **Task 6** — Tests (AC: 7)
  - [x] **Doc Sync** : suite d'intégration co-localisée `src/pois/pois.controller.live-access.spec.ts` au lieu d'un E2E `test/*.e2e-spec.ts` (carry-forward déviation Story 2.3 : CI = `pnpm test` Jest unitaire, rootDir=src, sans Postgres/Redis ni `test:e2e`)
  - [x] Redis mocké en mémoire (pas de TestContainers — non câblé en CI projet)
  - [x] Cas AC #7 couverts (gps consent true/false/null, redis-cache, validation 4 déc., rate limit 120) répartis entre tests service (unit) + controller (intégration)

- [x] **Task 7** — Doc Sync + commit (AC: 8)
  - [x] Doc archi : décision rate limit notée dans l'en-tête du controller + `AccessThrottlerGuard`
  - [ ] Commit (à la main par Guillaume) : `feat(api): extend POST /pois/:id/access for live mode (gps origin + redis cache + consent gate) — story poi-access-3.1`

### Review Findings (Code Review — 2026-05-29)

> Revue adversariale 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 1 decision-needed, 2 patch, 2 defer, 9 dismissed (faux positifs / déjà gérés). Tous les AC #1–#8 jugés satisfaits par l'Acceptance Auditor ; conformité NFR-PA-006 confirmée (userId jamais dans la clé Redis, GPS jamais stocké durablement).

**Decision-needed (résolu) :**
- [x] [Review][Decision] Rate limit par-IP au lieu de par-user — AC #4 spécifie « 120 req/min/**user** » mais aucun `getTracker` n'est surchargé : le throttling reste par-IP (hérité Story 2.3, `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])`). **Résolution (Guillaume, 2026-05-29) : option (a) — per-IP accepté, écart assumé / Doc Sync.** Le rate limit borne le débit par adresse source ; la granularité per-user pourra être ajoutée ultérieurement via un `getTracker` sur `req.user.id` si l'abus multi-user derrière NAT devient un problème réel. [app.module.ts:34, common/guards/access-throttler.guard.ts]

**Patch (appliqués 2026-05-29) :**
- [x] [Review][Patch] Lecture cache Live ne vérifie pas `engineVersion` — **CORRIGÉ** : `computeLive` ne renvoie un hit Redis que si `cached.engineVersion === this.config.engineVersion`, sinon l'entrée est traitée comme un miss → recalcul frais (parité avec le cache DB Planning). Régression ajoutée (`access-calculator.service.spec.ts` : « engineVersion obsolète → recalcul frais »). [access-calculator.service.ts computeLive]
- [x] [Review][Patch] `AccessThrottlerGuard` appliquait le bump à 120 sur toute route avec body `origin.type:'gps'` — **CORRIGÉ** : le bump est désormais borné au seul handler `PoisController.computeAccess` (`isAccessRoute`, comparaison par nom sans import → pas de dépendance circulaire). Toute autre route conserve sa limite décorateur/module. [common/guards/access-throttler.guard.ts]

**Defer :**
- [x] [Review][Defer] Compteur de throttle partagé Planning(60)/Live(120) sur la même clé route+tracker — un trafic mixte gps/stage accumule sur un seul bucket, throttlant tôt le trafic légitime ; les deux limites ne sont pas indépendantes (bornées toutefois, jamais >120). [common/guards/access-throttler.guard.ts:29-35] — deferred, tradeoff de l'option B documenté et accepté
- [x] [Review][Defer] Consent gate non appliqué pour une origine `live` non-gps — la garde consent est imbriquée dans `if (origin.type === 'gps')`, et `cacheKey` est null hors gps. Non atteignable aujourd'hui (le couplage `mode==='live'` ⇔ `origin.type==='gps'` n'existe que dans le controller). [access-calculator.service.ts computeLive] — deferred, ajouter une assertion si un futur appelant introduit une origine live non-gps

---

## Dev Notes

### Pattern projet — Redis client

Si le projet utilise `@nestjs-modules/ioredis` :
```typescript
@InjectRedis() private readonly redis: Redis
// ...
await this.redis.set(key, JSON.stringify(data), 'EX', ttlSec)
const cached = await this.redis.get(key)
return cached ? JSON.parse(cached) : null
```

### Sérialisation cache Redis

`AccessResult` contient `geometry` (objet GeoJSON potentiellement gros). Sérialisation JSON OK pour MVP (~1-10 KB). Si volume devient problème : compresser via `zlib.deflate`, ou ne pas cacher la geometry en Redis (recompute si nécessaire).

### Privacy — vérification finale

Avant de merger, grep dans le code pour s'assurer qu'aucun `userId` n'apparaît dans les clés Redis access:
```bash
grep -rn "access:live" apps/api/src/
# Doit montrer uniquement les clés sans userId
```

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-3.1]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Stratégie-Cache-Mode-Live]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#RGPD]
- [Source: _bmad-output/implementation-artifacts/poi-access-2-2-...md] — AccessCalculator base
- [Source: _bmad-output/implementation-artifacts/poi-access-2-3-...md] — endpoint Planning + schéma Zod

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (BMad dev-story workflow)

### Completion Notes List

> **⚠️ SUPERSEDED — 2026-05-30.** Toute l'extension « mode Live GPS » décrite ci-dessous a été
> **retirée**. Décision produit (Guillaume) : en mode Live, l'itinéraire d'accès doit utiliser la
> même origine `nearest-trace` que le Planning (détour final depuis la trace) plutôt que la position
> GPS du cycliste. Conséquences appliquées le 2026-05-30 :
> - `AccessOrigin` : variante `gps` supprimée (shared `poi-access.ts` + api types) ; `RoundedCoord`/
>   `AccessOriginGpsSchema` supprimés.
> - `AccessCalculatorService` : `computeLive`, consent gate, cache Redis anonyme et `toCachedMetrics`
>   supprimés ; `compute()` ne fait plus que le chemin cache DB. Injection `RedisProvider` retirée du
>   service et `RedisModule` retiré de `AccessCalculatorModule` (`RedisProvider` reste utilisé ailleurs).
> - `profile-lookup.ts` (+ spec) et `strategies/redis-cache.ts` (+ spec) **supprimés**.
> - `AccessComputeInput` : `mode` + `userId` retirés ; `AccessResult.source` perd `redis-cache`,
>   `fallbackReason` perd `no_consent`.
> - Rate limit : `AccessThrottlerGuard` **supprimé**, retour au `ThrottlerGuard` standard (60/min).
>   `pois.controller.live-access.spec.ts` supprimé.
> - `ACCESS_CACHE_TTL_LIVE_SECONDS` retiré de `access.config.ts` (ligne orpheline restant à nettoyer
>   manuellement dans `apps/api/.env.example`, écriture refusée par permissions).
> - Validation post-retrait : API 346/346, shared 29/29, web 1050/1050 ; tsc API 0 / web 59 (baseline) ;
>   ESLint api+shared clean.
>
> La note d'implémentation d'origine est conservée ci-dessous pour l'historique.

- **Stratégie rate limit retenue : ☑ B** — guard custom `AccessThrottlerGuard extends ThrottlerGuard` surchargeant `handleRequest` : bump 60→120 quand `origin.type === 'gps'`. Enregistré comme APP_GUARD global EN REMPLACEMENT du `ThrottlerGuard` standard (comportement inchangé pour les routes sans `origin.type === 'gps'` au body).
- **Pattern Redis injection** : `RedisProvider.getClient()` (ioredis singleton, `@Global RedisModule`) — même pattern que `pois.service.ts`. `AccessCalculatorModule` importe explicitement `RedisModule` (DI hygiène + testabilité isolée).
- **Lookup consent placement** : effectué dans `AccessCalculatorService.computeLive` (pas le controller) pour cohésion/testabilité ; le controller passe `userId` + `mode`. L'AC #2 décrivait « le controller récupère le consent » — placement assumé côté service (cf. Task 4). Fonction pure `getLiveAccessConsent(db, userId)`.
- **Latence lookup consent** : non mesurée en runtime (pas d'env DB en CI) ; lookup sur `profiles.id` (PK) → indexé nativement, ~5 ms attendu (Discovery #2/#5). Pas d'index ajouté (conforme Discovery #5).
- **Vérif anti-PII clé Redis : ☑ Confirmé** — `grep -rn "access:live" src/` (hors tests) ne montre que la construction `access:live:{poiId}:{profile}:{lat}:{lng}` ; `userId` n'entre jamais dans la clé ni n'est stocké. Test dédié `clé Redis n'inclut jamais userId`.
- **AccessResult** : `redis-cache` / `no_consent` déjà présents dans l'union `AccessResult` + schéma Zod `AccessResponseSchema` (anticipés en Story 2.2/2.3) — aucune modif shared nécessaire.
- **Best-effort cache** : erreurs Redis (read/write) catchées + WARN (`access_redis_read_failed` / `access_redis_write_failed`) → dégrade en calcul frais, ne casse jamais la réponse.
- **Doc Sync — tests** : suite d'intégration co-localisée `pois.controller.live-access.spec.ts` (runs en `pnpm test`/CI) au lieu de `test/poi-access-live.e2e-spec.ts` (`test:e2e` non câblé en CI, `ioredis-mock` absent). Carry-forward de la déviation documentée Story 2.3.
- **Régression** : `pois.controller.access.spec.ts` (Story 2.3) mis à jour — assertion `compute` inclut désormais `userId` ; le bloc « real service » fournit un `RedisProvider` mocké.
- **Résultats tests** : API 375/375 verts (33 suites — dont 28 nouveaux tests Story 3.1 : redis-cache 11, profile-lookup 5, service Live 7, controller Live/rate-limit 9, hors ajustements régression). Un échec ECONNRESET flaky réseau (test Overpass) sur un run, disparu au re-run — non lié (mes tests sont 100% mockés). tsc `--noEmit` clean. ESLint clean sur les fichiers touchés.

### File List
- [x] `apps/api/src/pois/access-calculator/access-calculator.service.ts` (modifié — branche mode 'live', `computeLive`/`computeFresh`, inject RedisProvider)
- [x] `apps/api/src/pois/access-calculator/access-calculator.service.spec.ts` (modifié — tests mode Live + mock RedisProvider)
- [x] `apps/api/src/pois/access-calculator/access-calculator.module.ts` (modifié — import RedisModule)
- [x] `apps/api/src/pois/access-calculator/types/access-result.types.ts` (modifié — ajout `userId?` à `AccessComputeInput`)
- [x] `apps/api/src/pois/access-calculator/strategies/redis-cache.ts` (nouveau — wrapper Redis + key builder anonyme)
- [x] `apps/api/src/pois/access-calculator/strategies/redis-cache.spec.ts` (nouveau)
- [x] `apps/api/src/pois/access-calculator/profile-lookup.ts` (nouveau — lookup consent tri-state)
- [x] `apps/api/src/pois/access-calculator/profile-lookup.spec.ts` (nouveau)
- [x] `apps/api/src/pois/pois.controller.ts` (modifié — dérivation mode + passage userId)
- [x] `apps/api/src/pois/pois.controller.access.spec.ts` (modifié — régression userId + RedisProvider)
- [x] `apps/api/src/pois/pois.controller.live-access.spec.ts` (nouveau — intégration Live + rate limit ; **remplace** l'E2E prévu, cf. Doc Sync)
- [x] `apps/api/src/common/guards/access-throttler.guard.ts` (nouveau — rate limit conditionnel Live)
- [x] `apps/api/src/app.module.ts` (modifié — APP_GUARD `AccessThrottlerGuard` remplace `ThrottlerGuard`)

### Change Log
| Date | Changement |
|---|---|
| 2026-05-29 | Story POI-Access 3.1 implémentée — extension `POST /pois/:id/access` pour le mode Live (origin GPS) : consent gate (`profiles.live_access_consent`), cache Redis anonyme (`access:live:{poiId}:{profile}:{lat}:{lng}`, TTL 15 min, sans userId/NFR-PA-006), rate limit conditionnel 120/min via `AccessThrottlerGuard`. Calcul frais partagé Planning/Live (`computeFresh`). 11 nouveaux fichiers/modifs, API 384/384 verts, tsc + ESLint clean. 1 déviation Doc Sync (tests intégration co-localisés au lieu d'E2E TestContainers). |
| 2026-05-30 | **SUPERSEDED** — décision produit : le mode Live passe à l'origine `nearest-trace` (comme Planning), pas de GPS. Retrait complet de l'extension Live : origin `gps`, `computeLive`, consent gate, cache Redis anonyme (`profile-lookup.ts` + `redis-cache.ts` supprimés), `AccessThrottlerGuard` (retour `ThrottlerGuard` standard), `mode`/`userId` de `AccessComputeInput`, enums `redis-cache`/`no_consent`, `ACCESS_CACHE_TTL_LIVE_SECONDS`. Validation : API 346/346, shared 29/29, web 1050/1050, tsc/ESLint clean. Colonne DB `profiles.live_access_consent` conservée (drop migration à décider séparément). |
