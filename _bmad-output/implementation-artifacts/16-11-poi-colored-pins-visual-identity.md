# Story 16.11: POI Visual Identity — Colored Pins par Catégorie et Sous-type

## Story

As a **cyclist planning a long-distance route**,
I want each type of POI (hôtel, camping, refuge, restauration, vélo...) to display a distinct colored pin with its own icon on the map,
So that I can instantly identify the nature of a POI at a glance, and so the filter buttons in the sidebar and live mode match those same colors.

---

## Context & Design Decisions

### Problème actuel
- Tous les pins utilisent la même couleur (`#1A2D22`) quel que soit le type
- Tous les hébergements affichent la même icône 🏨 (même emoji pour hôtel, camping, refuge...)
- Les boutons de filtre sidebar utilisent le vert brand générique

### Objectif
- Chaque `PoiCategory` a son propre pin coloré (cercle coloré + icône PNG blanche)
- Les clusters utilisent le vert brand Ride'n'Rest `#2D6A4A` unifié
- Les boutons de filtre sidebar/live reprennent la couleur du layer
- Les chips de sous-type hébergement utilisent la couleur du sous-type (pas d'icônes)

---

## Couleurs de référence

| Catégorie | Type(s) | Couleur hex |
|---|---|---|
| Hébergement — Hôtel | `hotel` | `#F97316` |
| Hébergement — Camping | `camp_site` | `#38BDF8` |
| Hébergement — Refuge/Abri | `shelter` | `#84CC16` |
| Hébergement — Chambre d'hôte | `guesthouse` | `#EC4899` |
| Hébergement — Auberge jeunesse | `hostel` | `#8B5CF6` |
| Restauration | `restaurant` | `#EF4444` |
| Alimentation | `supermarket`, `convenience` | `#A855F7` |
| Vélo | `bike_shop`, `bike_repair` | `#14B8A6` |
| Clusters (tous layers) | — | `#2D6A4A` (vert brand) |

**Couleur représentative par layer** (boutons de filtre) :

| Layer | Couleur |
|---|---|
| `accommodations` | `#F97316` |
| `restaurants` | `#EF4444` |
| `supplies` | `#A855F7` |
| `bike` | `#14B8A6` |

---

## Approche technique — Pins sur la carte

### Fichiers SVG fournis par Guillaume

Guillaume fournit les **pins complets** (goutte colorée + icône intégrée) en **SVG** à placer dans :
```
apps/web/public/images/poi-icons/
  hotel.svg
  camp-site.svg
  shelter.svg
  guesthouse.svg
  hostel.svg
  restaurant.svg
  supplies.svg
  bike.svg
```

**Specs SVG :**
- Format : SVG (vectoriel — net à toutes résolutions, Retina inclus)
- `viewBox` : `0 0 40 50` recommandé (proportions goutte)
- Fond : **transparent** hors de la forme goutte
- Ancrage : la **pointe de la goutte en bas du viewBox**, sans marge basse

Une seule image par couleur/icône : `bike_shop` et `bike_repair` partagent `bike.svg`, `supermarket` et `convenience` partagent `supplies.svg`.

### Rendu : SVG → `HTMLImageElement` → `map.addImage()`

MapLibre accepte les `HTMLImageElement` dans `addImage()`. Le browser rend le SVG vectoriellement :
```typescript
const img = new Image(40, 50)  // dimensions d'affichage souhaitées
img.src = '/images/poi-icons/hotel.svg'
await img.decode()
map.addImage('poi-pin-hotel', img, { pixelRatio: window.devicePixelRatio ?? 2 })
```

### Mapping fichier → catégories

```typescript
export const CATEGORY_PIN_FILE: Record<PoiCategory, string> = {
  hotel:        'hotel',
  camp_site:    'camp-site',
  shelter:      'shelter',
  guesthouse:   'guesthouse',
  hostel:       'hostel',
  restaurant:   'restaurant',
  supermarket:  'supplies',
  convenience:  'supplies',
  bike_shop:    'bike',
  bike_repair:  'bike',
}
```

### Architecture des layers MapLibre (après refonte)

| Layer | Type | Changement |
|---|---|---|
| `pois-{layer}-clusters` | `circle` | `circle-color: POI_CLUSTER_COLOR` |
| `pois-{layer}-cluster-count` | `symbol` | Inchangé |
| `pois-{layer}-points` | **supprimé** | Remplacé par symbol avec icon-image |
| `pois-{layer}-icons` | **remplacé** | `icon-image: ['get', 'iconImageKey']`, `icon-anchor: 'bottom'` |
| `pois-{layer}-selected-ring` | `circle` | Inchangé (`#2D6A4A`) |

> Les layers `circle` individuels (points) et `symbol` emoji (icons) sont **fusionnés** en un seul layer `symbol`. Moins de layers, rendu plus propre.

---

## Acceptance Criteria

**AC-1 — Pins individuels colorés et iconifiés par sous-type**

**Given** la layer `accommodations` est visible et contient des POIs,
**When** les pins sont rendus sur la carte (planning + live),
**Then** chaque pin affiche un cercle coloré avec icône blanche correspondant à son type (`hotel` → cercle orange + icône lit, `camp_site` → cercle bleu + icône tente, etc.).

**AC-2 — Pins non-hébergement**

**Given** des POIs `restaurants`, `supplies`, `bike` sont affichés,
**When** les pins sont rendus,
**Then** chaque pin affiche la couleur et l'icône de sa catégorie (rouge+fourchette, violet+panier, teal+vélo).

**AC-3 — Clusters : vert brand Ride'n'Rest**

**Given** plusieurs POIs sont regroupés en cluster (quel que soit le layer),
**When** le cluster est rendu,
**Then** le fond est `#2D6A4A` avec le compte en blanc — identique pour tous les layers.

**AC-4 — Boutons de filtre layer colorés (sidebar + live)**

**Given** les 4 boutons "Je cherche" dans la sidebar (ou live drawer),
**When** un layer est actif,
**Then** le fond du bouton utilise la couleur du layer (style inline, pas classe Tailwind dynamique), icône blanche.
**When** un layer est inactif,
**Then** le bouton reste dans son style neutre actuel (fond blanc, bordure, icône sombre).

**AC-5 — Chips sous-type hébergement : couleur + label, sans icône**

**Given** la layer hébergements est active,
**When** les chips de sous-type s'affichent,
**Then** chaque chip active a un fond coloré (couleur du sous-type) avec label blanc.
**And** chaque chip inactive affiche un dot coloré à gauche du label (repère visuel).
**And** aucune icône emoji ou Lucide n'est affichée sur les chips.

**AC-6 — Cohérence planning ↔ live**

**Given** les composants `PoiLayerGrid` et `AccommodationSubTypes` sont partagés,
**When** utilisés dans `live-filters-drawer.tsx`,
**Then** les couleurs sont identiques en mode planning et live sans modification supplémentaire.

**AC-7 — Anneau de sélection inchangé**

**Given** l'utilisateur clique sur un POI,
**When** l'anneau de sélection est affiché,
**Then** il garde la couleur `#2D6A4A` — inchangé.

**AC-8 — Dégradation gracieuse si PNG manquant**

**Given** un fichier PNG n'est pas accessible (erreur de chargement),
**When** les pins tentent de se rendre,
**Then** le pin se rend en cercle coloré sans icône (fallback) — aucune erreur MapLibre visible.

---

## Tasks

### Task 1 — Constantes de couleur dans `packages/shared`

**File :** `packages/shared/src/constants/poi-colors.ts` *(nouveau)*

```typescript
import type { MapLayer, PoiCategory } from '../types'

/** Couleur hex par PoiCategory — source de vérité carte + UI */
export const POI_CATEGORY_COLORS: Record<PoiCategory, string> = {
  hotel:        '#F97316',
  camp_site:    '#38BDF8',
  shelter:      '#84CC16',
  guesthouse:   '#EC4899',
  hostel:       '#8B5CF6',
  restaurant:   '#EF4444',
  supermarket:  '#A855F7',
  convenience:  '#A855F7',
  bike_shop:    '#14B8A6',
  bike_repair:  '#14B8A6',
}

/** Couleur unifiée des clusters — vert brand Ride'n'Rest */
export const POI_CLUSTER_COLOR = '#2D6A4A'

/** Couleur représentative par layer — boutons de filtre sidebar/live */
export const POI_LAYER_COLORS: Record<MapLayer, string> = {
  accommodations: '#F97316',
  restaurants:    '#EF4444',
  supplies:       '#A855F7',
  bike:           '#14B8A6',
}
```

Exporter ces constantes depuis `packages/shared/src/index.ts`.

---

### Task 2 — Créer `poi-pin-factory.ts`

**File :** `apps/web/src/lib/poi-pin-factory.ts` *(nouveau)*

Chargement direct des PNGs complets (pin goutte fourni par Guillaume) — pas de Canvas.

```typescript
import type maplibregl from 'maplibre-gl'
import type { PoiCategory } from '@ridenrest/shared'

/** Mapping PoiCategory → nom du fichier PNG dans /images/poi-icons/ */
export const CATEGORY_PIN_FILE: Record<PoiCategory, string> = {
  hotel:        'hotel',
  camp_site:    'camp-site',
  shelter:      'shelter',
  guesthouse:   'guesthouse',
  hostel:       'hostel',
  restaurant:   'restaurant',
  supermarket:  'supplies',
  convenience:  'supplies',
  bike_shop:    'bike',
  bike_repair:  'bike',
}

/** Clé d'image MapLibre pour une catégorie */
export function poiPinImageKey(category: PoiCategory): string {
  return `poi-pin-${category}`
}

/**
 * Charge les SVGs de pins et les enregistre dans MapLibre.
 * À appeler après map.isStyleLoaded() — idempotent (vérifie hasImage).
 * SVG → HTMLImageElement → map.addImage() : net à toutes résolutions.
 */
export async function registerPoiPinImages(map: maplibregl.Map): Promise<void> {
  const categories = Object.keys(CATEGORY_PIN_FILE) as PoiCategory[]

  await Promise.allSettled(
    categories.map(async (category) => {
      const imageKey = poiPinImageKey(category)
      if (map.hasImage(imageKey)) return  // déjà chargé

      const file = CATEGORY_PIN_FILE[category]
      try {
        const img = await loadSvgImage(`/images/poi-icons/${file}.svg`, 40, 50)
        map.addImage(imageKey, img, { pixelRatio: window.devicePixelRatio ?? 2 })
      } catch {
        // Dégradation gracieuse — pin invisible, pas d'erreur MapLibre
        console.warn(`[poi-pin-factory] Failed to load pin SVG for ${category}`)
      }
    })
  )
}

/** Charge un SVG comme HTMLImageElement aux dimensions spécifiées */
function loadSvgImage(src: string, width: number, height: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(width, height)
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
```

---

### Task 3 — Mettre à jour `use-poi-layers.ts` (planning)

**File :** `apps/web/src/hooks/use-poi-layers.ts`

**Subtask 3a — Imports :**
```typescript
import { POI_CATEGORY_COLORS, POI_CLUSTER_COLOR, POI_LAYER_COLORS } from '@ridenrest/shared'
import { registerPoiPinImages, poiPinImageKey } from '@/lib/poi-pin-factory'
```

**Subtask 3b — Charger les images au montage (dans le `useEffect` principal, avant d'ajouter les layers) :**
```typescript
// Charger les images de pins (une seule fois par style load)
await registerPoiPinImages(map)
// NB: registerPoiPinImages est idempotent (vérifie hasImage avant d'ajouter)
```

> Le `useEffect` existant n'est pas `async`. Wrapper l'appel avec `void registerPoiPinImages(map).then(() => { /* add layers */ })` ou convertir l'effet en pattern avec un flag `mounted`.

**Subtask 3c — Enrichir les features GeoJSON :**
```typescript
properties: {
  id: poi.id,
  externalId: poi.externalId,
  name: poi.name,
  category: poi.category,
  iconImageKey: poiPinImageKey(poi.category),  // 'poi-pin-hotel' etc.
  // SUPPRIMÉ: categoryIcon (plus d'emoji)
}
```

**Subtask 3d — Remplacer les layers `points` + `icons` par un seul layer `symbol` :**

Supprimer :
- Le layer `circle` `pois-{layer}-points`
- Le layer `symbol` `pois-{layer}-icons`

Ajouter à la place (un seul layer symbol par source) :
```typescript
map.addLayer({
  id: pointLayerId,  // réutiliser l'ID existant pour la compatibilité des event handlers
  type: 'symbol',
  source: sourceId,
  filter: ['!', ['has', 'point_count']],
  layout: {
    'icon-image': ['get', 'iconImageKey'],
    'icon-size': 1,
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  },
})
```

**Subtask 3e — Mettre à jour le cluster :**
```typescript
'circle-color': POI_CLUSTER_COLOR,  // '#2D6A4A' — unifié tous layers
```

**Subtask 3f — Nettoyer le cleanup :**
Dans la section cleanup/removeLayer, supprimer la référence à `iconLayerId` (fusionné dans `pointLayerId`).

**Subtask 3g — Supprimer les constantes obsolètes :**
`POI_PIN_COLOR` et `LAYER_ICONS` — vérifier d'abord qu'ils ne sont importés nulle part ailleurs.

---

### Task 4 — Mettre à jour `use-live-poi-layers.ts` (live)

**File :** `apps/web/src/hooks/use-live-poi-layers.ts`

Appliquer exactement les mêmes changements que Task 3. Le hook live a la même architecture de layers.

---

### Task 5 — Mettre à jour `poi-layer-grid.tsx`

**File :** `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.tsx`

```typescript
import { POI_LAYER_COLORS } from '@ridenrest/shared'

const LAYER_CARDS = [
  { layer: 'accommodations', label: 'Hébergements', icon: BedDouble,      color: POI_LAYER_COLORS.accommodations },
  { layer: 'restaurants',    label: 'Restauration',  icon: Utensils,       color: POI_LAYER_COLORS.restaurants },
  { layer: 'supplies',       label: 'Alimentation',  icon: ShoppingBasket, color: POI_LAYER_COLORS.supplies },
  { layer: 'bike',           label: 'Vélo',          icon: Bike,           color: POI_LAYER_COLORS.bike },
] satisfies LayerCardConfig[]
```

Bouton actif — style inline (jamais de classe Tailwind dynamique) :
```typescript
style={isActive ? { backgroundColor: color, color: '#ffffff', borderColor: 'transparent' } : undefined}
className={[
  'flex-1 flex items-center justify-center rounded-xl p-3 transition-colors',
  isActive ? '' : 'bg-white text-foreground border border-[--border] hover:bg-surface-raised',
].join(' ')}
```

---

### Task 6 — Mettre à jour `accommodation-sub-types.tsx`

**File :** `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx`

**Supprimer toutes les icônes** (emoji et Lucide). Garder uniquement dot coloré + label.

```typescript
import { POI_CATEGORY_COLORS } from '@ridenrest/shared'

// SUPPRIMÉ: champ icon dans ACCOMMODATION_SUB_TYPES
export const ACCOMMODATION_SUB_TYPES: { type: PoiCategory; label: string; color: string }[] = [
  { type: 'hotel',      label: 'Hôtel',               color: POI_CATEGORY_COLORS.hotel },
  { type: 'camp_site',  label: 'Camping',              color: POI_CATEGORY_COLORS.camp_site },
  { type: 'shelter',    label: 'Refuge / Abri',        color: POI_CATEGORY_COLORS.shelter },
  { type: 'hostel',     label: 'Auberge de jeunesse',  color: POI_CATEGORY_COLORS.hostel },
  { type: 'guesthouse', label: 'Chambre d\'hôte',      color: POI_CATEGORY_COLORS.guesthouse },
]
```

Rendu des chips :
```tsx
<button
  key={type}
  onClick={() => toggleAccommodationType(type)}
  aria-pressed={isActive}
  style={isActive
    ? { backgroundColor: color, color: '#ffffff', borderColor: 'transparent' }
    : undefined}
  className={[
    'text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5',
    hasZeroResults
      ? 'bg-muted text-muted-foreground border border-[--border] opacity-60'
      : isActive
        ? 'border border-transparent'
        : 'bg-muted text-muted-foreground border border-[--border]',
  ].join(' ')}
>
  <span
    className="inline-block h-2 w-2 rounded-full flex-shrink-0"
    style={{ backgroundColor: isActive ? '#ffffff' : (hasZeroResults ? '#9CA3AF' : color) }}
    aria-hidden="true"
  />
  {label}{count !== null ? ` (${count})` : ''}
</button>
```

> Le dot est **blanc** quand la chip est active (fond coloré), **coloré** quand inactive.

---

### Task 7 — Vérifier `live-filters-drawer.tsx`

`PoiLayerGrid` et `AccommodationSubTypes` sont importés directement. Aucune modification attendue.

---

### Task 8 — Mettre à jour `project-context.md`

Ajouter dans la section patterns UI :

```markdown
### POI Color System (story 16.11)

Source de vérité : `packages/shared/src/constants/poi-colors.ts`
- `POI_CATEGORY_COLORS` — couleur par PoiCategory (pins + chips)
- `POI_LAYER_COLORS` — couleur représentative par MapLayer (boutons filtre)
- `POI_CLUSTER_COLOR = '#2D6A4A'` — vert brand, unifié tous clusters
- Ne jamais hardcoder une couleur POI dans un composant — toujours importer depuis shared
- Couleurs dynamiques UI : style inline uniquement (jamais `bg-[${color}]` Tailwind)

Pins sur carte : SVGs complets (goutte + icône) fournis par Guillaume, chargés via `map.addImage()`
- Factory : `apps/web/src/lib/poi-pin-factory.ts`
- SVGs : `apps/web/public/images/poi-icons/{key}.svg` (viewBox 0 0 40 50, fond transparent, pointe en bas)
- `icon-anchor: 'bottom'` obligatoire dans le layer symbol
- `pixelRatio: window.devicePixelRatio` — net sur tous écrans dont Retina
- Dégradation gracieuse si SVG manquant (pin invisible, pas d'erreur)
```

---

## Dev Notes

### ⚠️ `useEffect` async pattern
`registerPoiPinImages` est async. Le `useEffect` ne peut pas être directement async.
Pattern recommandé :
```typescript
useEffect(() => {
  const map = mapRef.current
  if (!map || !map.isStyleLoaded()) return
  let cancelled = false

  void registerPoiPinImages(map).then(() => {
    if (cancelled) return
    // ... ajouter les layers
  })

  return () => { cancelled = true }
}, [deps])
```

### ⚠️ `icon-anchor: 'bottom'` obligatoire
Le pin goutte doit s'ancrer par sa pointe basse, pas par son centre.
```typescript
layout: {
  'icon-image': ['get', 'iconImageKey'],
  'icon-size': 1,
  'icon-anchor': 'bottom',
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
}
```
Si `icon-anchor` est omis, les pins flottent au-dessus de leur position réelle.

### ⚠️ `hasImage` guard
`registerPoiPinImages` vérifie `map.hasImage(key)` avant d'appeler `map.addImage()`.
Appeler `map.addImage()` sur une clé déjà existante lève une erreur MapLibre.

### ⚠️ Anneau de sélection (`selected-ring`)
L'anneau `circle` reste sur le layer `selected-ring` (rayon 13px, stroke vert brand).
Avec `icon-anchor: 'bottom'`, le centre du cercle MapLibre correspond au bas du pin (pointe).
Ajuster `circle-translate` si nécessaire pour que l'anneau encercle la tête du pin plutôt que la pointe :
```typescript
'circle-translate': [0, -20]  // à calibrer selon la taille réelle des PNGs
```

### ⚠️ Style reload
Quand `styleVersion` change (changement de thème carte), MapLibre recharge le style et efface toutes les images.
`registerPoiPinImages` doit être rappelé — c'est déjà géré par le `styleVersion` dans les deps du `useEffect`.

### ⚠️ POI_PIN_COLOR exporté
`POI_PIN_COLOR` est actuellement exporté depuis `use-poi-layers.ts`. Vérifier qu'aucun autre fichier ne l'importe avant suppression (grep `POI_PIN_COLOR`).

### ℹ️ Pas de tests unitaires requis
Changements purement visuels. Tester manuellement : planning + live + thème clair/sombre + zoom cluster/uncluster.

---

## Files to Modify

| File | Action |
|---|---|
| `packages/shared/src/constants/poi-colors.ts` | CREATE |
| `packages/shared/src/index.ts` | UPDATE (exports) |
| `apps/web/src/lib/poi-pin-factory.ts` | CREATE |
| `apps/web/src/hooks/use-poi-layers.ts` | UPDATE |
| `apps/web/src/hooks/use-live-poi-layers.ts` | UPDATE |
| `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.tsx` | UPDATE |
| `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx` | UPDATE |
| `_bmad-output/project-context.md` | UPDATE |
| `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx` | VERIFY only |
| `apps/web/public/images/poi-icons/*.svg` | PROVIDED BY GUILLAUME |

---

## Review Follow-ups (AI)

- [ ] [AI-Review][LOW] `poi-popup.tsx:112` — Handler Escape utilise `onClose` directement au lieu de `onCloseRef.current` (incohérence avec le handler map click qui utilise correctement le ref)
- [ ] [AI-Review][LOW] `apps/web/public/images/poi-icons/*.svg` — SVGs non committés ; tout déploiement CI/CD sans ces fichiers active le path de dégradation (pins invisibles)
- [ ] [AI-Review][LOW] `use-live-poi-layers.ts` — Pas de tests unitaires malgré la logique async/event handlers identique à `use-poi-layers.ts` (qui a 8 tests). Note: `mapReady` false→true sur style reload remplace fonctionnellement `styleVersion` — comportement correct, mais non documenté ni testé.
- [ ] [AI-Review][LOW] `use-live-poi-layers.ts` — Ajouter un commentaire expliquant que `mapReady` (false→true sur style reload via `live-map-canvas.tsx:137,148`) joue le rôle de `styleVersion` du hook planning, pour éviter qu'un futur dev croie que le style reload n'est pas géré.

## Story Status

`done`

---

## Dev Agent Record

### Implementation Notes

- Created `packages/shared/src/constants/poi-colors.ts` with `POI_CATEGORY_COLORS`, `POI_CLUSTER_COLOR`, `POI_LAYER_COLORS` — source de vérité pour toutes les couleurs POI
- Created `apps/web/src/lib/poi-pin-factory.ts` — chargement SVG async via `HTMLImageElement` + `map.addImage()`
- Refactorisé `use-poi-layers.ts` : layers circle+symbol emoji fusionnés en un seul layer symbol avec `icon-image: ['get', 'iconImageKey']`, `icon-anchor: 'bottom'`. Pattern async `void registerPoiPinImages().then(() => { if (cancelled) return; ... })` pour React Strict Mode safety.
- Même refactoring dans `use-live-poi-layers.ts` (mode live).
- `poi-layer-grid.tsx` : style inline pour boutons actifs (couleur par layer depuis `POI_LAYER_COLORS`)
- `accommodation-sub-types.tsx` : suppression icônes emoji, ajout dot coloré + couleur par sous-type depuis `POI_CATEGORY_COLORS`
- Adaptations collatérales : `density-legend.tsx` et `density-category-dialog.tsx` (suppression `.icon` qui n'existe plus)
- Tests mis à jour : mock `@/lib/poi-pin-factory`, tests async avec `flushPromises()`, assertions sur le nouveau comportement symbol layer
- Lint pre-existant défaillant (eslint-config-next module resolution) — non causé par ces changements

### Post-Review Fixes (2026-04-02)

#### Race condition `registerPoiPinImages` (poi-pin-factory.ts)
`use-poi-layers` et `use-live-poi-layers` appellent `registerPoiPinImages` en parallèle. Le premier `hasImage` check passait pour les deux avant que l'un ait terminé `addImage` → erreur MapLibre "An image named X already exists". Fix : second `hasImage` check **après** le `await loadSvgImage()` (l'async peut avoir permis à l'autre appel de finir en premier).

#### Taille des pins
SVGs rastérisés à 40×50 avec `pixelRatio: devicePixelRatio` = seulement 20×25 CSS px à l'écran — trop petit. Changé en **120×150** → 60×75 CSS px, qualité préservée (SVG scalable).

#### Recherche live mode respecte les filtres (use-live-poi-search.ts)
La recherche envoyait toutes les catégories à l'API indépendamment des filtres actifs. Ajout de :
- `visibleLayers` → seuls les layers visibles sont cherchés
- `activeAccommodationTypes` → pour le layer accommodations, seuls les sous-types actifs sont cherchés
- `categories` **exclu du queryKey** intentionnellement : avec `enabled: false`, la recherche est toujours déclenchée explicitement. Exclure `categories` du queryKey préserve les compteurs affichés quand l'utilisateur change les filtres sans relancer la recherche (évite `poisData = undefined` sur changement de clé).

#### Chips hébergement — compteurs et lisibilité (accommodation-sub-types.tsx + live-filters-drawer.tsx)
- Nouveau prop `onlyCountActive?: boolean` : quand `true`, les types **non actifs** n'affichent pas de compteur `(0)` (ils n'ont pas été cherchés → afficher 0 est trompeur)
- `live-filters-drawer.tsx` passe `onlyCountActive` à `AccommodationSubTypes`
- Styling amélioré : `text-sm px-3 py-1.5` (au lieu de `text-xs px-2.5 py-1`), fond `bg-white` (au lieu de `bg-muted`), dot `h-2.5 w-2.5`, `gap-2`

#### Fermeture popup au clic extérieur + recentrage sur POI (poi-popup.tsx + hooks)
**Contexte :** popup POI coupée quand le pin est en bord d'écran ; pas de moyen de fermer sans cliquer le ✕.

**Fermeture au clic extérieur** (`poi-popup.tsx`) :
- `map.on('click', handleMapClick)` enregistré tant que le popup est monté
- `map.queryRenderedFeatures(e.point)` détecte si le clic a atterri sur un layer `-points` (pin individuel) — si oui, ne ferme pas (un autre POI va s'ouvrir à la place)
- MapLibre ne fire pas `click` sur un drag → aucune logique de drag supplémentaire nécessaire
- `onCloseRef` (ref mise à jour à chaque render) évite de re-enregistrer le listener sur chaque changement d'identité de `onClose`

**Recentrage automatique** (`use-poi-layers.ts` + `use-live-poi-layers.ts`) :
- `handlePoiClick` lit `e.features[0].geometry.coordinates` pour obtenir les coordonnées exactes du pin
- `map.easeTo({ center: coordinates, offset: [0, 100], duration: 300 })` — l'offset `[0, 100]` positionne le pin 100px sous le centre du viewport, laissant la moitié supérieure libre pour le popup
- Fonctionne en planning **et** live mode ; en live mode, `easeTo` programmatique ne déclenche pas la détection de pan manuel (qui désactive le suivi GPS)

### Post-Review Fixes (2026-04-02 — code review)

#### H1 — Hardcoded `'#2D6A4A'` sur selected-ring remplacé par `POI_CLUSTER_COLOR`
`use-poi-layers.ts` et `use-live-poi-layers.ts` utilisaient `'#2D6A4A'` en dur sur le `circle-stroke-color` du layer `selected-ring`, violant la règle project-context "ne jamais hardcoder une couleur POI". Remplacé par `POI_CLUSTER_COLOR` (déjà importé dans les deux hooks).

#### H2 — H2 reclassé LOW après analyse : `mapReady` couvre les style reloads en live mode
`useLivePoiLayers` ne reçoit pas `styleVersion`. Analyse : `live-map-canvas.tsx` appelle `setMapReady(false)` puis `setMapReady(true)` à chaque changement de style (lignes 137/148), ce qui re-déclenche l'effet principal — fonctionnellement équivalent au `styleVersion` bump du hook planning. Comportement correct, documenté en action item.

#### M1 — Mock stale `density-legend.test.tsx` corrigé
Mock de `ACCOMMODATION_SUB_TYPES` mis à jour : suppression du champ `icon` (supprimé dans cette story), ajout du champ `color` (interface réelle `{ type, label, color }`).

#### M2 — Fix chip hébergement grisée avec stale data en live mode
`accommodation-sub-types.tsx` : avec `onlyCountActive=true`, une chip nouvellement activée (type non présent dans la dernière recherche) avait `count=0` depuis les données stale, déclenchant le style "hasZeroResults" (grisé). Fix : en mode `onlyCountActive`, count affiché uniquement si type actif ET count > 0. Les zéros sont traités comme `null` (pas de badge), évitant l'état visuel trompeur.

#### L1 — Variable morte `pointLayerId` supprimée du 2ème effet de `use-poi-layers.ts`
Dans le second `useEffect` (sélection anneau), `pointLayerId` était déclarée mais jamais utilisée. Remplacée par construction directe de `ringLayerId`.

### Debug Log

- Suppression du 3ème effect `circle-stroke-color` dans `use-poi-layers.ts` car le layer est maintenant de type symbol (pas circle). La prop `selectedStageColor` est conservée en signature pour rétrocompatibilité mais sans effet visuel sur les pins SVG.
- `circle-translate: [0, -20]` sur le selected-ring — finalement supprimé car causait erreur MapLibre "Expected number, found null". L'anneau seul suffit comme feedback de sélection.

---

## File List

- `packages/shared/src/constants/poi-colors.ts` — CREATED
- `packages/shared/src/index.ts` — UPDATED (exports)
- `apps/web/src/lib/poi-pin-factory.ts` — CREATED
- `apps/web/src/hooks/use-poi-layers.ts` — UPDATED
- `apps/web/src/hooks/use-poi-layers.test.ts` — UPDATED
- `apps/web/src/hooks/use-live-poi-layers.ts` — UPDATED
- `apps/web/src/hooks/use-live-poi-search.ts` — UPDATED (filtres catégories live mode)
- `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.tsx` — UPDATED
- `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.test.tsx` — UPDATED
- `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx` — UPDATED
- `apps/web/src/app/(app)/map/[id]/_components/density-legend.tsx` — UPDATED (suppression `.icon`)
- `apps/web/src/app/(app)/map/[id]/_components/density-legend.test.tsx` — UPDATED
- `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx` — UPDATED (suppression `.icon`)
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx` — UPDATED (onlyCountActive)
- `apps/api/webpack.config.js` — UPDATED (nodeExternals pour compatibilité pino v10 worker threads)
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` — UPDATED (fermeture clic extérieur + onCloseRef)
- `apps/web/src/hooks/use-poi-layers.ts` — UPDATED (easeTo recentrage sur clic pin)
- `apps/web/src/hooks/use-live-poi-layers.ts` — UPDATED (easeTo recentrage sur clic pin)
- `_bmad-output/project-context.md` — UPDATED (POI Color System section)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — UPDATED

---

## Change Log

- 2026-04-02 — Story 16.11 : Implémentation identité visuelle pins POI colorés par catégorie. Création du système de couleurs centralisé, factory SVG pins, refonte layers MapLibre (circle+symbol → symbol unifié), boutons filtre colorés inline, chips hébergement avec dot coloré sans icône.
- 2026-04-02 — Post-review fixes : race condition registerPoiPinImages, taille pins 3× (120×150), live mode recherche respecte filtres actifs (visibleLayers + activeAccommodationTypes), chips hébergement onlyCountActive + styling amélioré, webpack.config.js nodeExternals pour pino v10.
- 2026-04-02 — UX popup POI : fermeture au clic extérieur sur la carte (queryRenderedFeatures guard, MapLibre ne fire pas click sur drag), recentrage automatique map sur clic pin (easeTo offset [0,100] pour laisser de l'espace au popup au-dessus du pin).
