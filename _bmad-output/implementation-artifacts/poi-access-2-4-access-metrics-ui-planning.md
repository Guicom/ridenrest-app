---
baseline_commit: f71d7a8e281d17108251ef2f6edcf71a30d90efa
---

# Story POI-Access 2.4 : Composant `AccessMetrics` + intégration POI Sheet/Popup Planning

Status: done

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

- [x] **Task 1** — Créer le helper `getAccessLabel` (AC: 1)
  - [x] `apps/web/src/lib/poi-labels.ts` avec mapping complet
  - [x] `.test.ts` couvrant les cas + fallback (Doc Sync : 5 catégories hébergement réelles `PoiCategory` + fallback, pas 6 — voir Completion Notes)

- [x] **Task 2** — Créer le hook `useAccess` (AC: 2, ⚠️Discovery #1)
  - [x] Identifier le wrapper API du projet → `apiClient.post` (`@/lib/api-client`, fetch + JWT cache + unwrap `{data}`)
  - [x] Implémenter `useAccess(poiId, origin)` avec TanStack Query
  - [x] Test : mock useQuery + apiClient, vérifier queryKey + parse Zod + error

- [x] **Task 3** — Créer `AccessMetricsSkeleton` (AC: 3)
  - [x] title (h-6) + ligne distance/D+/D- (h-4 chacune)

- [x] **Task 4** — Créer `AccessFallback` (AC: 4)
  - [x] Format distance fallback + badge outline "≈ approximatif" + SectionTooltip
  - [x] Couleur `text-muted-foreground`

- [x] **Task 5** — Créer `AccessMetrics` (AC: 5, ⚠️Discovery #2, #4)
  - [x] Composant principal avec switch sur `data.status`
  - [x] Helper formatage distance/élévation → créé (`format.ts`, virgule FR — aucun helper existant)
  - [x] Title via `getAccessLabel(category)` (Doc Sync : `category`, pas `subcategory`)
  - [x] Variant `compact` / `full`

- [x] **Task 6** — Étendre `poi-detail-sheet.tsx` (AC: 6, ⚠️Discovery #3)
  - [x] Check `isAccommodation` réutilisé (`LAYER_CATEGORIES.accommodations`)
  - [x] Ajouter `<AccessMetrics variant="full" poiId origin category fallbackDistanceM />` sous le bloc Stats
  - [x] Mount uniquement quand sheet open + planning mode (`!isLiveMode`) — pas de fetch silencieux
  - [x] Dériver origin : `useMapStore(s => s.selectedStageId)` → null ⇒ `{ type: 'adventure-start' }`, sinon `{ type: 'stage', stageId }` (Doc Sync : store réel, pas `usePlanningModeStore`)

- [x] **Task 7** — Étendre `poi-popup.tsx` (AC: 7)
  - [x] `variant="compact"`, hébergements + planning uniquement
  - [x] Popup reste compact (1 ligne "Accès vélo" + distance, séparateur)

- [x] **Task 8** — Tests composants (AC: 8)
  - [x] Vitest + React Testing Library
  - [x] Couverture : skeleton, ok (full + compact), fallback, error (status + network), formatage
  - [x] Mock `useAccess` (helper `setAccess`)

- [x] **Task 9** — Validation manuelle UI (AC: 6, 7) — ✅ validé par Guillaume (2026-05-29)
  - [x] `turbo dev` → ouvrir l'app → naviguer vers une aventure → ouvrir POI Sheet → vérifier l'affichage
  - [x] Cliquer plusieurs POI : pas de re-fetch si cache hit (Network tab DevTools)
  - [x] Stopper BRouter local (`docker compose stop brouter`) → fallback s'affiche correctement
  - [x] Restart BRouter → fetch frais OK

- [x] **Task 10** — Doc Sync + commit (AC: 9)
  - [x] Doc Sync consigné (cette story) ; commit à lancer par Guillaume : `feat(web): AccessMetrics + getAccessLabel + integration POI sheet/popup planning — story poi-access-2.4`

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
claude-opus-4-8[1m] (BMad dev-story workflow)

### Completion Notes List
- **API client wrapper utilisé** : `apiClient.post` de `@/lib/api-client` (fetch natif + cache JWT in-memory + unwrap automatique `{ data }` du ResponseInterceptor). Pas d'axios.
- **Helper formatage distance** : aucun helper existant trouvé dans `apps/web/src/lib/` (le formatage était inliné dans chaque composant POI, avec un **point** décimal). Créé `apps/web/src/components/poi-access/format.ts` centralisant la règle avec la **virgule française** (Discovery #4). Fichier additionnel hors File List initiale → consigné ci-dessous.
- **Couverture tests** : `@vitest/coverage-v8` n'est pas installé dans le projet (l'installer = nouvelle dépendance ⇒ condition HALT non déclenchée volontairement). Couverture évaluée **manuellement** : tous les fichiers et toutes les branches de `poi-access/` sont exercés (skeleton ; ok full + compact ; sub-km vs km ; fallback ; error status + network ; queryKey/staleTime/gcTime/enabled/queryFn-success/queryFn-parse-error/passthrough ; 5 mappings labels + 3 fallbacks ; 2 branches de formatage). Couverture statements/branches ≈ 100% sur le dossier — seuil AC8 (≥80%) satisfait qualitativement.
- **Tests** : suite web complète **1013/1013 verts**, zéro régression (Vitest). Lint ESLint clean sur tous les fichiers nouveaux/modifiés.
- `tsc --noEmit` : seules des **erreurs préexistantes** subsistent dans des fichiers de tests NON touchés par cette story (mocks obsolètes manquant `speedKmh`/`pauseHours`/`source`) — aucun de mes fichiers n'est en erreur.

#### ⚠️ Écarts Doc Sync (vs story planifiée)
1. **`PoiSubcategory` → `PoiCategory`** : le type `PoiSubcategory` (`hotel/camping/refuge/hostel/guesthouse/gite`) n'existe pas. Source de vérité = `PoiCategory`. Catégories hébergement réelles : `hotel, hostel, camp_site, shelter, guesthouse` (**5**, pas 6 ; pas de `gite`). Mapping `getAccessLabel` : `camp_site→camping`, `shelter→refuge`. Le test couvre les 5 mappings + fallbacks (au lieu de "6 sous-catégories").
2. **`usePlanningModeStore.currentStageId` → `useMapStore.selectedStageId`** : le store `usePlanningModeStore` n'existe pas. L'étape sélectionnée est exposée par `useMapStore.selectedStageId` (Story 11.4). Origine dérivée de là.
3. **Endpoint préfixé `/api/`** : `apiClient.post('/api/pois/:id/access', …)` (la story écrivait `/pois/:id/access` sans préfixe).
4. **`format.ts` ajouté** : module de formatage co-localisé (hors File List initiale) car aucun helper réutilisable n'existait.
5. **Intégration planning-only** : `<AccessMetrics>` n'est monté qu'en mode planning (`!isLiveMode`) — le mode Live (origine `gps`) est réservé à la Story 3.1.
6. **Corps de requête `{ origin }` (AC2)** : l'AC2 listait `{ origin, profileOverride }`. `useAccess` n'envoie que `{ origin }` : `profileOverride` est optionnel et aucune UI ne le définit en planning (le sélecteur de profil arrive en Story 2.6) ; le backend dérive le profil de `adventures.routing_profile`. Omission volontaire jusqu'à la Story 2.6.
7. **Tests d'intégration modifiés (AC9)** : `poi-detail-sheet.test.tsx` et `poi-popup.test.tsx` sont modifiés (mock de `<AccessMetrics>` pour éviter un `QueryClientProvider` réel) — nécessaire et listé en File List, mais hors liste de fichiers autorisés de l'AC9. Écart bénin consigné.

### File List
**Nouveaux fichiers :**
- `apps/web/src/lib/poi-labels.ts`
- `apps/web/src/lib/poi-labels.test.ts`
- `apps/web/src/components/poi-access/useAccess.ts`
- `apps/web/src/components/poi-access/useAccess.test.ts`
- `apps/web/src/components/poi-access/AccessMetrics.tsx`
- `apps/web/src/components/poi-access/AccessMetrics.test.tsx`
- `apps/web/src/components/poi-access/AccessMetricsSkeleton.tsx`
- `apps/web/src/components/poi-access/AccessFallback.tsx`
- `apps/web/src/components/poi-access/format.ts` (Doc Sync — helper formatage)

**Fichiers modifiés :**
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` (section AccessMetrics `full`)
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` (section AccessMetrics `compact`)
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.test.tsx` (mock AccessMetrics)
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.test.tsx` (mock AccessMetrics)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut story)

### Change Log
- 2026-05-29 — Implémentation Story 2.4 : helper `getAccessLabel`, hook `useAccess`, composants `AccessMetrics`/`AccessMetricsSkeleton`/`AccessFallback`, helper `format.ts`, intégration POI detail sheet (`full`) + popup (`compact`) en mode planning. 5 écarts Doc Sync consignés. Tests 1013/1013 verts, lint clean. Status → review.

---

### Review Findings

_Code review adversariale (3 couches : Blind Hunter / Edge Case Hunter / Acceptance Auditor) — 2026-05-29. Diff = changements non commités (baseline `f71d7a8`). 0 decision-needed, 4 patch, 1 defer, ~11 dismissed (faux positifs / cas non atteignables : query key objet `origin` sûr — TanStack v5 hash structurellement ; `NaN` non transportable par JSON ; distances/D± négatives invraisemblables du backend de routage ; `fallbackDistanceM` garanti présent par le schéma → chaîne `?? prop ?? 0` morte ; branche `status:'error'` jamais émise par `compute()` — confirmé Story 2.3 ; `poiId`/`stageId` = UUID URL-safe par construction ; tests mockés = stratégie projet assumée pour le MVP)._

- [x] [Review][Patch] Texte d'erreur en `text-destructive-foreground` (token « avant-plan SUR fond destructive », ~blanc → quasi invisible sur fond normal) — **atteignable** via une vraie erreur réseau/HTTP, pas seulement la branche morte `status:'error'`. **Corrigé** : `text-destructive`. [apps/web/src/components/poi-access/AccessMetrics.tsx:41]
- [x] [Review][Patch] Skeleton de chargement ignore `variant` : en `compact` (popup) il affiche un squelette 3 lignes surdimensionné puis se réduit à 1 ligne (flash de layout). **Corrigé** : `AccessMetricsSkeleton` accepte `variant`, rend 1 ligne `h-4` en compact ; `AccessMetrics` propage `variant`. [apps/web/src/components/poi-access/AccessMetricsSkeleton.tsx + AccessMetrics.tsx:36]
- [x] [Review][Patch] `format.ts` sans test co-localisé (règle projet « co-located tests — always ») + choix d'unité sur la valeur brute : `999,6 m` → "1000 m" au lieu de "1,0 km". **Corrigé** : unité décidée sur `Math.round(distanceM)` ; ajout de `format.test.ts` (bornes 999 / 999.6 / 1000 / 1000.4 / 0 + arrondis D±). [apps/web/src/components/poi-access/format.ts]
- [x] [Review][Patch] Doc Sync incomplet : (a) corps de requête `{ origin }` au lieu de `{ origin, profileOverride }` (AC2) ; (b) éditions de `poi-detail-sheet.test.tsx` / `poi-popup.test.tsx` non cadrées comme écart. **Corrigé** : écarts Doc Sync #6 et #7 ajoutés. [story 2.4]
- [x] [Review][Defer] Seuil de couverture AC8 « ≥ 80% » non mesuré mécaniquement (`@vitest/coverage-v8` absent — ajout de dépendance volontairement non déclenché ; couverture évaluée manuellement ~100% dans les Completion Notes). Installer l'outillage de couverture = décision outillage séparée. [story 2.4 / AC8] — deferred, tradeoff documenté

#### Passe 2 — re-revue post-patchs (2026-05-29)

_3 couches adversariales (Blind Hunter / Edge Case Hunter / Acceptance Auditor) re-lancées sur l'état courant du working tree (baseline `f71d7a8`). Schéma `AccessResponseSchema` et convention backend vérifiés à la main. Résultat : 0 decision-needed, 1 patch (LOW), 2 defer, ~10 dismissed. Les 4 patchs de la passe 1 tiennent toujours._

- [x] [Review][Patch] `AccessMetrics` masque des données valides en cache lors d'une erreur de refetch en arrière-plan : la garde `if (error || !data || data.status === 'error')` était évaluée AVANT le rendu d'un `data` `ok`/`fallback` déjà présent. TanStack v5 conserve `data` quand un refetch d'arrière-plan échoue (ex. `refetchOnWindowFocus` après `staleTime` 5 min, BRouter momentanément KO) → l'utilisateur perdait la distance affichée au profit du message d'erreur, alors qu'un résultat de routage est déterministe pour `(poi, origin)`. **Corrigé** : `usableData = data?.status !== 'error' ? data : null` ; l'erreur ne s'affiche que faute de donnée exploitable (`error` retiré de la déstructuration — `!usableData` couvre le cas data-undefined). Test ajouté (« keeps showing valid cached data when a background refetch errors »). [apps/web/src/components/poi-access/AccessMetrics.tsx:34]
- [x] [Review][Defer] Durcissement optionnel du schéma : les champs numériques de `AccessResponseSchema` (`distanceM`, `elevationGainM`, `elevationLossM`, `fallbackDistanceM`) sont des `z.number()` nus → acceptent `±Infinity` et les négatifs (Zod rejette seulement `NaN`). Non atteignable depuis le backend de confiance (distances finies ≥ 0 ; perte D- stockée en magnitude positive via `Math.abs`, cf. `stages.service.ts:35`) → aucun bug en prod. `.finite().nonnegative()` ajouterait de la défense en profondeur. Hors périmètre 2.4 (fichier schéma = Story 2.3). [packages/shared/src/schemas/poi-access.ts:73-84] — deferred, non atteignable
- [x] [Review][Defer] Scope Story 2.5 présent dans ce diff : l'effet `setVisibleAccessPoiId` de `poi-popup.tsx` (câblage polyline) appartient à la 2.5 (le code lui-même le commente « Story 2.5 »). Deux points à vérifier lors de la revue 2.5 : (a) les deps de l'effet omettent `selectedStageId`/origin → polyline potentiellement périmée si l'utilisateur change d'étape sans fermer le popup ; (b) le cleanup `setVisibleAccessPoiId(null)` n'a pas de garde d'« ownership » d'instance (ne pose problème que si deux `PoiPopup` coexistent transitoirement). Probablement mitigé par le re-fetch origin-aware de `map-view` — à confirmer en 2.5. [apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx:124-128] — deferred, périmètre Story 2.5

_Dismissed (faux positifs / non atteignables) : rendu de valeurs négatives (backend ≥ 0, D- via `Math.abs`) ; rendu `Infinity` (moteur de routage renvoie du fini) ; `NaN` (rejeté par Zod) ; fallback « 0 m » (champ requis, 0 invraisemblable pour un POI de corridor) ; chaîne morte `?? prop ?? 0` (inoffensive) ; message d'erreur vide (`message` requis par le schéma) ; `data-testid` dupliqué entre variantes du skeleton (une seule variante rendue à la fois) ; fragilité de la query key objet `origin` (hash déterministe TanStack v5 + memoïsé) ; « contradiction » sheet/popup relevée par l'Auditor (les DEUX rendent en planning via `!isLiveMode` — aucun code mort, AC6 & AC7 réellement satisfaits) ; label générique pour une future catégorie d'hébergement sans entrée de mapping (dégradation gracieuse acceptable)._
