# Story POI-Access 3.1 : Extension endpoint pour mode Live (origin GPS + cache Redis anonyme)

Status: ready-for-dev

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

- [ ] **Task 1** — Décider stratégie rate limit (AC: 4, ⚠️Discovery #1)
  - [ ] Évaluer les 3 options
  - [ ] Décider et documenter en commentaire de tête du controller
  - [ ] Implémenter via guard custom ou logique inline

- [ ] **Task 2** — Créer `redis-cache.ts` wrapper (AC: 3, ⚠️Discovery #3)
  - [ ] Identifier le pattern d'injection Redis existant
  - [ ] Wrapper : `get(key): Promise<AccessResult | null>`, `set(key, result, ttlSec): Promise<void>`
  - [ ] Clé builder : `buildAccessLiveKey({ poiId, profile, lat, lng }) → 'access:live:...'`
  - [ ] Test unitaire (mock Redis via ioredis-mock)

- [ ] **Task 3** — Créer `profile-lookup.ts` helper (AC: 2)
  - [ ] `getLiveAccessConsent(userId): Promise<boolean | null>` via Drizzle
  - [ ] Test unitaire (mock DB)

- [ ] **Task 4** — Étendre `AccessCalculatorService.compute` pour mode 'live' (AC: 5)
  - [ ] Switch sur `mode` : 'planning' → DB cache (Story 2.2), 'live' → Redis cache
  - [ ] Si live + gps → check consent via `profileLookup`
  - [ ] Si consent !== true → return fallback no_consent
  - [ ] Sinon : check Redis → miss → compute BRouter + ST_Diff → SET Redis → return

- [ ] **Task 5** — Étendre `PoisController` (AC: 1, 2, 4)
  - [ ] Détecter `origin.type === 'gps'` → mode 'live', sinon 'planning'
  - [ ] Appliquer rate limit conditionnel (cf. Task 1)
  - [ ] Pass `mode` à `accessCalculator.compute`

- [ ] **Task 6** — Tests E2E (AC: 7)
  - [ ] `apps/api/test/poi-access-live.e2e-spec.ts`
  - [ ] Setup TestContainers Redis OU docker-compose CI Redis isolé
  - [ ] Tous les cas de l'AC #7

- [ ] **Task 7** — Doc Sync + commit (AC: 8)
  - [ ] Doc archi : noter la décision rate limit
  - [ ] Commit : `feat(api): extend POST /pois/:id/access for live mode (gps origin + redis cache + consent gate) — story poi-access-3.1`

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
_(À renseigner)_

### Completion Notes List
- Stratégie rate limit retenue : ☐ A / ☐ B / ☐ C
- Pattern Redis injection : `___`
- Latence lookup consent mesurée : `___` ms
- Vérif anti-PII clé Redis : ☐ Confirmé

### File List
- [ ] `apps/api/src/pois/access-calculator/access-calculator.service.ts` (modifié)
- [ ] `apps/api/src/pois/access-calculator/access-calculator.service.spec.ts` (modifié)
- [ ] `apps/api/src/pois/access-calculator/strategies/redis-cache.ts` (nouveau)
- [ ] `apps/api/src/pois/access-calculator/strategies/redis-cache.spec.ts` (nouveau)
- [ ] `apps/api/src/pois/access-calculator/profile-lookup.ts` (nouveau)
- [ ] `apps/api/src/pois/pois.controller.ts` (modifié)
- [ ] `apps/api/test/poi-access-live.e2e-spec.ts` (nouveau)
