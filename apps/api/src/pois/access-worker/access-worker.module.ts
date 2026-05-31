/**
 * AccessWorkerModule (Story 4.1) — worker BullMQ de pré-calcul eager des accès POI.
 *
 * ── Notes vs spec (AC #1, Doc Sync) ────────────────────────────────────────────────────
 *  - Les queues `poi-access-calculation` + `poi-access-failures` (DLQ) sont enregistrées
 *    CENTRALEMENT dans `QueuesModule` (`BullModule.registerQueue`), comme `gpx-processing` /
 *    `density-analysis` — pattern projet existant (⚠️Discovery #1). Ce module importe donc
 *    `QueuesModule` au lieu de re-déclarer `registerQueue` localement.
 *  - `AccessCalculatorModule` fournit `AccessCalculatorService` (orchestration du calcul).
 *  - Pas de `DatabaseModule` (inexistant) : `AccessWorkerRepository` utilise le singleton `db`.
 *  - Pas d'`EventEmitterModule` importé : `EventEmitterModule.forRoot()` est global (app.module).
 */
import { Module } from '@nestjs/common'
import { QueuesModule } from '../../queues/queues.module.js'
import { AccessCalculatorModule } from '../access-calculator/access-calculator.module.js'
import { AccessWorkerProcessor } from './access-worker.processor.js'
import { AccessWorkerService } from './access-worker.service.js'
import { AccessWorkerRepository } from './access-worker.repository.js'

@Module({
  imports: [QueuesModule, AccessCalculatorModule],
  providers: [AccessWorkerProcessor, AccessWorkerService, AccessWorkerRepository],
})
export class AccessWorkerModule {}
