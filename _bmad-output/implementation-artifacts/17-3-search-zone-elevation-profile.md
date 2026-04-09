# Story 17.3: Zone de recherche sur le profil d'élévation (planning)

Status: review

> **Ajouté 2026-04-09** — Troisième story de l'Epic 17 (Quality of Life). Objectif : visualiser la plage de recherche POI `[fromKm, toKm]` sur le profil d'élévation en mode planning, via un overlay semi-transparent bleu (Recharts `ReferenceArea`). Purement frontend/présentationnel.

## Story

As a **cyclist using the planning map**,
I want to see my current search range `[fromKm, toKm]` highlighted on the elevation profile,
So that I can visually correlate the POI search corridor with the terrain profile (elevation, slope).

## Acceptance Criteria

1. **Given** le profil d'élévation est affiché en mode planning,
   **When** `fromKm` et `toKm` sont définis dans `useMapStore` (i.e. le slider de plage de recherche a été interagi),
   **Then** un overlay semi-transparent bleu (`ReferenceArea` de Recharts) est rendu sur le graphique d'élévation entre `fromKm` et `toKm` sur l'axe X, couvrant toute la hauteur de l'axe Y.

2. **Given** l'overlay de plage de recherche est affiché,
   **When** la couleur est rendue,
   **Then** il utilise le même bleu que le corridor de recherche sur la carte (`#3498db`) avec ~20% d'opacité — visuellement cohérent avec le corridor carte.

3. **Given** l'utilisateur déplace le slider de plage de recherche,
   **When** `fromKm` ou `toKm` change dans le store,
   **Then** le `ReferenceArea` se met à jour en temps réel sur le profil d'élévation (pas de debounce — suit le slider en direct).

4. **Given** le flag `searchRangeInteracted` est `false` (l'utilisateur n'a pas encore touché le slider),
   **When** le profil d'élévation est rendu,
   **Then** aucun overlay de plage de recherche n'est affiché — le profil affiche uniquement les données d'élévation brutes.

5. **Given** l'overlay de plage de recherche est affiché,
   **When** l'utilisateur survole le profil d'élévation dans la zone surlignée,
   **Then** le tooltip existant (km, altitude, pente, D+) fonctionne normalement — l'overlay n'interfère pas avec l'interaction du tooltip.

6. **Given** les étapes sont visibles sur le profil d'élévation,
   **When** l'overlay de plage de recherche est aussi actif,
   **Then** les deux sont visibles simultanément — les marqueurs d'étapes (lignes tiretées `ReferenceLine`) se rendent au-dessus de l'overlay de recherche (z-order : overlay derrière, marqueurs d'étapes devant).

## Tasks / Subtasks

- [x] Task 1 — Passer `fromKm`, `toKm`, `searchRangeInteracted` au composant `ElevationProfile` (AC: #1, #3, #4)
  - [x] 1.1 — Ajouter 3 props optionnelles à `ElevationProfileProps` : `searchFromKm?: number`, `searchToKm?: number`, `searchRangeActive?: boolean`
  - [x] 1.2 — Dans `map-view.tsx`, lire `fromKm`, `toKm`, `searchRangeInteracted` depuis `useMapStore` et les passer à `<ElevationProfile />`

- [x] Task 2 — Ajouter le `ReferenceArea` dans le composant `ElevationProfile` (AC: #1, #2, #5, #6)
  - [x] 2.1 — Importer `ReferenceArea` depuis `recharts` (déjà installé v3.8.0)
  - [x] 2.2 — Rendre `<ReferenceArea>` conditionnellement quand `searchRangeActive === true`, avec `x1={searchFromKm}`, `x2={searchToKm}`, `fill="#3498db"`, `fillOpacity={0.2}`, `stroke="none"`
  - [x] 2.3 — Positionner le `<ReferenceArea>` **avant** les `<ReferenceLine>` des étapes dans le JSX pour garantir le z-order (overlay derrière, étapes devant)

- [x] Task 3 — Tests unitaires (AC: #1, #4, #5, #6)
  - [x] 3.1 — Test : `ReferenceArea` n'est PAS rendu quand `searchRangeActive` est `false` ou non fourni
  - [x] 3.2 — Test : `ReferenceArea` EST rendu quand `searchRangeActive` est `true` avec les bonnes props `x1`/`x2`
  - [x] 3.3 — Test : les `ReferenceLine` des étapes sont toujours rendus quand le `ReferenceArea` est actif

## Dev Notes

### Architecture de la solution

```
apps/web/src/app/(app)/map/[id]/_components/
├── elevation-profile.tsx             ← MODIFIER — ajouter ReferenceArea + 3 props
├── elevation-profile.test.tsx        ← MODIFIER — ajouter 3 tests
├── map-view.tsx                      ← MODIFIER — passer fromKm/toKm/searchRangeInteracted à ElevationProfile
```

### Composant actuel — `elevation-profile.tsx` (154 lignes)

Le composant utilise Recharts `AreaChart` avec :
- `<Area>` pour le profil d'élévation (fill primary 20%, stroke primary)
- `<ReferenceLine>` pour les limites de segments (`boundaries`)
- `<ReferenceLine>` pour les marqueurs d'étapes (`stages`, conditionnel `stagesVisible`)
- `<Tooltip>` custom (`ElevationTooltip`) qui appelle `onHoverKm`
- Resize via `ResizeObserver` (pas de `ResponsiveContainer`)
- Click pour placement d'étapes (`isClickModeActive` + `onClickKm`)

### Recharts `ReferenceArea` — API

```tsx
import { ReferenceArea } from 'recharts'

<ReferenceArea
  x1={fromKm}
  x2={toKm}
  fill="#3498db"
  fillOpacity={0.2}
  stroke="none"
/>
```

`ReferenceArea` est disponible dans recharts v3.8.0 (déjà installé). Il s'intègre directement dans `<AreaChart>` comme enfant, au même niveau que `<Area>`, `<ReferenceLine>`, etc. Pas besoin de SVG custom ou de composant wrapper.

### Z-order dans Recharts

Dans Recharts, l'ordre de rendu dans le JSX détermine le z-order : les éléments déclarés en premier sont rendus en dessous. Le `<ReferenceArea>` doit être déclaré **avant** les `<ReferenceLine>` des étapes et des boundaries pour apparaître derrière.

Ordre recommandé dans le `<AreaChart>` :
1. `<XAxis>`, `<YAxis>`, `<Tooltip>` (axes + interaction)
2. `<Area>` (profil d'élévation)
3. **`<ReferenceArea>`** (overlay corridor) ← NOUVEAU
4. `<ReferenceLine>` boundaries (limites segments)
5. `<ReferenceLine>` stages (marqueurs étapes)

### Couleur corridor — constante existante

La couleur du corridor sur la carte est `#3498db` (bleu), hardcodée dans `map-canvas.tsx:690`. Utiliser la même valeur dans le `ReferenceArea` pour cohérence visuelle. Si nécessaire, extraire en constante partagée (optionnel pour cette story — un `const CORRIDOR_COLOR = '#3498db'` inline dans `elevation-profile.tsx` suffit).

### Store Zustand — `useMapStore`

Le store `map.store.ts` expose déjà les valeurs nécessaires :
- `fromKm: number` (défaut: 0)
- `toKm: number` (défaut: 15)
- `searchRangeInteracted: boolean` (défaut: false, passe à `true` dès que le slider est manipulé)

Dans `map-view.tsx`, ces valeurs sont déjà importées via `useMapStore` (utilisées par `SearchRangeControl` et les hooks POI). Il suffit de les passer en props à `<ElevationProfile>`.

### Pas de modifications backend

Aucune modification API ou base de données. Purement frontend/présentationnel.

### Attention

- **PAS de `useMapStore` directement dans `elevation-profile.tsx`** — le composant est générique (reçoit ses données via props). Les valeurs du store sont lues dans `map-view.tsx` et passées en props.
- **PAS de debounce** sur la mise à jour du `ReferenceArea` — il doit suivre le slider en temps réel (Recharts gère la performance de rendu).
- **PAS de librairie supplémentaire** — `ReferenceArea` est natif de recharts (déjà installé).
- **Props optionnelles** — `searchFromKm`, `searchToKm`, `searchRangeActive` sont tous optionnels pour ne pas casser l'API du composant (backward-compatible).
- **`fillOpacity={0.2}`** — valeur identique à la transparence du fill de l'`<Area>` du profil d'élévation (`hsl(var(--primary) / 0.2)`), donc visuellement harmonieux.

### Test patterns — Story 17.2

Story 17.2 a confirmé les patterns de test avec Vitest + @testing-library/react. Les tests du profil d'élévation existants (`elevation-profile.test.tsx`) mockent Recharts partiellement — vérifier le setup existant avant d'ajouter les nouveaux tests. Chercher si `ReferenceArea` est déjà mocké ou s'il faut l'ajouter au mock.

### Previous story intelligence (17.2)

- Tests Vitest avec mocks de modules : `vi.mock(...)` pour les dépendances externes
- Le composant `ElevationProfile` est déjà testé dans `elevation-profile.test.tsx` — bâtir sur les tests existants
- 945 tests dans la suite — vérifier la non-régression après modifications

### References

- [Source: apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx] — composant à modifier (154 lignes, Recharts AreaChart + ReferenceLine)
- [Source: apps/web/src/app/(app)/map/[id]/_components/elevation-profile.test.tsx] — tests existants à étendre
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:628-637] — passage des props à ElevationProfile
- [Source: apps/web/src/stores/map.store.ts:17-21] — fromKm, toKm, searchRangeInteracted dans le store
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx:690] — couleur corridor `#3498db`
- [Source: _bmad-output/planning-artifacts/epics.md:3359-3396] — AC et technical notes de l'epic

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Aucun problème rencontré. Implémentation directe en une passe.

### Completion Notes List

- Task 1 : Ajout de 3 props optionnelles (`searchFromKm`, `searchToKm`, `searchRangeActive`) à `ElevationProfileProps`. Props passées depuis `map-view.tsx` via les valeurs existantes du store (`mapFromKm`, `mapToKm`, `searchRangeInteracted`).
- Task 2 : Import `ReferenceArea` de recharts. Rendu conditionnel quand `searchRangeActive === true` avec `fill="#3498db"`, `fillOpacity={0.2}`, `stroke="none"`. Positionné après `<Area>` et avant les `<ReferenceLine>` pour le z-order correct.
- Task 3 : 4 tests ajoutés — (1) ReferenceArea absent quand `searchRangeActive=false`, (2) absent quand prop non fournie, (3) rendu avec bonnes props quand actif, (4) coexistence avec stage ReferenceLines. Mock `ReferenceArea` ajouté au mock recharts existant.
- Suite complète : 951 tests passent, 0 régressions.

### File List

- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx` — MODIFIÉ (3 props + ReferenceArea conditionnel)
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.test.tsx` — MODIFIÉ (mock ReferenceArea + 4 tests)
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — MODIFIÉ (passage des 3 props à ElevationProfile)
