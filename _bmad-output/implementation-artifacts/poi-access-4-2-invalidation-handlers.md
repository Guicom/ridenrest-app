---
baseline_commit: 4eedb11cc26c48e6f1b739c4fd5bc93253ef3e50
---

# Story POI-Access 4.2 : Invalidation handlers event-driven (trace / profil)

Status: done

> **✅ IMPLÉMENTÉE 2026-05-30 (pivot `nearest-trace` + décision « ÉTENDRE »).** État final :
> - **AC1 (trace-updated)** : ✅ implémenté au **scope AVENTURE** (pas segment — l'origine `nearest-trace` est
>   calculée sur la trace fusionnée de tous les segments). **Sources réelles câblées** = add/remove segment
>   (`SegmentsService.deleteSegment` + `GpxParseProcessor`). Couvre FR-PA-015.
> - **AC2 (profile-changed)** : ✅ implémenté (source = Story 2.6).
> - **AC3/AC4 (stage)** et **AC5 (purge consent Live / Redis)** : ⛔ **SUPERSEDED** — non implémentés
>   (`nearest-trace` ne dépend pas des stages ; consentement + cache Redis Live supprimés). `redis-cache-purge.ts`
>   et `invalidation-queries.ts` non créés.
> Cf. AC #1 (Doc Sync détaillé) + Dev Agent Record. Bannière Epic 4 §2 dans `epics-poi-access-routing.md`.

<!-- Dépend de : 4.1 (worker + queue), 2.6 (event adventure.profile-changed)~~, 3.2 (event profile.live-consent-revoked)~~ — 3.2 SUPERSEDED 2026-05-30. -->

## Story

As a **end user modifying my adventure trace, routing profile, or stages**,
I want the access routes to be automatically invalidated and recomputed so I never see stale data,
So that my planning decisions are always based on current information.

## Acceptance Criteria

1. **Given** un changement de trace de l'aventure, **When** un event `'adventure.trace-updated'` est émis avec payload `{ adventureId, segmentId, changeType }`, **Then** :
   - Handler `@OnEvent('adventure.trace-updated')` dans `AccessWorkerService` reset les `access_*` + re-enqueue les POI éligibles, puis recalcul.
   > **🔧 Doc Sync 2026-05-30 (décision « ÉTENDRE », cf. Task 1) — DEUX corrections vs spec initiale :**
   > 1. **Scope AVENTURE, pas segment.** Le spec demandait `WHERE segment_id = $segmentId`. ❌ Incorrect : l'origine `nearest-trace` est calculée sur la **trace fusionnée de tous les segments** (`resolve-origin.ts` → `ST_Collect`). Un changement de trace périme donc les accès des POI de **toute l'aventure**. → `resetAccessForAdventure(adventureId)` (UPDATE join via `adventure_segments`) + re-enqueue via `findEagerPois(adventureId)`. `segmentId` conservé pour l'observabilité uniquement.
   > 2. **Sources réelles câblées** (ce ne sont PAS « edit-segment / re-upload » qui n'existent pas) : `SegmentsService.deleteSegment` (`changeType:'segment-removed'`) et `GpxParseProcessor` après écriture de la géométrie (`changeType:'segment-added'`). Couvre `FR-PA-015`.

2. **Given** un PATCH sur `adventures.routing_profile` (Story 2.6 émet `'adventure.profile-changed'`), **When** le handler le reçoit avec payload `{ adventureId, newProfile, previousProfile }`, **Then** :
   - Skip si `newProfile === previousProfile` (idempotence)
   - UPDATE TOUS les `accommodations_cache.access_*` des POI rattachés à des segments de cette aventure → reset à NULL
   - Re-enqueue les jobs de recompute avec le nouveau profil

> **⛔ AC3, AC4, AC5 SUPERSEDED 2026-05-30** — voir bannière en tête. Conservés barrés pour traçabilité ;
> à NE PAS implémenter.

3. ~~**Given** un PATCH sur `adventure_stages` (changement `start_km` ou `end_km`), **When** un event `'stage.updated'` est émis avec payload `{ stageId, adventureId, changes: { startKm, endKm } }`, **Then** :~~ _(SUPERSEDED — `nearest-trace` ne dépend pas des stages)_
   - ~~Seuls les POI ayant `access_origin_stage_id = stageId` sont reset~~
   - ~~Les autres POI de l'aventure ne sont PAS affectés~~
   - ~~Re-enqueue avec origin = stage (même stageId mais nouvelle position)~~

4. ~~**Given** un DELETE sur `adventure_stages` (event `'stage.deleted'` avec `{ stageId }`), **When** le delete se produit, **Then** :~~ _(SUPERSEDED — idem AC3 ; `adventure-start` n'existe plus)_
   - ~~La contrainte FK `ON DELETE SET NULL` (Story 1.3) met automatiquement `access_origin_stage_id = NULL` pour les POI concernés~~
   - ~~Le handler complète : reset des autres `access_*` champs pour ces POI~~
   - ~~Re-enqueue avec origin = `'adventure-start'` (fallback)~~

5. ~~**Given** un user révoque le consent Live (event `'profile.live-consent-revoked'` de Story 3.2), **When** le handler le consomme avec `{ userId }`, **Then** :~~ _(SUPERSEDED — consentement Live + cache Redis Live supprimés)_
   - ~~Tentative best-effort de purge des clés Redis `access:live:*` via `SCAN + DEL`~~
   - ~~Limite : max 1000 clés purgées par opération (éviter blocage Redis)~~
   - ~~Log INFO : nombre de clés purgées (ou "expirera naturellement" si le SCAN ne retourne rien — clés anonymes, impossible de filtrer par userId)~~
   - ~~**Note importante** : la purge est SYMBOLIQUE — puisque les clés sont anonymes (cf. Story 3.1 NFR-PA-006), on ne peut pas cibler le user précis.~~

6. ~~**Given** l'event `'adventure.trace-updated'` n'a PAS de source actuelle~~ _(**RÉSOLU 2026-05-30** — décision « ÉTENDRE », cf. AC #1 + Task 1/6)_ :
   - ✅ Les 2 events ont désormais une source réelle : `adventure.profile-changed` (Story 2.6) ET `adventure.trace-updated` (émis par `SegmentsService.deleteSegment` + `GpxParseProcessor`).
   - Plus aucun handler dormant. `stage.*` / `profile.live-consent-revoked` restent superseded (jamais émis, non implémentés).

7. **Given** les tests, **When** je couvre _(🔧 MAJ 2026-05-30 — liste alignée sur l'impl ; stage/consent superseded)_ :
   - Unit tests handlers (consommateur) : émettre event mock → vérifier reset + enqueue
   - Test trace-updated : reset **aventure** + reenqueue (changeType `segment-added` ET `segment-removed`)
   - Test profile-changed : reset aventure + reenqueue, + idempotence (`newProfile === previousProfile` → no-op)
   - Tests **producteurs** : `SegmentsService.deleteSegment` émet `trace-updated` ; `GpxParseProcessor` émet sur parse OK, n'émet pas sur échec
   - E2E : vrai `EventEmitter2` + `@OnEvent` (câblage des 2 handlers)
   - ~~Test stage-updated / stage-deleted / consent-revoked (Redis SCAN)~~ ⛔ SUPERSEDED
   - Coverage ≥ 75% → **atteint** (cf. Task 5 / Completion Notes)

8. **Given** la story terminée, **When** je commit _(🔧 MAJ — liste réelle dans Dev Agent Record → File List)_ :
   - `apps/api/src/pois/access-worker/access-worker.service.ts` + `.spec.ts` (2 handlers @OnEvent, pas 5)
   - `apps/api/src/pois/access-worker/access-worker.repository.ts` + `.spec.ts` (`resetAccessForAdventure`)
   - `apps/api/src/segments/segments.service.ts` + `.test.ts` (émission `trace-updated` / delete)
   - `apps/api/src/segments/jobs/gpx-parse.processor.ts` + `.test.ts` (émission `trace-updated` / add)
   - `apps/api/test/access-worker.e2e-spec.ts`
   - ~~`strategies/redis-cache-purge.ts` / `strategies/invalidation-queries.ts`~~ ⛔ non créés (superseded / consolidé dans repo)
   - Doc Sync si écart → **fait** (story + sprint-status + architecture + epics)

---

## ⚠️ Critical Discovery Notes

> **🔧 RÉSOLU 2026-05-30 (impl)** — notes historiques conservées pour traçabilité. État final :
> décision = **ÉTENDRE** (cf. Task 1). `adventure.trace-updated` est désormais émis (sources réelles
> = add/remove segment, scope aventure). Discovery #2 (purge Redis) SUPERSEDED. Discovery #3/#4 appliqués.

### 1. Events sources — ~~gap critique~~ → RÉSOLU

État FINAL (post-impl) :
- `'adventure.profile-changed'` : émis par Story 2.6 ✅ — handler fonctionnel
- `'adventure.trace-updated'` : ✅ **émis** par `SegmentsService.deleteSegment` (segment-removed) + `GpxParseProcessor` (segment-added) — handler fonctionnel, scope **aventure**
- ~~`'profile.live-consent-revoked'` / `'stage.updated'` / `'stage.deleted'`~~ ⛔ SUPERSEDED — jamais émis, handlers non créés

~~**Décision A/B/C**~~ → tranchée : **ÉTENDRE** (variante d'« A » limitée aux 2 sources réelles add/remove segment ;
pas de modif `stages.service.ts` car stage superseded). Pas de follow-up story nécessaire — sources câblées ici.

### 2. ~~Purge Redis anonyme~~ ⛔ SUPERSEDED (cache Redis Live + consentement supprimés) — sans objet

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

- [x] **Task 1** — Décider scope events (⚠️Discovery #1)
  - [x] Discuter avec Guillaume : **décision finale = ÉTENDRE 4.2** (2026-05-30). Découverte décisive : l'origine `nearest-trace` est calculée sur la **trace fusionnée de TOUTE l'aventure** (`resolve-origin.ts` → `ST_Collect`). Donc **ajouter/supprimer un segment** (actions qui EXISTENT déjà) modifie la trace et périme les accès des POI des AUTRES segments → invalidation au scope **aventure**. On câble ces 2 sources réelles (au lieu de laisser le handler dormant).
  - [x] Documenter la décision (docstrings producteurs/consommateur + Doc Sync ci-dessous)

- [x] **Task 2** — Helper SQL de reset (AC: 1, 2)
  - [x] Implémenté dans `AccessWorkerRepository` (Doc Sync : pas de fichier `strategies/invalidation-queries.ts` séparé — voir docstring repo) :
    - `resetAccessForAdventure(adventureId)` → UPDATE join via `adventure_segments`. **Sert AC #1 ET AC #2** (les deux invalident au scope aventure : trace fusionnée + profil pilotent tous deux l'ensemble des accès).
    - ~~`resetAccessForSegment` / `findEagerPoisForSegment`~~ — **retirés** : segment-scopé incorrect (cf. trace fusionnée). Le re-enqueue réutilise `findEagerPois` (aventure).
    - ~~`resetAccessForStage`~~ ⛔ SUPERSEDED (stage)
  - [x] Tests unitaires (repository.spec)

- [x] ~~**Task 3** — Créer helper `redis-cache-purge.ts` (AC: 5, ⚠️Discovery #2)~~ ⛔ **SUPERSEDED** — cache Redis Live + consentement supprimés. Aucun fichier créé.

- [x] **Task 4** — Ajouter les handlers @OnEvent dans `AccessWorkerService` (AC: 1, 2)
  - [x] `@OnEvent('adventure.trace-updated')` → reset **aventure** + re-enqueue (scope corrigé vs spec segment — Doc Sync AC #1)
  - [x] `@OnEvent('adventure.profile-changed')` → check newProfile != previous, reset + re-enqueue aventure
  - [x] Cœur partagé `invalidateAdventure(adventureId, reason)` (DRY entre les 2 handlers)
  - [x] ~~stage.updated / stage.deleted / profile.live-consent-revoked~~ ⛔ SUPERSEDED

- [x] **Task 5** — Tests (AC: 7)
  - [x] Unit handlers (service.spec) + repository.spec + producteurs (segments.service.test delete, gpx-parse.processor.test add) + E2E (vrai EventEmitter + @OnEvent, 2 changeTypes)
  - [x] Coverage ≥ 75% → **module access-worker 90.26% stmts / 91.34% lines** (`service.ts` 96%, `repository.ts` 100%) ; producteurs : `gpx-parse.processor.ts` 100% stmts, chemin delete de `segments.service.ts` couvert

- [x] **Task 6** — Émission des events sources (décision Task 1 = ÉTENDRE)
  - [x] `SegmentsService.deleteSegment` → émet `adventure.trace-updated` (`changeType: 'segment-removed'`)
  - [x] `GpxParseProcessor` (après écriture géométrie) → émet `adventure.trace-updated` (`changeType: 'segment-added'`)
  - [x] ~~`stages.service.ts`~~ ⛔ SUPERSEDED (stage)

- [x] **Task 7** — Doc Sync + commit (AC: 8)
  - [x] Doc Sync : scope aventure (vs segment), sources add/remove segment, déviation `strategies/` → repository — documentés (story + sprint-status + epics)
  - [ ] Commit (manuel — politique projet, laissé à Guillaume) : `feat(api): event-driven access cache invalidation (trace add/remove + profile) — story poi-access-4.2`

---

### Review Findings (code review 2026-05-31)

> Revue adversariale 3 couches (Blind Hunter / Edge Case Hunter / Acceptance Auditor) sur le scope 4.2.
> **Bilan : 0 decision-needed · 0 patch · 3 defer · ~13 dismissed.** Aucun Critical/High confirmé.
> Les deux couches indépendantes (Blind + Edge) ont convergé sur le même point réel (`dist_from_trace_m`),
> mais l'impact utilisateur est masqué par le lazy compute correct (`POST /pois/:id/access` recalcule sur la
> trace fusionnée courante). L'Acceptance Auditor n'a trouvé que des déviations déjà documentées (Doc Sync).

- [x] [Review][Defer] Éligibilité `findEagerPois` basée sur `dist_from_trace_m` périmé + segment-local [apps/api/src/pois/access-worker/access-worker.repository.ts (findEagerPois) + access-calculator] — deferred, pre-existing (maintenance de colonne héritée du flux d'insert POI, exposée par le flux trace-updated 4.2 ; correctness préservée par le lazy compute)
- [x] [Review][Defer] `GpxParseProcessor` ré-émet `adventure.trace-updated{segment-added}` sur chaque parse réussi, y compris retry/re-parse BullMQ [apps/api/src/segments/jobs/gpx-parse.processor.ts] — deferred (idempotent côté handler → pas de bug de correctness ; recompute aventure-wide superflu sur retry transitoire + label `changeType` inexact sur re-parse)
- [x] [Review][Defer] Aucun test d'intégration ne prouve le câblage réel producteur→consommateur via le vrai `EventEmitterModule` [apps/api/test/access-worker.e2e-spec.ts + producteurs] — deferred (câblage vérifié correct manuellement : `EventEmitterModule.forRoot()` dans `app.module.ts`, `AccessWorkerModule` importé via `PoisModule` ; mais l'e2e émet manuellement, ne traverse pas les vrais modules producteurs)

---

## Dev Notes

### Pattern projet — @OnEvent (tel qu'implémenté)

```typescript
import { OnEvent } from '@nestjs/event-emitter'

@Injectable()
export class AccessWorkerService {
  // Producteur : SegmentsService.deleteSegment + GpxParseProcessor émettent ce payload.
  @OnEvent('adventure.trace-updated')
  async handleTraceUpdated(event: { adventureId: string; segmentId?: string; changeType?: 'segment-added' | 'segment-removed' }) {
    await this.invalidateAdventure(event.adventureId, `trace-updated:${event.changeType}`)
  }
}
```

### ~~Pattern projet — Redis SCAN~~ ⛔ SUPERSEDED

Purge Redis (consent Live) retirée — cache Live + consentement supprimés. Bloc supprimé (était lié à AC #5).

### Pattern projet — Émission best-effort côté producteur

`SegmentsService` / `GpxParseProcessor` émettent `adventure.trace-updated` via `EventEmitter2` (global,
`EventEmitterModule.forRoot()` dans `app.module`). L'émission est non bloquante : un listener ne doit pas
faire échouer le DELETE de segment ni le job de parse. Émettre APRÈS le commit de l'effet (delete / parse OK).

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-4.2]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Stratégie-Invalidation]
- [Source: apps/api/src/pois/access-calculator/strategies/resolve-origin.ts] — origine `nearest-trace` sur trace fusionnée (`ST_Collect`) → justifie le scope aventure
- [Source: _bmad-output/implementation-artifacts/poi-access-4-1-...md] — worker + enqueue patterns
- [Source: _bmad-output/implementation-artifacts/poi-access-2-6-...md] — event adventure.profile-changed source

---

## Dev Agent Record

### Agent Model Used
Claude Opus 4.8 (claude-opus-4-8) — BMad `dev-story` workflow, 2026-05-30

### Completion Notes List
- **Scope events retenu : ÉTENDRE** (décision finale Guillaume 2026-05-30, cf. Task 1). Découverte décisive en cours d'implémentation : l'origine `nearest-trace` est calculée sur la **trace fusionnée de toute l'aventure** (`resolve-origin.ts` → `ST_Collect`). Donc **add/remove segment** (actions existantes) périment les accès des POI des autres segments → invalidation au **scope aventure**. On câble ces 2 sources réelles. AC #3/#4 (stage) + AC #5 (purge Redis consent) **SUPERSEDED** — non implémentés.
- **Correction de scope AC #1 (Doc Sync majeur)** : le spec demandait un reset `WHERE segment_id` (segment-scopé). ❌ Incorrect vu la trace fusionnée → `resetAccessForAdventure` (scope aventure). Méthodes `resetAccessForSegment`/`findEagerPoisForSegment` **retirées** (auraient été du code mort/faux). `handleTraceUpdated` et `handleProfileChanged` partagent un cœur `invalidateAdventure`.
- **Sources `adventure.trace-updated` câblées** : `SegmentsService.deleteSegment` (`segment-removed`, après `recomputeCumulativeDistances`) + `GpxParseProcessor` (`segment-added`, après écriture géométrie + commit du parse — pas sur parse échoué). Émission best-effort (un listener ne fait pas échouer le DELETE / le job). `EventEmitter2` injecté (global via `forRoot`).
- **Re-enqueue strategy : jobId enrichi `${poiId}:${engineVersion}:reset:${Date.now()}`** (⚠️Discovery #3). Indispensable : le jobId du pré-calcul `…:null` survit dans le set `completed` BullMQ (`removeOnComplete: { count: 100 }`) → ré-enfiler à l'identique = no-op, le POI reset resterait à NULL. Un discriminant unique force un vrai recalcul.
- **Ordre reset → enqueue** (⚠️Discovery #4) : reset DB d'abord (rend les POI éligibles), puis `findEagerPois`, puis enqueue best-effort (try/catch par POI, le lazy compute compense un enqueue raté). Pattern repris de la boucle résiliente 4.1 (patch P4).
- **Déviation `strategies/invalidation-queries.ts` → `AccessWorkerRepository`** : SQL reset ajouté au repository existant (la 4.1 y a déjà consolidé l'accès DB ; règle projet « toutes les requêtes Drizzle dans UN repository »). Pas de dossier `strategies/`.
- **Idempotence AC #2** : skip si `newProfile === previousProfile` (défensif ; la 2.6 garde déjà l'émission).
- **Délimitation `reorderSegments`** : PAS d'émission — réordonner ne change pas l'ensemble de points de la trace fusionnée, donc `ST_ClosestPoint` (origine nearest-trace) est invariant.
- **Coverage : module access-worker 90.26% stmts / 91.34% lines** (`service.ts` 96%, `repository.ts` 100%) ; `gpx-parse.processor.ts` 100% stmts ; chemin delete de `segments.service.ts` couvert. Seuil AC #7 (≥75%) dépassé.
- **Validation** : tsc clean, ESLint clean, **suite API unit 376/376 verte**, **E2E access-worker 7/7 verts** (était 3 — +4 pour les events 4.2 via vrai EventEmitter + @OnEvent, 2 `changeType`).

### File List
- [x] `apps/api/src/pois/access-worker/access-worker.service.ts` (modifié — handlers `handleTraceUpdated`/`handleProfileChanged` scope aventure + cœur `invalidateAdventure` + `reenqueue` jobId enrichi)
- [x] `apps/api/src/pois/access-worker/access-worker.service.spec.ts` (modifié — tests des 2 handlers, scope aventure)
- [x] `apps/api/src/pois/access-worker/access-worker.repository.ts` (modifié — `resetAccessForAdventure` ; retrait des variantes segment-scopées)
- [x] `apps/api/src/pois/access-worker/access-worker.repository.spec.ts` (modifié)
- [x] `apps/api/src/segments/segments.service.ts` (modifié — export event `ADVENTURE_TRACE_UPDATED_EVENT` + payload ; émission `segment-removed` dans `deleteSegment` ; injection `EventEmitter2`)
- [x] `apps/api/src/segments/segments.service.test.ts` (modifié — mock `EventEmitter2` + assertions émission delete)
- [x] `apps/api/src/segments/jobs/gpx-parse.processor.ts` (modifié — émission `segment-added` après écriture géométrie ; injection `EventEmitter2`)
- [x] `apps/api/src/segments/jobs/gpx-parse.processor.test.ts` (modifié — mock `EventEmitter2` + assertions émission/non-émission)
- [x] `apps/api/test/access-worker.e2e-spec.ts` (modifié — E2E trace-updated [add+remove] + profile-changed)
- ~~`strategies/redis-cache-purge.ts` / `strategies/invalidation-queries.ts`~~ ⛔ non créés (superseded / consolidé dans repo)
- ~~`adventures.service.ts` / `stages.service.ts`~~ ⛔ N/A (profile-changed déjà émis par 2.6 ; stage superseded)

### Change Log
| Date | Change |
|---|---|
| 2026-05-30 | Story 4.2 implémentée — **invalidation event-driven du cache d'accès POI au scope aventure**. Handlers `adventure.trace-updated` (AC#1) + `adventure.profile-changed` (AC#2) → `resetAccessForAdventure` + re-enqueue (jobId enrichi `:reset:<ts>`). **Scope corrigé segment→aventure** (origine nearest-trace sur trace fusionnée). **Sources `trace-updated` câblées** : `deleteSegment` (segment-removed) + `GpxParseProcessor` (segment-added) — couvre FR-PA-015. AC#3/#4/#5 superseded. Tests : service + repo + 2 producteurs + 7 E2E. Coverage access-worker 90.3%. tsc/ESLint clean, 376 unit + 7 e2e verts. |
