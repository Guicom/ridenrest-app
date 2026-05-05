# Story 17.12: Mise à jour automatique de la date de fin d'aventure depuis la dernière étape

Status: review

> **Ajouté 2026-05-05** — Story de l'Epic 17 (Quality of Life). Objectif : proposer automatiquement une mise à jour de `adventure.endDate` après toute modification des étapes (création, modification, suppression) ou du changement de vitesse globale, dès que la date d'arrivée à la dernière étape est calculable. L'utilisateur confirme ou refuse via une dialog shadcn/ui. Dépend de 17.7 (per-stage departureTime + etaMinutes).

## Story

As a **cyclist planning a multi-day adventure**,
I want the adventure's end date to be automatically proposed when I create, modify, or delete a stage,
so that my adventure timeline stays in sync with my stage planning without manual entry.

## Acceptance Criteria

1. **Given** une aventure avec au moins une étape, et que la dernière étape (par `orderIndex` le plus élevé) a un `departureTime` et un `etaMinutes` définis,
   **When** l'utilisateur crée, modifie ou supprime une étape,
   **Then** une dialog de confirmation s'affiche avec la date de fin calculée : "Mettre à jour la date de fin à [date] ?" avec les boutons "Mettre à jour" et "Ignorer".

2. **Given** la dernière étape n'a pas de `departureTime` (OU n'a pas d'`etaMinutes`),
   **When** une opération de stage est effectuée,
   **Then** aucune dialog n'est affichée (impossible de calculer la date).

3. **Given** la dialog est affichée avec une date calculée,
   **When** l'utilisateur clique "Mettre à jour",
   **Then** `PATCH /adventures/:id` est appelé avec `{ endDate: "YYYY-MM-DD" }`, la date de fin est mise à jour, les queries `['adventures', adventureId]` et `['adventures']` sont invalidées, et la dialog se ferme.

4. **Given** la dialog est affichée,
   **When** l'utilisateur clique "Ignorer",
   **Then** la dialog se ferme sans modification de `adventure.endDate`.

5. **Given** l'utilisateur modifie la vitesse globale (`avgSpeedKmh`) de l'aventure via le champ dans `map-view.tsx`,
   **When** la mutation `updateAdventureAvgSpeedKmh` réussit (ce qui recalcule tous les `etaMinutes` côté API),
   **Then** après invalidation des stages, si la date est calculable, la même dialog de confirmation est affichée.

6. **Given** la date calculée est identique à `adventure.endDate` déjà définie,
   **When** les conditions ci-dessus sont remplies,
   **Then** aucune dialog n'est affichée (pas de changement).

7. **Given** la dialog est affichée,
   **When** l'utilisateur ferme la dialog en cliquant en dehors ou via Échap,
   **Then** comportement identique à "Ignorer" (AC #4).

8. **Given** une aventure avec `startDate` < aujourd'hui et `endDate` >= aujourd'hui (aventure en cours),
   **When** la liste des aventures s'affiche,
   **Then** cette aventure apparaît dans "À venir / En cours" et **non** dans "Aventures passées". La date de référence pour classer dans "passées" est `endDate` si définie, sinon `startDate`.

## Algorithme de calcul — `computeEndDateFromStages`

```typescript
function computeEndDateFromStages(stages: AdventureStageResponse[]): string | null {
  if (stages.length === 0) return null
  const sorted = [...stages].sort((a, b) => a.orderIndex - b.orderIndex)
  const last = sorted.at(-1)!
  if (!last.departureTime || !last.etaMinutes) return null
  const arrival = new Date(new Date(last.departureTime).getTime() + last.etaMinutes * 60 * 1000)
  return arrival.toISOString().split('T')[0] // format YYYY-MM-DD (date locale UTC)
}
```

**Règles critiques :**
- Seule la **dernière étape** (orderIndex max) est utilisée — pas de chaînage inter-étapes
- Si `departureTime` ou `etaMinutes` est `null` → retourne `null` (AC #2)
- `etaMinutes` inclut déjà le temps de pause (calculé lors du createStage/updateStage côté API)
- Le format retourné `YYYY-MM-DD` est compatible avec la colonne DB `date('end_date')` et le champ `<input type="date">`

## Tasks / Subtasks

### Review Findings

- [x] [Review][Patch] Les aventures sans `startDate` mais avec `endDate` passée restent classées dans "À venir / En cours" [apps/web/src/app/(app)/adventures/_components/adventure-list.tsx:68]

### Phase 1 — Utilitaire de calcul

- [x] Task 1 — Créer la fonction `computeEndDateFromStages` (AC: #1, #2, #6)
  - [x] 1.1 — Créer `apps/web/src/lib/compute-end-date.ts` avec la fonction exportée et son type
  - [x] 1.2 — Écrire les tests unitaires Vitest co-localisés `compute-end-date.test.ts` :
    - stages vide → null
    - dernier stage sans departureTime → null
    - dernier stage sans etaMinutes → null
    - dernier stage avec departureTime + etaMinutes → date correcte
    - résultat égal à endDate actuelle → détecté par le hook (pas dans l'utilitaire)

### Phase 2 — Hook `useEndDateSync`

- [x] Task 2 — Créer le hook `useEndDateSync` (AC: #3, #4, #6)
  - [x] 2.1 — Créer `apps/web/src/hooks/use-end-date-sync.ts`
  - [x] 2.2 — Interface du hook :
    ```typescript
    interface UseEndDateSyncResult {
      proposedDate: string | null   // date à proposer, null si dialog fermée ou pas calculable
      confirmUpdate: () => Promise<void>  // appelle updateAdventureEndDate + invalide queries
      dismiss: () => void           // ferme sans action
    }
    function useEndDateSync(
      adventureId: string,
      stages: AdventureStageResponse[],
      currentEndDate: string | null,
    ): UseEndDateSyncResult
    ```
  - [x] 2.3 — Logique interne :
    - `useState<string | null>(null)` pour `proposedDate`
    - `expose` une fonction `triggerCheck()` appelée par le parent après mutation success
    - `triggerCheck()` appelle `computeEndDateFromStages(stages)`, si résultat ≠ `null` et ≠ `currentEndDate` → `setProposedDate(result)`
    - `confirmUpdate()` : appelle `updateAdventureEndDate(adventureId, proposedDate)` → invalide `['adventures', adventureId]` et `['adventures']` → `setProposedDate(null)`
    - `dismiss()` : `setProposedDate(null)`
    - **Attention** : l'appel `triggerCheck()` doit utiliser les stages **après** leur invalidation (stages re-fetchés). Utiliser `useEffect` sur les stages dans le hook n'est PAS adapté car il se déclencherait au chargement initial. La méthode `triggerCheck()` est appelée explicitement depuis le `onSuccess` de chaque mutation.

### Phase 3 — Composant `EndDateSyncDialog`

- [x] Task 3 — Créer le composant dialog (AC: #3, #4, #7)
  - [x] 3.1 — Créer `apps/web/src/components/shared/end-date-sync-dialog.tsx`
  - [x] 3.2 — Utiliser `AlertDialog` de shadcn/ui (`@/components/ui/alert-dialog`) déjà disponible dans le projet
  - [x] 3.3 — Props
  - [x] 3.4 — Texte : "La dernière étape arrive le **[date FR]**. Voulez-vous mettre à jour la date de fin de l'aventure ?"
  - [x] 3.5 — Formater la date en français : `toLocaleDateString('fr-FR', ...)`
  - [x] 3.6 — Boutons : "Mettre à jour" (primary) + "Ignorer" (outline)
  - [x] 3.7 — `open={!!proposedDate}` — contrôlé par le prop
  - [x] 3.8 — `onOpenChange` : si fermé (clic extérieur / Échap) → appeler `onDismiss`

### Phase 4 — Intégration dans `sidebar-stages-section.tsx` (planning mode)

- [x] Task 4 — Wirer dans le panneau étapes planning (AC: #1, #2, #3, #4)
  - [x] 4.1 — `useStages` est appelé dans `map-view.tsx` (pas dans `sidebar-stages-section.tsx`) — intégration faite dans `map-view.tsx`
  - [x] 4.2 — `adventure.endDate` disponible via `adventure?.endDate` dans `map-view.tsx`
  - [x] 4.3 — `useStages` avec `onAfterChange: triggerCheck` dans `map-view.tsx`
  - [x] 4.4 — `useEndDateSync(adventureId, adventure?.endDate ?? null)` instancié dans `map-view.tsx`
  - [x] 4.5 — `onAfterChange` câblé via `use-stages.ts` options
  - [x] 4.6 — `<EndDateSyncDialog>` rendu dans `map-view.tsx`

### Phase 5 — Intégration dans `map-view.tsx` (changement vitesse globale)

- [x] Task 5 — Wirer dans map-view pour le changement de vitesse (AC: #5)
  - [x] 5.1 — Modifié `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`
  - [x] 5.2 — Stages disponibles via `useStages` déjà dans `map-view.tsx`
  - [x] 5.3 — `triggerCheck()` appelé dans `avgSpeedMutation.onSuccess` après refetch
  - [x] 5.4 — `await queryClient.refetchQueries({ queryKey: ['adventures', adventureId, 'stages'] })` avant `triggerCheck()` — timing correct
  - [x] 5.5 — `<EndDateSyncDialog>` rendu dans `map-view.tsx`

### Phase 6 — Modification de `use-stages.ts`

- [x] Task 6 — Ajouter le callback `onAfterChange` (supporté par Tasks 4 et 5)
  - [x] 6.1 — Modifié `apps/web/src/hooks/use-stages.ts` : `onAfterChange?: () => void` + `refetchQueries` (attend completion) + appel callback

## Dev Notes

### Fichiers à créer
- `apps/web/src/lib/compute-end-date.ts` — utilitaire pur, testable isolément
- `apps/web/src/lib/compute-end-date.test.ts` — tests Vitest
- `apps/web/src/hooks/use-end-date-sync.ts` — hook React
- `apps/web/src/components/shared/end-date-sync-dialog.tsx` — composant shadcn

### Fichiers à modifier
- `apps/web/src/hooks/use-stages.ts` — ajout `onAfterChange` callback
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` — intégration hook + dialog
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — intégration pour avgSpeedKmh

### Aucun changement DB ni API
- `adventure.endDate` existe déjà (schema adventures.ts ligne 21)
- `adventure_stages.departureTime` et `etaMinutes` existent déjà (schema adventure-stages.ts)
- `updateAdventureEndDate` existe dans `apps/web/src/lib/api-client.ts` (ligne 161)
- `PATCH /adventures/:id` gère déjà `{ endDate }` dans `UpdateAdventureDto`

### Patterns existants à suivre
- shadcn `AlertDialog` : déjà utilisé dans `adventure-detail.tsx` (lignes 44-52 imports) — même pattern pour `end-date-sync-dialog.tsx`
- Format date FR : pattern identique à `adventure-card.tsx` (ligne 53) — `new Date(date + 'T00:00:00').toLocaleDateString('fr-FR')`
- Query invalidation : `queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })` + `['adventures']` (pattern identique à `endDateMutation.onSuccess` dans `adventure-detail.tsx` lignes 176-177)
- `useMutation` + `onSuccess` invalidation : même pattern que `use-stages.ts` existant

### Attention — timing post-invalidation (AC #5)
Lors du changement de vitesse globale, les ETAs sont recalculés côté API (`recomputeAllEtasForAdventure` dans `stages.service.ts`). Les stages en cache TanStack Query sont périmés jusqu'à la re-fetch. Pour obtenir les stages avec ETAs à jour avant d'appeler `computeEndDateFromStages`, s'assurer que la re-fetch est complète :
```typescript
// dans avgSpeedMutation.onSuccess
await queryClient.invalidateQueries({ queryKey: ['adventures', adventureId, 'stages'] })
// TanStack Query invalide + re-fetche si la query est active (composant monté)
// Récupérer les stages frais depuis queryClient.getQueryData ou utiliser useStages
```
Alternative plus simple : utiliser `useStages` dans `map-view.tsx` si pas déjà importé, et accéder aux stages après invalidation via le state réactif.

### Note sur la clé query stages
Incohérence dans le codebase : `use-stages.ts` utilise `['adventures', adventureId, 'stages']` mais `map-view.tsx` invalide `['stages', adventureId]`. Utiliser la clé de `use-stages.ts` (`['adventures', adventureId, 'stages']`) comme référence canonique. Vérifier et corriger l'invalidation dans `map-view.tsx` si nécessaire (line 211).

### Testing
- Vitest pour `compute-end-date.ts` (pur, sans React)
- Pas de test E2E requis pour cette story (comportement non-bloquant, dialog optionnelle)
- S'assurer que les tests existants dans `adventure-detail.test.tsx` et `adventure-card.test.tsx` ne sont pas cassés

### Project Structure Notes
- Pas de changement de routing ni de page
- Nouveau composant dans `components/shared/` (pattern établi pour `stage-card.tsx`)
- Nouvel utilitaire dans `lib/` (pattern établi pour `api-client.ts`)
- Nouveau hook dans `hooks/` (pattern établi pour `use-stages.ts`, `use-stage-weather.ts`)

### References
- [Source: packages/database/src/schema/adventure-stages.ts] — `departureTime: timestamp`, `etaMinutes: integer`
- [Source: packages/database/src/schema/adventures.ts:21] — `endDate: date('end_date')`
- [Source: apps/web/src/lib/api-client.ts:161] — `updateAdventureEndDate`
- [Source: apps/api/src/stages/stages.service.ts:41-45] — `computeEtaMinutes` (etaMinutes inclut pauseHours)
- [Source: apps/web/src/hooks/use-stages.ts] — mutations create/update/delete stages
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:207-215] — `avgSpeedMutation`
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx:173-177] — pattern `endDateMutation` + invalidation

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Décision d'implémentation : `triggerCheck` lit depuis `queryClient.getQueryData` (cache TanStack Query) après `refetchQueries` → timing garanti sans race condition
- Fix bonus : clé query stages corrigée dans `avgSpeedMutation.onSuccess` — `['stages', adventureId]` → `['adventures', adventureId, 'stages']`
- L'intégration a été faite dans `map-view.tsx` (qui appelle `useStages`) plutôt que dans `sidebar-stages-section.tsx` (qui reçoit stages via props) — plus propre architecturalement
- Correctif AC#8 : classement "aventures passées" utilise désormais `endDate` comme date de référence (si définie) — une aventure en cours (startDate passé, endDate futur) reste dans "à venir"
- 83 fichiers de test, 991 tests — zéro régression

### File List

- `apps/web/src/lib/compute-end-date.ts` (créé)
- `apps/web/src/lib/compute-end-date.test.ts` (créé)
- `apps/web/src/hooks/use-end-date-sync.ts` (créé)
- `apps/web/src/hooks/use-stages.ts` (modifié — `onAfterChange` + `refetchQueries`)
- `apps/web/src/hooks/use-stages.test.ts` (modifié — mock refetchQueries + nouveaux tests)
- `apps/web/src/components/shared/end-date-sync-dialog.tsx` (créé)
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` (modifié — `useEndDateSync` + `EndDateSyncDialog` + fix query key)
- `apps/web/src/app/(app)/adventures/_components/adventure-list.tsx` (modifié — correctif classement "passées" basé sur endDate)
