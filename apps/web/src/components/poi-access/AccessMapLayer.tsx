'use client'
import { useEffect, useRef } from 'react'
import type maplibregl from 'maplibre-gl'
import type { AccessResponse } from '@ridenrest/shared'

/**
 * Polyline d'itinéraire d'accès cyclable vers un POI sur MapLibre (Story POI-Access 2.5).
 *
 * Affiche le tracé renvoyé par l'endpoint `/pois/:id/access` (Story 2.3) sous forme
 * d'une ligne ambre pointillée, insérée **entre la trace de l'aventure et les pins POI**
 * (cf. project-context §z-index Stack).
 *
 * Patterns suivis :
 * - Source GeoJSON statique + `setData` à chaque changement de géométrie (Discovery #3 —
 *   bien plus rapide que removeSource/addSource).
 * - Cleanup idempotent via flag `cancelled` au unmount (Discovery #1).
 * - `fitBounds` une seule fois par géométrie distincte (AC#6) — pas à chaque re-render.
 *
 * Doc Sync : la story planifiait un prop `geometry: GeoJSONLineString` ; le contrat réel
 * (`AccessGeometrySchema`, Story 2.3) est un `LineString | MultiLineString` — typé ici
 * via `AccessGeometry`.
 */

/** Géométrie d'accès dérivée du contrat partagé (LineString | MultiLineString). */
export type AccessGeometry = Extract<AccessResponse, { status: 'ok' }>['geometry']

const SOURCE_ID = 'poi-access-source'
const LAYER_ID = 'poi-access-line'

/**
 * Layers de pins POI candidats (cf. `use-poi-layers.ts` : `pois-{layer}-points`).
 * La ligne d'accès est insérée AVANT le premier présent → reste sous les pins.
 */
const POI_POINT_LAYER_IDS = [
  'pois-accommodations-points',
  'pois-restaurants-points',
  'pois-supplies-points',
  'pois-bike-points',
]

interface AccessMapLayerProps {
  map: maplibregl.Map | null
  geometry: AccessGeometry | null
}

/** Premier layer de pins POI présent dans la carte, sinon `undefined` (insertion au sommet). */
function firstPoiPointLayerId(map: maplibregl.Map): string | undefined {
  return POI_POINT_LAYER_IDS.find((id) => map.getLayer(id))
}

/** Retrait idempotent du layer + source d'accès (AC#5 — sûr même si absent). */
function removeAccessLayer(map: maplibregl.Map): void {
  if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
}

/** Bbox `[minLng, minLat, maxLng, maxLat]` sur toutes les positions, ou null si vide. */
function computeBounds(geometry: AccessGeometry): [number, number, number, number] | null {
  const positions: number[][] =
    geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates.flat()
  if (positions.length === 0) return null

  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of positions) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return [minLng, minLat, maxLng, maxLat]
}

export function AccessMapLayer({ map, geometry }: AccessMapLayerProps) {
  // Mémorise la dernière géométrie zoomée → évite un re-zoom à chaque re-render (AC#6).
  // La référence de `geometry` est stable par entrée de cache TanStack (un POI donné),
  // donc change uniquement au switch de POI → re-zoom pertinent sur le nouvel itinéraire.
  const lastZoomedGeometryRef = useRef<AccessGeometry | null>(null)

  useEffect(() => {
    if (!map) return

    // Pas de géométrie (loading / fallback / fermeture) → retrait propre + reset zoom.
    if (!geometry) {
      removeAccessLayer(map)
      lastZoomedGeometryRef.current = null
      return
    }

    let cancelled = false

    const apply = () => {
      if (cancelled) return
      const data: GeoJSON.Feature = { type: 'Feature', geometry, properties: {} }

      const existing = map.getSource(SOURCE_ID)
      if (existing) {
        // Source déjà présente → simple mise à jour des données (Discovery #3).
        ;(existing as maplibregl.GeoJSONSource).setData(data)
      } else {
        map.addSource(SOURCE_ID, { type: 'geojson', data })
        map.addLayer(
          {
            id: LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            paint: {
              'line-color': '#f59e0b',
              'line-width': 4,
              'line-dasharray': [2, 2],
              'line-opacity': 0.9,
            },
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
          },
          // beforeId : insère sous les pins POI, au-dessus de la trace (Discovery #5).
          firstPoiPointLayerId(map),
        )
      }

      // Zoom une seule fois par géométrie distincte (AC#6).
      if (lastZoomedGeometryRef.current !== geometry) {
        const bounds = computeBounds(geometry)
        if (bounds) map.fitBounds(bounds, { padding: 40, duration: 500 })
        lastZoomedGeometryRef.current = geometry
      }
    }

    // Le style peut ne pas être chargé (changement de thème / premier rendu) → différer.
    if (map.isStyleLoaded()) {
      apply()
    } else {
      map.once('styledata', apply)
    }

    return () => {
      cancelled = true
    }
  }, [map, geometry])

  // Cleanup au unmount du composant (AC#5) — retrait du layer même si la géométrie
  // était encore affichée. Idempotent : sûr en cas de double-cleanup (React Strict Mode).
  useEffect(() => {
    return () => {
      if (map) removeAccessLayer(map)
    }
  }, [map])

  return null
}
