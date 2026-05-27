# Story POI-Access 2.6 : UI sélecteur de profil de routage dans l'édition d'aventure

Status: ready-for-dev

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

- [ ] **Task 1** — Localiser la page d'édition (⚠️Discovery #1)
  - [ ] Identifier où ajouter le selector (page edit existante, ou ajout dans page détail)
  - [ ] Coordonner avec Guillaume si décision non triviale

- [ ] **Task 2** — Exposer le type RoutingProfile + labels dans `@ridenrest/shared` (AC: 6)
  - [ ] `packages/shared/src/types/routing-profile.ts` avec type + constantes labels/tooltips
  - [ ] Export depuis `index.ts`
  - [ ] `pnpm --filter @ridenrest/shared build`

- [ ] **Task 3** — Backend : étendre PATCH /adventures/:id (AC: 3, ⚠️Discovery #2)
  - [ ] Vérifier l'existant
  - [ ] Étendre `UpdateAdventureDto` avec `routingProfile?: z.enum(['road', 'gravel', 'bikepacking'])` (Zod ou class-validator)
  - [ ] Dans `AdventuresService.update()` : si `routingProfile` change, récupérer la valeur précédente, faire l'UPDATE, puis `eventEmitter.emit('adventure.profile-changed', { adventureId, newProfile, previousProfile })`
  - [ ] Test E2E couvre AC #3

- [ ] **Task 4** — Frontend : créer `routing-profile-selector.tsx` (AC: 1, 2, ⚠️Discovery #4, #5)
  - [ ] Composant `<RoutingProfileSelector adventureId={...} currentProfile={...} />`
  - [ ] `<Select>` shadcn/ui avec 3 options issues de `ROUTING_PROFILE_LABELS`
  - [ ] Tooltip `?` à côté du label (réutiliser pattern existant projet)
  - [ ] Mutation TanStack Query avec optimistic UI + rollback (cf. ⚠️Discovery #4)
  - [ ] Toast success/error

- [ ] **Task 5** — Intégrer dans la page d'édition (AC: 1)
  - [ ] Section "Profil de routage cyclable" avec `<RoutingProfileSelector>`
  - [ ] Placement cohérent avec la hiérarchie visuelle existante de la page

- [ ] **Task 6** — Tests composant (AC: 7)
  - [ ] Vitest : render initial, change → mutation, erreur → rollback
  - [ ] Mock TanStack Query mutation

- [ ] **Task 7** — Validation manuelle UI (AC: 4, 5)
  - [ ] Créer une nouvelle aventure → vérifier default "gravel"
  - [ ] Changer pour "Bikepacking" → toast OK, valeur persistée
  - [ ] Si Epic 4 pas encore livré : pas d'invalidation visible côté carte (acceptable)

- [ ] **Task 8** — Doc Sync + commit (AC: 8)
  - [ ] Commit : `feat(adventures): UI selector for routing profile + backend PATCH + event emit — story poi-access-2.6`

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
_(À renseigner)_

### Completion Notes List
- Page d'édition utilisée : `___`
- Pattern toast utilisé : `___`
- Pattern form utilisé : ☐ React Hook Form / ☐ standalone

### File List
- [ ] `packages/shared/src/types/routing-profile.ts`
- [ ] `packages/shared/src/index.ts` (modifié)
- [ ] `apps/api/src/adventures/dto/update-adventure.dto.ts` (modifié)
- [ ] `apps/api/src/adventures/adventures.controller.ts` (modifié)
- [ ] `apps/api/src/adventures/adventures.service.ts` (modifié)
- [ ] `apps/api/test/adventures-update.e2e-spec.ts` (modifié)
- [ ] `apps/web/src/app/(app)/adventures/[id]/edit/_components/routing-profile-selector.tsx` (nouveau)
- [ ] `apps/web/src/app/(app)/adventures/[id]/edit/_components/routing-profile-selector.test.tsx`
- [ ] `apps/web/src/app/(app)/adventures/[id]/edit/page.tsx` (modifié)
- [ ] `apps/web/src/lib/queries/adventures.ts` (modifié si nécessaire)
