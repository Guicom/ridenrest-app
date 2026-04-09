# Story 17.4: D- (dénivelé négatif) partout où D+ est affiché

Status: done

> **Ajouté 2026-04-09** — Quatrième story de l'Epic 17 (Quality of Life). Objectif : calculer et afficher le dénivelé négatif (D-) partout où le dénivelé positif (D+) est déjà affiché — backend (calcul + stockage) + frontend (11 composants). Story 17.5 (refonte cartouches) dépend de cette story.

## Story

As a **cyclist planning a multi-day adventure**,
I want to see the cumulative descent (D-) alongside the ascent (D+) everywhere elevation data is displayed,
So that I have a complete picture of the terrain difficulty for each segment and stage.

## Acceptance Criteria

1. **Given** l'API calcule l'elevation gain pour un stage ou segment,
   **When** `computeElevationGainForRange()` ou `computeElevationGain()` traite les waypoints,
   **Then** elle calcule aussi le D- cumulé en sommant les valeurs absolues des deltas négatifs — retourné comme champ séparé `elevationLossM` (alongside `elevationGainM`).

2. **Given** la table `adventure_stages`,
   **When** le schéma est inspecté,
   **Then** une nouvelle colonne `elevation_loss_m` (real, nullable, default null) stocke le D- par stage — ajoutée via `drizzle-kit generate`.

3. **Given** la table `adventure_segments`,
   **When** le schéma est inspecté,
   **Then** une nouvelle colonne `elevation_loss_m` (real, nullable, default null) stocke le D- par segment.

4. **Given** la table `adventures`,
   **When** le schéma est inspecté,
   **Then** une nouvelle colonne `total_elevation_loss_m` (real, nullable) stocke le D- total agrégé.

5. **Given** une adventure card dans la liste des aventures,
   **When** D+ est affiché (e.g. "↑ 4 200 m"),
   **Then** D- est affiché à côté (e.g. "↑ 4 200 m · ↓ 3 800 m") — même ligne, même style.

6. **Given** une segment card dans la page détail aventure,
   **When** D+ est affiché (e.g. "1 200m D+"),
   **Then** D- est affiché à côté (e.g. "1 200m D+ · 980m D-").

7. **Given** un cartouche d'étape dans la sidebar planning,
   **When** D+ est affiché,
   **Then** D- est affiché sur la même ligne (e.g. "D+ 850 m · D- 720 m") — ou "D+ — · D- —" si pas de données.

8. **Given** le tooltip du profil d'élévation est affiché au survol,
   **When** D+ cumulé est affiché,
   **Then** D- cumulé est aussi affiché (e.g. "D+ 1 200 m | D- 980 m").

9. **Given** le panneau live controls affiche D+ pour le lookahead,
   **When** D+ est affiché (e.g. "D+ 320m"),
   **Then** D- est affiché à côté (e.g. "D+ 320m · D- 280m").

10. **Given** la réponse API `adventure_segments` inclut `elevationGainM`,
    **When** l'API retourne les données segment,
    **Then** elle inclut aussi `elevationLossM` (number | null).

11. **Given** l'endpoint adventures list retourne `totalElevationGainM`,
    **When** l'API agrège les segments,
    **Then** elle retourne aussi `totalElevationLossM` (somme des D- de tous les segments).

## Tasks / Subtasks

### Phase 1 — Backend : Calcul et stockage du D-

- [x] Task 1 — Migration DB : ajouter `elevation_loss_m` sur 3 tables (AC: #2, #3, #4)
  - [x] 1.1 — `packages/database/src/schema/adventure-segments.ts` : ajouter `elevationLossM: real('elevation_loss_m')` (nullable, après `elevationGainM` ligne 20)
  - [x] 1.2 — `packages/database/src/schema/adventure-stages.ts` : ajouter `elevationLossM: real('elevation_loss_m')` (nullable, après `elevationGainM` ligne 13)
  - [x] 1.3 — `packages/database/src/schema/adventures.ts` : ajouter `totalElevationLossM: real('total_elevation_loss_m')` (nullable, après `totalElevationGainM` ligne 12)
  - [x] 1.4 — Exécuter `cd packages/database && pnpm drizzle-kit generate` — vérifier le SQL généré (3 colonnes nullable)

- [x] Task 2 — `@ridenrest/gpx` : ajouter `computeElevationLoss()` (AC: #1)
  - [x] 2.1 — `packages/gpx/src/parser.ts` : ajouter une fonction `computeElevationLoss(points: GpxPoint[]): number` — somme des valeurs absolues des deltas négatifs (même pattern que `computeElevationGain` lignes 40-50, mais `curr < prev`)
  - [x] 2.2 — Exporter depuis `packages/gpx/src/index.ts`
  - [x] 2.3 — Tests unitaires dans `packages/gpx/src/parser.test.ts` (ou fichier existant)

- [x] Task 3 — `stages.service.ts` : modifier `computeElevationGainForRange()` pour retourner D+ et D- (AC: #1)
  - [x] 3.1 — Modifier le type de retour de `number | null` vers `{ gain: number; loss: number } | null`
  - [x] 3.2 — Dans la boucle (lignes 30-34), tracker à la fois les deltas positifs (`gain`) et la valeur absolue des deltas négatifs (`loss`)
  - [x] 3.3 — Mettre à jour TOUS les call sites dans `StagesService` (create, update, delete, cascade) pour destructurer `{ gain, loss }` et stocker `elevationLossM` en plus de `elevationGainM`

- [x] Task 4 — GPX parse processor : stocker D- au parsing (AC: #1, #3)
  - [x] 4.1 — `apps/api/src/segments/jobs/gpx-parse.processor.ts:72` : appeler `computeElevationLoss(rawPoints)` en plus de `computeElevationGain(rawPoints)`
  - [x] 4.2 — Passer `elevationLossM` (null si ≤ 0) à `segmentsRepo.updateAfterParse()`

- [x] Task 5 — Repository + Service segment : propager D- (AC: #3, #4, #11)
  - [x] 5.1 — `segments.repository.ts:53-76` : ajouter `elevationLossM` dans le type de `updateAfterParse()` et dans le `.set()`
  - [x] 5.2 — `segments.service.ts:148-164` : dans `recomputeCumulativeDistances()`, calculer `totalElevationLossM` identiquement à `totalElevationGainM` (somme des `elevationLossM` segments, null si aucun n'a de données)
  - [x] 5.3 — `adventures.repository.ts:43-48` : `updateTotals()` — ajouter paramètre `totalElevationLossM` et l'inclure dans le `.set()`
  - [x] 5.4 — `adventures.service.ts` : `updateTotals()` — propager le nouveau paramètre

- [x] Task 6 — Types partagés : ajouter `elevationLossM` (AC: #10, #11)
  - [x] 6.1 — `packages/shared/src/types/adventure.types.ts` : ajouter `elevationLossM: number | null` dans `AdventureStageResponse` (après ligne 77), `AdventureSegmentResponse` (après ligne 91)
  - [x] 6.2 — Ajouter `totalElevationLossM: number | null` dans `AdventureMapResponse` (après ligne 31) et `totalElevationLossM?: number | null` dans `AdventureResponse` (après ligne 41)

- [x] Task 7 — Serializers/mappers : inclure D- dans les réponses API
  - [x] 7.1 — `segments.service.ts:167-179` (`toResponse`) : ajouter `elevationLossM: s.elevationLossM ?? null`
  - [x] 7.2 — Vérifier le mapper stages (dans `stages.service.ts` ou `stages.controller.ts`) — ajouter `elevationLossM`
  - [x] 7.3 — Vérifier le mapper adventures list — ajouter `totalElevationLossM`
  - [x] 7.4 — Vérifier le mapper `AdventureMapResponse` — ajouter `totalElevationLossM`

### Phase 2 — Frontend : Afficher D- partout

- [x] Task 8 — Hook `useElevationProfile` : calculer D- cumulé (AC: #8)
  - [x] 8.1 — `apps/web/src/hooks/use-elevation-profile.ts` : ajouter `cumulativeDMinus: number` dans `ElevationPoint` interface (ligne 4-9)
  - [x] 8.2 — Dans la boucle (lignes 40-54), tracker `cumulativeDMinus += Math.abs(Math.min(0, deltaEle))`
  - [x] 8.3 — Ajouter `totalDMinus` dans `UseElevationProfileResult` (calculer identiquement à `totalDPlus`)

- [x] Task 9 — `elevation-profile.tsx` : D- dans le tooltip (AC: #8)
  - [x] 9.1 — Lignes 30-49 (`ElevationTooltip`) : ajouter une ligne `D-` sous la ligne `D+` existante — format : `D- {cumulativeDMinus.toFixed(0)} m`

- [x] Task 10 — `adventure-card.tsx` : D- dans la carte aventure (AC: #5)
  - [x] 10.1 — Lignes 38-42 : après `↑ {totalElevationGainM} m`, ajouter ` · ↓ {totalElevationLossM} m` — conditionné sur `totalElevationLossM != null && totalElevationLossM > 0`

- [x] Task 11 — `adventure-detail.tsx` : D- dans les stats détail (AC: #5)
  - [x] 11.1 — Lignes 349-354 : ajouter une icône `TrendingDown` + `{totalElevationLossM} m D-` à côté du D+

- [x] Task 12 — `segment-card.tsx` : D- dans la carte segment (AC: #6)
  - [x] 12.1 — Ligne 34/182 : modifier `elevationLabel` pour inclure D- — format : `${gainM}m D+ · ${lossM}m D-` (ou juste `${gainM}m D+` si D- est null)

- [x] Task 13 — `sidebar-stages-section.tsx` : D- dans les cartouches stages (AC: #7)
  - [x] 13.1 — Lignes 253-254 : modifier le span pour afficher `D+ {gain} m · D- {loss} m` — ou `D+ — · D- —` si données indisponibles

- [x] Task 14 — `live-controls.tsx` : D- dans le panneau live (AC: #9)
  - [x] 14.1 — Lignes 68-70 : ajouter D- à côté de D+ — nécessite de calculer `elevationLoss` depuis les waypoints (même pattern que `elevationGain`)
  - [x] 14.2 — Si `computeElevationLoss` est déjà dans `@ridenrest/gpx`, l'utiliser directement

- [x] Task 15 — `search-range-control.tsx` : D- dans la preview (AC: #8)
  - [x] 15.1 — Lignes 197-200 : ajouter D- après D+ dans la preview — format similaire

- [x] Task 16 — `poi-detail-sheet.tsx` + `poi-popup.tsx` : D- dans les fiches POI (AC: #8)
  - [x] 16.1 — `poi-detail-sheet.tsx:74-95` : calculer `elevationLossM` en plus de `elevationGainM` — utiliser `computeElevationLoss()` depuis `@ridenrest/gpx`
  - [x] 16.2 — Afficher D- en `StatItem` à côté de D+
  - [x] 16.3 — `poi-popup.tsx:220` : même calcul + affichage avec icône `TrendingDown`

- [x] Task 17 — `map-view.tsx` : D- dans le preview stage click (AC: #7)
  - [x] 17.1 — Lignes 603-607 : ajouter D- à côté de D+ dans le floating preview box

- [x] Task 18 — `strava-import-modal.tsx` : D- dans la liste Strava (AC: #6)
  - [x] 18.1 — Ligne 149 : conditionnel — afficher D- si disponible dans la réponse Strava. Note : l'API Strava ne fournit pas le D- dans la même endpoint — si `elevationLossM` n'est pas dans `StravaRouteItem`, **skip cette tâche** (pas d'invention de données).

### Phase 2b — Backfill données existantes

- [x] Task 21 — Backfill D- au démarrage API pour segments/stages/adventures existants
  - [x] 21.1 — `apps/api/src/common/backfill-elevation-loss.service.ts` : service `OnApplicationBootstrap` qui recalcule `elevation_loss_m` pour les rows ayant `elevation_gain_m IS NOT NULL AND elevation_loss_m IS NULL`
  - [x] 21.2 — Backfill segments : recalcul depuis waypoints JSONB stockés via `computeElevationLoss()`
  - [x] 21.3 — Backfill stages : recalcul via `computeElevationGainForRange()` sur les waypoints de l'aventure
  - [x] 21.4 — Backfill adventure totals : agrégation `total_elevation_loss_m` depuis segments mis à jour
  - [x] 21.5 — Enregistré dans `AppModule` — tourne automatiquement au deploy (PM2 restart)
  - [x] 21.6 — Idempotent : condition `IS NULL` = no-op si déjà backfillé

### Phase 3 — Tests

- [x] Task 19 — Tests backend (AC: #1, #10, #11)
  - [x] 19.1 — Test `computeElevationLoss()` dans packages/gpx (points montants → loss = 0, points descendants → loss correct, mixte → loss correct)
  - [x] 19.2 — Test `computeElevationGainForRange()` retourne `{ gain, loss }` correctement
  - [x] 19.3 — Vérifier les tests existants de `stages.service.ts` — adapter au nouveau type de retour

- [x] Task 20 — Tests frontend (AC: #5 à #9)
  - [x] 20.1 — `use-elevation-profile` : tester que `cumulativeDMinus` et `totalDMinus` sont correctement calculés
  - [x] 20.2 — Vérifier non-régression sur les 951+ tests existants

## Dev Notes

### Architecture de la solution — Vue d'ensemble des modifications

```
# BACKEND — Calcul et stockage
packages/gpx/src/parser.ts                          ← AJOUTER computeElevationLoss()
packages/gpx/src/index.ts                           ← EXPORTER computeElevationLoss
packages/database/src/schema/adventure-segments.ts   ← AJOUTER elevation_loss_m
packages/database/src/schema/adventure-stages.ts     ← AJOUTER elevation_loss_m
packages/database/src/schema/adventures.ts           ← AJOUTER total_elevation_loss_m
apps/api/src/stages/stages.service.ts                ← MODIFIER computeElevationGainForRange() → retourner {gain, loss}
apps/api/src/segments/jobs/gpx-parse.processor.ts    ← MODIFIER — stocker D- au parsing
apps/api/src/segments/segments.repository.ts         ← MODIFIER updateAfterParse() — ajouter elevationLossM
apps/api/src/segments/segments.service.ts            ← MODIFIER recomputeCumulativeDistances() — agréger D-
apps/api/src/adventures/adventures.repository.ts     ← MODIFIER updateTotals() — ajouter totalElevationLossM
apps/api/src/adventures/adventures.service.ts        ← MODIFIER updateTotals() — propager
packages/shared/src/types/adventure.types.ts         ← AJOUTER elevationLossM dans 4 interfaces

# FRONTEND — Affichage (11 composants)
apps/web/src/hooks/use-elevation-profile.ts                                        ← MODIFIER — cumulativeDMinus + totalDMinus
apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx                  ← MODIFIER tooltip D-
apps/web/src/app/(app)/adventures/_components/adventure-card.tsx                   ← MODIFIER — ↓ D-
apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx            ← MODIFIER — D- stats
apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx                ← MODIFIER — D- label
apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx             ← MODIFIER — D- cartouche
apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx                     ← MODIFIER — D- lookahead
apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx               ← MODIFIER — D- preview
apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx                   ← MODIFIER — D- stat
apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx                          ← MODIFIER — D- stat
apps/web/src/app/(app)/map/[id]/_components/map-view.tsx                           ← MODIFIER — D- stage preview
```

### Pattern clé : `computeElevationGainForRange()` → `computeElevationForRange()`

La fonction actuelle (`stages.service.ts:13-36`) itère les waypoints et somme les deltas positifs. Pour le D-, il suffit d'ajouter un accumulateur `loss` dans la MÊME boucle :

```typescript
export function computeElevationForRange(
  waypoints: MapWaypoint[], startKm: number, endKm: number,
): { gain: number; loss: number } | null {
  const rangeWps = waypoints
    .filter((wp): wp is MapWaypoint & { ele: number } =>
      wp.ele !== null && wp.ele !== undefined &&
      wp.distKm >= startKm && wp.distKm <= endKm)
    .sort((a, b) => a.distKm - b.distKm)

  if (rangeWps.length < 2) return null

  let gain = 0, loss = 0
  for (let i = 1; i < rangeWps.length; i++) {
    const delta = rangeWps[i].ele - rangeWps[i - 1].ele
    if (delta > 0) gain += delta
    else loss += Math.abs(delta)
  }
  return { gain: Math.round(gain), loss: Math.round(loss) }
}
```

**Renommage optionnel** : `computeElevationGainForRange` → `computeElevationForRange`. Si le dev choisit de renommer, mettre à jour tous les call sites dans `StagesService`. Sinon, garder le même nom et juste changer le type de retour — les call sites doivent de toute façon être mis à jour pour destructurer `{ gain, loss }`.

### Pattern `computeElevationLoss()` dans `@ridenrest/gpx`

Même structure que `computeElevationGain()` (parser.ts:40-50) — symétrique :

```typescript
export function computeElevationLoss(points: GpxPoint[]): number {
  let loss = 0
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!.elevM
    const curr = points[i]!.elevM
    if (prev !== undefined && curr !== undefined && curr < prev) {
      loss += prev - curr
    }
  }
  return loss
}
```

### DB Migration — 3 colonnes nullable

Toutes les colonnes sont `real` nullable avec default null — pas de migration de données nécessaire. Les segments **existants** auront `elevation_loss_m = null`. Le D- sera calculé uniquement pour les **nouveaux** segments parsés après le deploy. Pour les segments existants, un re-parsing serait nécessaire (hors scope — les valeurs null sont gérées partout avec `?? null` et conditions `!= null`).

**CRITIQUE** : utiliser `drizzle-kit generate` — JAMAIS de SQL manuel.

### `recomputeCumulativeDistances()` — Agrégation D-

Pattern identique à l'agrégation D+ existante (`segments.service.ts:158-164`) :

```typescript
const hasLossData = segments.some((s) => s.elevationLossM !== null)
const totalElevationLossM = hasLossData
  ? segments.reduce((sum, s) => sum + (s.elevationLossM ?? 0), 0)
  : null
```

### `updateTotals()` — Signature étendue

`adventures.repository.ts:43` actuel : `updateTotals(id, totalDistanceKm, totalElevationGainM)`
Nouveau : `updateTotals(id, totalDistanceKm, totalElevationGainM, totalElevationLossM)`

Propager dans `adventures.service.ts` → `updateTotals()`.

### Frontend — `useElevationProfile` hook

Ajouter `cumulativeDMinus` dans `ElevationPoint` et `totalDMinus` dans le résultat. Calcul dans la même boucle (lignes 40-54) :

```typescript
let cumulativeDMinus = 0
// Dans la boucle :
if (deltaEle < 0) cumulativeDMinus += Math.abs(deltaEle)
```

### Frontend — Formats d'affichage par composant

| Composant | Format actuel D+ | Format cible D+ · D- |
|---|---|---|
| `adventure-card.tsx` | `↑ 4 200 m` | `↑ 4 200 m · ↓ 3 800 m` |
| `adventure-detail.tsx` | `TrendingUp + 4200 m D+` | `TrendingUp 4200 m D+ · TrendingDown 3800 m D-` |
| `segment-card.tsx` | `1200m D+` | `1200m D+ · 980m D-` |
| `sidebar-stages-section.tsx` | `D+ 850 m` / `D+ —` | `D+ 850 m · D- 720 m` / `D+ — · D- —` |
| `elevation-profile.tsx` tooltip | `D+ 1200 m` | `D+ 1200 m` + nouvelle ligne `D- 980 m` |
| `live-controls.tsx` | `D+ 320m` | `D+ 320m · D- 280m` |
| `search-range-control.tsx` | `1200m D+` | `1200m D+ · 980m D-` |
| `poi-detail-sheet.tsx` | `StatItem D+ ↑ 850 m` | `StatItem D+ ↑ 850 m` + `StatItem D- ↓ 720 m` |
| `poi-popup.tsx` | `TrendingUp + 850 m D+` | `TrendingUp 850 m D+` + `TrendingDown 720 m D-` |
| `map-view.tsx` preview | `D+ 850 m` | `D+ 850 m · D- 720 m` |

### Frontend — `computeElevationLoss` dans `@ridenrest/gpx`

Les composants `poi-detail-sheet.tsx`, `poi-popup.tsx`, et `live-controls.tsx` calculent le D+ **dynamiquement** à partir des waypoints (pas depuis l'API). Ils utilisent `computeElevationGain()` de `@ridenrest/gpx`. Pour le D-, utiliser la nouvelle `computeElevationLoss()` du même package.

### Strava — D- non disponible

L'API Strava (routes list) ne fournit pas le D- dans la réponse. `StravaRouteItem` (`strava.service.ts:14-19`) n'a que `elevationGainM`. **Ne PAS inventer un champ D- pour Strava** — laisser `null` pour les segments importés via Strava. Si l'API Strava est enrichie dans le futur, il suffira d'ajouter le champ.

### ETA — Pas de modification

`computeEtaMinutes()` (`stages.service.ts:40-44`) utilise Naismith's rule avec D+ uniquement. Le D- n'impacte pas le calcul ETA dans cette story. Optionnel futur : ajouter un bonus vitesse pour les descentes, mais hors scope.

### Ordre d'implémentation recommandé

1. **DB schema** (Task 1) — migration first
2. **`@ridenrest/gpx`** (Task 2) — nouvelle fonction
3. **Backend API** (Tasks 3-7) — calcul + stockage + réponses
4. **Shared types** (Task 6) — interfaces
5. **Frontend hook** (Task 8) — useElevationProfile
6. **Frontend composants** (Tasks 9-18) — affichage
7. **Tests** (Tasks 19-20)

### Previous story intelligence (17.3)

- Story 17.3 a modifié `elevation-profile.tsx` et `map-view.tsx` — les mêmes fichiers sont touchés ici
- Tests Vitest avec mocks de modules : `vi.mock(...)` pour recharts — pattern confirmé
- 951 tests dans la suite — vérifier non-régression
- Le composant `ElevationProfile` reçoit ses données via props (pas de store direct) — pattern à respecter

### Git intelligence (5 derniers commits)

- `3ecf683` — Story 17.2 : multi-upload GPX (dialog pattern, tests Vitest)
- `273b5c9` — Story 17.1 : versioning + release notes
- `8dea6f4` — Story 16.32 : Strava compliance
- Patterns confirmés : co-located tests, feature branch commits, Turborepo build

### Attention

- **TOUJOURS `drizzle-kit generate`** pour les migrations — JAMAIS de SQL manuel
- **Nullable partout** : `elevation_loss_m` peut être `null` (segments sans données élévation, segments existants non re-parsés)
- **Ne PAS modifier `computeEtaMinutes()`** — le D- n'est pas utilisé pour l'ETA
- **Ne PAS inventer de D- pour Strava** — l'API ne le fournit pas
- **Segments existants** : resteront avec `elevation_loss_m = null` après migration — le D- sera affiché uniquement pour les segments re-parsés ou nouveaux
- **`computeElevationGainForRange()` est une fonction exportée** (`export function`, pas une méthode de classe) — attention à ne pas la déplacer dans la classe `StagesService` ; elle est importée par des tests
- **Les types `@ridenrest/database`** (inferSelect/inferInsert) se mettent à jour automatiquement depuis le schéma Drizzle — pas de type à modifier manuellement dans database/

### References

- [Source: apps/api/src/stages/stages.service.ts:11-36] — `computeElevationGainForRange()` à modifier (type retour → `{gain, loss}`)
- [Source: packages/gpx/src/parser.ts:40-50] — `computeElevationGain()` modèle pour `computeElevationLoss()`
- [Source: packages/database/src/schema/adventure-segments.ts:20] — `elevationGainM` existant, ajouter `elevationLossM` après
- [Source: packages/database/src/schema/adventure-stages.ts:13] — `elevationGainM` existant, ajouter `elevationLossM` après
- [Source: packages/database/src/schema/adventures.ts:12] — `totalElevationGainM` existant, ajouter `totalElevationLossM` après
- [Source: apps/api/src/segments/jobs/gpx-parse.processor.ts:72-85] — parsing GPX → ajouter D-
- [Source: apps/api/src/segments/segments.service.ts:148-164] — `recomputeCumulativeDistances()` → agréger D-
- [Source: apps/api/src/segments/segments.repository.ts:53-76] — `updateAfterParse()` → ajouter elevationLossM
- [Source: apps/api/src/adventures/adventures.repository.ts:43-48] — `updateTotals()` → ajouter totalElevationLossM
- [Source: packages/shared/src/types/adventure.types.ts:31,41,77,91] — 4 interfaces à enrichir
- [Source: apps/web/src/hooks/use-elevation-profile.ts:4-66] — hook → ajouter cumulativeDMinus + totalDMinus
- [Source: apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx:30-49] — tooltip D-
- [Source: apps/web/src/app/(app)/adventures/_components/adventure-card.tsx:38-42] — ↓ D-
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx:349-354] — D- stats
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx:34,182] — D- label
- [Source: apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx:253-254] — D- cartouche
- [Source: apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx:68-70] — D- live
- [Source: apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx:197-200] — D- preview
- [Source: apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx:74-95,159-160] — D- stat
- [Source: apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx:220,352-360] — D- popup
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:603-607] — D- stage preview
- [Source: _bmad-output/planning-artifacts/epics.md:3399-3449] — AC et notes techniques de l'epic

### Review Findings

#### Decision Needed

- [x] [Review][Decision] D1 — Sémantique `null` vs `0` pour une perte nulle — résolu : cohérent avec `elevationGainM` (même pattern `> 0 ? val : null`), `null` = pas de données ou plat. Conservé tel quel.
- [x] [Review][Decision] D2 — `computeLossInRange` appelée avec `(waypoints, stageEndKm, fromKm)` — résolu : intentionnel, même signature que `computeElevationInRange` existante. Conservé tel quel.

#### Patches

- [x] [Review][Patch] P1 — `computeElevationLoss` ne protège pas contre NaN / valeurs non finies [`packages/gpx/src/parser.ts`] — corrigé : `Number.isFinite()` guard ajouté
- [x] [Review][Patch] P2 — `adventure-card` : D- imbriqué dans le `<span>` D+ (nœud enfant au lieu de sibling) [`adventure-card.tsx:44-49`] — corrigé : rendu en string interpolée dans le span
- [x] [Review][Patch] P3 — `adventure-detail` : pas de séparateur ` · ` entre bloc D+ et bloc D- [`adventure-detail.tsx:352-511`] — corrigé : D- inline avec ` · ` dans le même `<span>`
- [x] [Review][Patch] P4 — `map-view` preview stage : pas de séparateur ` · ` entre D+ et D- [`map-view.tsx:608-671`] — corrigé : span séparateur ` · ` conditionnel ajouté
- [x] [Review][Patch] P5 — `poi-popup` : `grid-cols` basé sur la truthiness de `elevationGainM` (0 = falsy) [`poi-popup.tsx:352`] — corrigé : condition `!== null && > 0`
- [x] [Review][Patch] P6 — Backfill : guard manquant pour segments sans aucune donnée d'élévation [`backfill-elevation-loss.service.ts:45-58`] — corrigé : guard `points.some((p) => p.elevM != null)` ajouté
- [x] [Review][Patch] P7 — `live-controls` : D- non rendu quand `elevationGain = null` — dismissed : le code actuel affiche `— · D- Xm` correctement dans ce cas
- [x] [Review][Patch] P8 — `computeElevationLoss` retourne des flottants bruts sans `Math.round` [`packages/gpx/src/parser.ts`] — corrigé : `Math.round(loss)` ajouté
- [x] [Review][Patch] P9 — Backfill stages : stages sans élévation restent éligibles à chaque restart [`backfill-elevation-loss.service.ts:99-103`] — corrigé : guard `hasElevData` ajouté

#### Deferred

- [x] [Review][Defer] W1 — Backfill sans pagination/batching [`backfill-elevation-loss.service.ts`] — deferred, pre-existing concern, acceptable pour backfill one-shot
- [x] [Review][Defer] W2 — Asymétrie `totalElevationLossM` requis vs optionnel selon le type de réponse [`adventure.types.ts`] — deferred, pattern hérité de `totalElevationGainM`
- [x] [Review][Defer] W3 — Hook `use-elevation-profile` : `deltaM = 0` avec `deltaEle ≠ 0` non géré [`use-elevation-profile.ts`] — deferred, pre-existing edge case aussi présent pour D+

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — all tests pass (951 web + 271 API).

### Completion Notes List

- Task 18 (strava-import-modal D-) skipped as planned — Strava API does not provide D- data
- `computeElevationGainForRange()` kept its name (not renamed to `computeElevationForRange`) — only return type changed
- All 3 DB columns are nullable real — no data backfill needed
- Pre-existing TS errors in test files (missing `source`, `hasStravaSegment`) not related to this story

### Change Log

- DB: 3 new nullable `elevation_loss_m` / `total_elevation_loss_m` columns (migration 0012)
- `@ridenrest/gpx`: new `computeElevationLoss()` function
- `stages.service.ts`: `computeElevationGainForRange()` returns `{ gain, loss }` instead of `number`
- `segments.service.ts`: `recomputeCumulativeDistances()` aggregates D-
- Shared types: `elevationLossM` added to 4 interfaces
- Frontend: D- displayed in 11 components (hook + 10 UI components)
- Tests: 22 gpx tests, 34 stages tests, 12 segments tests, 951 web tests — all pass

### File List

#### Backend
- `packages/database/src/schema/adventure-segments.ts` — added `elevationLossM` column
- `packages/database/src/schema/adventure-stages.ts` — added `elevationLossM` column
- `packages/database/src/schema/adventures.ts` — added `totalElevationLossM` column
- `packages/database/migrations/0012_mysterious_zemo.sql` — generated migration (3 ALTER TABLE)
- `packages/database/migrations/meta/0012_snapshot.json` — drizzle snapshot
- `packages/database/migrations/meta/_journal.json` — drizzle journal
- `packages/gpx/src/parser.ts` — added `computeElevationLoss()`
- `packages/gpx/src/index.ts` — export `computeElevationLoss`
- `packages/gpx/src/parser.test.ts` — NEW: tests for computeElevationGain + computeElevationLoss
- `apps/api/src/stages/stages.service.ts` — `computeElevationGainForRange()` returns `{gain, loss}`
- `apps/api/src/stages/stages.repository.ts` — `elevationLossM` in update/createWithSplit/updateMany
- `apps/api/src/stages/stages.service.test.ts` — updated assertions for `{gain, loss}` return type
- `apps/api/src/segments/jobs/gpx-parse.processor.ts` — compute + store D- at parse time
- `apps/api/src/segments/segments.repository.ts` — `elevationLossM` in `updateAfterParse`
- `apps/api/src/segments/segments.service.ts` — aggregate D- in `recomputeCumulativeDistances`
- `apps/api/src/segments/segments.service.test.ts` — updated `updateTotals` assertions (4th arg)
- `apps/api/src/adventures/adventures.repository.ts` — `totalElevationLossM` in `updateTotals` + `getAdventureMapData`
- `apps/api/src/adventures/adventures.service.ts` — propagate `totalElevationLossM`
- `apps/api/src/common/backfill-elevation-loss.service.ts` — NEW: one-time backfill D- at API startup
- `apps/api/src/app.module.ts` — register BackfillElevationLossService
- `packages/shared/src/types/adventure.types.ts` — `elevationLossM` in 4 interfaces

#### Frontend
- `apps/web/src/hooks/use-elevation-profile.ts` — `cumulativeDMinus` + `totalDMinus`
- `apps/web/src/hooks/use-elevation-profile.test.ts` — D- assertions
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx` — D- in tooltip
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.test.tsx` — `cumulativeDMinus` in mock payload
- `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx` — D- display
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — D- stat block
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx` — D- in label
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` — D- in stage cartouche
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — D- in live panel
- `apps/web/src/app/(app)/live/[id]/page.tsx` — compute elevationLoss for LiveControls
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — D- in preview
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` — D- StatItem
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` — D- in popup
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — D- in stage preview

#### Tests updated (mock data `elevationLossM: null`)
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx`
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.test.tsx`
- `apps/web/src/app/(app)/live/[id]/page.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/sortable-segment-card.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.test.tsx`
