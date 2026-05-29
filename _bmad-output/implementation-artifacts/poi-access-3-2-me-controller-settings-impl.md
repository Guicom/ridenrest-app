---
baseline_commit: 53175273a478a3bb6fc2084ca19f7e067f912698
---

# Story POI-Access 3.2 : `MeController` — `GET /me/settings` & `PATCH /me/settings` (impl. réelle)

Status: done

<!-- Dépend de : 1.4 (stubs MeController 501 créés). Indépendante de 3.1, 3.3. -->

## Story

As a **end user**,
I want to view and update my privacy settings via the `/me/settings` endpoints,
So that I can review and revoke my consent to live GPS-based access route calculations at any time.

## Acceptance Criteria

1. **Given** les stubs `GET /me/settings` et `PATCH /me/settings` créés en Story 1.4 (retournent 501), **When** je remplace les stubs par l'implémentation réelle, **Then** :
   - `GET /me/settings` retourne `{ liveAccessConsent: true | false | null }` (et tout autre setting existant si en place)
   - Pas de cache HTTP (toujours fresh — header `Cache-Control: no-store`)
   - Protégé par `JwtAuthGuard` (déjà en place via Story 1.4)

2. **Given** une requête `PATCH /me/settings` avec body `{ liveAccessConsent: true | false }`, **When** le controller la traite, **Then** :
   - La valeur est persistée dans `profiles.live_access_consent` via repository
   - La réponse 200 retourne l'état mis à jour `{ liveAccessConsent }`
   - Seul l'owner du profile peut PATCH (vérifié implicitement via `req.user.id` — pas besoin d'`OwnerOnly` puisque pas de path param)

3. **Given** un user qui passe de `liveAccessConsent: true` à `false`, **When** le PATCH est traité, **Then** :
   - Un event `'profile.live-consent-revoked'` est émis via `EventEmitter2` avec payload `{ userId }`
   - Un handler dans `AccessWorkerModule` ou similar (Story 4.2) pourra le consommer pour purger best-effort le cache Redis Live
   - L'event est émis APRÈS le commit DB (atomicity : if DB fails, no event)

4. **Given** une requête sans JWT, **When** je hit `GET /me/settings`, **Then** réponse 401.

5. **Given** un body PATCH avec une valeur autre que `true | false` (ex: `null`, `"yes"`, `1`), **When** le DTO est validé, **Then** réponse 400 avec message clair listant le champ invalide.

6. **Given** le user fait PATCH avec une valeur identique à l'actuelle (idempotence), **When** le call est traité, **Then** :
   - DB UPDATE est exécuté quand même (no-op effectif)
   - **PAS** d'event `'profile.live-consent-revoked'` émis (puisque pas de transition true→false)
   - Réponse 200 normale

7. **Given** un test E2E `apps/api/test/me-settings.e2e-spec.ts`, **When** je couvre les cas, **Then** :
   - GET sans JWT → 401
   - GET avec JWT → 200 + état actuel (true/false/null selon seed)
   - PATCH `{ liveAccessConsent: true }` quand actuel = null → 200 + DB updated + PAS d'event (transition null→true, pas révocation)
   - PATCH `{ liveAccessConsent: false }` quand actuel = true → 200 + event émis avec userId
   - PATCH `{ liveAccessConsent: true }` quand actuel = true → 200 + pas d'event (idempotent)
   - PATCH `{ liveAccessConsent: "invalid" }` → 400
   - PATCH `{}` → 400 (body vide invalide) OU 200 (no-op) — décider selon convention REST (PATCH ne devrait jamais être un GET déguisé)

8. **Given** la story terminée, **When** je commit, **Then** le diff inclut UNIQUEMENT :
   - `apps/api/src/me/me.controller.ts` (modifié — remplace les stubs 501)
   - `apps/api/src/me/me.service.ts` (nouveau)
   - `apps/api/src/me/me.repository.ts` (nouveau — query Drizzle)
   - `apps/api/src/me/dto/update-settings.dto.ts` (nouveau)
   - `apps/api/src/me/me.service.spec.ts` (nouveau)
   - `apps/api/src/me/me.module.ts` (modifié — ajout providers)
   - `apps/api/test/me-settings.e2e-spec.ts` (nouveau)
   - Doc Sync si écart

---

## ⚠️ Critical Discovery Notes

### 1. `MeController` stub à 501 — déjà en place

Story 1.4 a créé le stub. Cette story le REMPLACE par l'impl réelle. Au début de Task 1, vérifier que le stub existe bien et est conforme à ce qu'on attend.

### 2. Autres settings existants ?

Story 1.4 a créé `GET /me/settings`. Si d'autres settings sont déjà gérés ailleurs (ex: `overpassEnabled` mentionné dans project-context §Overpass Opt-in), il faut **les inclure dans la réponse** pour cohérence. Vérifier :
```bash
grep -r "overpassEnabled\|overpass_enabled" apps/api/src/
```
Si OUI : étendre `MeService.getSettings()` pour retourner tous les settings, pas juste `liveAccessConsent`.

### 3. Atomicity event + DB commit

Pattern à respecter :
```typescript
async updateLiveAccessConsent(userId: string, newValue: boolean) {
  const previous = await this.repo.getLiveAccessConsent(userId)
  await this.repo.setLiveAccessConsent(userId, newValue)
  // emit APRÈS le commit DB (Drizzle commit est implicite par defaut sans transaction)
  if (previous === true && newValue === false) {
    this.eventEmitter.emit('profile.live-consent-revoked', { userId })
  }
  return { liveAccessConsent: newValue }
}
```

Si transaction Drizzle utilisée : émettre dans le `.then()` du commit OU utiliser `eventEmitter.emitAsync` après le `await`.

### 4. JWT extraction `req.user.id`

Cf. project-context §NestJS Architecture Rules :
> JwtAuthGuard verifies Better Auth JWT on every protected endpoint. Extracts `req.user = { id, email }` from token. Use `@CurrentUser()` decorator to access user in controllers.

Réutiliser `@CurrentUser()` decorator existant.

### 5. PATCH partial body

REST convention : `PATCH` accepte des champs partiels. Pour `liveAccessConsent` uniquement (pour l'instant), DTO :
```typescript
class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  liveAccessConsent?: boolean
}
```

Si futur ajout d'autres settings : ajouter en optional, gérer chaque champ indépendamment dans le service.

---

## Tasks / Subtasks

- [x] **Task 1** — Vérifier état actuel du stub (⚠️Discovery #1)
  - [x] Ouvrir `apps/api/src/me/me.controller.ts`
  - [x] Confirmer présence des stubs 501 — confirmés (`GET` + `PATCH` → `NotImplementedException`)
  - [x] Identifier les autres settings éventuels (Discovery #2) — `overpassEnabled` + `tier` gérés par `ProfileModule` (`/api/profile`). Décision : inclure `overpassEnabled` dans la réponse `/me/settings` (cohérence settings de confidentialité), `tier` exclu (état d'abonnement, pas un setting togglable)

- [x] **Task 2** — Créer `MeRepository` (AC: 1, 2)
  - [x] `me.repository.ts` avec méthodes : `getSettings(userId)`, `setLiveAccessConsent(userId, value)`
  - [x] Pattern repository (cf. project-context §NestJS Architecture Rules) — seul à toucher Drizzle

- [x] **Task 3** — Créer `MeService` (AC: 2, 3, 6, ⚠️Discovery #3)
  - [x] `me.service.ts` avec `getSettings` + `updateSettings`
  - [x] Inject `MeRepository` + `EventEmitter2`
  - [x] Logique emit event uniquement sur transition true→false, APRÈS commit DB (atomicité)

- [x] **Task 4** — Créer DTO `UpdateSettingsDto` (AC: 5)
  - [x] `dto/update-settings.dto.ts` avec class-validator (`@IsBoolean` requis — cf. Doc Sync, déviation assumée vs Discovery #5)

- [x] **Task 5** — Remplacer stubs dans `MeController` (AC: 1, 2, 4)
  - [x] `GET /me/settings` → `this.meService.getSettings(user.id)`
  - [x] `PATCH /me/settings` → `this.meService.updateSettings(user.id, dto)`
  - [x] Protection JWT : assurée par le `JwtAuthGuard` GLOBAL (`APP_GUARD`) — pas de `@UseGuards` par route nécessaire (cf. Doc Sync)
  - [x] Header `Cache-Control: no-store` sur GET (`@Header`)

- [x] **Task 6** — Tests unitaires (AC: 7)
  - [x] `me.service.spec.ts` : 11 tests (transitions consent, idempotence, atomicité, défauts, overpassEnabled)

- [x] **Task 7** — Test E2E (AC: 7)
  - [x] `apps/api/test/me-settings.e2e-spec.ts` : 9 tests HTTP (intégration controller, DB mockée + faux JWT — cf. Doc Sync, aligné Story 2.3/3.1)
  - [x] État `profiles` piloté en mémoire (consent null/true/false selon cas)
  - [x] `EventEmitter2` mocké pour vérifier émission `profile.live-consent-revoked`

- [x] **Task 8** — Validation manuelle — DIFFÉRÉE (cf. Doc Sync)
  - [x] Couverte par le test d'intégration au niveau contrat HTTP (401, 200, PATCH+persistance, 400)
  - Le smoke test `curl` réel requiert la stack live (Postgres + Better Auth JWKS) — différé comme pour Story 3.1, à faire quand l'UI consent (3.3) atterrit

- [x] **Task 9** — Doc Sync + commit (AC: 8)
  - [x] Doc Sync consigné dans Dev Agent Record
  - [ ] Commit : `feat(api): MeController real impl for /me/settings (live access consent + event emit on revoke) — story poi-access-3.2` _(commit manuel restant — Guillaume, comme pour 2.6/3.1)_

---

## Dev Notes

### Pattern projet — `@CurrentUser()` decorator

```typescript
@Get()
async getSettings(@CurrentUser() user: { id: string; email: string }) {
  return this.meService.getSettings(user.id)
}
```

### Pattern projet — Repository

Cf. project-context §NestJS Architecture Rules : "ALL Drizzle queries go here, NEVER in service". `MeRepository` est le seul à toucher Drizzle.

### Pattern projet — ResponseInterceptor

Retour brut depuis le controller, wrap automatique :
```typescript
return { liveAccessConsent: true }
// → client reçoit { data: { liveAccessConsent: true } }
```

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-3.2]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Endpoints-de-Settings]
- [Source: _bmad-output/project-context.md#NestJS-Architecture-Rules]
- [Source: _bmad-output/project-context.md#Overpass-Opt-in] — exemple de pattern setting existant
- [Source: _bmad-output/implementation-artifacts/poi-access-1-4-...md] — stubs créés

---

## Review Findings

_Code review adversariale (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 2026-05-29. Acceptance Auditor : les 8 AC satisfaits, 5 écarts Doc Sync tous justifiés, File List = `git status` exact._

- [x] [Review][Decision→Patch] Phantom write si le profil n'existe pas — `PATCH /me/settings` répondait 200 avec les valeurs par défaut alors que rien n'était persisté (`UPDATE ... WHERE id = userId` touchant 0 ligne en silence ; la création de profil au signup est best-effort + erreur avalée dans `apps/web/src/lib/auth/auth.ts:117-124`, et `JwtAuthGuard` ne lit jamais `profiles`). **RÉSOLU (P1)** : `setLiveAccessConsent` utilise désormais un upsert `INSERT … ON CONFLICT (id) DO UPDATE` (schéma vérifié : toutes colonnes NOT NULL ont un défaut, FK `id → user.id` satisfaite par le JWT). Garantit la persistance RGPD. `updatedAt` bumpé manuellement (hors `$onUpdateFn` sur la branche conflict). Régression couverte par un test e2e dédié. [`me.repository.ts`] (blind+edge)
- [x] [Review][Patch] `eventEmitter.emit` non protégé — un listener Story 4.2 qui throw aurait fait remonter une 500 APRÈS le commit DB, alors que le commentaire déclare une purge cache "best-effort". **RÉSOLU (P2)** : émission isolée dans un `try/catch` + `Logger.error` ; l'échec d'un listener ne fait plus échouer le PATCH ni annuler une révocation déjà committée. [`me.service.ts`] (blind)
- [x] [Review][Defer] Read-modify-write non transactionnel — deux `PATCH {false}` concurrents lisent tous deux `previous=true` → event `profile.live-consent-revoked` émis 2× (consumer Story 4.2 = purge Redis idempotente best-effort → bénin), ou event perdu si un `PATCH {true}` s'intercale. Durcissement transactionnel transverse (déjà noté pour 3.1) — différé. [`me.service.ts:48-55`] (blind+edge) — deferred
- [x] [Review][Defer] `ValidationPipe` global sans `forbidNonWhitelisted` — clés inconnues d'un body PATCH silencieusement strippées (ex: `{ liveAccessConsent: true, foo: "x" }` → 200). Config globale pré-existante (`main.ts:20`), non introduite par cette story. [`apps/api/src/main.ts:20`] (edge) — deferred, pre-existing

**Écartés comme bruit (6) :** `overpassEnabled` lisible mais non writable ici (by design — source de vérité `ProfileModule`, Discovery #2) ; le test d'intégration ne rejoue pas la vraie chaîne de guards globaux (limite de stratégie de test assumée, Doc Sync #3) ; défaut `overpassEnabled: false` (= défaut colonne DB, vérifié) ; paramètre `updateSettings` non typé (faux positif — `@CurrentUser() user: CurrentUserPayload` bien typé) ; `moduleNameMapper` jest strippe `.js` (convention TS-ESM standard) ; double `getSettings` par PATCH (correct, micro-efficacité).

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (1M context) — bmad-dev-story

### Completion Notes List
- **Autres settings inclus dans la réponse** : `overpassEnabled` (Discovery #2). `tier` exclu (état d'abonnement, pas un setting togglable). Source de vérité d'écriture reste `/api/profile` ; `/me/settings` ne fait que le lire en lecture pour cohérence.
- **Event émis vérifié en test** : ☑ Oui — `profile.live-consent-revoked` avec `{ userId }`, vérifié en unit (`me.service.spec.ts`) ET en intégration (`me-settings.e2e-spec.ts`). Émis uniquement sur transition `true → false`, APRÈS le commit DB (atomicité AC #3 — test dédié : si `setLiveAccessConsent` rejette, aucun event).
- **Idempotence (AC #6)** : `setLiveAccessConsent` est toujours appelé (UPDATE no-op effectif), pas d'event si pas de transition true→false. Vérifié.
- **Résultats tests** : `me.service.spec.ts` 11/11 ✓ (CI `pnpm test`) ; `me-settings.e2e-spec.ts` 9/9 ✓ (`test:e2e`). Suite API complète **387/387**, aucune régression. `tsc --noEmit` clean, ESLint clean.

#### Doc Sync — Écarts documentés (project-context §Doc Sync Rule)

1. **DTO `liveAccessConsent` REQUIS (`@IsBoolean` sans `@IsOptional`)** — vs snippet Discovery #5 qui suggérait `@IsOptional()`. Raison : l'AC #5 exige `null` → 400 et l'AC #7 tranche `PATCH {}` → **400** ("PATCH ne devrait jamais être un GET déguisé"). `@IsOptional()` laisserait passer `null`/absence. Le contrat REST retenu : `liveAccessConsent` obligatoire et strictement booléen.
2. **Protection JWT par guard GLOBAL** — pas de `@UseGuards(JwtAuthGuard)` par route. Le projet enregistre `JwtAuthGuard` en `APP_GUARD` (app.module:78), donc `/me/settings` est protégé automatiquement (AC #4 satisfait sans annotation explicite, contrairement au libellé de Task 5).
3. **Test "E2E" = test d'intégration controller** (DB `@ridenrest/database` mockée + faux `JwtAuthGuard` piloté par header `x-test-user-id` + `EventEmitter2` mocké), PAS un E2E DB-backed avec seed réel. Raison : le CI exécute `pnpm test` (Jest unitaire, `rootDir=src`, sans Postgres/Better Auth) — décision déjà actée en Story 2.3/3.1. Tous les cas de l'AC #7 sont couverts au niveau du contrat HTTP.
4. **`apps/api/test/jest-e2e.json` modifié** (hors File List story) — ajout de `moduleNameMapper { "^(\\.{1,2}/.*)\\.js$": "$1" }` pour résoudre les imports ESM `.js` des fichiers source sous la config e2e. Changement d'infra de test minimal et nécessaire.
5. **Task 8 (validation manuelle `curl`) différée** — requiert la stack live (Postgres + Better Auth JWKS), différée comme pour Story 3.1. Le contrat HTTP est couvert par le test d'intégration.

### File List
- `apps/api/src/me/me.controller.ts` (modifié — remplace les stubs 501 par l'impl réelle)
- `apps/api/src/me/me.service.ts` (nouveau)
- `apps/api/src/me/me.repository.ts` (nouveau)
- `apps/api/src/me/me.service.spec.ts` (nouveau)
- `apps/api/src/me/me.module.ts` (modifié — ajout providers `MeService`, `MeRepository`)
- `apps/api/src/me/dto/update-settings.dto.ts` (nouveau)
- `apps/api/test/me-settings.e2e-spec.ts` (nouveau)
- `apps/api/test/jest-e2e.json` (modifié — `moduleNameMapper` pour résolution `.js`, cf. Doc Sync #4)
- `_bmad-output/implementation-artifacts/poi-access-3-2-me-controller-settings-impl.md` (modifié — story tracking)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié — statut story)

### Change Log
- 2026-05-29 — Implémentation réelle de `/me/settings` (Story 3.2) : `MeRepository` + `MeService` + `UpdateSettingsDto` + remplacement des stubs `MeController`. `GET` renvoie `{ liveAccessConsent, overpassEnabled }` (no-store), `PATCH` persiste `liveAccessConsent` et émet `profile.live-consent-revoked` sur révocation (true→false, post-commit). 11 tests unitaires + 9 tests d'intégration HTTP. Suite API 387/387, tsc + ESLint clean. 5 écarts Doc Sync documentés.
- 2026-05-29 — **Code review adversariale (bmad-code-review)** : 1 decision-needed + 1 patch + 2 defer + 6 écartés. Patches appliqués : **P1** `setLiveAccessConsent` → upsert `INSERT … ON CONFLICT DO UPDATE` (corrige le phantom-write quand le profil n'existe pas — consentement RGPD désormais garanti persisté ; `me.repository.ts`) ; **P2** émission de l'event isolée dans un `try/catch` + `Logger.error` (un listener best-effort qui throw ne fait plus échouer le PATCH post-commit ; `me.service.ts`). +1 test e2e de régression (phantom-write) → intégration 10/10. Suite API 387/387, tsc + ESLint clean. 2 findings différés consignés dans `deferred-work.md` (read-modify-write non transactionnel ; `forbidNonWhitelisted` global). Statut → `done`.
