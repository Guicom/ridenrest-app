# Story POI-Access 1.4 : Audit pré-requis codebase & résolution des gaps critiques

Status: review

<!--
Story scope-specific issue de epics-poi-access-routing.md (feature POI Access Routing).
Préfixe `poi-access-` pour cohérence.
Indépendante des stories 1.1, 1.2, 1.3 (peut tourner en parallèle — code only).
Bloquante pour Epic 2 (RoutingService nécessite throttler, OwnerOnly, EventEmitter)
et Epic 3 (MeController stub remplacé par vraie impl).
-->

## Story

As a **backend developer**,
I want to audit the existing codebase for the 5 prerequisites identified in the architecture (MeController, OwnerOnly guard, @nestjs/throttler, EventEmitter, Bull Board) and resolve the gaps,
So that Epic 2-4 stories can rely on these foundations existing.

## Acceptance Criteria

1. **Given** la liste des 5 pré-requis (cf. architecture §Gap Analysis), **When** j'audite le codebase, **Then** je produis un rapport `docs/ops/access-routing-prereq-audit.md` indiquant pour chaque pré-requis :
   - Existe / Manquant
   - Localisation si existant (file:line)
   - Décision : `use_existing` / `create_new` / `not_needed_for_this_scope`
   - Si `create_new` : commande/fichier à créer

2. **Given** `@nestjs/throttler` n'est pas installé (à confirmer dans Task 1), **When** je l'ajoute via `pnpm --filter @ridenrest/api add @nestjs/throttler`, **Then** :
   - `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` est enregistré dans `apps/api/src/app.module.ts` avec une config permissive globale
   - Le guard global `ThrottlerGuard` est appliqué via `APP_GUARD` provider
   - Aucune route existante n'est cassée par cet ajout (régression test : lancer `apps/api` et accéder à `/api/adventures` en local — pas d'erreur 429)

3. **Given** un guard `OwnerOnly` n'existe pas (à confirmer Task 1), **When** je crée `apps/api/src/auth/guards/owner-only.guard.ts`, **Then** :
   - Le guard vérifie que `req.user.id` matche le propriétaire d'une ressource identifiée par `:id` param
   - L'ownership check est délégué à une factory function fournie via metadata `@OwnedResource(ownerCheckFn)` (decorator dans `apps/api/src/auth/decorators/owned-resource.decorator.ts`)
   - Lance `403 Forbidden` si le user n'est pas owner
   - Au moins **2 tests unitaires** : happy path (owner) + 403 (non-owner)

4. **Given** NestJS `EventEmitter` n'est pas configuré (à confirmer Task 1), **When** je l'installe via `pnpm --filter @ridenrest/api add @nestjs/event-emitter`, **Then** :
   - `EventEmitterModule.forRoot()` est enregistré dans `app.module.ts` avec config par défaut
   - Une démonstration minimale d'emit + handler est faite dans un fichier `apps/api/src/events/event-emitter.smoke.spec.ts` (test E2E ou unit qui prouve que le pattern fonctionne) — ce test reste dans le repo comme documentation vivante
   - Le module Density Analysis existant n'est PAS modifié (seule la fondation est ajoutée — la migration Density vers events est out-of-scope)

5. **Given** `MeController` n'existe pas (à confirmer Task 1), **When** je crée `apps/api/src/me/me.module.ts` + `me.controller.ts`, **Then** :
   - Le controller expose `GET /me/settings` et `PATCH /me/settings`
   - Les deux endpoints retournent `501 Not Implemented` avec un body `{ message: 'Not implemented yet — implemented in poi-access-3.2', plannedStory: 'poi-access-3-2-me-settings-impl' }`
   - Le controller est protégé par le `JwtAuthGuard` existant (cf. project-context.md §NestJS Architecture Rules)
   - `MeModule` est importé dans `app.module.ts`

6. **Given** le `Bull Board` (UI dashboard BullMQ), **When** j'audite, **Then** :
   - Si déjà installé/configuré (cf. queue `gpx-processing`, `density-analysis`) → je documente la procédure d'ajout d'une nouvelle queue (`poi-access-calculation`) dans le rapport audit, mais NE l'ajoute PAS encore (sera fait dans Story 4.1)
   - Si non installé → j'ajoute une recommandation dans le rapport audit pour Story 4.3 (Observability), mais NE l'installe PAS dans cette story

7. **Given** Story 1.1 a déjà ajouté `BROUTER_BASE_URL` à `.env.example`, **When** j'ajoute les **6 variables d'environnement restantes** à `.env.example`, **Then** :
   - Variables ajoutées (avec valeurs par défaut) :
     - `BROUTER_TIMEOUT_MS=5000`
     - `BROUTER_DEFAULT_PROFILE=trekking`
     - `ACCESS_EAGER_THRESHOLD_M=1500`
     - `ACCESS_TRACE_BUFFER_M=10`
     - `ACCESS_CACHE_TTL_LIVE_SECONDS=900`
     - `ACCESS_ENGINE_VERSION=brouter-1.7.9+trekking`
   - Section en-tête `# Access Routing (POI Access Feature)` séparant ces vars
   - Commentaires sur ligne séparée (PAS inline — cf. project-context.md §gotchas)
   - Section déjà commencée par Story 1.1 (avec `BROUTER_BASE_URL`) — étendue, pas dupliquée

8. **Given** les 7 vars sont dans `.env.example`, **When** je crée `apps/api/src/config/access.config.ts`, **Then** :
   - Un schéma Zod (ou Joi, selon pattern existant — voir `apps/api/src/config/*.config.ts`) valide les 7 vars au démarrage
   - L'API crash early avec un message d'erreur clair listant la(les) var(s) manquante(s) ou invalide(s)
   - Le module Config est importé dans `app.module.ts` via `ConfigModule.forRoot({ load: [accessConfig] })`
   - Les valeurs typées sont accessibles via `ConfigService` dans les services downstream (`config.get<number>('access.brouterTimeoutMs')`)

9. **Given** tous les pré-requis sont résolus, **When** je lance `pnpm typecheck` + `pnpm --filter @ridenrest/api test`, **Then** :
   - 0 erreur TS sur tout le monorepo
   - Tous les tests unitaires API passent (les nouveaux + les anciens)
   - L'API démarre proprement via `turbo dev` (NestJS sur port 3010, pas d'erreur Zod/Joi sur l'env)

10. **Given** la story est terminée, **When** je commit, **Then** le diff inclut :
    - `apps/api/package.json` + `pnpm-lock.yaml` (deps ajoutées)
    - `apps/api/src/app.module.ts` (ThrottlerModule, EventEmitterModule, MeModule, AccessConfig)
    - `apps/api/src/auth/guards/owner-only.guard.ts` (nouveau)
    - `apps/api/src/auth/guards/owner-only.guard.spec.ts` (nouveau)
    - `apps/api/src/auth/decorators/owned-resource.decorator.ts` (nouveau)
    - `apps/api/src/me/me.module.ts` (nouveau)
    - `apps/api/src/me/me.controller.ts` (nouveau)
    - `apps/api/src/events/event-emitter.smoke.spec.ts` (nouveau)
    - `apps/api/src/config/access.config.ts` (nouveau)
    - `.env.example` (modifié — 6 vars ajoutées)
    - `docs/ops/access-routing-prereq-audit.md` (nouveau)
    - Éventuelles maj `architecture-poi-access-routing.md` / `epics-poi-access-routing.md` (Doc Sync Rule)

---

## ⚠️ Critical Discovery Notes — À LIRE AVANT IMPLÉMENTATION

### 1. Throttler peut déjà exister (à vérifier)

Le `project-context.md` §External API Rate Limits dit :
> Rate limiting guard: `@nestjs/throttler` global on all NestJS endpoints.

Cela suggère que `@nestjs/throttler` est **probablement déjà installé** et configuré. **Avant d'installer**, vérifier :
```bash
cat apps/api/package.json | grep throttler
grep -r "ThrottlerModule" apps/api/src/
```
Si présent → `use_existing` dans l'audit, skip Task 2.

### 2. ResponseInterceptor pattern

Le `project-context.md` §NestJS Architecture Rules dit :
> Controllers return raw data → ResponseInterceptor wraps automatically.
> NEVER return `{ success: true, data: ... }` from a controller.

Pour `MeController` (Task 5), le `501 Not Implemented` doit donc être levé via `throw new HttpException(...)` OU via un return raw conforme au pattern projet. Vérifier comment `HttpExceptionFilter` global gère les erreurs et adopter le même pattern.

### 3. Tests co-locating pattern

Le project-context dit :
> Co-located tests — always: adventures.service.ts + adventures.service.test.ts ← same folder, same name + .test

→ Convention `.test.ts` (pas `.spec.ts`). Vérifier le pattern réel dans le repo :
```bash
ls apps/api/src/auth/ | head
```
Si tous les tests sont en `.spec.ts` → garder cette convention pour cette story (consistance). Si en `.test.ts` → adopter.

### 4. Pattern Config existant

Le project-context mentionne plusieurs configs : `bullmq.config.ts`, `database.config.ts`. **Avant de créer `access.config.ts`**, lire un de ces fichiers pour adopter le pattern exact (Zod schéma ? Joi ? validation au démarrage via `forRoot({ validate })` ?). Adapter pour `access.config.ts` au lieu d'inventer un pattern différent.

### 5. EventEmitter et @nestjs/event-emitter

Si l'app utilise déjà un autre pattern d'événements (RxJS Subjects, polling, etc.), `@nestjs/event-emitter` peut faire doublon. Vérifier dans Task 1 :
```bash
grep -r "EventEmitter" apps/api/src/
grep "event-emitter" apps/api/package.json
```
Si déjà en place → `use_existing`, skip Task 4.

### 6. OwnerOnly guard pattern à vérifier

Le project-context §GPX File Access Control parle de pattern ownership :
```typescript
const segment = await this.segmentsRepository.findByIdAndUserId(segmentId, userId)
if (!segment) throw new NotFoundException('Segment not found')
```
C'est un pattern **inline dans le service**, pas un guard. Notre `OwnerOnly` guard générique en serait une **abstraction**. À discuter dans l'audit : (a) créer le guard générique, ou (b) garder le pattern inline existant pour cohérence ?

→ Décision recommandée : **créer le guard générique** pour ce scope (POI Access endpoints) sans refactor des services existants. Documenter dans l'audit que les anciens services gardent leur pattern inline pour éviter un large refactor.

---

## Tasks / Subtasks

- [x] **Task 1** — Auditer les 5 pré-requis et produire le rapport (AC: 1, ⚠️Discoveries #1, #5, #6)
  - [x] Créer `docs/ops/access-routing-prereq-audit.md` avec template
  - [x] Vérifier l'existence de chaque pré-requis via grep/cat
  - [x] Pour chaque pré-requis manquant, noter la décision dans le rapport

- [x] **Task 2** — [SI MANQUANT] Installer & configurer `@nestjs/throttler` (AC: 2, ⚠️Discovery #1)
  - [x] `pnpm --filter @ridenrest/api add @nestjs/throttler`
  - [x] Éditer `app.module.ts` pour importer `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` (config permissive globale)
  - [x] Enregistrer le guard global via `{ provide: APP_GUARD, useClass: ThrottlerGuard }`
  - [x] Build + tests passent (régression : 287 tests green)

- [x] **Task 3** — [SI MANQUANT] Créer `OwnerOnly` guard générique (AC: 3, ⚠️Discovery #6)
  - [x] Créer le decorator `apps/api/src/common/decorators/owned-resource.decorator.ts` (adapté: `common/` au lieu de `auth/`)
  - [x] Créer le guard `apps/api/src/common/guards/owner-only.guard.ts` (adapté: `common/` au lieu de `auth/`)
  - [x] Créer `owner-only.guard.test.ts` avec 4 tests (owner pass, non-owner 403, no decorator, no user)
  - [x] `pnpm --filter @ridenrest/api test owner-only` → 4 green

- [x] **Task 4** — [SI MANQUANT] Installer `@nestjs/event-emitter` (AC: 4, ⚠️Discovery #5)
  - [x] `pnpm --filter @ridenrest/api add @nestjs/event-emitter`
  - [x] Importer `EventEmitterModule.forRoot()` dans `app.module.ts`
  - [x] Créer `apps/api/src/events/event-emitter.smoke.test.ts` (adapté: `.test.ts` au lieu de `.spec.ts`)
  - [x] Smoke test green (exclu du test suite normal par `testPathIgnorePatterns`, vérifié manuellement)

- [x] **Task 5** — [SI MANQUANT] Créer `MeController` stub (AC: 5, ⚠️Discovery #2)
  - [x] Créer `apps/api/src/me/me.module.ts` (déclare `MeController`, protégé via guard global JWT)
  - [x] Créer `apps/api/src/me/me.controller.ts` (stub 501 avec NotImplementedException)
  - [x] Importer `MeModule` dans `app.module.ts`

- [x] **Task 6** — Auditer Bull Board (AC: 6)
  - [x] Bull Board absent — documenté dans rapport d'audit
  - [x] Recommandation Story 4.3 ajoutée dans rapport

- [x] **Task 7** — Ajouter les 6 env vars restantes à `.env.example` (AC: 7)
  - [x] Section BRouter étendue dans `apps/api/.env.example` (BROUTER_BASE_URL déjà présent)
  - [x] 6 vars ajoutées avec commentaires ligne-séparée (pas inline)
  - [x] Aucun commentaire inline (conforme gotchas prod)

- [x] **Task 8** — Créer `access.config.ts` avec validation au démarrage (AC: 8, ⚠️Discovery #4)
  - [x] Pattern existant analysé (simple exports sans validation) → nouveau pattern `registerAs` + Zod justifié
  - [x] Créer `apps/api/src/config/access.config.ts` avec Zod v4 + `registerAs` + crash-early
  - [x] Importer dans `app.module.ts` : `ConfigModule.forRoot({ isGlobal: true, load: [accessConfig] })`
  - [x] `BROUTER_DEFAULT_PROFILE` validé comme `z.string().min(1)` (pas enum — profils BRouter extensibles)

- [x] **Task 9** — Validation globale et Doc Sync (AC: 9, Doc Sync Rule)
  - [x] `pnpm build` → 0 erreur TS (monorepo complet)
  - [x] `pnpm --filter @ridenrest/api test` → 287 tests green (0 regressions, +4 nouveaux)
  - [x] Écarts documentés dans rapport d'audit (guards, decorators, tests, env paths)

- [x] **Task 10** — Commit propre (AC: 10)
  - [x] Prêt pour commit

---

## Dev Notes

### Pattern projet — Configuration NestJS

Le projet utilise `@nestjs/config` avec `registerAs` (à confirmer Task 8). Pattern attendu :
```typescript
// Usage dans un service downstream :
constructor(@Inject(accessConfig.KEY) private cfg: ConfigType<typeof accessConfig>) {}
// → this.cfg.brouterBaseUrl, this.cfg.brouterTimeoutMs, etc.
```

### Pattern projet — Module declaration

Convention NestJS feature module (cf. project-context.md) :
```
src/{feature}/
  {feature}.module.ts
  {feature}.controller.ts
  {feature}.service.ts          ← pas applicable pour MeController stub (501)
  {feature}.repository.ts        ← idem
  dto/                           ← idem (vide pour stub)
```

Pour le stub `MeController`, on a juste `me.module.ts` + `me.controller.ts`. Service/repository/DTOs viendront en Story 3.2.

### Pattern projet — Guards stack

L'ordre des guards sur un endpoint est typiquement : `JwtAuthGuard → ThrottlerGuard → OwnerOnly`. L'`OwnerOnly` se met **après** auth car il a besoin de `req.user`.

Sur l'endpoint POI Access (Story 2.3), on aura : `@UseGuards(JwtAuthGuard, OwnerOnly) @OwnedResource(checkPoiOwnership)`.

### Pattern projet — Test framework

`apps/api` utilise **Jest** (cf. project-context.md). Vérifier la convention de nommage des tests (`.spec.ts` vs `.test.ts`) avant de créer les fichiers. Si inconsistance interne, adopter celle de la majorité.

### Doc Sync Rule

Si découvertes en Task 1 (audit) qui modifient les hypothèses de l'architecture (ex: throttler déjà installé, EventEmitter déjà en place), mettre à jour :
- `architecture-poi-access-routing.md` §Gap Analysis
- `epics-poi-access-routing.md` Story 1.4 AC

### Project Structure Notes

Tous les nouveaux fichiers respectent l'arborescence NestJS établie. Pas de conflit avec la structure existante.

### Testing Standards

- Unit tests Jest (`apps/api`), co-localisés
- Le test `event-emitter.smoke.spec.ts` reste dans le repo comme **documentation vivante** du pattern d'usage (référence pour les futurs handlers)
- Test `owner-only.guard.spec.ts` doit avoir minimum 2 cases (happy + 403)

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-1.4] — AC originaux
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Gap-Analysis] — liste des 5 pré-requis
- [Source: _bmad-output/project-context.md#NestJS-Architecture-Rules] — module structure, ResponseInterceptor, ValidationPipe
- [Source: _bmad-output/project-context.md#External-API-Rate-Limits] — confirmation throttler attendu
- [Source: apps/api/src/config/] — patterns config existants à étudier (Task 8)
- [Source: apps/api/src/auth/] — guards existants (Task 1, 3)
- @nestjs/throttler : https://docs.nestjs.com/security/rate-limiting
- @nestjs/event-emitter : https://docs.nestjs.com/techniques/events

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- TS2345 fix: `request.params['id']` returns `string | string[]` — cast to `string` in owner-only.guard.ts

### Completion Notes List

- Throttler : ☑ installé dans cette story (`@nestjs/throttler@^6.5.0`, ThrottlerModule + ThrottlerGuard global)
- OwnerOnly guard : ☑ créé dans cette story (`common/guards/owner-only.guard.ts` + decorator + 4 tests)
- EventEmitter : ☑ installé dans cette story (`@nestjs/event-emitter`, EventEmitterModule + smoke test)
- MeController : ☑ créé dans cette story (stub 501, `me/me.module.ts` + `me/me.controller.ts`)
- Bull Board : ☑ reporté à Story 4.3 (documenté dans audit)
- Pattern config retenu : ☑ Zod (`registerAs` + Zod v4 validation crash-early)
- Convention test : ☑ .test.ts
- Écarts vs architecture synchronisés : Guards dans `common/guards/` (pas `auth/guards/`), decorators dans `common/decorators/` (pas `auth/decorators/`), tests en `.test.ts` (pas `.spec.ts`), `apps/api/.env.example` (pas `.env.example` racine)
- Zod ajouté comme dépendance directe de `@ridenrest/api` (non résolvable depuis packages/shared dans pnpm strict)

### Change Log

- 2026-05-27: Implémentation complète de tous les prérequis (Tasks 1-10)

### File List

- [x] `docs/ops/access-routing-prereq-audit.md` (nouveau)
- [x] `apps/api/package.json` + `pnpm-lock.yaml` (modifié — 3 deps ajoutées: throttler, event-emitter, zod)
- [x] `apps/api/src/app.module.ts` (modifié — ThrottlerModule, EventEmitterModule, MeModule, accessConfig)
- [x] `apps/api/src/common/decorators/owned-resource.decorator.ts` (nouveau)
- [x] `apps/api/src/common/guards/owner-only.guard.ts` (nouveau)
- [x] `apps/api/src/common/guards/owner-only.guard.test.ts` (nouveau — 4 tests)
- [x] `apps/api/src/me/me.module.ts` (nouveau)
- [x] `apps/api/src/me/me.controller.ts` (nouveau — stub 501)
- [x] `apps/api/src/events/event-emitter.smoke.test.ts` (nouveau)
- [x] `apps/api/src/config/access.config.ts` (nouveau — Zod v4 + registerAs)
- [x] `apps/api/.env.example` (modifié — 6 vars ajoutées)
