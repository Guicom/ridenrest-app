import type maplibregl from 'maplibre-gl'
import type { PoiCategory } from '@ridenrest/shared'

/** Mapping PoiCategory → nom du fichier SVG dans /images/poi-icons/ */
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
        const img = await loadSvgImage(`/images/poi-icons/${file}.svg`, 120, 150)
        // Re-check after async load — concurrent calls may have already added the image
        if (!map.hasImage(imageKey)) {
          map.addImage(imageKey, img, { pixelRatio: window.devicePixelRatio ?? 2 })
        }
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
