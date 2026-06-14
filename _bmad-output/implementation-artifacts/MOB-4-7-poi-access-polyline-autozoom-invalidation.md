# Story MOB-4.7 : POI Access Routing — polyline carte, auto-zoom & invalidation

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur planifiant**,
I want **voir l'itinéraire d'accès tracé sur la carte et qu'il reste à jour**,
So that **je visualise concrètement le détour vers un hébergement**.

> **Dépend de MOB-4.6** (hook `use-access`, `selectedVariantIndex` lifté à l'écran carte) **et MOB-4.1** (carte + caméra). Cette story porte la **polyline d'accès sur la carte** (variante sélectionnée + variantes « fantômes »), l'**auto-zoom** sur le bbox accès+trace, l'**unicité** (une seule polyline à la fois) et l'**invalidation** des accès quand la trace change.
>
> **La géométrie provient de la MÊME query `use-access`** (`['poi-access', poiId, origin]`) que MOB-4.6 — **un seul fetch** partagé entre fiche et carte. **Précompute + invalidation backend déjà livrés** (BullMQ) — mobile **consomme** et **re-fetch** (pas de websocket/push).

## Acceptance Criteria

1. **Given** un POI dont l'itinéraire d'accès est disponible (`status === 'ok'`, `variants`)
   **When** je le sélectionne (tap pin / ouverture fiche)
   **Then** la **polyline de la variante sélectionnée** s'affiche **au-dessus de la trace principale**, style **magenta `#e6007e` pointillé** (`[2,2]`) avec un casing blanc, et les autres variantes en **« fantômes » gris pointillés** (`#9ca3af`, opacité ~0.55) tapables (FR-PA-007)
   **And** la carte effectue un **auto-zoom** (`fitBounds`, padding ~40, durée ~500 ms) sur le **bbox englobant toutes les variantes**, **une seule fois** par jeu de variantes (FR-PA-009)

2. **Given** une polyline d'accès affichée
   **When** je tape sur **un autre POI** ou **en dehors**
   **Then** une **seule polyline d'accès est visible à la fois** : un autre POI la remplace, un clic extérieur / fermeture de fiche la **masque** (FR-PA-008)
   **And** taper une variante **fantôme** la sélectionne (met à jour `selectedVariantIndex`, synchronisé avec les chips de la fiche MOB-4.6)

3. **Given** une variante sélectionnée dans la fiche (chips MOB-4.6)
   **When** je change de variante
   **Then** la **polyline** affichée change en conséquence (sélection **partagée** via `selectedVariantIndex` lifté écran) — fiche et carte restent synchronisées

4. **Given** une **modification de trace** (ajout/suppression/remplacement de segment) ou de profil
   **When** elle est appliquée
   **Then** les itinéraires d'accès rattachés sont **invalidés** côté client (invalidation des queries `['poi-access', …]`) et re-calculés à la prochaine consultation (FR-PA-015/016/017 ; le recompute d'arrière-plan est backend) — la polyline obsolète n'est pas conservée

5. **Given** un changement de **thème** (light/dark) qui recharge le style de carte
   **When** il survient
   **Then** la polyline d'accès est **ré-appliquée** (les couches custom détruites par un reload de style sont reconstruites — robustesse `styledata`), sans doublon

## Tasks / Subtasks

- [ ] **T1 — `components/poi-access/access-map-layer.tsx`** (AC: 1, 2, 5)
  - [ ] Source GeoJSON `poi-access-source` = `FeatureCollection` (une feature par variante, `properties.idx`). 3 couches (bas→haut), parité web :
    - `poi-access-ghost` — variantes non sélectionnées : gris `#9ca3af`, width 3, **dasharray [2,2]**, opacité 0.55, **tapable → onSelect(idx)**.
    - `poi-access-casing` — casing blanc `#ffffff` sous la sélection, width 7, opacité 0.9.
    - `poi-access-line` — variante sélectionnée : **magenta `#e6007e`**, width 4, **dasharray [2,2]**, opacité 1, cap/join round.
  - [ ] **Insérée au-dessus de la trace, sous les pins POI** (ordre des couches MapLibre — `aboveLayerID`/`belowLayerID` selon l'API RN). Une **seule** polyline sélectionnée via filtre `idx` (`setFilter`/`filter` prop), update par `setData` (pas remove/add).
  - [ ] **Robustesse reload style (AC5)** : ré-appliquer source+couches sur `styledata`/reload (MapLibre RN détruit les couches custom au changement de style). Teardown idempotent (try/catch — la carte peut être démontée).
  - [ ] Géométrie : `AccessVariant.geometry` (GeoJSON `LineString|MultiLineString`, `[lon,lat]`). Concaténer/normaliser MultiLineString.

- [ ] **T2 — Auto-zoom (fitBounds once)** (AC: 1)
  - [ ] Calculer le **bbox englobant toutes les variantes** (`computeBounds(variants)`), `camera.fitBounds(ne, sw, padding≈40, duration≈500)`. **Une seule fois par jeu de variantes distinct** (`lastZoomedRef`, parité web). En Planning, `fitOnShow=true`.
  - [ ] Réutiliser/factoriser la logique de fit de MOB-4.1 (`computeTraceBounds`/`computeBoundingBox`), étendue aux coords d'accès.

- [ ] **T3 — Branchement écran carte + unicité** (AC: 1, 2, 3)
  - [ ] La géométrie vient de `useAccess(selectedPoiId, { type:'nearest-trace' })` (**même query** que MOB-4.6). Monter `<AccessMapLayer variants selectedIndex onSelect fitOnShow />` dans le `MapView`, piloté par `selectedPoiId` + `selectedVariantIndex` **liftés écran** (MOB-4.2/4.6).
  - [ ] **Unicité (AC2)** : `selectedPoiId === null` (fiche fermée / clic extérieur) → pas de polyline. Changer de POI → la query change → nouvelle polyline (l'ancienne disparaît). Tap variante fantôme → `setSelectedVariantIndex(idx)` (synchronise les chips fiche).
  - [ ] Reset `selectedVariantIndex = 0` au changement de `selectedPoiId`.

- [ ] **T4 — Invalidation client sur changement de trace** (AC: 4)
  - [ ] Après toute **mutation de trace** (upload/suppression/remplacement/réordre de segment — hooks `use-segments` existants) **et** retour sur la carte, **invalider** les queries `['poi-access']` (ex. `queryClient.invalidateQueries({ queryKey: ['poi-access'] })`) pour forcer un recompute à la prochaine consultation. Documenter que le **recompute d'arrière-plan est backend** (BullMQ) — mobile ne fait que re-fetch.
  - [ ] Brancher l'invalidation au bon endroit (au montage de la carte si la trace a changé, ou dans les `onSuccess` des mutations segments si l'app est sur la carte). Éviter une invalidation en boucle (cf. leçon « cascading invalidation storm » MOB-3.5) — invalider **ciblé** `['poi-access']`, pas tout.

- [ ] **T5 — i18n + a11y** (AC: 1, 2)
  - [ ] Pas/peu de chaînes (carte). Label a11y pour la polyline/variantes fantômes (`pois.access.polylineA11y`, `pois.access.ghostVariantA11y`). Parité FR/EN.

- [ ] **T6 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5)
  - [ ] `computeBounds(variants)` (pur) : bbox correct sur LineString/MultiLineString multi-variantes.
  - [ ] `access-map-layer` (avec mock MapLibre) : 3 couches construites ; filtre `idx` = variante sélectionnée ; tap ghost → `onSelect(idx)` ; ré-application sur `styledata` (pas de doublon).
  - [ ] Écran carte : `selectedPoiId=null` → pas de polyline ; changement POI → remplace ; changement `selectedVariantIndex` → la couche sélectionnée suit.
  - [ ] Invalidation : une mutation segment → `invalidateQueries(['poi-access'])` appelé (ciblé, pas global). Pas de boucle.
  - [ ] Gate : `test|typecheck|lint` verts + `expo export` OK.

- [ ] **T7 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4, 5) — ⏳ build Dev Client
  - [ ] Sélectionner un hôtel → polyline magenta + casing + fantômes gris, auto-zoom une fois.
  - [ ] Tap autre POI → l'ancienne polyline disparaît, nouvelle apparaît. Clic extérieur / fermer fiche → masquée.
  - [ ] Changer de variante (chips fiche) → la polyline suit. Tap variante fantôme → devient sélectionnée + chips synchro.
  - [ ] Ajouter/supprimer un segment puis rouvrir un POI → accès recalculé (pas l'ancien). Basculer thème → polyline réaffichée sans doublon.

## Dev Notes

### Géométrie & couches (référence web → MapLibre Native)

- `AccessMapLayer.tsx` (web) : source `poi-access-source` (1 feature/variante, `properties.idx`), 3 couches `ghost`/`casing`/`line`. **Sélection unique** via `setFilter` sur `idx` ; `setData` pour update. Insérée **avant la 1ʳᵉ couche de pins** (entre trace et pins). `fitBounds(computeBounds(variants), { padding:40, duration:500 })` **une fois** (`lastZoomedRef`). Ré-applique sur `styledata` (reload style détruit les couches custom). [Source: apps/web/src/components/poi-access/AccessMapLayer.tsx]
- **Couleur ligne sélectionnée = magenta `#e6007e`** (l'archi disait amber `#f59e0b` — le **code actuel est magenta**, cohérent avec l'accent des chips MOB-4.6). Ghost gris `#9ca3af` dash [2,2] op .55 ; casing blanc width 7. [Source: rapport agent §7]
- Géométrie = **GeoJSON** (pas polyline encodée), coords `[lon,lat]`, `LineString|MultiLineString` (le segment divergent peut être fragmenté), simplifiée serveur (~5 m). [Source: packages/shared/src/schemas/poi-access.ts:55-65]
- **`LiveAccessPolyline.tsx`** (web) = wrapper `useAccess` + `AccessMapLayer fitOnShow=false` (la caméra GPS pilote en Live). Ici Planning → `fitOnShow=true`. (Live = epic MOB-5.)

### Sélection partagée (fiche ↔ carte)

- `selectedVariantIndex` est **lifté à l'écran carte** (déjà introduit en MOB-4.6) et passé **à la fois** à `AccessMetrics` (chips) et `AccessMapLayer` (polyline) → synchro garantie. Reset au changement de POI. [Source: apps/web map-view.tsx ; rapport agent §6-7]

### Invalidation (backend déjà câblé — mobile re-fetch)

- Backend : `@OnEvent('adventure.trace-updated')` réinitialise l'accès **pour toute l'aventure** (origine `nearest-trace` = trace fusionnée) + re-enqueue (segment ajouté/supprimé). `adventure.profile-changed` idem (même si le profil n'affecte plus le routage). Invalidation version = lazy (`ACCESS_ENGINE_VERSION` vérifié au cache-hit). [Source: apps/api/src/pois/access-worker/access-worker.service.ts ; rapport agent §8]
- **Pas de push/websocket** → mobile invalide `['poi-access']` après une mutation de trace et re-fetch. Un 1ᵉʳ accès post-changement peut être `computed-fresh` (lent) → skeleton MOB-4.6 tient. **Invalidation ciblée** `['poi-access']` (éviter la tempête d'invalidation, leçon MOB-3.5).

### Réutilisation du code mobile existant

- **MOB-4.6** : `use-access` (query partagée), `selectedVariantIndex` lifté, `AccessVariant`/`AccessResponse` (`@ridenrest/shared`).
- **MOB-4.1** : `map-canvas` (children/caméra), `computeBoundingBox` (`@ridenrest/gpx`) pour le bbox, helpers fit.
- **MOB-4.2** : `selectedPoiId` lifté, `poi-detail-sheet` (fermeture → masque polyline).
- `src/hooks/use-segments.ts` (mutations trace → déclencheur d'invalidation). `@tanstack/react-query` (`useQueryClient.invalidateQueries`).

### Conventions

- Couleurs polyline = inline / expressions MapLibre. Ré-appliquer sur `styledata`. Invalidation **ciblée**. Tests hors `src/app/`, `userEvent`, mock MapLibre. i18n FR/EN parité.

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/components/poi-access/access-map-layer.tsx
+ tests co-localisés (access-map-layer, computeBounds, invalidation)
```
**Modifs** :
```
apps/mobile/src/app/(app)/map/[id].tsx   (monter AccessMapLayer, unicité, auto-zoom, invalidation trace)
apps/mobile/src/lib/i18n/locales/fr.json + en.json (labels a11y polyline)
```
**Aucune** migration DB / modif serveur.

### Frontière de story

- **Inclus** : polyline magenta + casing + fantômes gris tapables, auto-zoom once, unicité (1 polyline), synchro `selectedVariantIndex` fiche↔carte, invalidation client `['poi-access']` sur changement de trace, robustesse reload style. i18n a11y, tests.
- **Exclu** : fiche/métriques/variantes (MOB-4.6) ; precompute/invalidation backend (déjà serveur) ; Live (camera GPS, `fitOnShow=false`) → **MOB-5** ; profil de routage (obsolète).

### References

- [Source: epics-mobile.md#Story MOB-4.7 (l.840-863)] — AC d'origine (FR-PA-007/008/009/014/015/016/017)
- [Source: apps/web/src/components/poi-access/AccessMapLayer.tsx, LiveAccessPolyline.tsx] — couches/polyline/fitBounds à porter
- [Source: packages/shared/src/schemas/poi-access.ts:55-92] — `AccessVariant.geometry` GeoJSON `[lon,lat]`
- [Source: apps/api/src/pois/access-worker/access-worker.service.ts] — invalidation backend (trace-updated)
- [Source: architecture-poi-access-routing.md] — architecture (polyline = couleur actuelle magenta vs amber doc)
- [Source: _bmad-output/implementation-artifacts/MOB-4-6-poi-access-routing-sheet-profile.md] — `use-access` + `selectedVariantIndex` (dépendance)
- [Source: _bmad-output/implementation-artifacts/MOB-4-1-maplibre-native-trace-themes-attribution.md] — caméra/bbox/fit

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-13 | 0.1 | Création story MOB-4.7 (ready-for-dev) — `access-map-layer` (3 couches : ghost gris pointillé tapable / casing blanc / ligne magenta `#e6007e` pointillée), auto-zoom `fitBounds` once sur bbox variantes, unicité (1 polyline), synchro `selectedVariantIndex` fiche↔carte, invalidation client ciblée `['poi-access']` sur mutation de trace, robustesse reload style (`styledata`). Géométrie partagée via `use-access`. i18n a11y FR/EN, tests. | bmad-create-story (Story Context Engineer) |
