# Story 17.7: Vitesse et pause par étape — ETA individuelle sur cartouches

Status: done

> **Ajouté 2026-04-11** — Story de l'Epic 17 (Quality of Life). Objectif : ajouter vitesse moyenne et temps de pause **par étape** (au lieu d'uniquement global), recalculer l'ETA en conséquence, et nettoyer les doublons d'affichage date sur les cartouches. Dépend de 17.5 (StageCard) et 16.8 (avgSpeedKmh global).

## Story

As a **cyclist planning multi-day stages**,
I want to set an average speed and pause time per stage,
So that each stage's ETA accurately reflects the terrain and my daily rhythm (riding time + breaks).

## Acceptance Criteria

1. **Given** le dialog de création d'étape (naming dialog),
   **When** l'utilisateur crée une nouvelle étape,
   **Then** le dialog propose 4 champs :
   - **Nom** (existant, obligatoire)
   - **Date de début** (datetime-local, optionnel — remplace l'ancien `StageDepartureInput` inline)
   - **Vitesse moyenne** (number, range 5–50, défaut = `adventure.avgSpeedKmh`, optionnel)
   - **Temps de pause** (number en heures, range 0–12, défaut = 0, optionnel — représente les pauses/repos dans la journée)

2. **Given** le dialog d'édition d'étape (bouton crayon ✏️),
   **When** l'utilisateur modifie une étape existante,
   **Then** le dialog propose les mêmes champs que la création : Nom, Couleur (existant), Date de début, Vitesse moyenne, Temps de pause.

3. **Given** une cartouche étape en **planning mode**,
   **When** les données de l'étape sont affichées,
   **Then** le layout est :
   - **Ligne 1** : dot couleur + nom tronqué — à droite : boutons ✏️ et 🗑️ (inchangé)
   - **Ligne 2** : km + D+ · D- (inchangé)
   - **Ligne 3** : date de début formatée (e.g. "jeu. 15 avril · 07:30") — absente si non définie
   - **Ligne 4** : ETA formatée (e.g. "ETA ~6h30 (dont 1h pause)") — toujours visible si `etaMinutes` est disponible
   - Le `StageDepartureInput` inline (datetime-local sous chaque cartouche) est **SUPPRIMÉ** — la date se gère désormais uniquement via les dialogs

4. **Given** une cartouche étape en **live mode**,
   **When** les données de l'étape sont affichées,
   **Then** le layout est le même mais :
   - Ligne 3 : ETA depuis la position courante (inchangé par rapport à 17.5)
   - Pas de boutons edit/delete (lecture seule, inchangé)

5. **Given** les nouveaux champs `speedKmh` et `pauseHours` sur une étape,
   **When** l'ETA est calculée côté API,
   **Then** la formule est : `computeEtaMinutes(distanceKm, elevationGainM, speedKmh) + pauseHours * 60`
   - `speedKmh` : valeur per-stage si définie, sinon fallback `adventure.avgSpeedKmh`
   - `pauseHours` : valeur per-stage si définie, sinon 0
   - Le champ `etaMinutes` en DB inclut le temps de pause

6. **Given** les nouveaux champs DB,
   **When** les schémas sont mis à jour,
   **Then** :
   - `adventure_stages` a deux nouvelles colonnes : `speed_kmh REAL NULL` et `pause_hours REAL NULL DEFAULT 0`
   - `AdventureStageResponse` inclut `speedKmh: number | null` et `pauseHours: number | null`
   - `CreateStageInput` accepte `departureTime`, `speedKmh`, `pauseHours` (tous optionnels)
   - `UpdateStageInput` accepte `speedKmh`, `pauseHours` (tous optionnels)

7. **Given** le re-calcul cascade après modification de `avgSpeedKmh` global,
   **When** `recomputeAllEtasForAdventure` est appelé,
   **Then** pour chaque étape, utiliser `stage.speedKmh ?? adventure.avgSpeedKmh` + `stage.pauseHours ?? 0`.

8. **Given** la météo par étape (`getStageWeather`),
   **When** l'API calcule la prévision météo au point d'arrivée d'une étape,
   **Then** :
   - La vitesse utilisée est `stage.speedKmh ?? dto.speedKmh` (per-stage prioritaire sur le query param global)
   - Le temps de pause (`stage.pauseHours ?? 0`) est ajouté à l'ETA pour décaler l'heure d'arrivée prévue (la météo doit refléter l'heure réelle d'arrivée, pas l'heure de roulage pur)
   - Côté frontend : le `StageWeatherBadge` passe toujours `speedKmh` en fallback, mais l'API utilise la valeur per-stage si disponible

## Tasks / Subtasks

### Phase 1 — DB + Schema + Types

- [x] Task 1 — Ajouter colonnes DB (AC: #6)
  - [x] 1.1 — `packages/database/src/schema/adventure-stages.ts` : ajouter `speedKmh: real('speed_kmh')` (nullable) et `pauseHours: real('pause_hours').default(0)` (nullable)
  - [x] 1.2 — `pnpm --filter @ridenrest/database db:generate` pour générer la migration
  - [x] 1.3 — Vérifier le SQL de migration

- [x] Task 2 — Mettre à jour les types partagés (AC: #6)
  - [x] 2.1 — `packages/shared/src/types/adventure.types.ts` : ajouter `speedKmh: number | null` et `pauseHours: number | null` à `AdventureStageResponse`
  - [x] 2.2 — `packages/shared/src/schemas/stage.schema.ts` :
    - `createStageSchema` : ajouter `departureTime: z.string().datetime().optional().nullable()`, `speedKmh: z.number().min(5).max(50).optional().nullable()`, `pauseHours: z.number().min(0).max(12).optional().nullable()`
    - `updateStageSchema` : ajouter `speedKmh: z.number().min(5).max(50).optional().nullable()`, `pauseHours: z.number().min(0).max(12).optional().nullable()`

### Phase 2 — API (NestJS)

- [x] Task 3 — Mettre à jour StagesService (AC: #5, #7)
  - [x] 3.1 — `stages.service.ts` : dans `createStage()`, lire `dto.speedKmh`, `dto.pauseHours`, `dto.departureTime` et les passer au `repo.create()`. L'ETA devient : `computeEtaMinutes(distanceKm, elev, speedKmh ?? adventure.avgSpeedKmh) + (pauseHours ?? 0) * 60`
  - [x] 3.2 — `stages.service.ts` : dans `updateStage()`, gérer `dto.speedKmh` et `dto.pauseHours` (passer au repo update). Recalculer `etaMinutes` si l'un des champs change.
  - [x] 3.3 — `stages.service.ts` : dans `deleteStage()` cascade et `recomputeAllEtasForAdventure()`, utiliser `stage.speedKmh ?? adventure.avgSpeedKmh` et `(stage.pauseHours ?? 0) * 60` pour chaque étape
  - [x] 3.4 — `stages.service.ts` : mettre à jour `toResponse()` pour inclure `speedKmh` et `pauseHours`
  - [x] 3.5 — `stages.repository.ts` : s'assurer que `create()` et `update()` acceptent les nouveaux champs

- [x] Task 4 — Mettre à jour le DTO NestJS (AC: #6)
  - [x] 4.1 — `apps/api/src/stages/dto/create-stage.dto.ts` : ajouter `@IsOptional() @IsDateString() departureTime?: string`, `@IsOptional() @IsNumber() @Min(5) @Max(50) speedKmh?: number`, `@IsOptional() @IsNumber() @Min(0) @Max(12) pauseHours?: number`
  - [x] 4.2 — `apps/api/src/stages/dto/update-stage.dto.ts` : ajouter `speedKmh` et `pauseHours` (mêmes validations)

- [x] Task 5 — Météo par étape avec vitesse/pause per-stage (AC: #8)
  - [x] 5.1 — `stages.service.ts` : dans `getStageWeather()`, utiliser `stage.speedKmh ?? dto.speedKmh` pour la vitesse effective
  - [x] 5.2 — `stages.service.ts` : dans `getStageWeather()`, ajouter `(stage.pauseHours ?? 0)` heures à l'ETA pour décaler l'heure d'arrivée (la météo reflète l'heure réelle d'arrivée avec pauses)
  - [x] 5.3 — Le `distanceKm` passé à `getWeatherAtKmWithEta` reste `stage.distanceKm`, mais le `speedKmh` effectif tient compte du per-stage

- [x] Task 6 — Tests API (AC: #5, #7, #8)
  - [x] 6.1 — `stages.service.test.ts` : ajouter tests pour createStage avec speedKmh/pauseHours, updateStage avec speed/pause, vérifier le calcul ETA avec pause
  - [x] 6.2 — `stages.service.test.ts` : tester `recomputeAllEtasForAdventure` avec stages ayant des speedKmh/pauseHours individuels
  - [x] 6.3 — `stages.service.test.ts` : tester `getStageWeather` utilise `stage.speedKmh` quand disponible et ajoute `pauseHours` à l'ETA

### Phase 3 — Frontend : Dialogs

- [x] Task 7 — Enrichir le naming dialog (création) (AC: #1)
  - [x] 7.1 — `sidebar-stages-section.tsx` : dans le naming dialog, ajouter 3 champs sous le nom :
    - `datetime-local` pour la date de début (state: `namingDepartureTime`)
    - Number input pour vitesse moyenne (state: `namingSpeedKmh`, défaut: `adventure.avgSpeedKmh`)
    - Number input pour temps de pause en heures (state: `namingPauseHours`, défaut: 0)
  - [x] 7.2 — `handleNamingConfirm` : passer `departureTime`, `speedKmh`, `pauseHours` à `createStage()`
  - [x] 7.3 — `SidebarStagesSectionProps` : ajouter `defaultSpeedKmh?: number` prop (pour pré-remplir depuis `adventure.avgSpeedKmh`)

- [x] Task 8 — Enrichir le edit dialog (AC: #2)
  - [x] 8.1 — `sidebar-stages-section.tsx` : dans le edit dialog, ajouter :
    - `datetime-local` pour la date de début (state: `editDepartureTime`, pré-rempli depuis `editStage.departureTime`)
    - Number input pour vitesse (state: `editSpeedKmh`, pré-rempli depuis `editStage.speedKmh ?? defaultSpeedKmh`)
    - Number input pour pause (state: `editPauseHours`, pré-rempli depuis `editStage.pauseHours ?? 0`)
  - [x] 8.2 — `handleEditSave` : passer `departureTime`, `speedKmh`, `pauseHours` à `updateStage()`

### Phase 4 — Frontend : Cartouches StageCard

- [x] Task 9 — Supprimer StageDepartureInput inline (AC: #3)
  - [x] 9.1 — `sidebar-stages-section.tsx` : supprimer le composant `StageDepartureInput` et son usage dans le `children` de `<StageCard />`
  - [x] 9.2 — Supprimer le composant `StageDepartureInput` (fonction locale dans le fichier)

- [x] Task 10 — Mettre à jour StageCard (AC: #3, #4)
  - [x] 10.1 — `stage-card.tsx` : ajouter une ligne 4 pour l'ETA planning basée sur `stage.etaMinutes` et `stage.pauseHours` :
    - Format : "ETA ~6h30" si pas de pause, "ETA ~6h30 (dont 1h pause)" si pauseHours > 0
    - Visible uniquement si `stage.etaMinutes != null`
  - [x] 10.2 — Ligne 3 (date de début) : inchangée — affiche `formatStageDeparture(stage.departureTime)` quand défini
  - [x] 10.3 — Ajuster les props si nécessaire (supprimer les props liées à `StageDepartureInput` devenues inutiles)

### Phase 5 — Intégration map-view

- [x] Task 11 — Passer defaultSpeedKmh à SidebarStagesSection (AC: #1)
  - [x] 11.1 — `map-view.tsx` : passer `defaultSpeedKmh={adventure?.avgSpeedKmh ?? 15}` à `<SidebarStagesSection />`

### Phase 6 — Tests frontend

- [x] Task 12 — Tests (AC: all)
  - [x] 12.1 — `stage-card.test.tsx` : ajouter tests pour ligne 4 ETA (avec et sans pause)
  - [x] 12.2 — `sidebar-stages-section.test.tsx` : mettre à jour pour les nouveaux champs dans les dialogs et la suppression de StageDepartureInput
  - [x] 12.3 — Vérifier 0 échecs TypeScript introduits

## Dev Notes

### Architecture de la solution

```
# DB + TYPES
packages/database/src/schema/adventure-stages.ts     ← MODIFIER — ajouter speed_kmh + pause_hours
packages/shared/src/types/adventure.types.ts          ← MODIFIER — AdventureStageResponse + speedKmh + pauseHours
packages/shared/src/schemas/stage.schema.ts           ← MODIFIER — createStageSchema + updateStageSchema

# API
apps/api/src/stages/stages.service.ts                ← MODIFIER — ETA avec pause, create/update avec nouveaux champs
apps/api/src/stages/stages.repository.ts              ← MODIFIER — create/update acceptent les nouveaux champs
apps/api/src/stages/dto/create-stage.dto.ts           ← MODIFIER — nouveaux champs optionnels
apps/api/src/stages/dto/update-stage.dto.ts           ← MODIFIER — nouveaux champs optionnels

# FRONTEND
apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx  ← MODIFIER — dialogs enrichis, StageDepartureInput supprimé
apps/web/src/components/shared/stage-card.tsx                            ← MODIFIER — ligne 4 ETA planning
apps/web/src/app/(app)/map/[id]/_components/map-view.tsx                ← MODIFIER — passer defaultSpeedKmh
```

### Champs DB existants vs nouveaux

**Existants sur `adventure_stages` :**
- `speed_kmh` : N'EXISTE PAS encore — la vitesse vient du global `adventures.avg_speed_kmh`
- `pause_hours` : N'EXISTE PAS encore
- `eta_minutes` : EXISTE (integer, nullable) — actuellement calculé sans pause
- `departure_time` : EXISTE (timestamp, nullable) — par étape

**Nouveaux :**
- `speed_kmh REAL NULL` — `NULL` = utiliser le global `adventure.avgSpeedKmh`
- `pause_hours REAL NULL DEFAULT 0` — heures de pause (repos, repas, etc.)

### Calcul ETA mis à jour

```typescript
// Avant (stages.service.ts:42)
export function computeEtaMinutes(distanceKm: number, elevationGainM: number | null, speedKmh = 15): number {
  const flatMinutes = (distanceKm / speedKmh) * 60
  const climbMinutes = ((elevationGainM ?? 0) / 100) * 6
  return Math.round(flatMinutes + climbMinutes)
}

// Après — la fonction reste la même, mais l'appelant ajoute la pause :
const ridingEta = computeEtaMinutes(distanceKm, elevGain, stage.speedKmh ?? adventure.avgSpeedKmh)
const totalEta = ridingEta + Math.round((stage.pauseHours ?? 0) * 60)
// stocker totalEta dans etaMinutes
```

**Ne PAS modifier la signature de `computeEtaMinutes`** — la pause est ajoutée au niveau de l'appelant, pas dans la formule de base (qui reste un calcul de temps de roulage pur).

### StageDepartureInput — à supprimer

Le composant `StageDepartureInput` (lignes 38-87 de `sidebar-stages-section.tsx`) est une fonction locale qui rend un `<input type="datetime-local">` inline sous chaque cartouche. Il est passé comme `children` au `<StageCard />`.

**Pourquoi le supprimer :** doublon avec le champ "Date de début" dans les dialogs. L'utilisateur voulait supprimer ce doublon (ligne 2 = date de début + ligne 3 = champ date = même info affichée deux fois).

**À la place :** la date de début s'édite uniquement via le dialog de création ou d'édition (bouton ✏️).

### Naming Dialog — Champs à ajouter

Le dialog actuel (lignes 264-295) a uniquement un champ `Nom` + affichage couleur auto. Il faut ajouter :

```tsx
{/* Date de début */}
<div className="flex flex-col gap-1.5">
  <Label htmlFor="stage-departure">Date de début</Label>
  <Input id="stage-departure" type="datetime-local" value={namingDepartureTime} onChange={...} />
</div>

{/* Vitesse moyenne */}
<div className="flex flex-col gap-1.5">
  <Label htmlFor="stage-speed">Vitesse moyenne (km/h)</Label>
  <Input id="stage-speed" type="number" min={5} max={50} value={namingSpeedKmh} onChange={...} />
</div>

{/* Temps de pause */}
<div className="flex flex-col gap-1.5">
  <Label htmlFor="stage-pause">Temps de pause (heures)</Label>
  <Input id="stage-pause" type="number" min={0} max={12} step={0.5} value={namingPauseHours} onChange={...} />
</div>
```

### Edit Dialog — Champs à ajouter

Le dialog d'édition (lignes 298-338) a actuellement `Nom` + `Couleur`. Ajouter les 3 mêmes champs que le naming dialog, pré-remplis avec les valeurs existantes de l'étape.

### StageCard — Nouvelle ligne 4 (ETA planning)

Actuellement la ligne 3 affiche soit la date (planning) soit l'ETA (live). Le changement :
- **Ligne 3** : date de début (planning uniquement, inchangé)
- **Ligne 4** : ETA planning — `stage.etaMinutes` formaté, avec mention du temps de pause si > 0

```tsx
{/* Line 4: ETA (planning mode) */}
{isPlanning && stage.etaMinutes != null && (
  <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-5">
    <span>
      ETA {formatEta(stage.etaMinutes)}
      {stage.pauseHours != null && stage.pauseHours > 0 && (
        ` (dont ${stage.pauseHours}h pause)`
      )}
    </span>
  </div>
)}
```

### Props à passer depuis map-view.tsx

`<SidebarStagesSection>` a besoin d'un nouveau prop `defaultSpeedKmh` pour pré-remplir le champ vitesse dans le naming dialog. Source : `adventure?.avgSpeedKmh ?? 15`.

### createStage — Signature mise à jour

Actuellement `createStage` dans `api-client.ts` envoie `{ name, endKm, color }`. Il faudra envoyer aussi `departureTime`, `speedKmh`, `pauseHours`.

Vérifier que `api-client.ts` → `createStage()` passe bien les nouveaux champs au body de la requête POST.

### Cascade et recompute

`recomputeAllEtasForAdventure(adventureId, speedKmh)` (ligne ~285 de stages.service.ts) doit être mis à jour pour utiliser `stage.speedKmh ?? speedKmh` et ajouter `(stage.pauseHours ?? 0) * 60`.

Même chose pour les cascades dans `createStage` (split) et `deleteStage`.

### Météo par étape — Utilisation vitesse/pause per-stage (AC #8)

Le endpoint `GET /api/stages/:id/weather` (`getStageWeather` dans `stages.service.ts:302`) calcule la météo au point d'arrivée de l'étape. Actuellement il utilise `dto.speedKmh` (query param passé par le frontend).

**Modification :** utiliser `stage.speedKmh` (per-stage, lu depuis la DB) en priorité sur `dto.speedKmh` (fallback global).

```typescript
// stages.service.ts — getStageWeather()
const effectiveSpeedKmh = stage.speedKmh ?? dto.speedKmh  // per-stage > global
const pauseMs = (stage.pauseHours ?? 0) * 3600000          // pause en ms

// Quand stage a un departureTime propre (branche ligne 313-323) :
// Le distanceKm et effectiveSpeedKmh déterminent le temps de roulage
// Il faut ajouter pauseMs pour obtenir l'heure d'arrivée réelle
// → Passer effectiveSpeedKmh à getWeatherAtKmWithEta au lieu de dto.speedKmh
// → Ajuster le calcul pour inclure la pause

// Deux options pour gérer la pause :
// Option A (simple): calculer un "effective speed" plus lent qui intègre la pause
//   effectiveSlowerSpeed = distanceKm / ((distanceKm / effectiveSpeedKmh) + pauseHours)
// Option B (propre): passer pauseHours comme param supplémentaire au WeatherService
// → Préférer Option A car ne modifie pas la signature de getWeatherAtKmWithEta
```

**Fichiers impactés :**
- `apps/api/src/stages/stages.service.ts` : `getStageWeather()` (lignes 302-332)
- **PAS de modification** sur `StageWeatherBadge` ni `useStageWeather` côté frontend — le frontend continue de passer `speedKmh` en query param comme fallback, mais l'API utilise la valeur DB en priorité

### Attention

- **NE PAS modifier `computeEtaMinutes`** — la pause est ajoutée au niveau de l'appelant
- **Préserver les data-testid** existants (`stage-departure-input-*` peut être supprimé car le composant est supprimé)
- **Migration DB** via `drizzle-kit generate` uniquement — jamais de SQL manuel
- **Les étapes existantes** auront `speed_kmh = NULL` et `pause_hours = NULL` → fallback `avgSpeedKmh` et 0 pause → comportement identique à l'actuel
- **Le champ `etaMinutes` en DB** inclut désormais le temps de pause (c'est le temps total, pas seulement le roulage)
- **Live mode** : la ligne ETA live utilise `speedKmh` et `currentKmOnRoute` — elle reste un calcul frontend (pas impactée par la pause DB, car c'est un ETA "temps restant depuis position courante"). Laisser le comportement live inchangé pour cette story.

### Imports clés

```typescript
// DTO NestJS
import { IsOptional, IsNumber, Min, Max, IsDateString } from 'class-validator'

// Zod schema
import { z } from 'zod'
```

### Previous story intelligence (17.5, 17.6)

- 17.5 a créé `StageCard` avec layout 3 lignes + `StageDepartureInput` en children
- 17.5 a créé `LiveStagesSection` — ne doit pas être impactée par cette story (sauf types mis à jour)
- 17.6 a ajouté des badges étapes dans le drawer filtres live — pas d'impact
- Le pattern de dialog (naming + edit) est établi dans `sidebar-stages-section.tsx` — étendre plutôt que refactorer

### Git intelligence (5 derniers commits)

- Récents: fix infra (caddy, JWT, Redis) — pas de code métier récent
- Patterns établis : migration Drizzle, shared types, NestJS DTOs avec class-validator, Vitest + @testing-library/react

### References

- [Source: apps/web/src/components/shared/stage-card.tsx] — Composant StageCard à modifier (ligne 4 ETA)
- [Source: apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx:38-87] — StageDepartureInput à supprimer
- [Source: apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx:264-295] — Naming dialog à enrichir
- [Source: apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx:298-338] — Edit dialog à enrichir
- [Source: apps/api/src/stages/stages.service.ts:42-46] — computeEtaMinutes (ne pas modifier)
- [Source: apps/api/src/stages/stages.service.ts:280-296] — recomputeAllEtasForAdventure (à mettre à jour)
- [Source: packages/database/src/schema/adventure-stages.ts] — Schema DB à modifier
- [Source: packages/shared/src/schemas/stage.schema.ts] — Zod schemas à modifier
- [Source: packages/shared/src/types/adventure.types.ts:70-85] — AdventureStageResponse à modifier
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:404] — Passage speedKmh à SidebarStagesSection

## Review Findings

- [x] [Review][Decision] D+ supprimé de `computeEtaMinutes` — décision : ignorer le D+, l'utilisateur gère via la vitesse per-stage. Formule devient purement distance/vitesse. [apps/api/src/stages/stages.service.ts:computeEtaMinutes]

- [x] [Review][Patch] `effectiveSpeedKmh` peut être `undefined` dans `getStageWeather` — Ajout fallback `?? 15` et suppression de la garde `&& effectiveSpeedKmh` devenue superflue. [apps/api/src/stages/stages.service.ts:~312]

- [x] [Review][Patch] `@IsNumber()` + `@IsOptional()` ne protège pas `null` explicite — Ajout `@ValidateIf((o) => o.speedKmh !== null)` et `@ValidateIf((o) => o.pauseHours !== null)` dans les deux DTOs. [apps/api/src/stages/dto/create-stage.dto.ts, update-stage.dto.ts]

- [x] [Review][Patch] Incohérence create vs update pour vitesse/pause à la valeur défaut — `handleNamingConfirm` aligne sur `null` (au lieu de `undefined`) pour `departureTime`, `speedKmh` et `pauseHours`. [apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx:handleNamingConfirm]

- [x] [Review][Patch] Format de la pause affiché avec décimales (`1.5h pause`) — Remplacement de `{stage.pauseHours}h` par `{formatEta(stage.pauseHours * 60)}` pour un affichage cohérent (ex. `~1h30`). [apps/web/src/components/shared/stage-card.tsx:~160]

- [x] [Review][Patch] Commentaire et prop `children` obsolètes dans `StageCard` — Suppression de `children?: React.ReactNode`, du commentaire `e.g. StageDepartureInput`, et de `{children}` dans le JSX. [apps/web/src/components/shared/stage-card.tsx]

- [x] [Review][Patch] Migration SQL sans `NULL` explicite — Accepté tel quel : la migration est immuable une fois appliquée, et PostgreSQL rend la colonne nullable par défaut. Pas de correctif nécessaire. [packages/database/migrations/0013_nasty_pyro.sql]

- [x] [Review][Defer] `recomputeAllEtasForAdventure` préserve les speedKmh per-stage sans documentation explicite [apps/api/src/stages/stages.service.ts:recomputeAllEtasForAdventure] — deferred, pre-existing design decision — comportement intentionnel mais non documenté dans le JSDoc

- [x] [Review][Defer] Égalité flottante `speed !== defaultSpeedKmh` sans epsilon peut créer des overrides parasites selon arrondis [apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx:handleNamingConfirm] — deferred, pre-existing — impact UX mineur, refactor UX séparé recommandé

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Aucun problème rencontré

### Completion Notes List
- Phase 1: Ajout colonnes DB `speed_kmh` (REAL NULL) et `pause_hours` (REAL NULL DEFAULT 0) via Drizzle migration 0013
- Phase 2: API mise à jour — createStage/updateStage/deleteStage/recomputeAllEtas utilisent speed/pause per-stage avec fallback global. computeEtaMinutes non modifié (pause ajoutée au niveau appelant)
- Phase 3: Dialogs naming + edit enrichis avec 3 champs (date début, vitesse, pause). speedKmh envoyé uniquement si différent du default, pauseHours uniquement si > 0
- Phase 4: StageDepartureInput inline supprimé, remplacé par champs dans les dialogs. Ligne 4 ETA planning ajoutée au StageCard avec mention pause
- Phase 5: map-view passe defaultSpeedKmh à SidebarStagesSection
- Phase 6: 8 nouveaux tests API (42 total), 8 nouveaux tests frontend (997 total web). 0 régressions.
- Tous les tests passent: 279 API + 997 web
- AC #8 (météo per-stage): `getStageWeather()` utilise `stage.speedKmh ?? dto.speedKmh` (per-stage prioritaire) + "effective slower speed" pour intégrer `pauseHours` dans l'ETA météo. `findByIdWithAdventureUserId` élargi pour remonter `speedKmh` et `pauseHours`. +4 tests (46 total API stages).

### Change Log
- 2026-04-11: Implémentation complète story 17.7 — vitesse et pause par étape, ETA individuelle, suppression StageDepartureInput inline
- 2026-04-12: AC #8 — météo per-stage: getStageWeather utilise speedKmh/pauseHours per-stage, effective slower speed pour décaler heure arrivée météo

### File List
- packages/database/src/schema/adventure-stages.ts (modifié — +speedKmh, +pauseHours)
- packages/database/migrations/0013_nasty_pyro.sql (nouveau — migration ALTER TABLE)
- packages/shared/src/types/adventure.types.ts (modifié — AdventureStageResponse +speedKmh +pauseHours)
- packages/shared/src/schemas/stage.schema.ts (modifié — createStageSchema +3 champs, updateStageSchema +2 champs)
- apps/api/src/stages/dto/create-stage.dto.ts (modifié — +departureTime, +speedKmh, +pauseHours)
- apps/api/src/stages/dto/update-stage.dto.ts (modifié — +speedKmh, +pauseHours)
- apps/api/src/stages/stages.repository.ts (modifié — update() type élargi + findByIdWithAdventureUserId +speedKmh +pauseHours)
- apps/api/src/stages/stages.service.ts (modifié — ETA avec pause, create/update/delete/recompute per-stage, toResponse, getStageWeather per-stage speed+pause)
- apps/api/src/stages/stages.service.test.ts (modifié — +12 tests speed/pause/weather)
- apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx (modifié — dialogs enrichis, StageDepartureInput supprimé)
- apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.test.tsx (modifié — +3 tests nouveaux champs)
- apps/web/src/app/(app)/map/[id]/_components/map-view.tsx (modifié — +defaultSpeedKmh prop)
- apps/web/src/components/shared/stage-card.tsx (modifié — +ligne 4 ETA planning avec pause)
- apps/web/src/components/shared/stage-card.test.tsx (modifié — +5 tests ETA planning)
