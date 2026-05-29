---
baseline_commit: c758a88af225f2fd63e06732240cf68a5372af46
---

# Story POI-Access 2.6 : UI sélecteur de profil de routage dans l'édition d'aventure

Status: done

<!-- Dépend de : 1.3 (colonne DB + enum), 1.4 (EventEmitter en place). Indépendante des autres stories Epic 2. -->

## Story

As a **end user planning my adventure**,
I want to set the cycling routing profile (Route / Gravel / Bikepacking) on each of my adventures,
So that the access route calculations match my actual riding style and bike type.

## Acceptance Criteria

1. **Given** la page d'édition d'aventure existante (à identifier via `find` — probablement `apps/web/src/app/(app)/adventures/[id]/edit/page.tsx` ou similar), **When** j'y ajoute un composant `<Select>` shadcn/ui sous une nouvelle section "Profil de routage cyclable", **Then** :
   - Le select expose 3 options : `Route`, `Gravel (par défaut)`, `Bikepacking`
   - La valeur affichée correspond à `adventure.routingProfile` lue depuis l'API
   - Un mini-tooltip (`?` icon) explique en 1 phrase la différence entre profils :
     > "Route privilégie l'asphalte. Gravel mixe route et chemins blancs. Bikepacking minimise le trafic routier."

2. **Given** l'utilisateur change la sélection, **When** il sélectionne un autre profil, **Then** :
   - L'UI appelle `PATCH /adventures/:id { routingProfile: 'road' | 'gravel' | 'bikepacking' }`
   - La réponse 200 confirme le changement et le store local TanStack Query est invalidé via `queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })`
   - Un toast confirme la sauvegarde (réutiliser le pattern toast existant)
   - Sur erreur réseau/serveur, un toast d'erreur s'affiche ET la sélection revient à la valeur précédente (optimistic UI avec rollback)

3. **Given** le backend `PATCH /adventures/:id` reçoit `routingProfile`, **When** la mise à jour DB est faite, **Then** :
   - La nouvelle valeur est persistée dans `adventures.routing_profile`
   - Un event `'adventure.profile-changed'` est émis via `EventEmitter2` avec payload `{ adventureId, newProfile, previousProfile }` (consommé par Story 4.2 pour l'invalidation des caches d'accès)
   - La validation DTO côté backend accepte uniquement les 3 valeurs enum, rejette 400 sinon
   - Test E2E : PATCH valide (200 + event émis), PATCH valeur invalide (400), PATCH sur aventure d'un autre user (403)

4. **Given** une nouvelle aventure créée, **When** je consulte sa fiche, **Then** :
   - `routingProfile === 'gravel'` (default DB de la Story 1.3 appliqué)
   - Le `<Select>` affiche "Gravel (par défaut)" sélectionné

5. **Given** l'utilisateur change le profil d'une aventure existante qui a déjà des access caches calculés, **When** le PATCH est confirmé, **Then** :
   - L'event `'adventure.profile-changed'` est émis (Story 4.2 invalide les caches access en cascade)
   - L'utilisateur peut continuer à consulter ses POI — les itinéraires d'accès seront recalculés au prochain accès (lazy) OU en background (eager si worker actif, Story 4.1)
   - Aucune erreur UI visible pendant le recalcul (les composants `AccessMetrics` afficheront skeleton puis nouvelles valeurs)

6. **Given** le type TS pour `RoutingProfile`, **When** je l'expose dans `@ridenrest/shared`, **Then** :
   - Type exporté : `export type RoutingProfile = 'road' | 'gravel' | 'bikepacking'`
   - Constante labels exportée : `export const ROUTING_PROFILE_LABELS: Record<RoutingProfile, string> = { road: 'Route', gravel: 'Gravel (par défaut)', bikepacking: 'Bikepacking' }`
   - Constante tooltips exportée : `export const ROUTING_PROFILE_TOOLTIPS: Record<RoutingProfile, string> = { ... }`

7. **Given** les tests composant + E2E, **When** je les couvre, **Then** :
   - Composant React (Vitest) : render avec valeur initiale, changement valeur → mutation appelée, erreur mutation → rollback UI
   - Backend E2E (Jest) : PATCH valide → 200 + event + DB updated, PATCH 400 invalid value, PATCH 403 non-owner
   - Coverage ≥ 80%

8. **Given** la story terminée, **When** je commit, **Then** le diff inclut UNIQUEMENT :
   - `packages/shared/src/types/routing-profile.ts` (nouveau ou ajouté à un fichier existant `adventures.ts`)
   - `packages/shared/src/index.ts` (modifié)
   - `apps/api/src/adventures/dto/update-adventure.dto.ts` (modifié — ajout `routingProfile`)
   - `apps/api/src/adventures/adventures.controller.ts` (modifié — PATCH étendu, event emit)
   - `apps/api/src/adventures/adventures.service.ts` (modifié — handle update + emit)
   - `apps/api/test/adventures-update.e2e-spec.ts` (modifié ou nouveau)
   - `apps/web/src/app/(app)/adventures/[id]/edit/_components/routing-profile-selector.tsx` (nouveau)
   - `apps/web/src/app/(app)/adventures/[id]/edit/page.tsx` (modifié — intégration du selector)
   - `apps/web/src/lib/queries/adventures.ts` (modifié si mutation `useUpdateAdventure` existe — sinon créée)
   - Doc Sync si écart

---

## ⚠️ Critical Discovery Notes

### 1. Page d'édition d'aventure — à localiser

L'archi présume qu'une page d'édition existe. **À confirmer** avant d'implémenter :
```bash
find apps/web/src/app -name "edit" -type d
grep -r "PATCH.*adventures" apps/web/src/lib/queries/
```
Si pas de page d'édition existante, OPTION : intégrer le selector dans la page de détail de l'aventure ou dans un dialog. **Coordonner avec Guillaume** avant de créer une nouvelle page complète (out of scope).

### 2. Pattern PATCH adventures — vérifier l'existant

L'endpoint `PATCH /adventures/:id` existe probablement déjà (pour rename, etc.). À vérifier :
```bash
grep -A 10 "Patch.*adventures" apps/api/src/adventures/adventures.controller.ts
```
Si oui : étendre le DTO existant `UpdateAdventureDto` avec `routingProfile?: RoutingProfile`. Si non : créer le endpoint complet.

### 3. EventEmitter consumer — Story 4.2

L'event `'adventure.profile-changed'` est consommé par Story 4.2 (invalidation handlers). Cette story 2.6 émet juste l'event — la consommation est out of scope. **À documenter** dans le commit que l'event est émis pour le futur consumer.

Si Story 4.2 n'est pas encore implémentée au moment où 2.6 ship en prod, **aucun listener n'écoute l'event** → pas d'invalidation cache, les POI continuent à afficher des valeurs calculées avec l'ancien profil. **Acceptable pour MVP** car l'utilisateur change rarement de profil.

### 4. Optimistic UI rollback — pattern TanStack Query

```typescript
const mutation = useMutation({
  mutationFn: (newProfile) => api.patch(`/adventures/${id}`, { routingProfile: newProfile }),
  onMutate: async (newProfile) => {
    await queryClient.cancelQueries({ queryKey: ['adventures', id] })
    const previous = queryClient.getQueryData(['adventures', id])
    queryClient.setQueryData(['adventures', id], (old) => ({ ...old, routingProfile: newProfile }))
    return { previous }
  },
  onError: (err, _, context) => {
    queryClient.setQueryData(['adventures', id], context.previous)
    toast.error('Échec de la sauvegarde')
  },
  onSuccess: () => {
    toast.success('Profil mis à jour')
    queryClient.invalidateQueries({ queryKey: ['poi-access'] })  // invalide tous les access POI
  },
})
```

L'invalidation `['poi-access']` (préfixe) force le refetch sur tous les `useAccess` actifs → nouveaux calculs avec nouveau profil. Cohérent UX.

### 5. Pattern toast du projet

À identifier :
```bash
grep -r "import.*toast" apps/web/src/ | head -5
```
Probablement `sonner` (popular avec shadcn). Réutiliser le pattern.

---

## Tasks / Subtasks

- [x] **Task 1** — Localiser la page d'édition (⚠️Discovery #1)
  - [x] Identifier où ajouter le selector (page edit existante, ou ajout dans page détail) → **AUCUNE page edit n'existe**. Intégration inline dans la page détail `adventures/[id]` (`adventure-detail.tsx`), pattern cohérent avec les champs date/vitesse.
  - [x] Coordonner avec Guillaume si décision non triviale → **Guillaume a choisi "Page détail, inline"** (AskUserQuestion 2026-05-29).

- [x] **Task 2** — Exposer le type RoutingProfile + labels dans `@ridenrest/shared` (AC: 6)
  - [x] `packages/shared/src/types/routing-profile.ts` avec type + constantes labels/tooltips (+ `ROUTING_PROFILE_VALUES`)
  - [x] Export depuis `index.ts`
  - [x] `pnpm --filter @ridenrest/shared build` → OK

- [x] **Task 3** — Backend : étendre PATCH /adventures/:id (AC: 3, ⚠️Discovery #2)
  - [x] Vérifier l'existant → endpoint `PATCH /adventures/:id` + `UpdateAdventureDto` (class-validator) existent
  - [x] Étendre `UpdateAdventureDto` avec `routingProfile?` via `@IsIn(ROUTING_PROFILE_VALUES)` (class-validator, cohérent avec le DTO existant — pas Zod)
  - [x] Dans `AdventuresService.updateAdventure()` : si `routingProfile` change, récupère la valeur précédente, UPDATE via `updateRoutingProfile`, puis `eventEmitter.emit('adventure.profile-changed', { adventureId, newProfile, previousProfile })`
  - [x] Tests couvrent AC #3 (cf. Doc Sync : tests unitaires co-localisés au lieu d'E2E, conforme project-context « No E2E for MVP »)

- [x] **Task 4** — Frontend : créer `routing-profile-selector.tsx` (AC: 1, 2, ⚠️Discovery #4, #5)
  - [x] Composant `<RoutingProfileSelector adventureId={...} currentProfile={...} />`
  - [x] `<Select>` shadcn/ui (Base UI) avec 3 options issues de `ROUTING_PROFILE_LABELS` + `items` map (label visible fermé)
  - [x] Tooltip explicatif via `SectionTooltip` (pattern projet, icône Info) — texte combiné AC1
  - [x] Mutation TanStack Query avec optimistic UI + rollback (cf. ⚠️Discovery #4)
  - [x] Toast success/error (`sonner`)

- [x] **Task 5** — Intégrer dans la page détail (AC: 1)
  - [x] Section "Profil de routage cyclable" avec `<RoutingProfileSelector>` après le bloc dates
  - [x] Placement cohérent avec la hiérarchie visuelle existante de la page

- [x] **Task 6** — Tests composant (AC: 7)
  - [x] Vitest : render/labels, valeur initiale (AC1), change → mutation (AC2), succès → invalidation poi-access, erreur → rollback (AC2), no-op même valeur — 6/6 verts
  - [x] Mock TanStack Query + mock du `Select` Base UI en `<select>` natif (popup flottant non fiable sous jsdom — voir Doc Sync)

- [~] **Task 7** — Validation manuelle UI (AC: 4, 5) — **protocole fourni, exécution Guillaume requise** (cf. pattern stories 2.4/2.5)
  - [ ] Créer une nouvelle aventure → vérifier default "Gravel (par défaut)" (AC4)
  - [ ] Changer pour "Bikepacking" → toast OK, valeur persistée après reload (AC5)
  - [ ] Epic 4 non livré : pas d'invalidation cache visible côté carte (acceptable, AC5 / Discovery #3)

- [x] **Task 8** — Doc Sync + commit (AC: 8)
  - [x] Doc Sync documenté (écarts vs file list AC8 ci-dessous)
  - [ ] Commit (effectué après validation/review) : `feat(adventures): UI selector for routing profile + backend PATCH + event emit — story poi-access-2.6`

---

## Dev Notes

### Pattern projet — shadcn Select

```tsx
<Select value={currentProfile} onValueChange={handleChange}>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    {Object.entries(ROUTING_PROFILE_LABELS).map(([k, v]) => (
      <SelectItem key={k} value={k}>{v}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

### Pattern projet — Mutation TanStack Query

Cf. project-context §Loading States + pattern existant `useUpdateAdventure` (à vérifier).

### Pattern projet — Forms

Si la page d'édition utilise React Hook Form (cf. project-context §Validation), intégrer le selector dans le form parent OU le garder standalone selon UX souhaitée. Décision avec Guillaume.

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-2.6]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Data-Architecture] — schéma adventures
- [Source: _bmad-output/implementation-artifacts/poi-access-1-3-...md] — colonne DB
- [Source: _bmad-output/implementation-artifacts/poi-access-1-4-...md] — EventEmitter setup
- shadcn Select : https://ui.shadcn.com/docs/components/select

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (1M context) — BMad dev-story workflow, 2026-05-29

### Completion Notes List
- **Page utilisée** : page détail `adventures/[id]` → `adventure-detail.tsx` (aucune page edit n'existe ; choix validé par Guillaume).
- **Pattern toast** : `sonner` (`import { toast } from 'sonner'`).
- **Pattern form** : ☑ standalone (mutations inline TanStack Query, cohérent avec les champs date/vitesse de la page — pas de React Hook Form sur cette page).
- **Validation backend** : `@IsIn(ROUTING_PROFILE_VALUES)` (class-validator), cohérent avec le `UpdateAdventureDto` existant. Le Zod `updateAdventureSchema` est obsolète (ne couvre pas dates/vitesse) et non câblé au DTO → non touché.
- **Event** : `ADVENTURE_PROFILE_CHANGED_EVENT = 'adventure.profile-changed'` + interface `AdventureProfileChangedPayload` exportées depuis `adventures.service.ts` pour le futur consumer (Story 4.2). Émis uniquement si le profil change réellement. `EventEmitterModule.forRoot()` étant global, `EventEmitter2` est injecté sans modifier `AdventuresModule`.
- **Optimistic UI** : la valeur affichée est pilotée par le cache `['adventures', id]` ; `onMutate` met le cache à jour, `onError` rollback. `onSuccess` invalide `['poi-access']` (préfixe) → recalcul des métriques d'accès. `onSettled` re-sync `['adventures', id]`.
- **AC8 — `AdventureResponse`** : ajout du champ requis `routingProfile` (lu par l'UI via `adventure.routingProfile`). `toResponse()` le mappe désormais.
- **Validation auto** : Shared 31/31, API 344/344 (suite complète), Web 1044/1044 (suite complète). ESLint clean (api/shared/web fichiers touchés). `tsc` : production clean ; web test-fixtures à 59 erreurs pré-existantes inchangées (cf. Doc Sync).

### ⚠️ Doc Sync — écarts vs plan d'origine (AC8)
1. **Page edit inexistante** → intégration dans `adventures/[id]/_components/adventure-detail.tsx` au lieu de `adventures/[id]/edit/page.tsx`. Aucune nouvelle page créée (out-of-scope évité, validé Guillaume).
2. **Data layer** → la fonction PATCH client vit dans `apps/web/src/lib/api-client.ts` (`updateAdventureRoutingProfile`), pas dans `apps/web/src/lib/queries/adventures.ts` (ce fichier/dossier n'existe pas).
3. **Tests backend** → tests unitaires co-localisés (`adventures.service.test.ts` + `dto/update-adventure.dto.test.ts`) au lieu de `apps/api/test/adventures-update.e2e-spec.ts`, conforme à project-context « No E2E for MVP — deferred ». Couvrent : PATCH valide (200 + event + DB), valeur invalide (400 via DTO), non-owner (404 `NotFoundException` — le projet renvoie 404 et non 403 pour ne pas divulguer l'existence ; léger écart vs AC3 qui mentionnait 403).
4. **`AdventureResponse`** (`packages/shared/src/types/adventure.types.ts`) modifié — non listé dans AC8 mais nécessaire pour exposer `routingProfile` à l'UI.
5. **Fixtures de tests** (`adventure-card.test.tsx`, `adventure-list.test.tsx`, `app-header.test.tsx`) : ajout de `routingProfile: 'gravel'` (conséquence du champ requis).
6. **Tooltip** : `SectionTooltip` (icône Info) au lieu d'une icône `?` ad hoc — réutilise le pattern projet existant.
7. **Select** : composant shadcn basé sur **Base UI** (pas Radix) ; `items` map ajoutée pour afficher le label sélectionné fermé ; test composant mocke le `Select` en `<select>` natif (popup flottant non sélectionnable de façon fiable sous jsdom).

### File List
- [x] `packages/shared/src/types/routing-profile.ts` (nouveau)
- [x] `packages/shared/src/types/adventure.types.ts` (modifié — `routingProfile` sur `AdventureResponse`)
- [x] `packages/shared/src/index.ts` (modifié — exports RoutingProfile)
- [x] `apps/api/src/adventures/dto/update-adventure.dto.ts` (modifié — `routingProfile`)
- [x] `apps/api/src/adventures/dto/update-adventure.dto.test.ts` (nouveau — validation 400)
- [x] `apps/api/src/adventures/adventures.controller.ts` (modifié — summary PATCH)
- [x] `apps/api/src/adventures/adventures.service.ts` (modifié — update + emit event)
- [x] `apps/api/src/adventures/adventures.repository.ts` (modifié — `updateRoutingProfile`)
- [x] `apps/api/src/adventures/adventures.service.test.ts` (modifié — tests update + event)
- [x] `apps/web/src/app/(app)/adventures/[id]/_components/routing-profile-selector.tsx` (nouveau)
- [x] `apps/web/src/app/(app)/adventures/[id]/_components/routing-profile-selector.test.tsx` (nouveau)
- [x] `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` (modifié — intégration)
- [x] `apps/web/src/lib/api-client.ts` (modifié — `updateAdventureRoutingProfile`)
- [x] `apps/web/src/app/(app)/adventures/_components/adventure-card.test.tsx` (modifié — fixture)
- [x] `apps/web/src/app/(app)/adventures/_components/adventure-list.test.tsx` (modifié — fixture)
- [x] `apps/web/src/components/layout/app-header.test.tsx` (modifié — fixture)

### Change Log
| Date | Description |
|---|---|
| 2026-05-29 | Implémentation story 2.6 : type `RoutingProfile` partagé (labels/tooltips), PATCH backend `routingProfile` + event `adventure.profile-changed`, composant `RoutingProfileSelector` (optimistic UI + rollback) intégré dans la page détail. Tests : Shared 31/31, API 344/344, Web 1044/1044. Status → review. |

---

## Review Findings (code review 2026-05-29)

Revue adversariale 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Bilan : **0 decision-needed, 1 patch, 2 deferred, 9 écartés (faux positifs / bruit)**. Les 3 findings High/Medium initiaux étaient tous des faux positifs confirmés par lecture du code réel.

### Patch (optionnel)

- [x] [Review][Patch] Lecture DB redondante dans la branche `routingProfile` — **CORRIGÉ** : `verifyOwnership()` retourne désormais l'`Adventure` ; `updateAdventure` réutilise `existing.routingProfile` pour `previousProfile` (suppression du `findByIdAndUserId` redondant + du guard mort `previousProfile !== undefined`). Test `verifyOwnership` mis à jour. API 344/344 ✓, tsc ✓, ESLint ✓. [`apps/api/src/adventures/adventures.service.ts:48,62,80`]

### Deferred (pré-existant, non causé par 2.6)

- [x] [Review][Defer] `updateRoutingProfile` (repo) filtre par `id` seul (pas `userId`) et renvoie `row as Adventure` sans null-check — pattern partagé par toutes les méthodes `updateX` du repo. IDOR latent mais **inatteignable** car `updateAdventure` appelle `verifyOwnership` en amont (ligne 62). [`apps/api/src/adventures/adventures.repository.ts:86-93`] — deferred, pré-existant
- [x] [Review][Defer] PATCH multi-champs non-atomique — `name/startDate/endDate/avgSpeedKmh/routingProfile` sont des UPDATE séparés sans transaction ; un échec sur l'un laisse une mise à jour partielle. Le client envoie un seul champ par appel aujourd'hui. Architecture pré-existante du service `updateAdventure`. [`apps/api/src/adventures/adventures.service.ts:65-92`] — deferred, pré-existant

### Écartés (faux positifs / bruit) — 9

| # | Source | Finding | Raison de l'écart |
|---|---|---|---|
| 1 | blind | Contournement d'autorisation (write par `id` seul) | `verifyOwnership` ligne 62 throw `NotFoundException` pour non-owner avant la branche |
| 2 | blind | Optimistic UI cassé si parent ne souscrit pas à `['adventures', id]` | `adventure-detail` souscrit bien à cette clé exacte → prop se met à jour |
| 3 | blind | Clé `['poi-access']` ne matche pas les query keys | `useAccess.ts:24` = `['poi-access', poiId, origin]`, invalidation préfixe correcte |
| 4 | blind+edge | `previousProfile === undefined` masque l'event au premier set | Dead code : colonne `notNull().default('gravel')` → jamais `undefined` |
| 5 | blind+edge | `row as Adventure` undefined après `returning()` vide | TOCTOU théorique ; ligne réécrite micro-secondes après `verifyOwnership` |
| 6 | blind+edge | Race `onSettled` invalidation lors de changements rapides | `disabled={isPending}` mitige ; profil changé rarement (Discovery #3) ; impact négligeable |
| 7 | edge | `onMutate` no-op si cache vide (pas de rollback) | Composant rendu uniquement si `adventure` existe (guard parent, même clé) |
| 8 | edge | `onSuccess` ignore la réponse serveur, dépend du refetch `onSettled` | Pattern TanStack standard ; `onSettled` garantit la cohérence |
| 9 | auditor | AC2 — invalidation `['adventures',id]` vs `['poi-access']` incohérente | Les **deux** clés sont invalidées (`onSuccess` + `onSettled`) → AC2 satisfait, simple incohérence doc interne |

### Notes de l'Acceptance Auditor (non bloquantes)
- **AC1–AC8 globalement satisfaits.** Déviations documentées (Doc Sync #1–#7) toutes vérifiées **vraies** : 403→404 (sécurité projet), `SectionTooltip`/icône Info au lieu de `?`, Base UI Select, tests unitaires co-localisés vs E2E.
- **AC7 — couverture ≥ 80 %** : les 3 cas composant + 3 cas backend requis sont présents, mais le seuil de couverture n'a pas été re-mesuré indépendamment (affirmé dans la story, non ré-évidencé ici).
