# Story POI-Access 4.3 : Observabilité — Métriques BullMQ + Uptime Kuma + Sentry + Logs

Status: ready-for-dev

<!-- Dépend de : 4.1 (queue active), 4.2 (handlers actifs), 1.5 (Uptime Kuma BRouter monitor existant). -->

## Story

As a **DevOps engineer running the app in production**,
I want metrics, alerts and structured logs for the access routing pipeline,
So that I can detect BRouter outages, queue backlogs, and silent failures before users complain.

## Acceptance Criteria

1. **Given** Bull Board (audit Story 1.4), **When** je le configure pour `poi-access-calculation`, **Then** :
   - Si Bull Board déjà installé : ajouter la queue `poi-access-calculation` (+ DLQ `poi-access-failures`) au dashboard existant
   - Si pas installé : ajouter `@bull-board/api` + `@bull-board/express` au projet, mount sur `/admin/queues` (protégé par auth admin si existant, sinon par variable d'env `BULL_BOARD_ENABLED`)
   - Le dashboard affiche : queue depth, active jobs, failed jobs (24h), avg processing time, completed jobs

2. **Given** Uptime Kuma déjà configuré (BRouter monitor en Story 1.5), **When** j'ajoute un monitor "queue depth", **Then** :
   - Type : `HTTP(s) - JSON Query` ou `Push monitor`
   - Endpoint custom à créer : `GET /api/health/access-queue` retournant `{ depth: number, failed24h: number, oldestPendingAgeS: number }`
   - Alerte si `depth > 200` (push notification + email)
   - Nom : `POI Access Queue Health`
   - Réutilise les channels notif existants

3. **Given** Sentry est configuré dans le projet (cf. project-context — à vérifier), **When** une exception est levée dans `RoutingService`, `AccessCalculatorService`, ou `AccessWorkerProcessor`, **Then** :
   - L'exception est capturée avec tags : `engine_version`, `profile`, `origin_type`, `traceId`, `service`
   - Les fallbacks `routing_failed` (volume attendu normal) NE sont PAS envoyés à Sentry (filter via `beforeSend` hook)
   - Les exceptions `BrouterUnavailableException` avec reason `circuit_open` sont aussi filtrées (volume attendu)
   - Les vraies erreurs (parse_error, DB error, unexpected) remontent normalement

4. **Given** les logs structurés JSON, **When** une requête traverse la pipeline access, **Then** :
   - Chaque log contient (minimum) : `level, timestamp, service, traceId, userId?, poiId, durationMs, engineVersion, status`
   - Format JSON compatible Loki/Grafana (si ajout futur)
   - Niveau par défaut des succès : `'debug'` ou silencieux (pas un log par calcul — volume trop élevé)
   - Erreurs/fallbacks logged en `'warn'` ou `'error'`

5. **Given** l'audit final, **When** je vérifie en local, **Then** :
   - Lancer 10 calculs access (5 ok, 3 fallback BRouter down, 2 erreurs DB simulées) → vérifier les logs structurés générés
   - Bull Board accessible et affiche correctement les jobs
   - Sentry (si configuré local) reçoit seulement les 2 erreurs DB (pas les 3 fallbacks)

6. **Given** le runbook BRouter (Story 1.2), **When** je l'enrichis, **Then** la section "Observabilité" est ajoutée :
   - URL Bull Board en prod
   - Comment interpréter les métriques (queue depth normale vs anormale, taux failed sain)
   - Comment investiguer un spike de fallbacks BRouter (logs structurés + Sentry)
   - Comment debug une queue qui grossit (vérifier worker process running, vérifier RAM/CPU VPS)

7. **Given** un test smoke d'observabilité, **When** je le crée :
   - Test E2E déclenchant exception → vérifier que Sentry reçoit (en env staging) OU que le log structuré contient les bons champs
   - Test smoke automatisable en CI (mock Sentry SDK)

8. **Given** les métriques applicatives (post-MVP — optionnel pour cette story selon scope), **When** je les ajoute :
   - Si scope OK : créer compteurs Prometheus-compatible via `prom-client` :
     - `access_compute_total{status, source}` (counter)
     - `access_compute_duration_seconds` (histogram)
     - `access_brouter_failures_total{reason}` (counter)
   - Endpoint `/metrics` exposé (protégé)
   - Sinon : documenter dans le runbook comme "post-MVP, à ajouter si volume justifie"

9. **Given** la story terminée, **When** je commit :
   - `apps/api/src/health/access-queue-health.controller.ts` (nouveau)
   - `apps/api/src/admin/bull-board.module.ts` (nouveau ou modifié si existant)
   - `apps/api/src/common/sentry.config.ts` (modifié — beforeSend filter)
   - `apps/api/src/common/logger.config.ts` (modifié — structured fields)
   - `docs/ops/brouter-runbook.md` (modifié — section Observabilité)
   - `apps/api/test/access-queue-health.e2e-spec.ts` (nouveau)
   - Si métriques : `apps/api/src/common/metrics.module.ts` (nouveau)
   - Doc Sync si écart

---

## ⚠️ Critical Discovery Notes

### 1. Sentry — état actuel à confirmer

L'archi mentionne Sentry mais le `project-context.md` ne le confirme pas. Vérifier :
```bash
grep -r "Sentry\|@sentry" apps/api/src/
grep "@sentry" apps/api/package.json
```
Si pas en place : 
- **A.** Cette story installe Sentry depuis zéro (out of scope strict)
- **B.** Cette story prépare le hook `beforeSend` mais skip l'install (à faire en story future)

Recommandation : **B** + créer follow-up story `infra-install-sentry.md`.

### 2. Bull Board — décision binaire

Audit Story 1.4 a indiqué si Bull Board est installé. Selon le résultat :
- Si oui : juste extension (mins de scope)
- Si non : installation complète (out of scope strict, mais nécessaire — l'archi le mentionne explicitement)

### 3. Endpoint /api/health/access-queue — auth ?

L'endpoint doit être accessible par Uptime Kuma. Options :
- **Public** : risque (info opérationnelle exposée)
- **Token statique** dans header (configuré côté Uptime Kuma)
- **IP whitelist** (Uptime Kuma container IP)

Recommandation : **Token statique** simple via env var `HEALTH_ENDPOINT_TOKEN`.

### 4. prom-client métriques — overhead

`prom-client` ajoute ~50KB au bundle + un endpoint `/metrics`. Pour MVP sans Grafana en place, l'utilité est limitée. **Recommandation : reporter en post-MVP** dans le runbook, ne pas implémenter dans cette story sauf demande explicite Guillaume.

### 5. Logger structuré — pattern projet

Vérifier le pattern existant :
```bash
grep -r "import.*Logger" apps/api/src/common/
```
NestJS a un `Logger` par défaut. Si format JSON pas configuré, le faire dans cette story (config minimale via `WinstonModule` ou `Pino` selon préférence projet).

---

## Tasks / Subtasks

- [ ] **Task 1** — Audit état Sentry, Bull Board, logger (⚠️Discovery #1, #2, #5)
  - [ ] Documenter dans `docs/ops/access-routing-prereq-audit.md` (créé Story 1.4) ou nouveau fichier
  - [ ] Décider scope effectif de cette story selon résultats

- [ ] **Task 2** — Créer endpoint `/api/health/access-queue` (AC: 2, ⚠️Discovery #3)
  - [ ] Controller dans `apps/api/src/health/` (nouveau ou existant)
  - [ ] Query Bull queue depth, failed 24h, oldest pending age
  - [ ] Protection token via guard custom ou header check
  - [ ] Test E2E

- [ ] **Task 3** — Configurer Bull Board (AC: 1)
  - [ ] Si déjà installé : ajouter `poi-access-calculation` + DLQ au dashboard
  - [ ] Si non : installer + mount sur `/admin/queues`
  - [ ] Documenter URL d'accès dans runbook

- [ ] **Task 4** — Configurer Uptime Kuma monitor (AC: 2)
  - [ ] Monitor HTTP JSON Query sur `/api/health/access-queue` avec token header
  - [ ] Alerte threshold `depth > 200`
  - [ ] Test : créer fake jobs pour gonfler la queue → alerte reçue

- [ ] **Task 5** — Configurer Sentry filter (AC: 3, ⚠️Discovery #1)
  - [ ] Si Sentry installé : modifier `sentry.config.ts` avec `beforeSend` hook qui filter `routing_failed` + `circuit_open`
  - [ ] Sinon : créer follow-up story

- [ ] **Task 6** — Configurer logger structuré (AC: 4, ⚠️Discovery #5)
  - [ ] Identifier le pattern logger projet (Pino ? Winston ? default NestJS ?)
  - [ ] S'assurer que les services access émettent les champs requis
  - [ ] Documenter format dans runbook

- [ ] **Task 7** — Enrichir le runbook (AC: 6)
  - [ ] Ajouter section "Observabilité" à `docs/ops/brouter-runbook.md`
  - [ ] Inclure URLs, commandes, troubleshooting

- [ ] **Task 8** — (OPTIONNEL — selon scope) Métriques Prometheus (AC: 8, ⚠️Discovery #4)
  - [ ] Si retenu : install `prom-client`, expose `/metrics`, instrument 3 métriques
  - [ ] Sinon : documenter dans runbook comme follow-up post-MVP

- [ ] **Task 9** — Test smoke (AC: 5, 7)
  - [ ] Provoquer artificiellement les 3 types d'erreur en local
  - [ ] Vérifier logs structurés + Sentry filter

- [ ] **Task 10** — Doc Sync + commit (AC: 9)
  - [ ] Commit : `feat(observability): bull board + queue health endpoint + sentry filter + structured logs for access routing — story poi-access-4.3`

---

## Dev Notes

### Pattern projet — Health endpoint

Si pattern existant `/api/health` : étendre. Sinon créer simple :
```typescript
@Controller('health')
export class HealthController {
  @Get('access-queue')
  @UseGuards(TokenGuard)
  async getAccessQueueHealth() {
    return {
      depth: await this.queue.count(),
      failed24h: await this.queue.getFailedCount(),
      oldestPendingAgeS: await this.getOldestPendingAge(),
    }
  }
}
```

### Pattern projet — Bull Board mount

```typescript
import { createBullBoard } from '@bull-board/api'
import { BullAdapter } from '@bull-board/api/bullAdapter'
import { ExpressAdapter } from '@bull-board/express'

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')
createBullBoard({
  queues: [new BullAdapter(accessQueue), new BullAdapter(densityQueue), ...],
  serverAdapter,
})
app.use('/admin/queues', serverAdapter.getRouter())
```

### Limitations Sentry pour fallbacks

Le `beforeSend` hook permet de filtrer :
```typescript
Sentry.init({
  beforeSend(event, hint) {
    const exception = hint.originalException
    if (exception instanceof BrouterUnavailableException && 
        ['routing_failed', 'circuit_open'].includes(exception.reason)) {
      return null  // skip envoi
    }
    return event
  }
})
```

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-4.3]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Monitoring-Logging]
- [Source: _bmad-output/implementation-artifacts/poi-access-1-4-...md] — audit Bull Board
- [Source: _bmad-output/implementation-artifacts/poi-access-1-5-...md] — Uptime Kuma BRouter monitor existant
- [Source: _bmad-output/implementation-artifacts/poi-access-4-1-...md] — queue à monitorer
- Bull Board : https://github.com/felixmosh/bull-board
- Sentry NestJS : https://docs.sentry.io/platforms/javascript/guides/nestjs/

---

## Dev Agent Record

### Agent Model Used
_(À renseigner)_

### Completion Notes List
- Sentry installé : ☐ Oui (filter ajouté) / ☐ Non (follow-up créé)
- Bull Board installé : ☐ Oui (extension) / ☐ Non (installé dans cette story)
- Logger pattern : ☐ Pino / ☐ Winston / ☐ NestJS default + format
- Métriques Prometheus : ☐ Implémentées / ☐ Reportées post-MVP
- URL Bull Board prod : `___`
- Uptime Kuma monitor configuré : ☐ Oui / ☐ Non

### File List
- [ ] `apps/api/src/health/access-queue-health.controller.ts` (nouveau)
- [ ] `apps/api/src/admin/bull-board.module.ts` (nouveau ou modifié)
- [ ] `apps/api/src/common/sentry.config.ts` (modifié si applicable)
- [ ] `apps/api/src/common/logger.config.ts` (modifié)
- [ ] `apps/api/test/access-queue-health.e2e-spec.ts` (nouveau)
- [ ] `docs/ops/brouter-runbook.md` (modifié — section Observabilité)
- [ ] (Optionnel) `apps/api/src/common/metrics.module.ts`
- [ ] (Si Bull Board nouveau) `apps/api/package.json` + lock
- [ ] `_bmad-output/planning-artifacts/architecture-poi-access-routing.md` (modifié si Doc Sync)
