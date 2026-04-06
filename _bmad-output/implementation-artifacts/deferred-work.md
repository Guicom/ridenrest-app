# Deferred Work

## Deferred from: code review of story 16-24 (2026-04-06)

- First-render visual inconsistency: header shows raw `targetAheadKm` before `useEffect` clamp fires (pre-existing from story 16.20, `live-controls.tsx:58`)
- Negative `maxAheadKm` possible from `page.tsx` when GPS overshoots trace end — already guarded by `Math.max(SLIDER_STEP, ...)` but semantically misleading (pre-existing, `page.tsx:198`)
- One-frame window where store `targetAheadKm` exceeds `effectiveMax` after max shrinks — if search triggered during that frame, corridor extends past route end (pre-existing from story 16.20, `live-controls.tsx:44-48`)

## Deferred from: code review of story 16-25 (2026-04-06)

- `toBeDefined()` pattern on `getByText` results — should be `toBeInTheDocument()` for meaningful assertions. Pre-existing pattern across all test files, not specific to story 16.25.
- `defaultSpeedKmh` prop silently overwrites `speedKmh` in store on first drawer close without modification. `localSpeed` is initialized from `defaultSpeedKmh ?? speedKmh`, so closing the drawer writes the adventure default rather than the user's stored preference. Pre-existing from `handleApply`, extended to `handleClose` by story 16.25.

## Deferred from: code review of story 16-27 (2026-04-06)

- Bouton X (close) visuellement actif mais silencieusement ignoré pendant un upload en cours — pas de feedback visuel pour l'utilisateur. Amélioration UX à considérer : soit désactiver visuellement le X, soit afficher un tooltip/toast expliquant que l'upload est en cours.

## Deferred from: code review of story 16-29 (2026-04-06)

- Planning `map-canvas.tsx` duplique `addDensityLayer`/`removeDensityLayer`/`DENSITY_COLORS` localement (~85 lignes) au lieu d'utiliser `density-layer.ts` partagé — les deux copies vont diverger.
- `buildDensityColoredFeatures` : le dernier chunk d'un segment peut être skip si `tronconWaypoints.length < 2`, et le matching par epsilon (`< 0.01`) entre chunks client et gaps serveur est fragile.
- Logique dérivée (needsCalculation/isAnalyzing/isDone + useMutation pattern) dupliquée identiquement dans `SidebarDensitySection` et `LiveFiltersDrawer` — candidat pour extraction dans un hook partagé `useDensityTrigger`.
