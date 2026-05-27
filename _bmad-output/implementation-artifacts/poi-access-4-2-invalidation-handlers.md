# Story POI-Access 4.2 : Invalidation handlers event-driven (trace / profil / stage)

Status: ready-for-dev

<!-- Dépend de : 4.1 (worker + queue), 2.6 (event adventure.profile-changed), 3.2 (event profile.live-consent-revoked). -->

## Story

As a **end user modifying my adventure trace, routing profile, or stages**,
I want the access routes to be automatically invalidated and recomputed so I never see stale data,
So that my planning decisions are always based on current information.

## Acceptance Criteria

1. **Given** un UPDATE sur `adventure_segments.geom` (changement de trace, depuis edit-segment ou re-upload GPX), **When** un event `'adventure.trace-updated'` est émis avec payload `{ adventureId, segmentId }`, **Then** :
   - Handler `@OnEvent('adventure.trace-updated')` dans `AccessWorkerService` :
     - UPDATE `accommodations_cache SET access_distance_m=NULL, access_elevation_gain_m=NULL, access_elevation_loss_m=NULL, access_geometry=NULL, access_computed_at=NULL, access_engine_version=NULL, access_failed=false WHERE segment_id = $segmentId`
     - Re-enqueue les jobs de recompute pour les POI éligibles (mêmes filtres Story 4.1 : `dist_from_trace_m < 1500 AND access_computed_at IS NULL`)
   - Test : émettre l'event → vérifier le UPDATE + les jobs

2. **Given** un PATCH sur `adventures.routing_profile` (Story 2.6 émet `'adventure.profile-changed'`), **When** le handler le reçoit avec payload `{ adventureId, newProfile, previousProfile }`, **Then** :
   - Skip si `newProfile === previousProfile` (idempotence)
   - UPDATE TOUS les `accommodations_cache.access_*` des POI rattachés à des segments de cette aventure → reset à NULL
   - Re-enqueue les jobs de recompute avec le nouveau profil

3. **Given** un PATCH sur `adventure_stages` (changement `start_km` ou `end_km`), **When** un event `'stage.updated'` est émis avec payload `{ stageId, adventureId, changes: { startKm, endKm } }`, **Then** :
   - Seuls les POI ayant `access_origin_stage_id = stageId` sont reset
   - Les autres POI de l'aventure ne sont PAS affectés
   - Re-enqueue avec origin = stage (même stageId mais nouvelle position)

4. **Given** un DELETE sur `adventure_stages` (event `'stage.deleted'` avec `{ stageId }`), **When** le delete se produit, **Then** :
   - La contrainte FK `ON DELETE SET NULL` (Story 1.3) met automatiquement `access_origin_stage_id = NULL` pour les POI concernés
   - Le handler complète : reset des autres `access_*` champs pour ces POI
   - Re-enqueue avec origin = `'adventure-start'` (fallback)

5. **Given** un user révoque le consent Live (event `'profile.live-consent-revoked'` de Story 3.2), **When** le handler le consomme avec `{ userId }`, **Then** :
   - Tentative best-effort de purge des clés Redis `access:live:*` via `SCAN + DEL`
   - Limite : max 1000 clés purgées par opération (éviter blocage Redis)
   - Log INFO : nombre de clés purgées (ou "expirera naturellement" si le SCAN ne retourne rien — clés anonymes, impossible de filtrer par userId)
   - **Note importante** : la purge est SYMBOLIQUE — puisque les clés sont anonymes (cf. Story 3.1 NFR-PA-006), on ne peut pas cibler le user précis. La purge sera donc globale ou skip → documenter le compromis

6. **Given** les events `'adventure.trace-updated'`, `'stage.updated'`, `'stage.deleted'` n'ont PAS de source actuelle dans le code, **When** la story est mergée, **Then** :
   - Les handlers sont EN PLACE mais ne reçoivent aucun event (silent no-op pour MVP)
   - Documenter dans le commit + audit que les sources d'events doivent être ajoutées en parallèle dans les services concernés (adventures.service.ts pour trace-updated, stages.service.ts pour stage-*)
   - Alternativement : déclencher les events depuis cette story aussi (out of scope strict mais utile) — décision avec Guillaume

7. **Given** les tests, **When** je couvre :
   - Unit tests handlers : émettre event mock → vérifier UPDATE + enqueue
   - Test trace-updated : reset + reenqueue ciblé sur segmentId
   - Test profile-changed : reset global aventure + reenqueue
   - Test stage-updated : reset stage-scoped uniquement (autres POI intacts)
   - Test stage-deleted : SET NULL + reset
   - Test consent-revoked : Redis SCAN mock, vérifier DEL appelé (ou log si rien à purger)
   - Coverage ≥ 75% (event handlers + redis interaction partielle)

8. **Given** la story terminée, **When** je commit :
   - `apps/api/src/pois/access-worker/access-worker.service.ts` (modifié — ajout des 5 handlers @OnEvent)
   - `apps/api/src/pois/access-worker/access-worker.service.spec.ts` (modifié — tests handlers)
   - `apps/api/src/pois/access-worker/strategies/redis-cache-purge.ts` (nouveau — best-effort Redis purge)
   - `apps/api/src/pois/access-worker/strategies/invalidation-queries.ts` (nouveau — repository des SQL UPDATE reset)
   - Doc Sync si écart

---

## ⚠️ Critical Discovery Notes

### 1. Events sources — gap critique

Sur les 5 events listés :
- `'adventure.profile-changed'` : émis par Story 2.6 ✅
- `'profile.live-consent-revoked'` : émis par Story 3.2 ✅
- `'adventure.trace-updated'` : **PAS émis nulle part** ❌
- `'stage.updated'` : **PAS émis nulle part** ❌
- `'stage.deleted'` : **PAS émis nulle part** ❌

Pour les 3 events manquants, il faut **modifier les services existants** :
- `adventures.service.ts` ou `gpx-processing` worker pour `'adventure.trace-updated'` après modification GPX
- `stages.service.ts` pour `'stage.updated'` après PATCH et `'stage.deleted'` après DELETE

**Décision à prendre** :
- **A.** Cette story émet TOUS les events manquants (modifications cross-service) — out of scope strict mais cohérent
- **B.** Cette story crée juste les handlers, les modifications source sont des micro-stories séparées
- **C.** Cette story handle uniquement les 2 events disponibles (adventure.profile-changed + profile.live-consent-revoked), les 3 autres handlers sont créés mais documentés comme "non testés en intégration tant que source absente"

Recommandation : **C** pour minimiser scope, avec création explicite de 3 follow-up stories ou TODO bien visible. À discuter avec Guillaume.

### 2. Purge Redis anonyme — limitation fondamentale

Cf. archi §RGPD : les clés Redis `access:live:{poiId}:{profile}:{lat}:{lng}` n'ont PAS de `userId`. **Impossible de cibler un user spécifique** pour la purge.

Options pour le handler `profile.live-consent-revoked` :
- **A.** Skip la purge (laisser expirer TTL 15 min) — simple, RGPD-acceptable
- **B.** Purge globale `access:live:*` — supprime les caches de TOUS les users, impact perf temporaire mais zéro risque PII
- **C.** Tracker côté DB une table `user_access_cache_keys` (anti-pattern car perd l'anonymisation)

Recommandation : **A** (skip + log) avec mention claire dans la doc. Le TTL 15 min garantit la finitude.

### 3. Re-enqueue idempotent

Les jobs ont un `jobId = ${poiId}:${engineVersion}:${stageId}`. Re-enqueue avec même jobId = no-op si le job précédent est encore en flight. Si le job précédent a complété → nouveau job avec même jobId est rejeté par BullMQ.

**Pour forcer le recompute après reset cache** : changer le jobId. Stratégie : append timestamp ou compteur.

Alternative simple : reset le cache (UPDATE NULL) ET enqueue avec un `jobId` enrichi `${poiId}:${engineVersion}:${stageId}:${Date.now()}`.

### 4. Transactions DB

Les UPDATE reset + enqueue jobs ne sont PAS atomiques (UPDATE en DB, enqueue en Redis). Risque : reset OK mais enqueue fail → POI reste à NULL sans recompute. Mitigation :
- Réessayer l'enqueue dans un retry
- OU déclencher l'enqueue avant le reset, puis reset après confirmation

**MVP** : ordre simple `UPDATE → enqueue`, log si enqueue fail. Le calcul lazy au prochain accès compense.

---

## Tasks / Subtasks

- [ ] **Task 1** — Décider scope events (⚠️Discovery #1)
  - [ ] Discuter avec Guillaume : option A, B ou C
  - [ ] Documenter la décision dans le commit
  - [ ] Si C : créer 3 follow-up stories ou TODOs trackés

- [ ] **Task 2** — Créer helper `invalidation-queries.ts` (AC: 1, 2, 3, 4)
  - [ ] Fonctions :
    - `resetAccessForSegment(db, segmentId)` → UPDATE
    - `resetAccessForAdventure(db, adventureId)` → UPDATE join
    - `resetAccessForStage(db, stageId)` → UPDATE WHERE access_origin_stage_id
  - [ ] Tests unitaires

- [ ] **Task 3** — Créer helper `redis-cache-purge.ts` (AC: 5, ⚠️Discovery #2)
  - [ ] `purgeAccessLiveCache(redis, limit = 1000): Promise<{ purgedCount: number }>` — SCAN + DEL global (impossible de cibler user)
  - [ ] Logger un WARN clair sur la limitation
  - [ ] Test : mock Redis avec ioredis-mock

- [ ] **Task 4** — Ajouter les 5 handlers @OnEvent dans `AccessWorkerService` (AC: 1, 2, 3, 4, 5)
  - [ ] `@OnEvent('adventure.trace-updated')` → reset + enqueue ciblé segmentId
  - [ ] `@OnEvent('adventure.profile-changed')` → check newProfile != previous, reset + enqueue global aventure
  - [ ] `@OnEvent('stage.updated')` → reset stage-scoped, enqueue
  - [ ] `@OnEvent('stage.deleted')` → reset (ON DELETE SET NULL déjà géré), enqueue avec origin adventure-start
  - [ ] `@OnEvent('profile.live-consent-revoked')` → purge Redis best-effort

- [ ] **Task 5** — Tests (AC: 7)
  - [ ] Unit tests pour chaque handler
  - [ ] Coverage ≥ 75%

- [ ] **Task 6** — Si option A retenue (Discovery #1) : ajouter émission events sources
  - [ ] Modifier `adventures.service.ts` (ou gpx-processing) pour émettre `adventure.trace-updated`
  - [ ] Modifier `stages.service.ts` pour `stage.updated` et `stage.deleted`
  - [ ] Tests E2E intégration complète

- [ ] **Task 7** — Doc Sync + commit (AC: 8)
  - [ ] Doc archi : documenter les decisions Discovery #1, #2
  - [ ] Commit : `feat(api): event-driven invalidation handlers for access cache (trace, profile, stage, consent) — story poi-access-4.2`

---

## Dev Notes

### Pattern projet — @OnEvent

```typescript
import { OnEvent } from '@nestjs/event-emitter'

@Injectable()
export class AccessWorkerService {
  @OnEvent('adventure.trace-updated')
  async handleTraceUpdated(payload: { adventureId: string; segmentId: string }) {
    // ...
  }
}
```

### Pattern projet — Redis SCAN

```typescript
async purgeKeys(pattern: string, limit: number) {
  let cursor = '0'
  let count = 0
  do {
    const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    if (keys.length) {
      await this.redis.del(...keys)
      count += keys.length
    }
    cursor = next
    if (count >= limit) break
  } while (cursor !== '0')
  return count
}
```

### Pattern projet — Pas d'event emission silencieuse en prod

Si Option C (Discovery #1) : ajouter un test smoke qui vérifie qu'AU MOINS UN handler est appelé sur émission de chaque event. Ça force à émettre les events sources avant de pouvoir tester l'intégration.

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-4.2]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Stratégie-Invalidation]
- [Source: _bmad-output/implementation-artifacts/poi-access-4-1-...md] — worker + enqueue patterns
- [Source: _bmad-output/implementation-artifacts/poi-access-2-6-...md] — event adventure.profile-changed source
- [Source: _bmad-output/implementation-artifacts/poi-access-3-2-...md] — event profile.live-consent-revoked source

---

## Dev Agent Record

### Agent Model Used
_(À renseigner)_

### Completion Notes List
- Scope events retenu : ☐ A (tout émis ici) / ☐ B (handlers seulement) / ☐ C (mixte, follow-ups créés)
- Stratégie purge Redis consent-revoked : ☐ A skip+log / ☐ B purge globale / ☐ C tracking table
- Re-enqueue strategy : ☐ jobId enrichi timestamp / ☐ autre
- Coverage tests : `___%`

### File List
- [ ] `apps/api/src/pois/access-worker/access-worker.service.ts` (modifié)
- [ ] `apps/api/src/pois/access-worker/access-worker.service.spec.ts` (modifié)
- [ ] `apps/api/src/pois/access-worker/strategies/redis-cache-purge.ts` (nouveau)
- [ ] `apps/api/src/pois/access-worker/strategies/redis-cache-purge.spec.ts` (nouveau)
- [ ] `apps/api/src/pois/access-worker/strategies/invalidation-queries.ts` (nouveau)
- [ ] `apps/api/src/pois/access-worker/strategies/invalidation-queries.spec.ts` (nouveau)
- [ ] (Si option A Discovery #1) `apps/api/src/adventures/adventures.service.ts` (modifié)
- [ ] (Si option A Discovery #1) `apps/api/src/stages/stages.service.ts` (modifié)
