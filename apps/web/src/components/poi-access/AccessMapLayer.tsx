'use client'
import { useEffect, useRef } from 'react'
import type maplibregl from 'maplibre-gl'
import type { AccessResponse, AccessVariant } from '@ridenrest/shared'

/**
 * Calque des itinéraires d'accès cyclables vers un POI sur MapLibre (Story POI-Access 2.5,
 * étendu multi-variantes 2026-05-31).
 *
 * Le serveur renvoie plusieurs variantes (points d'entrée candidats sur la trace, cf.
 * `closestPointsOnTrace`). On dessine :
 *  - la variante SÉLECTIONNÉE en ambre gras pointillé (au-dessus),
 *  - les autres en « fantômes » gris, cliquables → `onSelect(index)` (pattern Google Maps).
 * Inséré **entre la trace de l'aventure et les pins POI** (cf. project-context §z-index Stack).
 *
 * Patterns conservés depuis la version mono-tracé :
 * - Source GeoJSON statique + `setData` (Discovery #3, plus rapide que removeSource/addSource).
 * - Ré-insertion sur `styledata` (un `setStyle`/thème détruit les calques custom).
 * - Cleanup idempotent + try/catch teardown (map.remove() détruit le style → getLayer throw).
 * - `fitBounds` une seule fois par JEU de variantes distinct (AC#6) ; désactivé en Live (GPS).
 */

/** Géométrie d'accès dérivée du contrat partagé (LineString | MultiLineString). */
export type AccessGeometry = Extract<AccessResponse, { status: 'ok' }>['geometry']

const SOURCE_ID = 'poi-access-source'
/** Calque de la variante sélectionnée (id historique conservé). */
const SELECTED_LAYER_ID = 'poi-access-line'
/** Liseré blanc continu SOUS la variante sélectionnée — la « décolle » de n'importe quel
 *  fond (clair, vif ou sombre) et rend les pointillés colorés lisibles partout. */
const CASING_LAYER_ID = 'poi-access-casing'
/** Calque des variantes non sélectionnées (cliquables). */
const GHOST_LAYER_ID = 'poi-access-ghost'

/** Couleur du trait d'accès sélectionné : magenta/fuchsia — tranche sur tous les fonds OSM
 *  sans collision avec le bleu de la trace, l'orange des pins ni le vert du terrain. */
const ACCESS_ROUTE_COLOR = '#e6007e'

/**
 * Calques de pins POI candidats. La ligne d'accès est insérée AVANT le premier présent
 * → reste sous les pins. Couvre la carte Planning (`use-poi-layers.ts` : `pois-{layer}-points`)
 * ET la carte Live (`use-live-poi-layers.ts` : `live-pois-{layer}-points`, Story 3.3).
 */
const POI_POINT_LAYER_IDS = [
  'pois-accommodations-points',
  'pois-restaurants-points',
  'pois-supplies-points',
  'pois-bike-points',
  'live-pois-accommodations-points',
  'live-pois-restaurants-points',
  'live-pois-supplies-points',
  'live-pois-bike-points',
]

interface AccessMapLayerProps {
  map: maplibregl.Map | null
  /** Variantes d'accès renvoyées par l'API. `null`/`[]` → rien dessiné. */
  variants: AccessVariant[] | null
  /** Index de la variante sélectionnée (gras ambre). */
  selectedIndex: number
  /** Clic sur une variante fantôme → sélection. */
  onSelect?: (index: number) => void
  /**
   * Auto-zoom (`fitBounds`) sur les variantes au 1er affichage (AC#6 Planning).
   * `false` en mode Live (Story 3.3) : le suivi GPS pilote la caméra — un `fitBounds`
   * programmatique serait écrasé et créerait un à-coup.
   */
  fitOnShow?: boolean
}

/** Premier calque de pins POI présent, sinon `undefined` (insertion au sommet). */
function firstPoiPointLayerId(map: maplibregl.Map): string | undefined {
  return POI_POINT_LAYER_IDS.find((id) => map.getLayer(id))
}

/** Retrait idempotent des calques + source d'accès (sûr même si absents / map détruite). */
function removeAccessLayer(map: maplibregl.Map): void {
  try {
    if (map.getLayer(SELECTED_LAYER_ID)) map.removeLayer(SELECTED_LAYER_ID)
    if (map.getLayer(CASING_LAYER_ID)) map.removeLayer(CASING_LAYER_ID)
    if (map.getLayer(GHOST_LAYER_ID)) map.removeLayer(GHOST_LAYER_ID)
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
  } catch {
    // map déjà détruite (map.remove()) — plus de style, rien à retirer.
  }
}

/** FeatureCollection : une feature par variante, propriété `idx`. */
function toFeatureCollection(variants: AccessVariant[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: variants.map((v, idx) => ({
      type: 'Feature',
      geometry: v.geometry as GeoJSON.Geometry,
      properties: { idx },
    })),
  }
}

/** Bbox `[minLng, minLat, maxLng, maxLat]` sur toutes les variantes, ou null si vide. */
function computeBounds(variants: AccessVariant[]): [number, number, number, number] | null {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  let seen = false
  for (const v of variants) {
    const positions: number[][] =
      v.geometry.type === 'LineString' ? v.geometry.coordinates : v.geometry.coordinates.flat()
    for (const [lng, lat] of positions) {
      seen = true
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  return seen ? [minLng, minLat, maxLng, maxLat] : null
}

export function AccessMapLayer({
  map,
  variants,
  selectedIndex,
  onSelect,
  fitOnShow = true,
}: AccessMapLayerProps) {
  // Mémorise le dernier jeu de variantes zoomé → évite un re-zoom à chaque re-render (AC#6).
  // La référence `variants` est stable par entrée de cache TanStack (un POI donné) → change
  // uniquement au switch de POI → re-zoom pertinent sur le nouvel ensemble d'itinéraires.
  const lastZoomedRef = useRef<AccessVariant[] | null>(null)
  // onSelect via ref → le handler de clic (enregistré une fois) lit toujours la dernière valeur.
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // ── Enregistrement unique des handlers de clic/curseur sur les fantômes (par map) ──
  useEffect(() => {
    if (!map) return

    const handleClick = (e: maplibregl.MapLayerMouseEvent) => {
      const idx = e.features?.[0]?.properties?.idx
      if (typeof idx === 'number') onSelectRef.current?.(idx)
    }
    const handleEnter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const handleLeave = () => {
      map.getCanvas().style.cursor = ''
    }

    // Handlers par id de calque : MapLibre les résout à la volée, même si le calque est
    // (re)créé plus tard ou après un reload de style.
    map.on('click', GHOST_LAYER_ID, handleClick)
    map.on('mouseenter', GHOST_LAYER_ID, handleEnter)
    map.on('mouseleave', GHOST_LAYER_ID, handleLeave)

    return () => {
      try {
        map.off('click', GHOST_LAYER_ID, handleClick)
        map.off('mouseenter', GHOST_LAYER_ID, handleEnter)
        map.off('mouseleave', GHOST_LAYER_ID, handleLeave)
      } catch {
        // map détruite — rien à détacher.
      }
    }
  }, [map])

  // ── Source / calques / filtres / fit ─────────────────────────────────────────────
  useEffect(() => {
    if (!map) return

    // Rien à dessiner (loading / fallback / fermeture) → retrait propre + reset zoom.
    if (!variants || variants.length === 0) {
      removeAccessLayer(map)
      lastZoomedRef.current = null
      return
    }

    let cancelled = false

    const apply = () => {
      if (cancelled) return
      const data = toFeatureCollection(variants)
      const ghostFilter = ['!=', ['get', 'idx'], selectedIndex] as unknown as maplibregl.FilterSpecification
      const selectedFilter = ['==', ['get', 'idx'], selectedIndex] as unknown as maplibregl.FilterSpecification

      const existing = map.getSource(SOURCE_ID)
      if (existing) {
        ;(existing as maplibregl.GeoJSONSource).setData(data)
        map.setFilter(GHOST_LAYER_ID, ghostFilter)
        map.setFilter(CASING_LAYER_ID, selectedFilter)
        map.setFilter(SELECTED_LAYER_ID, selectedFilter)
      } else {
        const beforeId = firstPoiPointLayerId(map)
        map.addSource(SOURCE_ID, { type: 'geojson', data })
        // Empilement bas→haut (même beforeId) : fantômes, puis liseré blanc, puis trait coloré.
        map.addLayer(
          {
            id: GHOST_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            filter: ghostFilter,
            paint: {
              'line-color': '#9ca3af',
              'line-width': 3,
              'line-dasharray': [2, 2],
              'line-opacity': 0.55,
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          },
          beforeId,
        )
        // Liseré : ruban blanc CONTINU (non pointillé), plus large → halo de contraste sous le
        // trait. Les pointillés colorés ressortent dessus quel que soit le fond de carte.
        map.addLayer(
          {
            id: CASING_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            filter: selectedFilter,
            paint: {
              'line-color': '#ffffff',
              'line-width': 7,
              'line-opacity': 0.9,
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          },
          beforeId,
        )
        map.addLayer(
          {
            id: SELECTED_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            filter: selectedFilter,
            paint: {
              'line-color': ACCESS_ROUTE_COLOR,
              'line-width': 4,
              'line-dasharray': [2, 2],
              'line-opacity': 1,
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          },
          beforeId,
        )
      }

      // Zoom une seule fois par jeu de variantes distinct (AC#6) — sauf en Live (fitOnShow=false).
      if (fitOnShow && lastZoomedRef.current !== variants) {
        const bounds = computeBounds(variants)
        if (bounds) map.fitBounds(bounds, { padding: 40, duration: 500 })
        lastZoomedRef.current = variants
      }
    }

    if (map.isStyleLoaded()) apply()

    // Ré-applique à chaque (re)chargement de style (setStyle/thème détruit les calques custom).
    const onStyleData = () => {
      if (cancelled) return
      if (!map.getSource(SOURCE_ID)) apply()
    }
    map.on('styledata', onStyleData)

    return () => {
      cancelled = true
      map.off('styledata', onStyleData)
    }
  }, [map, variants, selectedIndex, fitOnShow])

  // Cleanup au unmount — retrait des calques même si encore affichés (idempotent, Strict Mode).
  useEffect(() => {
    return () => {
      if (map) removeAccessLayer(map)
    }
  }, [map])

  return null
}
