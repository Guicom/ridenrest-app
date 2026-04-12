# Deferred Work

## Deferred from: code review of 17-1-versioning-app-release-notes-popup.md (2026-04-09)

- Règle webpack `CHANGELOG.md asset/source` non portée vers Turbopack — import cassé en mode dev Turbopack (`next.config.ts:12-18`)
- Labels français codés en dur dans les composants release notes — non actionnable sans i18n (`release-notes-dialog.tsx`, `about-section.tsx`)
- Comportement multi-onglets : `localStorage` mis à jour dans un onglet mais autre onglet garde `showReleaseNotes=true` — hors périmètre story (`use-release-notes.ts`)

## Deferred from: code review of story 16-31-booking-url-region-country-enrichment.md (2026-04-08)

- Champs `GooglePlaceDetails.adminArea`/`country` extraits côté API mais non utilisés pour l’URL Booking web : aligné avec le choix Geoapify pour des noms compatibles Booking ; réutilisation future possible.

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

## Deferred from: code review of story 16-30 (2026-04-08)

- `shelter: ['lodging']` dans `GOOGLE_PLACE_TYPES` — entry morte, `mapGoogleTypesToCategory` ne retourne jamais `'shelter'`. Google Places n'a pas de type shelter — c'est OSM/Overpass only.
- 16 requêtes parallèles par recherche accommodations — risque QPS théorique. Prévu par la spec ($0 IDs Only tier), à monitorer si throttling observé.
- Test dedup mock seulement 2/16 fetches — les 14 autres reject silencieusement via `Promise.allSettled`. Coverage partielle mais fonctionnelle.
- `GOOGLE_PLACE_TYPES` et `mapGoogleTypesToCategory` — deux sources de vérité dupliquées pour le même mapping, risque de drift. Refacto candidat.
- `food` type dans `GOOGLE_PLACE_TYPES.restaurant` mais absent de `LAYER_GOOGLE_TYPES.restaurants` — places typées `food` jamais fetchées.
- `GOOGLE_PLACE_TYPES` exporté mais inutilisé en runtime — dead code à usage documentaire.

## Deferred from: code review of 17-4-elevation-loss-d-minus-everywhere (2026-04-09)

- W1 — Backfill `backfill-elevation-loss.service.ts` sans pagination : charge N segments en mémoire sans limite. Acceptable pour backfill one-shot ; à adresser si dataset devient très large.
- W2 — `totalElevationLossM` requis dans `AdventureMapResponse` mais optionnel dans `AdventureResponse` : asymétrie héritée du pattern `totalElevationGainM` existant. À uniformiser lors d'une refonte des types partagés.
- W3 — `use-elevation-profile.ts` : cas `deltaM = 0` avec `deltaEle ≠ 0` (waypoints superposés horizontalement) non géré. Pre-existing edge case présent aussi pour D+.

## Deferred from: code review of 17-6-live-filter-stage-badges.md (2026-04-09)

- Scroll redéclenché à chaque tick GPS si accordéon ouvert — `useEffect([stagesExpanded, currentKmOnRoute])` appelle `scrollIntoView` à chaque update GPS ; pattern hérité de la spec, peut être agaçant en navigation active (`live-filters-drawer.tsx`, `live-stages-section.tsx`).
- ETA NaN avec données corrompues — `etaFromCurrentMinutes` peut être NaN si `endKm < currentKmOnRoute` pour une étape non-passée ; `NaN != null` vrai en JS, `formatEta(NaN)` affiche `—` avec ligne ETA visible (`stage-card.tsx`).
- `currentKmOnRoute` hors plage sans clamp dans le store — ETA aberrante possible pour valeur négative ou > longueur trace. Pré-existant (`live.store.ts`).
- Boutons edit/delete sans `type="button"` dans `StageCard` — soumission form involontaire si rendu dans un `<form>`. Pré-existant (`stage-card.tsx`).
- `Switch` dans un `button` — accessibilité clavier/SR complexe, pattern hérité du design du drawer (`live-filters-drawer.tsx`).

## Deferred from: code review of 17-5-stage-cartouche-redesign-planning-live (2026-04-09)

- Boutons edit/delete dans `StageCard` visibles même sans callbacks `onEdit`/`onDelete` (actions sans effet) — pré-existant, design pattern du composant, non critique.
- Libellés `fr-FR` en dur dans `formatStageDeparture` et `formatEta` — incohérent si l'app devient multilingue, mais hors scope story 17.5.
- Badge météo sur cartouches étapes désactivé (D1) — décision produit : le layer météo carte est suffisant, pas de météo sur les cartouches.
- Badge météo absent en live mode (D3) — décision produit : voulu, le layer météo carte suffit en live.

## Deferred from: code review of 17-7-stage-per-stage-speed-pause-eta (2026-04-12)

- `recomputeAllEtasForAdventure` préserve les speedKmh per-stage sans documentation explicite dans le JSDoc — comportement intentionnel mais surprise pour un lecteur. Ajouter un commentaire de fonction expliquant le fallback par étape.
- Égalité flottante `speed !== defaultSpeedKmh` sans epsilon dans `handleNamingConfirm` — peut créer des overrides parasites selon arrondis JS/locale. Impact UX mineur, refactor UX séparé recommandé.
