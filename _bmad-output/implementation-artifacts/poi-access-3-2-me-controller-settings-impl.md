# Story POI-Access 3.2 : `MeController` — `GET /me/settings` & `PATCH /me/settings` (impl. réelle)

Status: ready-for-dev

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

- [ ] **Task 1** — Vérifier état actuel du stub (⚠️Discovery #1)
  - [ ] Ouvrir `apps/api/src/me/me.controller.ts`
  - [ ] Confirmer présence des stubs 501
  - [ ] Identifier les autres settings éventuels (Discovery #2)

- [ ] **Task 2** — Créer `MeRepository` (AC: 1, 2)
  - [ ] `me.repository.ts` avec méthodes : `getSettings(userId)`, `setLiveAccessConsent(userId, value)`
  - [ ] Pattern repository (cf. project-context §NestJS Architecture Rules)

- [ ] **Task 3** — Créer `MeService` (AC: 2, 3, 6, ⚠️Discovery #3)
  - [ ] `me.service.ts` avec :
    - `getSettings(userId): Promise<{ liveAccessConsent: boolean | null, ... }>`
    - `updateSettings(userId, dto: UpdateSettingsDto): Promise<{ liveAccessConsent, ... }>`
  - [ ] Inject `MeRepository` + `EventEmitter2`
  - [ ] Logique emit event uniquement sur transition true→false

- [ ] **Task 4** — Créer DTO `UpdateSettingsDto` (AC: 5)
  - [ ] `dto/update-settings.dto.ts` avec class-validator OU Zod (cohérent avec Story 2.3)

- [ ] **Task 5** — Remplacer stubs dans `MeController` (AC: 1, 2, 4)
  - [ ] `GET /me/settings` → `this.meService.getSettings(user.id)`
  - [ ] `PATCH /me/settings` → `this.meService.updateSettings(user.id, dto)`
  - [ ] `@UseGuards(JwtAuthGuard)` (vérifier déjà appliqué via Story 1.4)
  - [ ] Header `Cache-Control: no-store` sur GET

- [ ] **Task 6** — Tests unitaires (AC: 7)
  - [ ] `me.service.spec.ts` : tous les cas de l'AC #7

- [ ] **Task 7** — Test E2E (AC: 7)
  - [ ] `apps/api/test/me-settings.e2e-spec.ts`
  - [ ] Seed DB avec user (consent null/true/false selon cas)
  - [ ] Mock EventEmitter pour vérifier émission

- [ ] **Task 8** — Validation manuelle
  - [ ] `turbo dev` → curl GET /api/me/settings sans token → 401
  - [ ] curl avec token valide → 200 + JSON
  - [ ] curl PATCH avec body valide → 200 + DB update visible

- [ ] **Task 9** — Doc Sync + commit (AC: 8)
  - [ ] Commit : `feat(api): MeController real impl for /me/settings (live access consent + event emit on revoke) — story poi-access-3.2`

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

## Dev Agent Record

### Agent Model Used
_(À renseigner)_

### Completion Notes List
- Autres settings inclus dans la réponse : `___`
- Event émis vérifié en test : ☐ Oui / ☐ Non

### File List
- [ ] `apps/api/src/me/me.controller.ts` (modifié)
- [ ] `apps/api/src/me/me.service.ts` (nouveau)
- [ ] `apps/api/src/me/me.repository.ts` (nouveau)
- [ ] `apps/api/src/me/me.service.spec.ts` (nouveau)
- [ ] `apps/api/src/me/me.module.ts` (modifié)
- [ ] `apps/api/src/me/dto/update-settings.dto.ts` (nouveau)
- [ ] `apps/api/test/me-settings.e2e-spec.ts` (nouveau)
