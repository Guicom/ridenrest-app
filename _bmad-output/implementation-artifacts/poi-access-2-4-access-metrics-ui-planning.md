# Story POI-Access 2.4 : Composant `AccessMetrics` + intégration POI Sheet/Popup Planning

Status: ready-for-dev

<!-- Dépend de : 2.3 (endpoint disponible). Premier code frontend de la feature. -->

## Story

As a **end user planning my adventure on desktop**,
I want to see the real cycling access distance + elevation gain to each accommodation POI directly in its detail sheet and popup,
So that I can pick a stopover hotel based on the actual additional cycling effort, not just a misleading straight-line distance.

## Acceptance Criteria

1. **Given** le helper `apps/web/src/lib/poi-labels.ts`, **When** je l'implémente, **Then** :
   - Export `getAccessLabel(subcategory: PoiSubcategory | null | undefined): string`
   - Mapping : `hotel → "Itinéraire vers l'hôtel"`, `camping → "Itinéraire vers le camping"`, `refuge → "Itinéraire vers le refuge"`, `hostel → "Itinéraire vers l'auberge"`, `guesthouse → "Itinéraire vers la chambre d'hôte"`, `gite → "Itinéraire vers le gîte"`
   - Fallback : `"Itinéraire d'accès"` si subcategory null/inconnue
   - Test unitaire couvre les 6 sous-catégories + le fallback

2. **Given** le hook `apps/web/src/components/poi-access/useAccess.ts`, **When** je l'implémente, **Then** :
   - Wrap TanStack Query : `useQuery({ queryKey: ['poi-access', poiId, origin], queryFn: () => api.post('/pois/${poiId}/access', { origin, profileOverride }) })`
   - Parse la réponse avec `AccessResponseSchema.parse(...)` (Zod, depuis `@ridenrest/shared`)
   - `staleTime: 5 * 60 * 1000`, `gcTime: 15 * 60 * 1000`
   - Retourne `{ data, isLoading, error }`
   - **Lazy** : pas de fetch tant que le composant n'est pas monté

3. **Given** `apps/web/src/components/poi-access/AccessMetricsSkeleton.tsx`, **When** je l'implémente, **Then** :
   - Skeleton dédié shadcn/ui `<Skeleton />` (pas spinner générique — cf. project-context §Loading States)
   - 3 lignes : title (height: h-6), distance + D+ + D- (height: h-4 chacune)

4. **Given** `apps/web/src/components/poi-access/AccessFallback.tsx`, **When** je l'implémente, **Then** :
   - Affiche distance vol d'oiseau (`fallbackDistanceM`)
   - Badge "≈ approximatif" (`<Badge variant="outline">`)
   - Tooltip explicatif (`<SectionTooltip>` du projet) : "BRouter indisponible — affichage de la distance à vol d'oiseau"
   - Couleur visuelle plus discrète (text-muted-foreground)

5. **Given** `apps/web/src/components/poi-access/AccessMetrics.tsx`, **When** je l'implémente, **Then** :
   - Props : `{ poiId: string; origin: AccessOrigin; subcategory: PoiSubcategory | null; fallbackDistanceM?: number; variant?: 'full' | 'compact' }`
   - Appelle `useAccess(poiId, origin)`
   - Pendant `isLoading` : `<AccessMetricsSkeleton />`
   - Si `data.status === 'ok'` : affiche title via `getAccessLabel(subcategory)`, distance formatée (`< 1000` → "X m", sinon "X,X km"), D+ ("X m D+"), D- ("X m D-")
   - Si `data.status === 'fallback'` : `<AccessFallback ... />`
   - Si `data.status === 'error'` ou network error : message d'erreur discret (text-destructive-foreground)
   - Variant `compact` : distance seule, sans D+/D- ni title (pour popup)
   - Variant `full` : tout (pour detail sheet)

6. **Given** le composant `poi-detail-sheet.tsx` existant (`apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx`), **When** je l'étends, **Then** :
   - Pour les POI de catégorie `accommodation` : ajout d'une section `<AccessMetrics variant="full" />` sous le bloc "Distance trace" existant
   - Pour les POI non-accommodation : pas d'ajout (out of scope, archi confirmée)
   - Le mount est lazy (uniquement quand le sheet est ouvert — pas de fetch silencieux)
   - L'origine passée est dérivée du store `usePlanningModeStore.currentStageId` (si présent) → `{ type: 'stage', stageId }`, sinon `{ type: 'adventure-start' }`

7. **Given** le composant `poi-popup.tsx` existant, **When** je l'étends, **Then** :
   - Pour les POI accommodation : ajout d'une `<AccessMetrics variant="compact" />` (distance seule, pas plus de 2 lignes ajoutées)
   - Pour les non-accommodation : pas d'ajout
   - Latence visible : skeleton apparaît immédiatement, distance dans les 500ms (cache hit) à 1s (miss)

8. **Given** les tests `*.test.tsx`, **When** je les couvre, **Then** :
   - `poi-labels.test.ts` : 6 mappings + fallback
   - `AccessMetrics.test.tsx` : rendu skeleton, ok (full), ok (compact), fallback, error
   - `useAccess.test.ts` : query key correct, parse réponse, error handling
   - Coverage ≥ 80% sur le dossier `poi-access/`

9. **Given** la story terminée, **When** je commit, **Then** le diff inclut UNIQUEMENT :
   - `apps/web/src/lib/poi-labels.ts` + `.test.ts`
   - `apps/web/src/components/poi-access/{AccessMetrics, AccessMetricsSkeleton, AccessFallback, useAccess}.{tsx,ts,test.tsx}`
   - `apps/web/src/lib/queries/poi-access.ts` (optionnel — pourrait être inline dans useAccess.ts)
   - `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` (modifié)
   - `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` (modifié)
   - `apps/web/src/stores/planning-mode-store.ts` (si extension nécessaire — peut être Story 2.5 selon découpe)
   - Doc Sync si écart

---

## ⚠️ Critical Discovery Notes

### 1. Pattern API client existant

Le projet utilise probablement un wrapper API (axios + interceptors, ou fetch wrapper). À identifier dans `apps/web/src/lib/` :
```bash
ls apps/web/src/lib/api*
grep -r "axios\|fetch" apps/web/src/lib/queries/ | head
```
Réutiliser le pattern (probable : `api.post(url, body)` qui gère JWT + base URL + ResponseInterceptor unwrap).

### 2. PoiSubcategory — source de vérité

`PoiSubcategory` doit être importé depuis `@ridenrest/shared` (cf. project-context §Package Import Rules — "Shared types → packages/shared/types/, NEVER redefine locally"). Si le type n'existe pas encore, le créer.

### 3. Mount lazy — pattern existant

`poi-detail-sheet.tsx` doit déjà gérer l'open/close. Le mount du `<AccessMetrics>` se fait quand `isOpen === true`. **Anti-pattern** : monter `AccessMetrics` dans un parent toujours-mounted → fetch silencieux pour TOUS les POI affichés. **À éviter absolument**.

### 4. Format distance/élévation — règle projet

Cf. archi §Format Patterns §Units :
- Distance < 1000m → "X m" (entier)
- Distance ≥ 1000m → "X,X km" (1 décimale, séparateur français virgule)
- Élévation → "X m" (entier)

Vérifier si un helper de formatage existe (`formatDistance`, `formatElevation`) dans `apps/web/src/lib/` — réutiliser.

### 5. CompositionAPI — pattern shadcn

Les composants shadcn (Skeleton, Badge, etc.) sont à importer depuis `@/components/ui/*`. Tailwind v4 utilisé.

---

## Tasks / Subtasks

- [ ] **Task 1** — Créer le helper `getAccessLabel` (AC: 1)
  - [ ] `apps/web/src/lib/poi-labels.ts` avec mapping complet
  - [ ] `.test.ts` couvrant les 6 cas + fallback

- [ ] **Task 2** — Créer le hook `useAccess` (AC: 2, ⚠️Discovery #1)
  - [ ] Identifier le wrapper API du projet (axios/fetch)
  - [ ] Implémenter `useAccess(poiId, origin)` avec TanStack Query
  - [ ] Test : mock fetch, vérifier queryKey + parse Zod

- [ ] **Task 3** — Créer `AccessMetricsSkeleton` (AC: 3)
  - [ ] 3 `<Skeleton />` empilées avec hauteurs correspondant au rendu final

- [ ] **Task 4** — Créer `AccessFallback` (AC: 4)
  - [ ] Format distance fallback + badge "≈ approximatif" + tooltip
  - [ ] Utiliser couleur muted

- [ ] **Task 5** — Créer `AccessMetrics` (AC: 5, ⚠️Discovery #2, #4)
  - [ ] Composant principal avec switch sur `data.status`
  - [ ] Helper formatage distance/élévation (réutiliser si existe, sinon inline)
  - [ ] Title via `getAccessLabel(subcategory)`
  - [ ] Variant `compact` / `full`

- [ ] **Task 6** — Étendre `poi-detail-sheet.tsx` (AC: 6, ⚠️Discovery #3)
  - [ ] Identifier le check `subcategory === 'accommodation'` (cf. archi)
  - [ ] Ajouter `<AccessMetrics variant="full" poiId={poi.id} origin={derivedOrigin} subcategory={poi.subcategory} fallbackDistanceM={poi.distFromTraceM} />`
  - [ ] Mount uniquement quand sheet open (déjà géré par le pattern de Sheet shadcn)
  - [ ] Dériver origin : `usePlanningModeStore(s => s.currentStageId)` → si null, `{ type: 'adventure-start' }`, sinon `{ type: 'stage', stageId }`

- [ ] **Task 7** — Étendre `poi-popup.tsx` (AC: 7)
  - [ ] Idem mais avec `variant="compact"`
  - [ ] Vérifier que le popup reste compact visuellement (max 2 lignes ajoutées)

- [ ] **Task 8** — Tests composants (AC: 8)
  - [ ] Vitest + React Testing Library
  - [ ] Couverture : skeleton, ok variants, fallback, error
  - [ ] Mock `useAccess` (factory helper)

- [ ] **Task 9** — Validation manuelle UI (AC: 6, 7)
  - [ ] `turbo dev` → ouvrir l'app → naviguer vers une aventure → ouvrir POI Sheet → vérifier l'affichage
  - [ ] Cliquer plusieurs POI : pas de re-fetch si cache hit (Network tab DevTools)
  - [ ] Stopper BRouter local (`docker compose stop brouter`) → fallback s'affiche correctement
  - [ ] Restart BRouter → fetch frais OK

- [ ] **Task 10** — Doc Sync + commit (AC: 9)
  - [ ] Commit : `feat(web): AccessMetrics + getAccessLabel + integration POI sheet/popup planning — story poi-access-2.4`

---

## Dev Notes

### Pattern projet — TanStack Query

Cf. project-context §TanStack Query :
```typescript
useQuery({ queryKey: ['poi-access', poiId, origin], ... })
```
**Jamais** inventer des query keys comme `['getPoiAccess', id]`.

### Pattern projet — Stores Zustand

Cf. project-context §Zustand Stores :
- Naming : `use{Domain}Store`
- Actions impératives : `setCurrentStageId`, `clearVisibleAccessPoi`

### Pattern projet — Co-located tests

Fichiers `.test.tsx` à côté des composants. Vitest pour web.

### Pattern projet — shadcn/ui imports

`@/components/ui/skeleton`, `@/components/ui/badge`, etc. (alias `@` = `apps/web/src`).

### Pattern projet — SectionTooltip

Le projet a un `SectionTooltip` custom (cf. project-context §SectionTooltip) avec long-press mobile support. Utiliser pour le tooltip "≈ approximatif".

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-2.4]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Frontend-Architecture]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Wording-UI-contextualisé]
- [Source: _bmad-output/project-context.md#Loading-States]
- [Source: _bmad-output/project-context.md#TanStack-Query]
- [Source: _bmad-output/project-context.md#Package-Import-Rules]
- [Source: _bmad-output/implementation-artifacts/poi-access-2-3-...md] — endpoint API

---

## Dev Agent Record

### Agent Model Used
_(À renseigner)_

### Completion Notes List
- API client wrapper utilisé : `___`
- Helper formatage distance trouvé existant : ☐ Oui / ☐ Non (créé inline)
- Coverage tests : `___%`

### File List
- [ ] `apps/web/src/lib/poi-labels.ts` + `.test.ts`
- [ ] `apps/web/src/components/poi-access/AccessMetrics.tsx` + `.test.tsx`
- [ ] `apps/web/src/components/poi-access/AccessMetricsSkeleton.tsx`
- [ ] `apps/web/src/components/poi-access/AccessFallback.tsx`
- [ ] `apps/web/src/components/poi-access/useAccess.ts` + `.test.ts`
- [ ] `apps/web/src/lib/queries/poi-access.ts` (optionnel)
- [ ] `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` (modifié)
- [ ] `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` (modifié)
