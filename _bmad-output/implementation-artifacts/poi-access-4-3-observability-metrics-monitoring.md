---
baseline_commit: 2bc536cb42bf55e72f387d9bfba502a5d311b785
---

# Story POI-Access 4.3 : Observabilité — Métriques BullMQ + Uptime Kuma + Sentry + Logs

Status: done

> **ℹ️ Note 2026-05-30 (pivot `nearest-trace`).** Story quasi-non-impactée (observabilité = transverse). Deux nuances mineures :
> - tag Sentry `origin_type` : reste valide (valeurs `stage` / `nearest-trace`) ;
> - champ de log `userId?` : n'est plus alimenté par le pipeline d'accès (`userId` retiré de `compute()` avec le mode Live GPS) — le garder optionnel pour les autres contextes, mais il sera toujours absent côté accès.
> Le runbook ne contient (volontairement) pas d'item « purge cache Redis live » — ce cache a été supprimé. Cf. epic.

<!-- Dépend de : 4.1 (queue active), 4.2 (handlers actifs), 1.5 (Uptime Kuma BRouter monitor existant). -->

---

## ⚠️ RE-CADRAGE 2026-05-31 — Scope minimal (décision Guillaume)

> **Cette story a été écrite avant le pivot `nearest-trace`** et porte une ambition d'observabilité « production multi-services » disproportionnée pour l'état réel du MVP. Audit du code (Task 1) : beaucoup d'observabilité existe **déjà** et n'a pas à être rebâtie :
> - `nestjs-pino` produit déjà des **logs JSON structurés** (prod `level=info`, `reqId`, sérialisation req/res) → AC4 quasi-satisfaite.
> - Le **circuit breaker** `RoutingService` logge chaque échec BRouter en `warn` structuré (`reason`, `profile`, `durationMs`, `engineVersion`).
> - La **DLQ** `poi-access-failures` existe déjà, marque `access_failed`, logge en `error` → « silent failures » déjà tracées.
> - **Sentry** n'est installé nulle part ; **Grafana/Prometheus** non plus.
>
> **Décision (Guillaume, 2026-05-31) — scope minimal + Bull Board gardé.** Seul vrai trou opérationnel : Kuma (déjà installé) ne sait pas que la queue d'accès gonfle. On comble ce trou, on documente l'existant, et on **diffère le code spéculatif**.
>
> | Item | Décision | Raison |
> |---|---|---|
> | Endpoint `/api/health/access-queue` + monitor Kuma (AC2) | ✅ **FAIT** | Comble le seul vrai trou (alerte backlog proactive) |
> | Bull Board (AC1) | ✅ **FAIT** | Outil de triage manuel de la DLQ (confort solo-dev) |
> | Section "Observabilité" runbook (AC6) | ✅ **FAIT** | Documente pino + DLQ + circuit breaker + endpoint |
> | Logs structurés (AC4) | ✅ **VÉRIFIÉ + enrichi léger** | Déjà couvert par pino ; enrichissement mineur du worker |
> | Smoke test (AC5/AC7) | ✅ **RÉDUIT** | E2E sur l'endpoint health + token ; vérif champs logs. Pas de mock Sentry (rien à mocker) |
> | Sentry `beforeSend` (AC3) | ⏭️ **DIFFÉRÉ — aucun code** | Sentry absent → spec du filtre documentée dans le runbook pour la follow-up `infra-install-sentry` |
> | Prometheus `/metrics` (AC8) | ⏭️ **DIFFÉRÉ** | Pas de Grafana → documenté post-MVP dans le runbook |
>
> **Auth endpoint health** : token statique `HEALTH_ENDPOINT_TOKEN` (header `x-health-token`), **fail-closed** si non configuré.

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

> Set re-cadré 2026-05-31 (scope minimal + Bull Board). Tasks Sentry/Prometheus diffÉrées (documentation seulement).

- [x] **Task 1** — Audit état Sentry, Bull Board, logger (⚠️Discovery #1, #2, #5)
  - [x] Sentry : absent (api/web/root) → recommandation B (documenter, pas de code)
  - [x] Bull Board : absent (pré-décidé Story 1.4 → installer ici)
  - [x] Logger : `nestjs-pino` déjà configuré (JSON structuré) → enrichir seulement
  - [x] Health endpoint : `/api/health` existe déjà → étendre
  - [x] Scope effectif décidé avec Guillaume (cf. § RE-CADRAGE)

- [x] **Task 2** — Endpoint `GET /api/health/access-queue` (AC: 2, ⚠️Discovery #3)
  - [x] Controller `apps/api/src/health/access-queue-health.controller.ts` (dans HealthModule)
  - [x] Query queue `poi-access-calculation` : `depth` (waiting+delayed), `failed24h`, `oldestPendingAgeS`
  - [x] Guard custom `HealthTokenGuard` (header `x-health-token` vs `HEALTH_ENDPOINT_TOKEN`, fail-closed) + `@Public()` + `@SkipThrottle()`
  - [x] Tests unit (controller 5 + guard 6) + E2E 3 (`test/access-queue-health.e2e-spec.ts`)

- [x] **Task 3** — Bull Board (AC: 1)
  - [x] Installer `@bull-board/api` + `@bull-board/express` + `@bull-board/nestjs` (^7.1.5)
  - [x] `apps/api/src/admin/bull-board.module.ts` — enregistre `poi-access-calculation`, `poi-access-failures`, `gpx-processing`, `density-analysis`, route `/admin/queues` (→ `/api/admin/queues` avec global prefix)
  - [x] Gate par `BULL_BOARD_ENABLED` (default false) ; Basic Auth via `BULL_BOARD_USER`/`BULL_BOARD_PASSWORD` quand activé (4 tests middleware)
  - [x] Documenter accès (SSH tunnel) dans runbook §(m)

- [x] **Task 4** — Logs structurés access (AC: 4)
  - [x] Worker enrichi : `status` (`processing`/`ok`/`fallback`/`error`) + `engineVersion` ajoutés aux logs `access_job_*`
  - [x] Format + limite `traceId` (jobs worker sans contexte HTTP) documentés dans runbook §(m)

- [x] **Task 5** — Section "Observabilité" du runbook (AC: 6)
  - [x] Section (m) ajoutée à `docs/ops/brouter-runbook.md` : existant (pino/DLQ/circuit breaker), endpoint health, Bull Board, interprétation métriques, debug spike fallbacks, debug queue qui grossit
  - [x] Config monitor Kuma `POI Access Queue Health` (HTTP JSON Query `$.data.depth`, header token, alerte `depth > 200`)
  - [x] Spec du filtre Sentry `beforeSend` (différé) + note Prometheus post-MVP

- [x] **Task 6** — Doc Sync + follow-ups + commit (AC: 9)
  - [x] MAJ epic `epics-poi-access-routing.md` (note re-cadrage, AC3/AC8 différés)
  - [x] Follow-ups `infra-install-sentry` + `infra-prometheus-metrics` notés dans deferred-work.md
  - [ ] Commit (manuel, Guillaume) : `feat(observability): bull board + queue health endpoint + structured logs runbook — story poi-access-4.3`

### Tasks DIFFÉRÉES (documentation seulement, aucun code)

- [~] **Task 7 (différée)** — Sentry `beforeSend` (AC: 3) → spec documentée dans runbook, follow-up `infra-install-sentry`
- [~] **Task 8 (différée)** — Prometheus `/metrics` (AC: 8) → documenté post-MVP dans runbook, follow-up `infra-prometheus-metrics`

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
claude-opus-4-8 (1M context) — BMad dev-story workflow

### Completion Notes List
- Sentry installé : ☑ Non → **différé** (aucun code ; spec `beforeSend` documentée dans runbook + follow-up `infra-install-sentry`)
- Bull Board installé : ☑ Oui (installé dans cette story, gated `BULL_BOARD_ENABLED`)
- Logger pattern : ☑ Pino (`nestjs-pino` déjà configuré) — enrichissement worker mineur
- Métriques Prometheus : ☑ Reportées post-MVP (runbook + follow-up `infra-prometheus-metrics`)
- URL Bull Board prod : via SSH tunnel `/admin/queues` (non exposé publiquement par Caddy)
- Uptime Kuma monitor configuré : config documentée dans runbook (à ajouter côté UI Kuma par Guillaume)
- Scope re-cadré 2026-05-31 (décision Guillaume) : cf. § RE-CADRAGE en tête de story
- **Code review 2026-05-31 (4 patches appliqués)** : (1) Bull Board durci fail-closed (503 si activé sans creds) ; (2) `oldestPendingAgeS` inclut les jobs `delayed` (backlog backoff visible) ; (3) déviation AC4 assumée — `access_job_success` reste en `info` (volume borné post-pivot eager), documentée au runbook ; (4) doc-sync AC1 epics/runbook (Bull Board = compteurs par état, pas de tuiles « avg processing time »/« failed 24h » calculées). Détail : cf. § Review Findings.

### File List

**Nouveaux fichiers :**
- `apps/api/src/health/access-queue-health.controller.ts` — endpoint `/api/health/access-queue`
- `apps/api/src/health/access-queue-health.controller.test.ts` — 5 tests unit
- `apps/api/src/common/guards/health-token.guard.ts` — guard token fail-closed
- `apps/api/src/common/guards/health-token.guard.test.ts` — 6 tests unit
- `apps/api/src/admin/bull-board.module.ts` — Bull Board + Basic Auth middleware
- `apps/api/src/admin/bull-board.module.test.ts` — 4 tests middleware
- `apps/api/test/access-queue-health.e2e-spec.ts` — 3 tests E2E

**Fichiers modifiés :**
- `apps/api/src/health/health.module.ts` — import QueuesModule + AccessQueueHealthController + HealthTokenGuard
- `apps/api/src/app.module.ts` — import conditionnel AccessBullBoardModule (gate `BULL_BOARD_ENABLED`)
- `apps/api/src/pois/access-worker/access-worker.processor.ts` — logs enrichis (`status`, `engineVersion`)
- `apps/api/package.json` + `pnpm-lock.yaml` — deps `@bull-board/{api,express,nestjs}@^7.1.5`
- `docs/ops/brouter-runbook.md` — section (m) Observabilité
- `_bmad-output/planning-artifacts/epics-poi-access-routing.md` — note re-cadrage Story 4.3
- `_bmad-output/implementation-artifacts/deferred-work.md` — follow-ups infra-install-sentry / infra-prometheus-metrics
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — statut story

**À faire manuellement (Guillaume) :**
- `apps/api/.env.example` — ajouter `HEALTH_ENDPOINT_TOKEN`, `BULL_BOARD_ENABLED`, `BULL_BOARD_USER`, `BULL_BOARD_PASSWORD` (protection `.env*` empêche l'édition auto — valeurs dans runbook §m)
- Config monitor Kuma `POI Access Queue Health` côté UI Kuma (table dans runbook §m)

### Pré-existant (hors scope, non régressé)
- `apps/api/test/app.e2e-spec.ts` échoue (`SyntaxError: Unexpected token 'export'` sur l'import ESM `jose` dans `jwt-auth.guard.ts` non transformé par `jest-e2e.json`). Cassé depuis le commit initial (boot full AppModule) — sans rapport avec cette story.

### Change Log
- 2026-05-31 — Re-cadrage scope minimal + Bull Board (décision Guillaume). Sentry (AC3) et Prometheus (AC8) différés en documentation/follow-up ; reste = endpoint health queue + Bull Board + logs + runbook. Story passée `ready-for-dev` → `in-progress`.

---

## Review Findings (code review adversariale 2026-05-31)

> 3 couches : Blind Hunter (diff seul) + Edge Case Hunter (diff + repo) + Acceptance Auditor (diff + spec). Aucune couche en échec. Aucun finding **Critical**. Triage : 3 decision-needed, 1 patch, 0 defer, 11 dismissed.

### Decision-needed → résolues (toutes converties en patch, appliquées)
- [x] [Review][Decision→Patch] **Bull Board fail-OPEN si activé sans credentials** [apps/api/src/admin/bull-board.module.ts] — **Décision Guillaume : durcir en fail-closed.** Si `BULL_BOARD_ENABLED=true` sans `BULL_BOARD_USER`/`BULL_BOARD_PASSWORD` (ou l'une vide) → `bullBoardBasicAuth` renvoie désormais **503** au lieu de `next()`. Aligné sur la posture fail-closed du `HealthTokenGuard`. Test mis à jour + cas « une seule cred » ajouté. Doc runbook + commentaires module synchronisés. (blind High + edge Medium)
- [x] [Review][Decision→Patch] **`oldestPendingAgeS` ignore les jobs `delayed`** [apps/api/src/health/access-queue-health.controller.ts] — **Décision Guillaume : inclure les delayed.** `computeOldestPendingAgeS` lit maintenant le plus ancien de `getWaiting(0,0)` ET `getDelayed(0,0)` (min `timestamp` = âge max). Un backlog en backoff devient visible. 2 tests ajoutés (delayed-only + mix). Runbook mis à jour. (blind Low/Med + edge High)
- [x] [Review][Decision→Patch] **Logs de succès en niveau `info` (AC4)** [access-worker.processor.ts] — **Décision Guillaume : garder `info` + doc-sync AC4.** Le souci de volume d'AC4 ne s'applique plus post-pivot (eager, volume borné par nb POI). Déviation documentée dans le runbook (§ Logs structurés) + Completion Notes. Aucun changement de code. (auditor Low)

### Patch (appliqués)
- [x] [Review][Patch] **Doc-sync AC1 — métriques dashboard sur-promises** [epics + runbook] — Bull Board (UI native) affiche les compteurs par état (waiting/active/completed/failed/delayed/paused) + inspection, **pas** de tile « avg processing time » ni « failed 24h ». Ces agrégats vivent sur l'endpoint health (`failed24h`) et les logs (`durationMs`). Epic AC1 corrigé (note doc-sync) + runbook § Bull Board enrichi.

### Dismissed (11 — listés pour traçabilité)
1. `failed24h` plafonné par `removeOnFail:{count:50}` alors que `getFailed(0,199)` demande 200 → intentionnel + documenté dans le commentaire du controller ; l'alerte `failed24h<=10` se déclenche quand même (50>10). (blind+edge)
2. `failed24h` fallback `finishedOn ?? timestamp` → pour un job réellement en échec `finishedOn` est toujours posé ; le fallback ne sur-compte que marginalement, direction d'alerte sûre. (blind)
3. Redis injoignable → endpoint 500 → Kuma DOWN : **fail-safe** (l'alerte se déclenche), seule l'attribution est ambiguë (vs panne API/Redis). (edge)
4. `BULL_BOARD_ENABLED` lu à l'import du module → **vérifié OK** : `import 'dotenv/config'` en tête de `main.ts` peuple `process.env` avant l'éval. Régression latente seulement. (blind+edge)
5. Auth « single-point » sur route `@Public()` → pas de défaut, couvert par le e2e. (blind)
6. `getWaitingCount` + `getWaiting` non-atomiques → `depth>0`+`age=0` transitoire cosmétique sur heartbeat 60s. (edge)
7. Header `x-health-token` multi-valeurs avec 1er élément vide → 401 bénin (Kuma envoie un header simple). (edge)
8. `timingSafeEqual` court-circuit longueur → fuite la longueur (pas le contenu), pattern standard + secret haute entropie. (blind)
9. Décodage base64 Basic Auth → géré (pas de `:` → 401, base64 invalide ignoré sans crash). (blind)
10. Monitor Kuma `data.depth` vs `$.data.depth` (Task 5) → incohérence interne story, runbook authoritatif correct. (auditor)
11. `access_job_start` sans `durationMs` → justifié (aucune durée écoulée au démarrage). (auditor)
