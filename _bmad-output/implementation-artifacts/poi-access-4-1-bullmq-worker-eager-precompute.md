# Story POI-Access 4.1 : Worker BullMQ `poi-access-calculation` (pré-calcul eager)

Status: ready-for-dev

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
   - Appelle `accessCalculatorService.compute({ poiId, origin, mode: 'planning', profileOverride })`
   - Succès → UPDATE DB déjà fait par AccessCalculator
   - Échec définitif après 3 retries → handler `@OnQueueFailed` met `access_failed = true` + `access_computed_at = NOW()` (évite recalcul perpétuel)
   - Logs structurés à chaque étape (start, success, failure)

4. **Given** un trigger d'upload d'aventure terminé (corridor search + `dist_from_trace_m` calculé pour chaque POI), **When** un event `'adventure.corridor-ready'` est émis avec payload `{ adventureId }`, **Then** :
   - Handler `@OnEvent('adventure.corridor-ready')` dans `AccessWorkerService` :
     1. Lookup les POI éligibles : `WHERE adventure_id = $1 AND dist_from_trace_m < ACCESS_EAGER_THRESHOLD_M (1500) AND access_computed_at IS NULL AND access_failed = false`
     2. Pour chaque POI : enqueue un job avec payload `{ poiId, adventureId, stageId: <premier stage si existe sinon null>, profile, engineVersion }`
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

- [ ] **Task 1** — Étudier le pattern Density Analysis (⚠️Discovery #1)
  - [ ] Lire `apps/api/src/density-analysis/density.processor.ts` (ou équivalent)
  - [ ] Identifier : module structure, queue registration, processor decoration, retry config, error handling, DLQ
  - [ ] Documenter dans audit

- [ ] **Task 2** — Créer la structure module (AC: 1)
  - [ ] `access-worker.module.ts` avec imports + providers
  - [ ] Modifier `pois.module.ts` pour importer

- [ ] **Task 3** — Définir types et job payload (AC: 2)
  - [ ] `types/access-job-payload.ts` :
    ```typescript
    export interface AccessJobPayload {
      poiId: string
      adventureId: string
      stageId: string | null
      profile: BrouterProfile
      engineVersion: string
    }
    ```

- [ ] **Task 4** — Implémenter `AccessWorkerProcessor` (AC: 2, 3)
  - [ ] `@Processor('poi-access-calculation', { concurrency: 5 })`
  - [ ] Handler `compute-access` : appelle `accessCalculator.compute()`
  - [ ] Configurer retry (3, backoff exp) via options job
  - [ ] `@OnQueueFailed` → UPDATE `access_failed = true`

- [ ] **Task 5** — Configurer DLQ `poi-access-failures` (AC: 2, ⚠️Discovery #4)
  - [ ] Enregistrer la queue
  - [ ] Routing des jobs failed définitif → DLQ

- [ ] **Task 6** — Implémenter `AccessWorkerService` avec handler event (AC: 4, ⚠️Discovery #2, #5)
  - [ ] `@OnEvent('adventure.corridor-ready')` → query DB éligibles → enqueue avec idempotent jobId
  - [ ] Commentaire TODO bien visible : "L'event source n'est PAS encore implémenté — voir story future"
  - [ ] Tests : mock DB + Queue, vérifier enqueue correct

- [ ] **Task 7** — Tests E2E (AC: 7)
  - [ ] Setup Redis + DB de test
  - [ ] Émettre event manuellement → vérifier jobs dans queue
  - [ ] Force failure d'un job → vérifier UPDATE failed après 3 retries

- [ ] **Task 8** — Doc Sync + commit (AC: 8)
  - [ ] Doc archi : noter le TODO event source
  - [ ] Commit : `feat(api): BullMQ worker poi-access-calculation for eager pre-compute (concurrency 5, retry 3, DLQ) — story poi-access-4.1`

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
_(À renseigner)_

### Completion Notes List
- Pattern density-analysis appliqué : ☐ Oui (référence : `___`)
- Source event 'adventure.corridor-ready' : ☐ Existant / ☐ TODO documenté
- DLQ pattern existant réutilisé : ☐ Oui / ☐ Non (créé)
- Coverage tests : `___%`

### File List
- [ ] `apps/api/src/pois/access-worker/access-worker.module.ts`
- [ ] `apps/api/src/pois/access-worker/access-worker.processor.ts`
- [ ] `apps/api/src/pois/access-worker/access-worker.service.ts`
- [ ] `apps/api/src/pois/access-worker/access-worker.processor.spec.ts`
- [ ] `apps/api/src/pois/access-worker/access-worker.service.spec.ts`
- [ ] `apps/api/src/pois/access-worker/types/access-job-payload.ts`
- [ ] `apps/api/test/access-worker.e2e-spec.ts`
- [ ] `apps/api/src/pois/pois.module.ts` (modifié)
