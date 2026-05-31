---
baseline_commit: 4eedb11cc26c48e6f1b739c4fd5bc93253ef3e50
---

# Story POI-Access 4.1 : Worker BullMQ `poi-access-calculation` (pré-calcul eager)

Status: done

> **⚠️ RÉVISION REQUISE — 2026-05-30 (pivot `nearest-trace` + retrait mode Live GPS).** Avant implémentation, intégrer :
> 1. **Origine du pré-calcul = `nearest-trace`** (PAS `stage`/`adventure-start`). L'UI ne requête que `nearest-trace` ;
>    pré-calculer en `stage` stockerait des entrées (stageId=uuid) jamais lues par l'UI → cache inutile. `adventure-start`
>    a été supprimée du code (review). Le `stageId` dans `jobId`/payload est donc toujours `null`.
> 2. **Signature `compute()` changée** : `mode`/`userId` ont été RETIRÉS (le mode Live GPS n'existe plus). Appeler
>    `accessCalculatorService.compute({ poiId, origin: { type: 'nearest-trace' }, profileOverride })`.
> 3. **Pré-requis résolu** : le cache DB persiste désormais (migration `0017` : `access_geometry` → `geometry(GEOMETRY,4326)`
>    + `ST_Force2D` ; bug « 0/1770 persisté » corrigé le 2026-05-30). Le worker écrit donc bien.
> Cf. bannière de tête d'Epic 4 dans `epics-poi-access-routing.md`.

<!-- Dépend de : 2.2 (AccessCalculatorService), 1.3 (schéma DB), 1.4 (EventEmitter, audit Bull Board). -->

## Story

As a **end user uploading a new adventure**,
I want the access routes for nearby POIs to be pre-computed in the background so the data is ready when I open the map,
So that I never see a loading skeleton on common POIs.

## Acceptance Criteria

1. **Given** le module `AccessWorkerModule` à créer dans `apps/api/src/pois/access-worker/`, **When** je le crée, **Then** :
   - Enregistre la queue `poi-access-calculation` via `BullModule.registerQueue({ name: 'poi-access-calculation' })`
   - Imports : `AccessCalculatorModule` (pour orchestrer le calcul), `DatabaseModule` (pour lookup POIs filtrés), `EventEmitterModule` (pour `@OnEvent`)
   - Provider : `AccessWorkerProcessor` + `AccessWorkerService` (logique d'enqueue)

2. **Given** le processor `access-worker.processor.ts`, **When** je le définis, **Then** :
   - Décorateur `@Processor('poi-access-calculation', { concurrency: 5 })`
   - Handler `@Process('compute-access')` (ou nom du job décidé)
   - Stratégie retry : 3 tentatives, backoff exponentiel (1s, 5s, 25s) via options de job au moment de l'add
   - Dead letter queue : `poi-access-failures` (enregistrée séparément, log + ne bloque pas)
   - `jobId` configuré pour idempotence : `${poiId}:${engineVersion}:${stageId ?? 'null'}` — re-enqueue avec même jobId = no-op

3. **Given** un job en cours, **When** le processor traite, **Then** :
   - Appelle ~~`accessCalculatorService.compute({ poiId, origin, mode: 'planning', profileOverride })`~~ **`accessCalculatorService.compute({ poiId, origin: { type: 'nearest-trace' }, profileOverride })`** _(MAJ 2026-05-30 : `mode` retiré, origine `nearest-trace`)_
   - Succès → UPDATE DB déjà fait par AccessCalculator
   - Échec définitif après 3 retries → handler `@OnQueueFailed` met `access_failed = true` + `access_computed_at = NOW()` (évite recalcul perpétuel)
   - Logs structurés à chaque étape (start, success, failure)

4. **Given** un trigger d'upload d'aventure terminé (corridor search + `dist_from_trace_m` calculé pour chaque POI), **When** un event `'adventure.corridor-ready'` est émis avec payload `{ adventureId }`, **Then** :
   - Handler `@OnEvent('adventure.corridor-ready')` dans `AccessWorkerService` :
     1. Lookup les POI éligibles : `WHERE adventure_id = $1 AND dist_from_trace_m < ACCESS_EAGER_THRESHOLD_M (1500) AND access_computed_at IS NULL AND access_failed = false`
     2. Pour chaque POI : enqueue un job avec payload `{ poiId, adventureId, profile, engineVersion }` _(MAJ 2026-05-30 : plus de `stageId` — origine `nearest-trace`, stageId toujours null)_
     3. Jobs traités en background sans bloquer la réponse HTTP de l'upload

5. **Given** l'event source `'adventure.corridor-ready'` n'existe pas encore (Story scope-extérieur), **When** cette story est mergée, **Then** :
   - Le handler `@OnEvent` est EN PLACE mais ne reçoit aucun event (silent no-op pour MVP)
   - Documenter dans le commit message + audit que l'event source doit être ajouté dans une story future (probablement adventures.service.ts trigger après corridor search)
   - Alternatif MVP : enqueue manuel via endpoint `POST /admin/access/recompute-adventure/:id` (out of scope ici)

6. **Given** un nouveau push avec bump de `ACCESS_ENGINE_VERSION`, **When** l'API redémarre, **Then** :
   - AUCUN job de recalcul global n'est enqueue (pas de pic de charge)
   - Le recalcul se fait LAZY au prochain accès du POI (la vérif version est dans `AccessCalculatorService.compute` Story 2.2 cache check)

7. **Given** les tests unitaires et E2E, **When** je les écris :
   - `access-worker.processor.spec.ts` : mock AccessCalculator + Queue, vérif handler appelle compute
   - `access-worker.service.spec.ts` : mock DB + Queue, event reçu → enqueue les bons POI avec bons payloads
   - E2E `apps/api/test/access-worker.e2e-spec.ts` : émettre event → vérifier jobs enqueued (via Bull Board API ou queue inspect)
   - Idempotence : re-émettre event → même jobIds → pas de double traitement
   - Coverage ≥ 80%

8. **Given** la story terminée, **When** je commit :
   - `apps/api/src/pois/access-worker/access-worker.module.ts` (nouveau)
   - `apps/api/src/pois/access-worker/access-worker.processor.ts` (nouveau)
   - `apps/api/src/pois/access-worker/access-worker.service.ts` (nouveau)
   - `apps/api/src/pois/access-worker/access-worker.processor.spec.ts` (nouveau)
   - `apps/api/src/pois/access-worker/access-worker.service.spec.ts` (nouveau)
   - `apps/api/src/pois/access-worker/types/access-job-payload.ts` (nouveau)
   - `apps/api/test/access-worker.e2e-spec.ts` (nouveau)
   - `apps/api/src/pois/pois.module.ts` (modifié — import AccessWorkerModule)
   - Doc Sync si écart

---

## ⚠️ Critical Discovery Notes

### 1. BullMQ pattern existant — Density Analysis

Le projet a déjà 2 queues : `gpx-processing` et `density-analysis` (cf. project-context §BullMQ Job Queues). Étudier le pattern existant :
```bash
find apps/api/src -name "*.processor.ts"
grep -A 10 "@Processor" apps/api/src/density-analysis/
```
Réutiliser EXACTEMENT le même pattern (naming, concurrency declaration, retry config, error handling).

### 2. Event `'adventure.corridor-ready'` — source à clarifier

L'event est mentionné dans l'architecture comme trigger. Mais **rien ne le déclenche actuellement** dans le code existant (le corridor search retourne synchronement les POI à la réponse de l'upload).

Options :
- **A.** Modifier `adventures.service.ts` ou `gpx-processing` worker pour émettre l'event APRÈS corridor search done — extension out of scope strict mais nécessaire pour Story 4.1 fonctionne
- **B.** Cette story crée juste le handler, la modification source est une story future (à créer)
- **C.** Polling : un cron job qui scan régulièrement les POI sans access calculé → enqueue (anti-pattern, moins propre)

Recommandation : **B** + créer un TODO bien visible dans le code + ajouter une story future `poi-access-X-Y-emit-corridor-ready-event.md` à anticiper.

### 3. Concurrency 5 — préserver les ressources VPS

Cf. archi §Communication NestJS ↔ BullMQ : `concurrency: 5` max simultanés. Important parce que :
- BRouter accepte une requête à la fois (single-threaded JVM)
- DB Postgres accepte les concurrent UPDATE mais pool max 10
- VPS RAM partagée

→ Ne PAS augmenter cette valeur sans benchmark.

### 4. Dead letter queue — pattern projet

Vérifier si `density-analysis` a déjà une DLQ. Si oui : réutiliser le pattern. Si non : créer pour `poi-access` mais aussi documenter dans audit (Story 4.3) que les autres queues devraient en avoir.

### 5. `accommodations_cache` pas `pois` — colonne lookup

Les POI accommodations sont dans `accommodations_cache` (cf. Story 1.3 schéma). Le `WHERE dist_from_trace_m < 1500` se fait sur cette table, pas sur une table `pois` générique. À adapter dans la query Drizzle.

---

## Tasks / Subtasks

- [x] **Task 1** — Étudier le pattern Density Analysis (⚠️Discovery #1)
  - [x] Lire le processor existant — fichier réel : `apps/api/src/density/jobs/density-analyze.processor.ts` (+ `gpx-parse.processor.ts`)
  - [x] Identifier : `WorkerHost` + `@Processor` + `process()` ; queues enregistrées CENTRALEMENT dans `QueuesModule` (`BullModule.forRoot` + `registerQueue`) ; retry/backoff GLOBAUX dans `bullmq.config.ts` (attempts 3, exponentiel 1s) ; error handling = re-throw pour laisser BullMQ retry ; pas de DLQ existante
  - [x] Documenté dans les Completion Notes

- [x] **Task 2** — Créer la structure module (AC: 1)
  - [x] `access-worker.module.ts` avec imports (`QueuesModule`, `AccessCalculatorModule`) + providers (processor, service, repository)
  - [x] Modifier `pois.module.ts` pour importer `AccessWorkerModule`

- [x] **Task 3** — Définir types et job payload (AC: 2)
  - [x] `types/access-job-payload.ts` — **DÉVIATION (pivot nearest-trace)** : `stageId` retiré (toujours null), `profile: BrouterProfile` → `routingProfile: string` (profil projet brut, observabilité ; non repassé en override — `compute()` dérive le profil BRouter de la DB). Payload final : `{ poiId, adventureId, routingProfile, engineVersion }`. Ajout `AccessFailurePayload` (DLQ).

- [x] **Task 4** — Implémenter `AccessWorkerProcessor` (AC: 2, 3)
  - [x] `@Processor('poi-access-calculation', { concurrency: 5 })`
  - [x] Handler `process()` (pattern `WorkerHost`) → `accessCalculator.compute({ poiId, origin: { type: 'nearest-trace' } })` ; `fallback` NON relancé (POI reste éligible) ; `error`/exception propagée pour retry
  - [x] Retry (3, backoff exp) — **DÉVIATION** : hérité des `defaultJobOptions` globaux (`bullmq.config.ts`) plutôt que surchargé par job, pour cohérence avec `gpx`/`density` (⚠️Discovery #1). Délais effectifs 1s/2s/4s (vs « 1s/5s/25s » illustratif de l'AC).
  - [x] `@OnWorkerEvent('failed')` (pattern @nestjs/bullmq, pas `@OnQueueFailed`) → à l'échec définitif : `access_failed = true` + `access_computed_at = NOW()`

- [x] **Task 5** — Configurer DLQ `poi-access-failures` (AC: 2, ⚠️Discovery #4)
  - [x] Queue enregistrée dans `QueuesModule` (pattern central)
  - [x] Jobs en échec définitif routés vers la DLQ via `@OnWorkerEvent('failed')` (payload `AccessFailurePayload`)

- [x] **Task 6** — Implémenter `AccessWorkerService` avec handler event (AC: 4, ⚠️Discovery #2, #5)
  - [x] `@OnEvent('adventure.corridor-ready')` → `repo.findEagerPois()` → enqueue avec `jobId` idempotent `${poiId}:${engineVersion}:null`
  - [x] Commentaire TODO bien visible (en-tête service) : source d'event non implémentée → story future
  - [x] Tests : `access-worker.service.spec.ts` (mock repo + Queue) + `access-worker.repository.spec.ts` (mock `db`)

- [x] **Task 7** — Tests E2E (AC: 7)
  - [x] **DÉVIATION (scope MVP)** : E2E sans infra Redis/DB réelle (project-context §Testing diffère les E2E infra). `access-worker.e2e-spec.ts` boote `EventEmitterModule.forRoot()` + service réel + repo/queue mockés → valide la chaîne event→`@OnEvent`→enqueue + idempotence des jobIds.
  - [x] Échec définitif → `markAccessFailed` après retries : couvert par les unit tests du processor (`onFailed`).

- [x] **Task 8** — Doc Sync + commit (AC: 8)
  - [x] TODO event source documenté dans le code (en-tête `access-worker.service.ts`) + Completion Notes
  - [ ] Commit (laissé à Guillaume) : `feat(api): BullMQ worker poi-access-calculation for eager pre-compute (concurrency 5, retry 3, DLQ) — story poi-access-4.1`

---

## Dev Notes

### Pattern projet — BullMQ via @nestjs/bullmq

```typescript
import { BullModule } from '@nestjs/bullmq'

@Module({
  imports: [BullModule.registerQueue({ name: 'poi-access-calculation' })],
  providers: [AccessWorkerProcessor],
})
export class AccessWorkerModule {}
```

### Pattern projet — Job options retry

```typescript
await this.queue.add('compute-access', payload, {
  jobId: `${poiId}:${engineVersion}:${stageId ?? 'null'}`,  // idempotence
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },  // 1s, 5s (×5), 25s (×5)
})
```

### Pattern projet — Logger structuré

Cf. archi §Error Handling Standards : format JSON, champs `level, timestamp, service, traceId, poiId, durationMs, engineVersion, status`. Réutiliser le logger NestJS par défaut + format JSON si configuré.

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-4.1]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Communication-NestJS-BullMQ]
- [Source: _bmad-output/project-context.md#BullMQ-Job-Queues]
- [Source: _bmad-output/implementation-artifacts/poi-access-2-2-...md] — AccessCalculator
- [Source: _bmad-output/implementation-artifacts/poi-access-1-3-...md] — schéma + index access_pending

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — workflow `bmad-dev-story`.

### Completion Notes List
- Pattern density-analysis appliqué : ☑ Oui (réf : `apps/api/src/density/jobs/density-analyze.processor.ts` + `segments/jobs/gpx-parse.processor.ts`). `WorkerHost` + `@Processor` + `process()` ; queues enregistrées dans `QueuesModule`.
- Source event 'adventure.corridor-ready' : ☑ TODO documenté (silent no-op MVP). AUCUN code n'émet l'event — handler en place, TODO bien visible en en-tête de `access-worker.service.ts`. **Story future à créer** (`poi-access-X-Y-emit-corridor-ready-event`) : émission après corridor search, probablement dans `adventures.service.ts` ou le worker `gpx-processing`, une fois `dist_from_trace_m` calculé.
- DLQ pattern existant réutilisé : ☐ Non (créé) — le projet n'avait aucune DLQ. `poi-access-failures` créée ; à généraliser aux autres queues (à noter dans l'audit Story 4.3).
- Coverage tests module : **86.95 % lignes / 100 % fonctions** (≥ 80 % AC #7). Non couvert : wiring DI du `.module.ts` (conventionnellement non testé) + branche défensive `status==='error'` du processor (jamais atteinte — `compute()` throw au lieu de la retourner).
- **AC #6 (pas de recalcul global au bump de version)** : satisfait par construction — le worker ne réagit QU'À l'event `adventure.corridor-ready` ; aucun job de recalcul au démarrage n'est enqueue. La vérif `engineVersion` reste lazy dans `AccessCalculatorService.compute()` (Story 2.2). Rien à implémenter.
- **Contrat fallback** : `compute()` ne throw pas si BRouter est indispo (`status: 'fallback'`, non persisté). Le processor ne relance donc PAS le job sur fallback (sinon `access_failed` marqué en masse pendant une coupure transitoire) — le POI reste éligible pour un re-pré-calcul / calcul lazy. Seules les vraies exceptions déclenchent retry → échec définitif → `access_failed = true` + DLQ.
- **Déviations Doc Sync** : (1) queues enregistrées dans `QueuesModule` (pattern central) et non dans le module worker ; (2) `AccessWorkerRepository` injectable ajouté (non listé au spec) pour respecter la règle « requêtes Drizzle en repository » + testabilité ; (3) payload `routingProfile: string` au lieu de `profile: BrouterProfile`, `stageId` retiré (pivot) ; (4) retry hérité des `defaultJobOptions` globaux ; (5) E2E sans infra réelle. Détails dans les Tasks et en en-tête de chaque fichier.
- Validation : `tsc --noEmit` OK, `eslint` OK, suite complète API **360 tests / 32 suites** verte (aucune régression), E2E 3 tests verts.
- **Commit non effectué** (politique : commit sur demande). Reste à committer par Guillaume (cf. Task 8).

### File List
- `apps/api/src/pois/access-worker/access-worker.module.ts` (nouveau)
- `apps/api/src/pois/access-worker/access-worker.processor.ts` (nouveau)
- `apps/api/src/pois/access-worker/access-worker.service.ts` (nouveau)
- `apps/api/src/pois/access-worker/access-worker.repository.ts` (nouveau — déviation documentée)
- `apps/api/src/pois/access-worker/access-worker.constants.ts` (nouveau — noms queues/jobs centralisés)
- `apps/api/src/pois/access-worker/types/access-job-payload.ts` (nouveau)
- `apps/api/src/pois/access-worker/access-worker.processor.spec.ts` (nouveau)
- `apps/api/src/pois/access-worker/access-worker.service.spec.ts` (nouveau)
- `apps/api/src/pois/access-worker/access-worker.repository.spec.ts` (nouveau)
- `apps/api/test/access-worker.e2e-spec.ts` (nouveau)
- `apps/api/src/queues/queues.module.ts` (modifié — enregistrement des 2 queues)
- `apps/api/src/pois/pois.module.ts` (modifié — import `AccessWorkerModule`)

### Change Log
- 2026-05-30 — Implémentation Story 4.1 : worker BullMQ `poi-access-calculation` (pré-calcul eager, origine `nearest-trace`, concurrency 5, retry 3 hérité global, DLQ `poi-access-failures`, handler `@OnEvent('adventure.corridor-ready')` en silent no-op MVP). 11 fichiers (+`access-worker.repository.ts`/`.constants.ts` hors spec, documentés). Tests : 16 unit + 3 e2e, coverage 86.95 %. Status → review.

---

### Review Findings

> Revue adversariale `bmad-code-review` du 2026-05-30 (3 couches : Blind Hunter, Edge Case Hunter, Acceptance Auditor). 4 patch · 4 defer · 7 dismissed. Aucune `decision-needed`. Aucun Critical/High confirmé (l'alerte off-by-one `attemptsMade` a été vérifiée FAUSSE contre bullmq@5.71.0 — l'arithmétique est correcte).

**Patch (à corriger)**

- [x] [Review][Patch] Branche `status === 'error'` avale une vraie erreur en succès silencieux — `return` au lieu de propager → si le contrat de `compute()` change, le POI est marqué « succès » (pas de retry, pas de `access_failed`, `access_computed_at` reste NULL pour toujours). Devrait `throw` (retry → DLQ). [access-worker.processor.ts] — **CORRIGÉ** : `throw` au lieu de `return` + test `throws on an error-status result`.
- [x] [Review][Patch] Dépôt DLQ perdu sur erreur du handler — `markAccessFailed` puis `dlq.add` dans le même `try` : si `dlq.add` jette après le mark, le POI est `access_failed=true` MAIS absent de la DLQ (invisible aux 2 surfaces de récupération). Réordonner DLQ-first ou try/catch indépendants. [access-worker.processor.ts] — **CORRIGÉ** : DLQ d'abord + 2 try/catch indépendants + 2 tests (mark throws → DLQ déposée ; DLQ throws → mark effectué).
- [x] [Review][Patch] `dlq.add` sans `jobId` → doublons en DLQ si l'event `'failed'` re-fire (stalled-job recovery). Passer un `jobId` déterministe (ex. `${poiId}:${engineVersion}:failed`) pour dédupliquer. [access-worker.processor.ts] — **CORRIGÉ** : `jobId: ${poiId}:${engineVersion}:failed` + assertion test.
- [x] [Review][Patch] `handleCorridorReady` : un `queue.add` qui jette interrompt la boucle `for` → les POIs restants sont silencieusement ignorés (la rejection est avalée par `emitAsync`, aucune source d'event ne re-déclenche). Envelopper chaque enqueue dans try/catch + continue (ou utiliser `addBulk`). [access-worker.service.ts] — **CORRIGÉ** : try/catch best-effort par enqueue + compteurs `enqueued`/`failed` loggés.

**Defer (réel mais cause-racine hors de ce diff — `AccessCalculatorService` / Story 2.2, ou latent jusqu'à la source d'event)**

- [x] [Review][Defer] Clé de cache omet le profil → un appel lazy avec `profileOverride` différent reçoit la géométrie eager (profil par défaut). [apps/api/src/pois/access-calculator/access-calculator.service.ts] — deferred, pre-existing (design cache Story 2.2)
- [x] [Review][Defer] Collision sur la ligne de cache unique entre origine `nearest-trace` (eager) et `stage` (lazy) → travail eager écrasé / thrashing. Probablement sans objet post-pivot `nearest-trace`-only, mais le chemin `origin: stage` existe encore dans le DTO/service. [apps/api/src/pois/access-calculator/access-calculator.service.ts] — deferred, pre-existing
- [x] [Review][Defer] POI sur la trace (`dist_from_trace_m ≈ 0`) → résultat ~0 m non persisté par `compute()` → `access_computed_at` reste NULL → ré-enfilé à chaque `corridor-ready` (gaspillage, latent jusqu'à la source d'event). [apps/api/src/pois/access-worker/access-worker.repository.ts:439 + calculator short-circuit] — deferred, pre-existing
- [x] [Review][Defer] Le chemin de lecture lazy n'honore PAS `access_failed` → un POI en échec définitif (marqué par ce worker) est recalculé à chaque requête lazy, annulant le bénéfice du flag côté lecture. Le fix appartient au gate de cache-hit de `compute()`. [apps/api/src/pois/access-calculator/access-calculator.service.ts] — deferred, pre-existing

**Dismissed (bruit / faux positifs / déviations documentées et saines)**

- Off-by-one `attemptsMade < maxAttempts` (alerte Blind « feature jamais déclenchée ») — **vérifié FAUX** : bullmq@5.71.0 incrémente `attemptsMade` dans `moveToFailed` AVANT d'émettre `'failed'` → `3 < 3 = false` marque bien l'échec définitif. Logique correcte.
- Backoff effectif `1s/2s/4s` vs `1s/5s/25s` de l'AC #2 — déviation documentée et saine (hérité des `defaultJobOptions` globaux, cohérence `gpx`/`density`, Discovery #1).
- `@OnWorkerEvent('failed')` vs `@OnQueueFailed` de l'AC #3 — simple terminologie legacy-Bull ; `@nestjs/bullmq` (BullMQ v5) n'expose que `@OnWorkerEvent`.
- Payload `routingProfile: string` vs `profile: BrouterProfile` + retrait `stageId` — déviation documentée et saine (profil dérivé en DB par `compute()`, parité cache lazy garantie).
- Lookup par jointure `segment_id` au lieu de `adventure_id` direct — réalisation correcte (`accommodations_cache` n'a pas de colonne `adventure_id`, Discovery #5).
- Cast `r.routing_profile as string` sur colonne potentiellement nullable — inoffensif (champ d'observabilité/log uniquement, non repassé à `compute()`).
- Tests « false confidence » (e2e idempotence sur queue mockée, mock `attemptsMade` fabriqué, `failedAt` non asserté) — déviation E2E « sans infra réelle » documentée pour le MVP ; la sémantique BullMQ réelle a été vérifiée indépendamment par la couche Edge Case.
